#!/usr/bin/env python3
"""Verify frozen corpus payloads and accepted Figurestead baselines."""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path


BASELINE = "f9085251ccdc57bce53289b6f8a3b7a4458179cf"
PUBLIC_SITE_TREE = "c65d33a1a72ce18b8a756ac007f9117e6336f28d"
V2_TREE = "d14516a981cf4ed8bd0a9e9c756e3076086e92e3"
V01_CORPUS_TREE = "2a8c462b4a87a87a88eee6290b5136716b55eadd"
PROTECTED_PATHS = ["site", "technical-showcase", "web", "src", ".github", "pyproject.toml", "release"]
AUTHORIZED_CORE_FIX_PATHS = {"web/src/scientific-layout.js"}


def sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def git(repository: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=repository, text=True).strip()


def main() -> int:
    repository = Path(__file__).resolve().parents[2]
    corpora = {}
    for label, folder in (("v0.1", "corpus"), ("v0.2", "corpus-v0.2")):
        corpus = repository / "specimen-study" / folder
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
        corpora[label] = {
            "expectedChecksumManifestSha256": sha256((corpus / "expected-checksums.json").read_bytes()),
            "fileCount": len(corpus_files),
            "allMatch": all(item["matches"] for item in corpus_files),
            "files": corpus_files,
        }

    protected_changes = git(repository, "diff", "--name-only", BASELINE, "--", *PROTECTED_PATHS).splitlines()
    untracked_protected = git(repository, "ls-files", "--others", "--exclude-standard", "--", *PROTECTED_PATHS).splitlines()
    untracked_protected = [
        path for path in untracked_protected
        if Path(path).name not in {".DS_Store", "Thumbs.db", "desktop.ini"}
        and not Path(path).name.startswith("._")
        and "__pycache__" not in Path(path).parts
        and Path(path).suffix != ".pyc"
    ]
    protected_changes = sorted(set(protected_changes + untracked_protected))
    authorized_core_changes = sorted(set(protected_changes) & AUTHORIZED_CORE_FIX_PATHS)
    unexpected_protected_changes = sorted(set(protected_changes) - AUTHORIZED_CORE_FIX_PATHS)
    theme_changes = git(repository, "diff", "--name-only", BASELINE, "--", "src/figurestead/themes").splitlines()
    package_release_changes = git(
        repository, "diff", "--name-only", BASELINE, "--",
        "pyproject.toml", "web/package.json", ".github", "release",
    ).splitlines()
    tracked_os_artifacts = [
        path for path in git(repository, "ls-files").splitlines()
        if Path(path).name in {".DS_Store", "Thumbs.db", "desktop.ini"} or Path(path).name.startswith("._")
    ]
    reviewer_files = [
        repository / "specimen-study" / "reviewer-README.md",
        repository / "specimen-study" / "specimen-evaluation.json",
        repository / "specimen-study" / "specimen-evaluation-v0.2.json",
        *[path for path in (repository / "specimen-study" / "audit").glob("corpus-v0.2-*.json") if path.is_file()],
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
        "authorizedCoreFixPaths": authorized_core_changes,
        "unexpectedProtectedPathChanges": unexpected_protected_changes,
        "themes": {
            "baselineTree": git(repository, "rev-parse", f"{BASELINE}:src/figurestead/themes"),
            "changedPaths": theme_changes,
            "byteIdentical": not theme_changes,
        },
        "corpora": {
            "acceptedV01Tree": V01_CORPUS_TREE,
            "baselineV01Tree": git(repository, "rev-parse", f"{BASELINE}:specimen-study/corpus"),
            "v01ChangedPaths": git(repository, "diff", "--name-only", BASELINE, "--", "specimen-study/corpus").splitlines(),
            **corpora,
        },
        "packetHygiene": {
            "trackedOsArtifacts": tracked_os_artifacts,
            "absoluteCachePathLeaks": path_leaks,
        },
        "deploymentInvoked": False,
        "navigationChanged": False,
        "packageOrReleaseChanged": bool(package_release_changes),
        "packageOrReleaseChangedPaths": package_release_changes,
    }
    checks = [
        report["publicR3"]["baselineSiteTree"] == PUBLIC_SITE_TREE,
        report["technicalShowcaseV2"]["baselineTree"] == V2_TREE,
        set(authorized_core_changes) == AUTHORIZED_CORE_FIX_PATHS,
        not unexpected_protected_changes,
        report["themes"]["byteIdentical"],
        not package_release_changes,
        report["corpora"]["baselineV01Tree"] == V01_CORPUS_TREE,
        not report["corpora"]["v01ChangedPaths"],
        report["corpora"]["v0.1"]["allMatch"],
        report["corpora"]["v0.2"]["allMatch"],
        not tracked_os_artifacts,
        not path_leaks,
    ]
    if not all(checks):
        report["result"] = "FAIL"
    output = repository / "specimen-study" / "audit" / "corpus-v0.2-preservation.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
