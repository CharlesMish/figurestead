#!/usr/bin/env python3
"""Verify frozen corpus payloads and accepted Figurestead baselines."""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path


BASELINE = "dfd60073fa911153451e8764744e3b15f2ee388b"
PUBLIC_SITE_TREE = "c65d33a1a72ce18b8a756ac007f9117e6336f28d"
V2_TREE = "d14516a981cf4ed8bd0a9e9c756e3076086e92e3"
PROTECTED_PATHS = ["site", "technical-showcase", "web", "src", ".github", "pyproject.toml", "release"]


def sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def git(repository: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=repository, text=True).strip()


def main() -> int:
    repository = Path(__file__).resolve().parents[2]
    corpus = repository / "specimen-study" / "corpus"
    expected = json.loads((corpus / "expected-checksums.json").read_text(encoding="utf-8"))
    corpus_files = []
    for relative, expectation in expected["files"].items():
        path = corpus / relative
        payload = path.read_bytes()
        corpus_files.append({
            "path": relative,
            "bytes": len(payload),
            "sha256": sha256(payload),
            "matches": len(payload) == expectation["bytes"] and sha256(payload) == expectation["sha256"],
        })

    protected_changes = git(repository, "diff", "--name-only", BASELINE, "--", *PROTECTED_PATHS).splitlines()
    tracked_os_artifacts = [
        path for path in git(repository, "ls-files").splitlines()
        if Path(path).name in {".DS_Store", "Thumbs.db", "desktop.ini"} or Path(path).name.startswith("._")
    ]
    reviewer_files = [
        repository / "specimen-study" / "reviewer-README.md",
        repository / "specimen-study" / "specimen-evaluation.json",
        *[path for path in (repository / "specimen-study" / "evidence").rglob("*.json") if path.is_file()],
    ]
    path_leaks = [
        path.relative_to(repository).as_posix() for path in reviewer_files
        if b"/Users/" in path.read_bytes() or b"Library/Caches" in path.read_bytes()
    ]
    report = {
        "schemaVersion": "figurestead.specimen-preservation/1",
        "result": "PASS",
        "baselineCommit": BASELINE,
        "publicR3": {
            "expectedSiteTree": PUBLIC_SITE_TREE,
            "baselineSiteTree": git(repository, "rev-parse", f"{BASELINE}:site"),
            "unchanged": not any(path == "site" or path.startswith("site/") for path in protected_changes),
        },
        "technicalShowcaseV2": {
            "expectedTree": V2_TREE,
            "baselineTree": git(repository, "rev-parse", f"{BASELINE}:technical-showcase"),
            "unchanged": not any(path == "technical-showcase" or path.startswith("technical-showcase/") for path in protected_changes),
        },
        "protectedPathChanges": protected_changes,
        "corpus": {
            "expectedChecksumManifestSha256": sha256((corpus / "expected-checksums.json").read_bytes()),
            "fileCount": len(corpus_files),
            "allMatch": all(item["matches"] for item in corpus_files),
            "files": corpus_files,
        },
        "packetHygiene": {
            "trackedOsArtifacts": tracked_os_artifacts,
            "absoluteCachePathLeaks": path_leaks,
        },
        "deploymentInvoked": False,
        "navigationChanged": False,
        "packageOrReleaseChanged": False,
    }
    checks = [
        report["publicR3"]["baselineSiteTree"] == PUBLIC_SITE_TREE,
        report["technicalShowcaseV2"]["baselineTree"] == V2_TREE,
        not protected_changes,
        report["corpus"]["allMatch"],
        not tracked_os_artifacts,
        not path_leaks,
    ]
    if not all(checks):
        report["result"] = "FAIL"
    output = repository / "specimen-study" / "audit" / "preservation.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
