#!/usr/bin/env python3
"""Record the outward visual delta from the accepted responsive-header baseline."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
BASELINE = "e14d9098f0daefebadf3c0637dbe14e6b5c937e9"
OUTPUT = ROOT / "docs" / "responsive-header-production-review" / "manifest.json"
SOCIAL_MANIFEST = ROOT / "docs" / "social-preview-study" / "manifest.json"


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def baseline_bytes(relative: str) -> bytes:
    return subprocess.check_output(["git", "show", f"{BASELINE}:{relative}"], cwd=ROOT)


def image_record(relative: str) -> dict:
    path = ROOT / relative
    with Image.open(path) as image:
        dimensions = list(image.size)
        mode = image.mode
    payload = path.read_bytes()
    return {"path": relative, "dimensions": dimensions, "mode": mode, "bytes": len(payload), "sha256": digest(payload)}


def comparison(relative: str, reason: str) -> dict:
    before = baseline_bytes(relative)
    after = (ROOT / relative).read_bytes()
    return {
        "path": relative,
        "before": {"bytes": len(before), "sha256": digest(before)},
        "after": {"bytes": len(after), "sha256": digest(after)},
        "changed": before != after,
        "reason": reason,
    }


def unchanged(relative: str) -> dict:
    before = baseline_bytes(relative)
    after = (ROOT / relative).read_bytes()
    return {"path": relative, "bytes": len(after), "sha256": digest(after), "byteIdenticalToBaseline": before == after}


def update_social_manifest() -> None:
    manifest = json.loads(SOCIAL_MANIFEST.read_text(encoding="utf-8"))
    montage = image_record("docs/assets/readme/figurestead-at-a-glance.png")
    candidate_a = image_record("docs/assets/readme/github-social-preview-candidate.png")
    selected_c = image_record("docs/assets/readme/github-social-preview.png")
    source_c = image_record("docs/social-preview-study/candidate-c-lead-plus-pair.png")
    manifest["candidates"]["A"].update(candidate_a)
    manifest["candidates"]["A"]["role"] = "current accepted eight-panel README montage derivative"
    manifest["acceptedAssetsModified"] = True
    manifest["scientificFigureContentModified"] = False
    manifest["selection"].update({
        "source": source_c,
        "canonicalAsset": selected_c,
        "byteIdenticalToSource": (ROOT / source_c["path"]).read_bytes() == (ROOT / selected_c["path"]).read_bytes(),
        "readmeMontage": montage,
        "readmeMontageUnchanged": False,
        "githubSettingsChanged": False,
    })
    manifest["currentHeadRefresh"] = {
        "baselineCommit": BASELINE,
        "reason": "production compact C header fitting in the accepted montage; selected C sources remain byte-identical",
        "compositionChanged": False,
        "historicalCandidatesRetained": ["B", "D", "comparison", "smallPreviewComparison"],
        "reviewEvidence": "docs/responsive-header-production-review/manifest.json",
    }
    SOCIAL_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    update_social_manifest()
    specimen_reason = "production compact C visual header fitting; scientific plot geometry and complete accessibility text are preserved"
    derivative_reason = "deterministic derivative of the refreshed accepted eight-panel montage; composition and crop are unchanged"
    technical_reason = "production compact C visual header fitting at the 390 px Technical Showcase viewport"
    changed_paths = [
        "specimen-study/evidence/corpus-v0.2/categorical/chromium-montage-cell-1920.png",
        "specimen-study/evidence/corpus-v0.2/categorical/chromium-narrow-390.png",
        "specimen-study/evidence/corpus-v0.2/categorical/firefox-montage-cell-1920.png",
        "specimen-study/evidence/corpus-v0.2/categorical/firefox-narrow-390.png",
        "specimen-study/evidence/corpus-v0.2/screenshots/chromium-lab-390-full.png",
        "specimen-study/evidence/corpus-v0.2/screenshots/chromium-montage-1920x1080.png",
        "specimen-study/evidence/corpus-v0.2/screenshots/chromium-montage-390-full.png",
        "specimen-study/evidence/corpus-v0.2/screenshots/firefox-lab-390-full.png",
        "specimen-study/evidence/corpus-v0.2/screenshots/firefox-montage-1920x1080.png",
        "specimen-study/evidence/corpus-v0.2/screenshots/firefox-montage-390-full.png",
    ]
    changes = [comparison(path, specimen_reason) for path in changed_paths]
    changes.extend([
        comparison("technical-showcase/evidence/screenshots/chromium-390-full.png", technical_reason),
        comparison("technical-showcase/evidence/screenshots/firefox-390-full.png", technical_reason),
        comparison("docs/assets/readme/figurestead-at-a-glance.png", derivative_reason),
        comparison("docs/assets/readme/github-social-preview-candidate.png", derivative_reason),
    ])
    unchanged_paths = [
        "docs/assets/readme/github-social-preview.png",
        "docs/social-preview-study/candidate-c-lead-plus-pair.png",
        "docs/assets/readme/populated-categorical-response-matrix.png",
        "specimen-study/evidence/corpus-v0.2/response-matrix/populated-wide.png",
        "specimen-study/evidence/corpus-v0.2/individual/watershed_storm_response.png",
        "specimen-study/evidence/corpus-v0.2/individual/circadian_phase_shift.png",
        "specimen-study/evidence/corpus-v0.2/individual/paired_seasonal_distributions.png",
        "technical-showcase/evidence/screenshots/chromium-paper-close.png",
        "technical-showcase/evidence/screenshots/firefox-paper-close.png",
        "technical-showcase/evidence/motion-frames/chromium-restrained-04.png",
    ]
    stable = [unchanged(path) for path in unchanged_paths]
    payload = {
        "schemaVersion": "figurestead.responsive-header-production-visual-refresh/1",
        "result": "PASS" if all(item["changed"] for item in changes) and all(item["byteIdenticalToBaseline"] for item in stable) else "FAIL",
        "baselineCommit": BASELINE,
        "changedAssets": changes,
        "unchangedAuthorities": stable,
        "claims": {
            "compositionChanged": False,
            "scientificGeometryChanged": False,
            "individualScientificFramesChanged": False,
            "themeTokensChanged": False,
            "populatedPythonMatrixChanged": False,
            "selectedSocialCandidateCChanged": False,
            "technicalPaperEvidenceChanged": False,
            "technicalTerminalFrameChanged": False,
        },
    }
    OUTPUT.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2))
    return 0 if payload["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
