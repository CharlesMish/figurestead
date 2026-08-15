#!/usr/bin/env python3
"""Verify the selected current social preview and retained historical study."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
STUDY = ROOT / "docs" / "social-preview-study"
BASELINE = "f648f5e04fa39c419fa3cc61aae9bb2c3807ae89"
ACCEPTED_ASSETS = {
    "docs/assets/readme/figurestead-at-a-glance.png": "0f5d17e95abbac62d4ef1e9952928a6b5ea266d3e362f404e42c8efc26fa3656",
    "docs/assets/readme/populated-categorical-response-matrix.png": "347517b89a32098dba055de3e5c44d1ac484a5b2abc28d264862e6ba7f64152c",
    "docs/assets/readme/github-social-preview-candidate.png": "e9d6c176adb034d2785b8c3fd649fc59449ef0ad7e85ae4f73ba3ddacdeb4969",
}
SELECTED_ASSET = ROOT / "docs" / "assets" / "readme" / "github-social-preview.png"
SELECTED_SHA256 = "fff8f95fa6e7e3a708dec6356225d75eae557f4cf2d758cb7f8b4c1703e2ec54"
PROTECTED = [
    "README.md",
    *ACCEPTED_ASSETS,
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
        placements_valid = all(placement["sourceCrop"] == [0, 0, 674, 408] for placement in record["placements"])
        current_sources = all(
            sha256(ROOT / placement["sourcePath"]) == placement["sourceSha256"]
            for placement in record["placements"]
        ) if key == "C" else None
        candidate_results[key] = {
            "dimensions": dimensions,
            "mode": mode,
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "manifestMatches": sha256(path) == record["sha256"] and path.stat().st_size == record["bytes"],
            "fullFramesOnly": placements_valid,
            "currentSourceHashesMatch": current_sources,
        }

    with Image.open(SELECTED_ASSET) as selected:
        selected_dimensions = list(selected.size)
        selected_mode = selected.mode
    selected_results = {
        "path": SELECTED_ASSET.relative_to(ROOT).as_posix(),
        "dimensions": selected_dimensions,
        "mode": selected_mode,
        "bytes": SELECTED_ASSET.stat().st_size,
        "sha256": sha256(SELECTED_ASSET),
        "matchesCandidateC": SELECTED_ASSET.read_bytes() == (STUDY / "candidate-c-lead-plus-pair.png").read_bytes(),
    }

    protected_changes = git("diff", "--name-only", BASELINE, "--", *PROTECTED).splitlines()
    unexpected_protected_changes = [
        path for path in protected_changes
        if path.startswith(("site/", "technical-showcase/", "src/", "examples/", "release/"))
        or path in {"README.md", "pyproject.toml", "VERSIONING.md"}
    ]
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
        "currentAcceptedReadmeAssetsMatch": all(item["matches"] for item in accepted_results.values()),
        "threeAlternatesPresent": set(candidate_results) == {"B", "C", "D"},
        "allCandidates1280x640Rgb": all(item["dimensions"] == [1280, 640] and item["mode"] == "RGB" for item in candidate_results.values()),
        "candidateHashesMatchManifest": all(item["manifestMatches"] for item in candidate_results.values()),
        "fullFramesOnly": all(item["fullFramesOnly"] for item in candidate_results.values()),
        "currentCandidateSourcesMatch": candidate_results["C"]["currentSourceHashesMatch"] is True,
        "contactSheetPresent": (STUDY / "comparison-contact-sheet.png").exists(),
        "smallPreviewStripPresent": (STUDY / "small-preview-strip.png").exists(),
        "protectedSurfacesUnchanged": not unexpected_protected_changes,
        "noLocalPathLeaks": not local_leaks,
        "noTrackedOsArtifacts": not tracked_artifacts,
        "refreshFlags": manifest["acceptedAssetsModified"] is True and manifest["scientificFigureContentModified"] is False,
        "recommendationRecorded": manifest["recommendation"] == "candidate C",
        "selectionRecorded": (
            manifest["selection"]["candidate"] == "C"
            and manifest["selection"]["canonicalAsset"]["path"] == selected_results["path"]
            and manifest["selection"]["githubSettingsChanged"] is False
        ),
        "selectedAssetCanonical": (
            selected_results["dimensions"] == [1280, 640]
            and selected_results["mode"] == "RGB"
            and selected_results["sha256"] == SELECTED_SHA256
            and selected_results["matchesCandidateC"]
        ),
        "matrixPreserved": accepted_results["docs/assets/readme/populated-categorical-response-matrix.png"]["matches"],
        "historicalStudyArtifactsRetained": manifest["currentHeadRefresh"]["historicalCandidatesRetained"] == ["B", "D", "comparison", "smallPreviewComparison"],
    }
    report = {
        "schemaVersion": "figurestead.social-preview-audit/1",
        "result": "PASS" if all(checks.values()) else "FAIL",
        "baselineCommit": BASELINE,
        "checks": checks,
        "acceptedAssets": accepted_results,
        "candidates": candidate_results,
        "selectedAsset": selected_results,
        "protectedPaths": PROTECTED,
        "protectedChanges": protected_changes,
        "unexpectedProtectedChanges": unexpected_protected_changes,
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
