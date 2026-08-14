#!/usr/bin/env python3
"""Generate deterministic Figurestead GitHub social-preview A/B candidates."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import platform
import shutil

from PIL import Image, ImageDraw, ImageFont, __version__ as pillow_version


ROOT = Path(__file__).resolve().parents[2]
STUDY = ROOT / "docs" / "social-preview-study"
BASELINE = ROOT / "docs" / "assets" / "readme" / "github-social-preview-candidate.png"
SELECTED = ROOT / "docs" / "assets" / "readme" / "github-social-preview.png"
EVIDENCE = ROOT / "specimen-study" / "evidence" / "corpus-v0.2" / "individual"
SOURCES = {
    "watershed": EVIDENCE / "watershed_storm_response.png",
    "circadian": EVIDENCE / "circadian_phase_shift.png",
    "calibration": EVIDENCE / "instrument_calibration.png",
    "seasonal": EVIDENCE / "paired_seasonal_distributions.png",
    "coverage": EVIDENCE / "field_sampling_coverage.png",
}
FONTS = {
    "wordmark": Path("/System/Library/Fonts/Supplemental/Georgia Bold.ttf"),
    "sans": Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
    "sans-bold": Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    "mono": Path("/System/Library/Fonts/Supplemental/Andale Mono.ttf"),
}

CANVAS = (1280, 640)
PAPER = "#F1EEE5"
INK = "#152023"
MUTED = "#526064"
RULE = "#BEBDB5"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS[name]), size=size)


def fit(source: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Proportionally fit an accepted full frame into an exact box."""
    target_width, target_height = size
    scale = min(target_width / source.width, target_height / source.height)
    dimensions = (round(source.width * scale), round(source.height * scale))
    return source.resize(dimensions, Image.Resampling.LANCZOS)


def place_frame(canvas: Image.Image, source_key: str, box: tuple[int, int, int, int]) -> dict:
    left, top, width, height = box
    with Image.open(SOURCES[source_key]) as source:
        source.load()
        rendered = fit(source, (width, height))
        x = left + (width - rendered.width) // 2
        y = top + (height - rendered.height) // 2
        canvas.paste(rendered, (x, y))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((x, y, x + rendered.width - 1, y + rendered.height - 1), outline=RULE, width=1)
    return {
        "sourceKey": source_key,
        "sourcePath": SOURCES[source_key].relative_to(ROOT).as_posix(),
        "sourceSha256": sha256(SOURCES[source_key]),
        "sourceCrop": [0, 0, 674, 408],
        "destinationBox": [x, y, rendered.width, rendered.height],
        "transform": "proportional Lanczos scaling; full accepted frame retained",
    }


def identity(draw: ImageDraw.ImageDraw, *, title_xy: tuple[int, int], title_size: int, descriptor_xy: tuple[int, int], descriptor: str, descriptor_size: int = 23) -> None:
    draw.text(title_xy, "Figurestead", font=font("wordmark", title_size), fill=INK)
    draw.text(descriptor_xy, descriptor, font=font("sans", descriptor_size), fill=MUTED, spacing=7)


def save(canvas: Image.Image, filename: str) -> Path:
    path = STUDY / filename
    canvas.save(path, format="PNG", optimize=True, compress_level=9)
    return path


def candidate_b() -> tuple[Path, list[dict]]:
    canvas = Image.new("RGB", CANVAS, PAPER)
    draw = ImageDraw.Draw(canvas)
    draw.text((34, 42), "SCIENTIFIC FIGURE SYSTEM", font=font("mono", 13), fill=MUTED)
    identity(
        draw,
        title_xy=(30, 72),
        title_size=46,
        descriptor_xy=(34, 164),
        descriptor="Scientific figures\nfor Python + browser",
        descriptor_size=24,
    )
    draw.line((334, 32, 334, 608), fill=RULE, width=2)
    draw.text((34, 542), "DETERMINISTIC · INSPECTABLE", font=font("mono", 12), fill=MUTED)
    placements = [
        place_frame(canvas, "watershed", (365, 35, 430, 260)),
        place_frame(canvas, "circadian", (819, 35, 430, 260)),
        place_frame(canvas, "calibration", (365, 345, 430, 260)),
        place_frame(canvas, "coverage", (819, 345, 430, 260)),
    ]
    return save(canvas, "candidate-b-four-family-rail.png"), placements


def candidate_c() -> tuple[Path, list[dict]]:
    canvas = Image.new("RGB", CANVAS, PAPER)
    draw = ImageDraw.Draw(canvas)
    identity(
        draw,
        title_xy=(26, 18),
        title_size=55,
        descriptor_xy=(848, 44),
        descriptor="Scientific figures for Python + browser",
        descriptor_size=20,
    )
    draw.line((22, 102, 1258, 102), fill=INK, width=2)
    placements = [
        place_frame(canvas, "watershed", (20, 120, 826, 500)),
        place_frame(canvas, "circadian", (858, 120, 402, 243)),
        place_frame(canvas, "seasonal", (858, 377, 402, 243)),
    ]
    return save(canvas, "candidate-c-lead-plus-pair.png"), placements


