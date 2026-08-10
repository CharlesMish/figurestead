#!/usr/bin/env python3
"""Verify paper delivery, V1 anchor, R3 immutability, and packet hygiene."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image


R3_BASELINE = "a2cb55c7813c9ba7040aba58099e6dc626ae5846"
R3_SITE_TREE = "c65d33a1a72ce18b8a756ac007f9117e6336f28d"
V1_ACCEPTED_ANCHOR = "2f0403348e9b2e18e120d47b5fedb3f24062a978e0a02b2af8e7c62a28a553a7"
OS_ARTIFACT_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}


def sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def pixel_sha(path: Path) -> str:
    return sha256(Image.open(path).convert("RGBA").tobytes())


def is_os_artifact(path: Path) -> bool:
    return path.name in OS_ARTIFACT_NAMES or path.name.startswith("._")


def v1_manifest(root: Path, *, exclude_os: bool) -> tuple[str, int]:
    records = []
    for path in sorted(candidate for candidate in root.rglob("*") if candidate.is_file()):
        if exclude_os and is_os_artifact(path):
            continue
        relative = path.relative_to(root.parent).as_posix()
        records.append(f"{sha256(path.read_bytes())}  {relative}\n")
    payload = "".join(records).encode()
    return sha256(payload), len(records)


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: verify-preservation.py OUTPUT_JSON")
    repository = Path(__file__).resolve().parents[2]
    workspace = repository.parents[1]
    v1_root = workspace / "FIGURESTEAD_SHOWCASE_PROTOTYPE"
    site = repository / "site"
    web_manifest = json.loads((site / "WEB_ASSET_MANIFEST.json").read_text(encoding="utf-8"))
    paper_records = []
    for width in ("89mm", "183mm"):
        canonical_relative = f"assets/evidence-paper-{width}.png"
        record = next(item for item in web_manifest["losslessDerivatives"] if item["canonicalPath"] == canonical_relative)
        canonical = site / record["canonicalPath"]
        derivative = site / record["derivativePath"]
        canonical_pixels = pixel_sha(canonical)
        derivative_pixels = pixel_sha(derivative)
        paper_records.append({
            "width": width,
            "canonical": {"path": record["canonicalPath"], "bytes": canonical.stat().st_size, "sha256": sha256(canonical.read_bytes())},
            "servedDerivative": {"path": record["derivativePath"], "bytes": derivative.stat().st_size, "sha256": sha256(derivative.read_bytes())},
            "decodedPixelSha256": canonical_pixels,
            "decodedPixelsIdentical": canonical_pixels == derivative_pixels == record["decodedPixelSha256"],
            "compressionSavingPercent": round((1 - derivative.stat().st_size / canonical.stat().st_size) * 100, 3),
        })

    canonical_total = sum(item["canonical"]["bytes"] for item in paper_records)
    served_total = sum(item["servedDerivative"]["bytes"] for item in paper_records)
    accepted_v1_aggregate, accepted_v1_count = v1_manifest(v1_root, exclude_os=False)
    clean_v1_aggregate, clean_v1_count = v1_manifest(v1_root, exclude_os=True)
    excluded_os_count = sum(1 for path in v1_root.rglob("*") if path.is_file() and is_os_artifact(path))
    public_diff = subprocess.check_output(
        ["git", "diff", "--name-only", R3_BASELINE, "--", "site", ".github/workflows/deploy-pages.yml"],
        cwd=repository, text=True,
    ).strip().splitlines()
    baseline_site_tree = subprocess.check_output(["git", "rev-parse", f"{R3_BASELINE}:site"], cwd=repository, text=True).strip()
    packet_files = [path for path in (repository / "technical-showcase").rglob("*") if path.is_file() and not is_os_artifact(path)]
    absolute_path_leaks = [path.relative_to(repository).as_posix() for path in packet_files if b"/Users/" in path.read_bytes() or b"Library/Caches" in path.read_bytes()]
    tracked_os_artifacts = subprocess.check_output(["git", "ls-files"], cwd=repository, text=True).splitlines()
    tracked_os_artifacts = [path for path in tracked_os_artifacts if is_os_artifact(Path(path))]
    report = {
        "schemaVersion": "figurestead.technical-showcase-preservation/1",
        "result": "PASS",
        "paperAssets": paper_records,
        "paperTotals": {
            "canonicalBytes": canonical_total,
            "servedDerivativeBytes": served_total,
            "compressionSavingPercent": round((1 - served_total / canonical_total) * 100, 3),
        },
        "v1": {
            "acceptedAnchor": V1_ACCEPTED_ANCHOR,
            "currentAcceptedAggregate": accepted_v1_aggregate,
            "acceptedAnchorMatch": accepted_v1_aggregate == V1_ACCEPTED_ANCHOR,
            "acceptedManifestFileCount": accepted_v1_count,
            "cleanManifestAggregate": clean_v1_aggregate,
            "cleanManifestFileCount": clean_v1_count,
            "osArtifactsExcludedFromNewEvidence": excluded_os_count,
        },
        "publicR3": {
            "baselineCommit": R3_BASELINE,
            "baselineSiteTree": baseline_site_tree,
            "expectedSiteTree": R3_SITE_TREE,
            "changedPaths": public_diff,
            "unchanged": baseline_site_tree == R3_SITE_TREE and not public_diff,
            "deploymentInvoked": False,
            "navigationChanged": False,
        },
        "packetHygiene": {"absoluteMachinePathLeaks": absolute_path_leaks, "trackedOsArtifacts": tracked_os_artifacts},
    }
    checks = [
        all(item["decodedPixelsIdentical"] for item in paper_records),
        report["v1"]["acceptedAnchorMatch"], report["publicR3"]["unchanged"],
        not absolute_path_leaks, not tracked_os_artifacts,
    ]
    if not all(checks):
        report["result"] = "FAIL"
    output = repository / sys.argv[1]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
