#!/usr/bin/env python3
"""Create deterministic GitHub-facing derivatives from accepted evidence."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import platform

from PIL import Image, ImageChops, __version__ as pillow_version


ROOT = Path(__file__).resolve().parents[2]
ASSET_ROOT = ROOT / "docs" / "assets" / "readme"
MONTAGE_SOURCE = ROOT / "specimen-study" / "evidence" / "corpus-v0.2" / "screenshots" / "chromium-montage-1920x1080.png"
MATRIX_SOURCE = ROOT / "specimen-study" / "evidence" / "corpus-v0.2" / "response-matrix" / "populated-wide.png"
MONTAGE_CROP = (0, 64, 1920, 1024)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_lossless(image: Image.Image, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG", optimize=True, compress_level=9)


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
    glance_path = ASSET_ROOT / "figurestead-at-a-glance.png"
    matrix_path = ASSET_ROOT / "populated-categorical-response-matrix.png"
    social_path = ASSET_ROOT / "github-social-preview-candidate.png"

    with Image.open(MONTAGE_SOURCE) as source:
        source.load()
        crop = source.crop(MONTAGE_CROP)
        save_lossless(crop, glance_path)
        social = crop.resize((1280, 640), Image.Resampling.LANCZOS)
        save_lossless(social, social_path)
        with Image.open(glance_path) as derivative:
            montage_crop_identity = ImageChops.difference(crop, derivative).getbbox() is None

    with Image.open(MATRIX_SOURCE) as source:
        source.load()
        save_lossless(source, matrix_path)
        matrix_transform = "lossless-png-optimization"
        if matrix_path.stat().st_size > MATRIX_SOURCE.stat().st_size:
            matrix_path.write_bytes(MATRIX_SOURCE.read_bytes())
            matrix_transform = "byte-identical-reuse"
        with Image.open(matrix_path) as derivative:
            matrix_pixel_identity = ImageChops.difference(source, derivative).getbbox() is None

    report = {
        "schemaVersion": "figurestead.readme-assets/1",
        "result": "PASS" if montage_crop_identity and matrix_pixel_identity else "FAIL",
        "environment": {"python": platform.python_version(), "pillow": pillow_version},
        "assets": {
            "figurestead-at-a-glance": {
                "source": image_record(MONTAGE_SOURCE),
                "derivative": image_record(glance_path),
                "transform": {"type": "lossless-crop-and-png-optimization", "cropBox": list(MONTAGE_CROP)},
                "decodedCropPixelsIdentical": montage_crop_identity,
                "reason": "Removes study-only masthead chrome while preserving the accepted eight-panel composition.",
            },
            "populated-categorical-response-matrix": {
                "source": image_record(MATRIX_SOURCE),
                "derivative": image_record(matrix_path),
                "transform": {"type": matrix_transform},
                "decodedPixelsIdentical": matrix_pixel_identity,
            },
            "github-social-preview-candidate": {
                "source": image_record(glance_path),
                "derivative": image_record(social_path),
                "transform": {"type": "lanczos-resize", "dimensions": [1280, 640]},
                "decodedPixelsIdentical": False,
                "ownerActionRequired": True,
            },
        },
    }
    report_path = ROOT / "docs" / "readme-review" / "asset-manifest.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
