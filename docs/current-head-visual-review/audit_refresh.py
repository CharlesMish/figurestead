#!/usr/bin/env python3
"""Read-only audit for the current-HEAD outward visual refresh."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def png_dimensions(path: Path) -> list[int]:
    payload = path.read_bytes()[:24]
    if payload[:8] != b"\x89PNG\r\n\x1a\n" or payload[12:16] != b"IHDR":
        raise ValueError(f"{path}: expected PNG IHDR")
    return [int.from_bytes(payload[16:20], "big"), int.from_bytes(payload[20:24], "big")]


def main() -> int:
    manifest = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))
    baseline = manifest["baselineCommit"]
    checks: dict[str, bool] = {}
    for name, comparison in manifest["comparisons"].items():
        current = ROOT / comparison["current"]["path"]
        previous = subprocess.check_output(
            ["git", "show", f"{baseline}:{comparison['current']['path']}"], cwd=ROOT
        )
        checks[f"{name}PreviousAnchor"] = sha256_bytes(previous) == comparison["previous"]["sha256"]
        checks[f"{name}CurrentAnchor"] = sha256(current) == comparison["current"]["sha256"]
        for label, artifact in comparison["artifacts"].items():
            path = ROOT / artifact["path"]
            checks[f"{name}-{label}Artifact"] = (
                sha256(path) == artifact["sha256"]
                and png_dimensions(path) == artifact["dimensions"]
            )

    for specimen in manifest["changedSpecimens"]:
        path = ROOT / specimen["path"]
        previous = subprocess.check_output(["git", "show", f"{baseline}:{specimen['path']}"], cwd=ROOT)
        checks[f"specimen:{path.name}"] = (
            sha256_bytes(previous) == specimen["oldSha256"]
            and sha256(path) == specimen["newSha256"]
            and specimen["expectedDifference"] == "authored scale-domain precedence only"
        )

    source_montage = manifest["sourceMontage"]
    source_montage_path = ROOT / source_montage["path"]
    source_montage_previous = subprocess.check_output(
        ["git", "show", f"{baseline}:{source_montage['path']}"], cwd=ROOT
    )
    checks["sourceMontageAnchors"] = (
        sha256_bytes(source_montage_previous) == source_montage["previousSha256"]
        and sha256(source_montage_path) == source_montage["currentSha256"]
        and source_montage["dimensions"] == [1920, 1080]
        and source_montage["compositionChanged"] is False
    )

    summary = json.loads(
        (ROOT / "specimen-study" / "audit" / "corpus-v0.2-summary.json").read_text(encoding="utf-8")
    )
    summary_records = {item["path"]: item for item in summary["evidence"]}
    tracked_refresh_paths = [
        specimen["path"].removeprefix("specimen-study/") for specimen in manifest["changedSpecimens"]
    ] + [source_montage["path"].removeprefix("specimen-study/")]
    checks["specimenSummaryMatches"] = all(
        summary_records[relative]["sha256"] == sha256(ROOT / "specimen-study" / relative)
        and summary_records[relative]["bytes"] == (ROOT / "specimen-study" / relative).stat().st_size
        for relative in tracked_refresh_paths
    )

    matrix = manifest["matrix"]
    matrix_path = ROOT / matrix["path"]
    matrix_previous = subprocess.check_output(["git", "show", f"{baseline}:{matrix['path']}"], cwd=ROOT)
    checks["matrixByteIdentical"] = (
        matrix_previous == matrix_path.read_bytes()
        and matrix["byteIdentical"] is True
        and sha256(matrix_path) == "347517b89a32098dba055de3e5c44d1ac484a5b2abc28d264862e6ba7f64152c"
    )
    checks["scopeClaims"] = manifest["claims"] == {
        "compositionChanged": False,
        "corpusDataChanged": False,
        "themeChanged": False,
        "githubSettingsChanged": False,
    }
    checks["exactlyTenSpecimens"] = len(manifest["changedSpecimens"]) == 10
    result = "PASS" if all(checks.values()) else "FAIL"
    print(json.dumps({"result": result, "checks": checks}, indent=2))
    return 0 if result == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