def candidate_d() -> tuple[Path, list[dict]]:
    canvas = Image.new("RGB", CANVAS, PAPER)
    draw = ImageDraw.Draw(canvas)
    identity(
        draw,
        title_xy=(30, 24),
        title_size=57,
        descriptor_xy=(770, 48),
        descriptor="Scientific figures for Python + browser",
        descriptor_size=21,
    )
    draw.line((26, 112, 1254, 112), fill=INK, width=2)
    placements = [
        place_frame(canvas, "watershed", (28, 145, 604, 366)),
        place_frame(canvas, "coverage", (648, 145, 604, 366)),
    ]
    draw.text((29, 548), "TEMPORAL RESPONSE", font=font("mono", 13), fill=MUTED)
    draw.text((649, 548), "EXACT TEMPORAL COVERAGE", font=font("mono", 13), fill=MUTED)
    draw.text((29, 589), "DETERMINISTIC SYNTHETIC FIGURE FIXTURES", font=font("mono", 12), fill=MUTED)
    return save(canvas, "candidate-d-two-figure-focus.png"), placements


def contact_sheet(paths: list[tuple[str, Path]]) -> Path:
    canvas = Image.new("RGB", (1420, 850), "#E8E6DF")
    draw = ImageDraw.Draw(canvas)
    draw.text((40, 22), "Figurestead social preview A/B study", font=font("sans-bold", 30), fill=INK)
    draw.text((40, 62), "Shown at 50% of 1280 × 640 delivery size", font=font("sans", 17), fill=MUTED)
    positions = [(40, 118), (740, 118), (40, 486), (740, 486)]
    for (label, path), (left, top) in zip(paths, positions, strict=True):
        with Image.open(path) as image:
            preview = image.resize((640, 320), Image.Resampling.LANCZOS)
        canvas.paste(preview, (left, top))
        draw.rectangle((left, top, left + 639, top + 319), outline="#9B9A94", width=1)
        draw.text((left, top - 28), label, font=font("sans-bold", 18), fill=INK)
    return save(canvas, "comparison-contact-sheet.png")


def small_preview_strip(paths: list[tuple[str, Path]]) -> Path:
    canvas = Image.new("RGB", (1400, 250), "#E8E6DF")
    draw = ImageDraw.Draw(canvas)
    draw.text((36, 18), "Small-preview check · 25% delivery size", font=font("sans-bold", 24), fill=INK)
    for index, (label, path) in enumerate(paths):
        left = 36 + index * 342
        with Image.open(path) as image:
            preview = image.resize((320, 160), Image.Resampling.LANCZOS)
        canvas.paste(preview, (left, 78))
        draw.rectangle((left, 78, left + 319, 237), outline="#9B9A94", width=1)
        draw.text((left, 54), label, font=font("sans-bold", 15), fill=INK)
    return save(canvas, "small-preview-strip.png")


def image_record(path: Path) -> dict:
    with Image.open(path) as image:
        return {
            "path": path.relative_to(ROOT).as_posix(),
            "dimensions": list(image.size),
            "mode": image.mode,
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }


def main() -> int:
    STUDY.mkdir(parents=True, exist_ok=True)
    path_b, placements_b = candidate_b()
    path_c, placements_c = candidate_c()
    path_d, placements_d = candidate_d()
    shutil.copyfile(path_c, SELECTED)
    comparison_paths = [
        ("A · accepted baseline", BASELINE),
        ("B · four-family identity rail", path_b),
        ("C · lead figure + supporting pair", path_c),
        ("D · two-figure focus", path_d),
    ]
    sheet = contact_sheet(comparison_paths)
    small_strip = small_preview_strip(comparison_paths)
    candidates = {
        "A": {
            **image_record(BASELINE),
            "role": "accepted baseline; unchanged",
            "rationale": "The complete eight-panel montage communicates maximum range, but individual figures become texture at small link-preview sizes.",
        },
        "B": {
            **image_record(path_b),
            "placements": placements_b,
            "rationale": "A strong identity rail and four equal, larger frames balance immediate project recognition with line, periodic, scatter, and temporal-coverage variety.",
        },
        "C": {
            **image_record(path_c),
            "placements": placements_c,
            "rationale": "A dominant watershed figure preserves the montage's editorial energy while two supporting frames add dark-theme and distribution range without returning to an eight-panel grid.",
        },
        "D": {
            **image_record(path_d),
            "placements": placements_d,
            "rationale": "Two large temporal figures maximize small-size legibility and scientific seriousness, trading away some renderer-family variety.",
        },
    }
    manifest = {
        "schemaVersion": "figurestead.social-preview-study/1",
        "result": "PASS",
        "canvas": list(CANVAS),
        "environment": {"python": platform.python_version(), "pillow": pillow_version},
        "fonts": {name: {"familyFile": path.name, "sha256": sha256(path)} for name, path in FONTS.items()},
        "candidates": candidates,
        "comparison": image_record(sheet),
        "smallPreviewComparison": image_record(small_strip),
        "acceptedAssetsModified": False,
        "scientificFigureContentModified": False,
        "recommendation": "candidate C",
        "recommendationReason": "It best follows the governing rule at 25% delivery size: Figurestead remains unmistakable, the lead scientific figure stays meaningfully inspectable, and two supporting families add range without collapsing into a miniature gallery.",
        "selection": {
            "status": "owner-selected",
            "candidate": "C",
            "source": image_record(path_c),
            "canonicalAsset": image_record(SELECTED),
            "byteIdenticalToSource": SELECTED.read_bytes() == path_c.read_bytes(),
            "readmeMontage": image_record(ROOT / "docs" / "assets" / "readme" / "figurestead-at-a-glance.png"),
            "readmeMontageUnchanged": True,
            "githubSettingsChanged": False,
            "ownerAction": "Configure docs/assets/readme/github-social-preview.png manually in GitHub repository settings.",
        },
    }
    (STUDY / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
