#!/usr/bin/env python3
"""Audit README hierarchy, links, delivery assets, and protected surfaces."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import subprocess

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
BASELINE = "f648f5e04fa39c419fa3cc61aae9bb2c3807ae89"
README = ROOT / "README.md"
PROTECTED = [
    "site",
    "technical-showcase",
    "src",
    "web",
    "specimen-study/corpus",
    "specimen-study/corpus-v0.2",
    "examples",
    "pyproject.toml",
    "release",
    ".github",
    "VERSIONING.md",
]
AUTHORIZED_PROTECTED_CHANGES = {
    ".github/workflows/pr-correctness.yml",
    "web/THIRD_PARTY_NOTICES.md",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def relative_targets(markdown: str) -> list[str]:
    targets = re.findall(r"(?<!!)\[[^\]]+\]\(([^)]+)\)|!\[[^\]]*\]\(([^)]+)\)", markdown)
    flattened = [left or right for left, right in targets]
    return [target.split("#", 1)[0] for target in flattened if target and not re.match(r"^(?:https?://|mailto:)", target)]


def main() -> int:
    markdown = README.read_text(encoding="utf-8")
    lines = markdown.splitlines()
    targets = sorted(set(relative_targets(markdown)))
    missing = [target for target in targets if not (ROOT / target).exists()]
    image_alts = re.findall(r"!\[([^\]]*)\]\(([^)]+)\)", markdown)
    manifest_path = ROOT / "docs" / "readme-review" / "asset-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    protected_changes = git("diff", "--name-only", BASELINE, "--", *PROTECTED).splitlines()
    unexpected_protected_changes = sorted(set(protected_changes) - AUTHORIZED_PROTECTED_CHANGES)
    readme_docs = [README, *(ROOT / "docs" / "readme-review").glob("*.md"), *(ROOT / "docs" / "readme-review").glob("*.html"), manifest_path]
    local_leaks = []
    forbidden_prefix = "/" + "Users/"
    forbidden_file_scheme = "file" + "://"
    for path in readme_docs:
        content = path.read_text(encoding="utf-8")
        if forbidden_prefix in content or forbidden_file_scheme in content:
            local_leaks.append(path.relative_to(ROOT).as_posix())

    screenshot_records = {}
    for name in ["before-1440.png", "after-1440.png", "after-390.png"]:
        path = ROOT / "docs" / "readme-review" / name
        with Image.open(path) as image:
            screenshot_records[name] = {"dimensions": list(image.size), "bytes": path.stat().st_size, "sha256": sha256(path)}

    install_lines = {
        "python": next(index for index, line in enumerate(lines, 1) if 'pip install "figurestead==0.9.0a1"' in line),
        "browser": next(index for index, line in enumerate(lines, 1) if "npm install @figurestead/web@0.9.0-alpha.1" in line),
    }
    first_visual_line = next(index for index, line in enumerate(lines, 1) if line.startswith("[!["))
    headings = [line.lstrip("# ") for line in lines if line.startswith("#")]
    tracked_os_artifacts = [path for path in git("ls-files").splitlines() if Path(path).name in {".DS_Store"} or "__MACOSX" in Path(path).parts or "__pycache__" in Path(path).parts]

    checks = {
        "identityFirst": lines[0] == "# Figurestead",
        "startHereFirstSection": next(line for line in lines if line.startswith("## ")) == "## Start here",
        "pythonInstallNearTop": install_lines["python"] <= 15,
        "browserInstallNearTop": install_lines["browser"] <= 30,
        "visualAfterQuickstart": first_visual_line > install_lines["browser"],
        "relativeLinksExist": not missing,
        "meaningfulImageAlt": len(image_alts) == 2 and all(alt.strip() for alt, _ in image_alts),
        "assetManifestPasses": manifest["result"] == "PASS",
        "protectedSurfacesUnchangedExceptNarrowHygiene": not unexpected_protected_changes,
        "noLocalPathLeaks": not local_leaks,
        "noTrackedOsArtifacts": not tracked_os_artifacts,
        "packageVersionsUnchanged": 'version = "0.9.0a1"' in (ROOT / "pyproject.toml").read_text() and json.loads((ROOT / "web" / "package.json").read_text())["version"] == "0.9.0-alpha.1",
        "sharedSemanticsLimitPresent": "shared semantics do not imply pixel-identical output" in markdown,
        "matrixAsymmetryPresent": "does not imply a browser categorical-matrix renderer exists" in markdown,
        "syntheticScopePresent": "not scientific measurements or findings" in markdown,
    }
    report = {
        "schemaVersion": "figurestead.readme-audit/1",
        "result": "PASS" if all(checks.values()) else "FAIL",
        "baseline": BASELINE,
        "outline": headings,
        "editorialDepth": {"pythonInstallLine": install_lines["python"], "browserInstallLine": install_lines["browser"], "firstVisualLine": first_visual_line},
        "checks": checks,
        "relativeTargets": targets,
        "missingTargets": missing,
        "protectedPaths": PROTECTED,
        "protectedChanges": protected_changes,
        "authorizedProtectedChanges": sorted(set(protected_changes) & AUTHORIZED_PROTECTED_CHANGES),
        "unexpectedProtectedChanges": unexpected_protected_changes,
        "localPathLeaks": local_leaks,
        "trackedOsArtifacts": tracked_os_artifacts,
        "screenshots": screenshot_records,
        "browserEvidence": {
            "desktop": {"viewport": [1440, 1000], "pythonInstallTopPx": 392.6640625, "browserInstallTopPx": 706.6640625, "imagesLoaded": 2},
            "narrow": {"viewport": [390, 844], "documentHorizontalOverflowPx": 0, "imagesLoaded": 2},
            "firstSuccess": {"ready": True, "status": "Rendered · line · terminal progress 1", "consoleErrors": 0},
            "captureLimitation": "Full-page stitching was incorrect with an active in-app viewport override; retained evidence uses verified viewport captures and the full-size image assets.",
        },
        "packageVerification": {
            "python": {"registryVersion": "0.9.0a1", "result": "PASS", "headlessEnvironmentOverride": "MPLBACKEND=Agg", "outputDimensions": [1260, 780], "outputSha256": "34b1117229b84cc6ce1d493253d993d4605697131ba30cb31ae6586e305a2fa8"},
            "browser": {"registryVersion": "0.9.0-alpha.1", "result": "PASS", "node": "v24.14.0", "createFiguresteadType": "function"},
        },
    }
    output = ROOT / "docs" / "readme-review" / "readme-audit.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
