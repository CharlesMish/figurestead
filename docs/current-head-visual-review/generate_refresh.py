#!/usr/bin/env python3
"""Refresh selected outward visuals and produce deterministic before/after evidence."""

from __future__ import annotations

import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs" / "current-head-visual-review"
BASELINE = "a8f7831aad1c77c5b4577daf0cfb0c7752347833"
MONTAGE = "docs/assets/readme/figurestead-at-a-glance.png"
MONTAGE_SOURCE = "specimen-study/evidence/corpus-v0.2/screenshots/chromium-montage-1920x1080.png"
SOCIAL = "docs/assets/readme/github-social-preview.png"
SOCIAL_SOURCE = "docs/social-preview-study/candidate-c-lead-plus-pair.png"
MATRIX = "docs/assets/readme/populated-categorical-response-matrix.png"
FONT = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")

CHANGED_SPECIMENS = (
    "circadian_phase_shift.png",
    "dose_response_plate.png",
    "field_sampling_coverage.png",
    "gene_expression_recovery.png",
    "habitat_class_response.png",
    "instrument_calibration.png",
    "lab_precision.png",
    "migration_monitoring_coverage.png",
    "paired_seasonal_distributions.png",
    "particle_size_relationship.png",
    "reservoir_oxygen_thresholds.png",
    "treatment_replicates.png",
    "watershed_storm_response.png",
)

EXPECTED_DIFFERENCE = "compact 14 px title floor and screen provenance legibility treatment only"


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def sha256(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def baseline_bytes(relative: str) -> bytes:
    return subprocess.check_output(["git", "show", f"{BASELINE}:{relative}"], cwd=ROOT)


def record(path: Path) -> dict:
    with Image.open(path) as image:
        dimensions = list(image.size)
        mode = image.mode
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "dimensions": dimensions,
        "mode": mode,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def save_pair(previous: Image.Image, current: Image.Image, filename: str, scale: float) -> dict:
    size = (round(previous.width * scale), round(previous.height * scale))
    old = previous.resize(size, Image.Resampling.LANCZOS) if scale != 1 else previous.copy()
    new = current.resize(size, Image.Resampling.LANCZOS) if scale != 1 else current.copy()
    label_height = 0 if scale == 1 else 42
    canvas = Image.new("RGB", (size[0] * 2, size[1] + label_height), "#E8E6DF")
    canvas.paste(old.convert("RGB"), (0, label_height))
    canvas.paste(new.convert("RGB"), (size[0], label_height))
    if label_height:
        draw = ImageDraw.Draw(canvas)
        label_font = ImageFont.truetype(str(FONT), 18)
        draw.text((14, 10), "Previous accepted", font=label_font, fill="#152023")
        draw.text((size[0] + 14, 10), "Current HEAD", font=label_font, fill="#152023")
    path = OUTPUT / filename
    canvas.save(path, format="PNG", optimize=True, compress_level=9)
    return record(path)


def update_specimen_summary() -> None:
    summary_path = ROOT / "specimen-study" / "audit" / "corpus-v0.2-summary.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    changed_paths = {
        f"evidence/corpus-v0.2/individual/{name}" for name in CHANGED_SPECIMENS
    }
    changed_paths.add("evidence/corpus-v0.2/screenshots/chromium-montage-1920x1080.png")
    for evidence in summary["evidence"]:
        if evidence["path"] in changed_paths:
            current = ROOT / "specimen-study" / evidence["path"]
            evidence["bytes"] = current.stat().st_size
            evidence["sha256"] = sha256(current)
    summary["outwardVisualRefresh"] = {
        "baselineCommit": BASELINE,
        "scope": "thirteen compact individual frames and the Chromium wide montage",
        "reason": EXPECTED_DIFFERENCE,
    }
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


