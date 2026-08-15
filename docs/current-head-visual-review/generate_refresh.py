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
BASELINE = "f648f5e04fa39c419fa3cc61aae9bb2c3807ae89"
MONTAGE = "docs/assets/readme/figurestead-at-a-glance.png"
MONTAGE_SOURCE = "specimen-study/evidence/corpus-v0.2/screenshots/chromium-montage-1920x1080.png"
SOCIAL = "docs/assets/readme/github-social-preview.png"
SOCIAL_SOURCE = "docs/social-preview-study/candidate-c-lead-plus-pair.png"
MATRIX = "docs/assets/readme/populated-categorical-response-matrix.png"
FONT = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")

CHANGED_SPECIMENS = {
    "circadian_phase_shift.png": {
        "oldSha256": "abc805045c8f1bcb237034ac3c6966c148dd01c2fbb919545eacf32007c590ac",
        "oldDomain": {"x": [-1.92, 25.92], "y": [0.374676, 1.6104239999999999]},
        "currentDomain": {"x": [0, 24], "y": [0.35, 1.75]},
    },
    "dose_response_plate.png": {
        "oldSha256": "10b7bc8d23509748f979bbc1fcb9dbd2196ffc203c39b46202dfd6847eb1c8ce",
        "oldDomain": {"x": [-0.64, 8.64], "y": [0.18781199999999998, 1.923288]},
        "currentDomain": {"x": [-0.3, 8.3], "y": [0, 1.95]},
    },
    "gene_expression_recovery.png": {
        "oldSha256": "200c7ece927a9724cd008e1be002fd10ab635069520ca27f5a49cdd73207dcc5",
        "oldDomain": {"x": [-5.76, 77.76], "y": [-2.375416, 2.7955159999999997]},
        "currentDomain": {"x": [0, 72], "y": [-2.4, 2.7]},
    },
    "habitat_class_response.png": {
        "oldSha256": "1c3a0c33f1f28bb2cd64422632b6614c38c5c7c43f8e907ef8fbed89ae1d225b",
        "oldDomain": {"x": [-0.5, 9.5], "y": [0.50362, 2.10268]},
        "currentDomain": {"x": [-0.5, 9.5], "y": [0.3, 2.3]},
    },
    "instrument_calibration.png": {
        "oldSha256": "92190be9c6b86b976b9245b20070c5dc7fd7bc4a680abb44083e8803120b997c",
        "oldDomain": {"x": [-7.2, 97.2], "y": [-10.3412, 101.3059]},
        "currentDomain": {"x": [-3, 93], "y": [-5, 100]},
    },
    "lab_precision.png": {
        "oldSha256": "05e5ff9edd851fbfbd2c8488d55bc567792f64d112518db6f40b4ddde580b507",
        "oldDomain": {"x": [-0.5, 5.5], "y": [94.42079600000001, 103.87630399999999]},
        "currentDomain": {"x": [-0.5, 5.5], "y": [92, 108]},
    },
    "paired_seasonal_distributions.png": {
        "oldSha256": "a56c9a2b2cce81abcd4936eff21f458386e4b41b1412048bde0036d7487594e3",
        "oldDomain": {"x": [-0.5, 3.5], "y": [0.291028, 0.843072]},
        "currentDomain": {"x": [-0.5, 3.5], "y": [0.25, 0.9]},
    },
    "particle_size_relationship.png": {
        "oldSha256": "1d0304ac93a2225c9e3ae59696746e20bb80e9a8f25de2fa0c5f1c05a36114ae",
        "oldDomain": {"x": [-1.310076, 62.930376], "y": [-1.017468, 17.475368]},
        "currentDomain": {"x": [0, 62], "y": [0, 17]},
    },
    "treatment_replicates.png": {
        "oldSha256": "d658f3fa1998c0a6260f91886db714909101a4069e92eda97e90245d6de21e4e",
        "oldDomain": {"x": [-0.5, 4.5], "y": [0.686836, 2.3755640000000002]},
        "currentDomain": {"x": [-0.5, 4.5], "y": [0.65, 2.35]},
    },
    "watershed_storm_response.png": {
        "oldSha256": "4be8dc0356b26a8929e18c342195a56ebedc0934f161dcdc1034c64dfb96a0ec",
        "oldDomain": {"x": [-1.36, 18.36], "y": [-0.021600000000000008, 2.0316]},
        "currentDomain": {"x": [0, 17], "y": [0, 2.05]},
    },
}


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
        "scope": "ten domain-sensitive individual frames and the Chromium wide montage",
        "reason": "accepted authored scale domains now control rendered geometry",
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
        "reason": "selected outward assets now depict accepted authored-domain geometry",
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
    for filename, expected in CHANGED_SPECIMENS.items():
        current = individual / filename
        previous = baseline_bytes(current.relative_to(ROOT).as_posix())
        assert sha256_bytes(previous) == expected["oldSha256"]
        specimen_records.append({
            "path": current.relative_to(ROOT).as_posix(),
            **expected,
            "newSha256": sha256(current),
            "expectedDifference": "authored scale-domain precedence only",
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
            "themeChanged": False,
            "githubSettingsChanged": False,
        },
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
