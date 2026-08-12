#!/usr/bin/env python3
"""Verify the social-preview study without touching accepted surfaces."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
STUDY = ROOT / "docs" / "social-preview-study"
BASELINE = "88ee3f93f2799764f74cad5cb547f9d2383c464c"
ACCEPTED_ASSETS = {
    "docs/assets/readme/figurestead-at-a-glance.png": "f8ff7b5101ccf2cd4d9fdecdcfa455866adac7da34ab723aea021dc9cfd044f6",
    "docs/assets/readme/populated-categorical-response-matrix.png": "347517b89a32098dba055de3e5c44d1ac484a5b2abc28d264862e6ba7f64152c",
    "docs/assets/readme/github-social-preview-candidate.png": "7bfa485b77033ae10fa1a8d43b6350ede6e9b24474ef38ad4de2c02e2105c05e",
}
PROTECTED = [
    "README.md",
    "docs/assets/readme",
    "docs/readme-review",
    "site",
    "technical-showcase",
    "src",
    "web",
    "specimen-study",
    "examples",
    "pyproject.toml",
    "release",
    ".github",
    "VERSIONING.md",
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def main() -> int:
    manifest = json.loads((STUDY / "manifest.json").read_text(encoding="utf-8"))
    accepted_results = {
        path: {"expectedSha256": expected, "actualSha256": sha256(ROOT / path), "matches": sha256(ROOT / path) == expected}
        for path, expected in ACCEPTED_ASSETS.items()
    }
    candidate_results = {}
    for key in ["B", "C", "D"]:
        record = manifest["candidates"][key]
        path = ROOT / record["path"]
        with Image.open(path) as image:
            dimensions = list(image.size)
            mode = image.mode
        placements_valid = all(
            placement["sourceCrop"] == [0, 0, 674, 408]
            and sha256(ROOT / placement["sourcePath"]) == placement["sourceSha256"]
            for placement in record["placements"]
        )
        candidate_results[key] = {
            "dimensions": dimensions,
            "mode": mode,
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "manifestMatches": sha256(path) == record["sha256"] and path.stat().st_size == record["bytes"],
            "fullAcceptedFramesOnly": placements_valid,
        }

    protected_changes = git("diff", "--name-only", BASELINE, "--", *PROTECTED).splitlines()
    tracked_artifacts = [
        path for path in git("ls-files").splitlines()
        if Path(path).name == ".DS_Store" or "__MACOSX" in Path(path).parts or "__pycache__" in Path(path).parts
    ]
    text_paths = [STUDY / "README.md", STUDY / "generate_candidates.py", STUDY / "manifest.json"]
    local_leaks = []
    forbidden_prefix = "/" + "Users/"
    forbidden_file_scheme = "file" + "://"
    for path in text_paths:
        content = path.read_text(encoding="utf-8")
        if forbidden_prefix in content or forbidden_file_scheme in content:
            local_leaks.append(path.relative_to(ROOT).as_posix())

    checks = {
        "baselineAUnchanged": accepted_results["docs/assets/readme/github-social-preview-candidate.png"]["matches"],
        "allAcceptedReadmeAssetsUnchanged": all(item["matches"] for item in accepted_results.values()),
        "threeAlternatesPresent": set(candidate_results) == {"B", "C", "D"},
        "allCandidates1280x640Rgb": all(item["dimensions"] == [1280, 640] and item["mode"] == "RGB" for item in candidate_results.values()),
        "candidateHashesMatchManifest": all(item["manifestMatches"] for item in candidate_results.values()),
        "fullAcceptedEvidenceFramesOnly": all(item["fullAcceptedFramesOnly"] for item in candidate_results.values()),
        "contactSheetPresent": (STUDY / "comparison-contact-sheet.png").exists(),
        "smallPreviewStripPresent": (STUDY / "small-preview-strip.png").exists(),
        "protectedSurfacesUnchanged": not protected_changes,
        "noLocalPathLeaks": not local_leaks,
        "noTrackedOsArtifacts": not tracked_artifacts,
        "reviewOnlyFlags": manifest["acceptedAssetsModified"] is False and manifest["scientificFigureContentModified"] is False,
        "recommendationRecorded": manifest["recommendation"] == "candidate C",
    }
    report = {
        "schemaVersion": "figurestead.social-preview-audit/1",
        "result": "PASS" if all(checks.values()) else "FAIL",
        "baselineCommit": BASELINE,
        "checks": checks,
        "acceptedAssets": accepted_results,
        "candidates": candidate_results,
        "protectedPaths": PROTECTED,
        "protectedChanges": protected_changes,
        "localPathLeaks": local_leaks,
        "trackedOsArtifacts": tracked_artifacts,
        "deploymentInvoked": False,
        "ownerGithubSettingsChanged": False,
    }
    (STUDY / "audit.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