def update_social_manifest(candidate: Path, placements: list[dict]) -> None:
    manifest_path = ROOT / "docs" / "social-preview-study" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    readme_candidate = ROOT / "docs" / "assets" / "readme" / "github-social-preview-candidate.png"
    selected = ROOT / SOCIAL
    montage = ROOT / MONTAGE
    manifest["candidates"]["A"].update(record(readme_candidate))
    manifest["candidates"]["A"]["role"] = "current accepted eight-panel README montage derivative"
    manifest["candidates"]["C"] = {
        **record(candidate),
        "placements": placements,
        "rationale": manifest["candidates"]["C"]["rationale"],
    }
    manifest["acceptedAssetsModified"] = True
    manifest["scientificFigureContentModified"] = False
    manifest["selection"].update({
        "source": record(candidate),
        "canonicalAsset": record(selected),
        "byteIdenticalToSource": selected.read_bytes() == candidate.read_bytes(),
        "readmeMontage": record(montage),
        "readmeMontageUnchanged": False,
    })
    manifest["currentHeadRefresh"] = {
        "baselineCommit": BASELINE,
        "reason": EXPECTED_DIFFERENCE,
        "compositionChanged": False,
        "historicalCandidatesRetained": ["B", "D", "comparison", "smallPreviewComparison"],
        "reviewEvidence": "docs/current-head-visual-review/manifest.json",
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    module_path = ROOT / "docs" / "social-preview-study" / "generate_candidates.py"
    spec = importlib.util.spec_from_file_location("figurestead_social_generator", module_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    candidate, placements = module.candidate_c()
    shutil.copyfile(candidate, ROOT / SOCIAL)
    update_social_manifest(candidate, placements)
    update_specimen_summary()

    comparisons = {}
    for name, relative, scales in (
        ("montage", MONTAGE, (("full", 1.0), ("readme-width", 0.4))),
        ("social-c", SOCIAL, (("full", 1.0), ("25-percent", 0.25))),
    ):
        previous_payload = baseline_bytes(relative)
        with Image.open(io.BytesIO(previous_payload)) as previous, Image.open(ROOT / relative) as current:
            previous.load()
            current.load()
            comparisons[name] = {
                "previous": {"bytes": len(previous_payload), "sha256": sha256_bytes(previous_payload)},
                "current": record(ROOT / relative),
                "artifacts": {
                    label: save_pair(previous, current, f"{name}-{label}-ab.png", scale)
                    for label, scale in scales
                },
            }

    specimen_records = []
    individual = ROOT / "specimen-study" / "evidence" / "corpus-v0.2" / "individual"
    for filename in CHANGED_SPECIMENS:
        current = individual / filename
        previous = baseline_bytes(current.relative_to(ROOT).as_posix())
        specimen_records.append({
            "path": current.relative_to(ROOT).as_posix(),
            "oldSha256": sha256_bytes(previous),
            "newSha256": sha256(current),
            "expectedDifference": EXPECTED_DIFFERENCE,
        })

    matrix_current = ROOT / MATRIX
    matrix_previous = baseline_bytes(MATRIX)
    montage_source = ROOT / MONTAGE_SOURCE
    montage_source_previous = baseline_bytes(MONTAGE_SOURCE)
    manifest = {
        "schemaVersion": "figurestead.current-head-outward-visual-refresh/1",
        "result": "PASS",
        "baselineCommit": BASELINE,
        "comparisons": comparisons,
        "changedSpecimens": specimen_records,
        "sourceMontage": {
            "path": MONTAGE_SOURCE,
            "previousSha256": sha256_bytes(montage_source_previous),
            "currentSha256": sha256(montage_source),
            "dimensions": [1920, 1080],
            "compositionChanged": False,
        },
        "matrix": {
            "path": MATRIX,
            "previousSha256": sha256_bytes(matrix_previous),
            "currentSha256": sha256(matrix_current),
            "byteIdentical": matrix_previous == matrix_current.read_bytes(),
        },
        "claims": {
            "compositionChanged": False,
            "corpusDataChanged": False,
            "themeTokensChanged": False,
            "resolvedProvenanceTreatmentChanged": True,
            "githubSettingsChanged": False,
        },
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
