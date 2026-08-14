#!/usr/bin/env python3
"""Render the populated corpus fixture through Figurestead's existing matrix extension."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

import matplotlib
matplotlib.use("Agg")
matplotlib.rcParams["svg.hashsalt"] = "figurestead-response-matrix-v0.2"
import matplotlib.pyplot as plt
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "src"
if str(SOURCE_ROOT) not in sys.path:
    sys.path.insert(0, str(SOURCE_ROOT))

from figurestead.core import PlotSpec  # noqa: E402
from figurestead.extensions.matrix.renderer import categorical_matrix, normalize_matrix_data  # noqa: E402
from figurestead.themes import get_theme  # noqa: E402


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def render(scene: dict, output: Path, width: int, height: int, *, svg: bool = False) -> None:
    dpi = 100
    fig, ax = plt.subplots(figsize=(width / dpi, height / dpi), dpi=dpi)
    spec = PlotSpec(
        scene["title"],
        subtitle=scene["subtitle"],
        xlabel=scene["suggestedSpec"]["xLabel"],
        ylabel=scene["suggestedSpec"]["yLabel"],
        note=scene["suggestedSpec"]["note"],
        signature="Figurestead · deterministic synthetic matrix study",
    )
    categorical_matrix(scene["data"], spec=spec, theme=scene["suggestedTheme"]["key"], profile="deep_scope", ax=ax)
    if width <= 420:
        fig.subplots_adjust(left=0.21, right=0.87, bottom=0.34, top=0.79)
    elif width <= 700:
        fig.subplots_adjust(left=0.16, right=0.90, bottom=0.31, top=0.77)
    else:
        fig.subplots_adjust(left=0.12, right=0.92, bottom=0.25, top=0.82)
    output.parent.mkdir(parents=True, exist_ok=True)
    metadata = {"Date": None, "Creator": "Figurestead matrix study"} if svg else {"Software": "Figurestead matrix study"}
    fig.savefig(output, dpi=dpi, facecolor=fig.get_facecolor(), metadata=metadata)
    plt.close(fig)
    if svg:
        # Matplotlib emits harmless spaces at the ends of multiline path-data
        # rows. Normalize those rows so the generated evidence also passes the
        # repository whitespace gate; this does not alter SVG geometry.
        normalized_svg = "\n".join(line.rstrip() for line in output.read_text(encoding="utf-8").splitlines()) + "\n"
        output.write_text(normalized_svg, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="render to a temporary directory and compare bytes")
    args = parser.parse_args()
    study = ROOT / "specimen-study"
    scene_path = study / "corpus-v0.2" / "scenes" / "habitat_response_matrix.json"
    scene = json.loads(scene_path.read_text(encoding="utf-8"))
    normalized = normalize_matrix_data(scene["data"])
    if len(normalized["xCategories"]) != 10 or len(normalized["yCategories"]) != 6 or len(normalized["cells"]) != 60:
        raise SystemExit("matrix contract did not normalize to 10 × 6")

    evidence = study / "evidence" / "corpus-v0.2" / "response-matrix"
    targets = {
        "populated-wide.png": (1160, 760, False),
        "populated-wide.svg": (1160, 760, True),
        "populated-montage-cell.png": (640, 416, False),
        "populated-narrow-390.png": (390, 520, False),
    }
    if args.check:
        import tempfile
        with tempfile.TemporaryDirectory(prefix="figurestead-matrix-render-") as temporary:
            temporary_root = Path(temporary)
            for name, (width, height, svg) in targets.items():
                candidate = temporary_root / name
                render(scene, candidate, width, height, svg=svg)
                if candidate.read_bytes() != (evidence / name).read_bytes():
                    raise SystemExit(f"render drift: {name}")
        print("PASS: populated matrix render outputs are byte-stable")
        return 0

    for name, (width, height, svg) in targets.items():
        render(scene, evidence / name, width, height, svg=svg)

    theme = get_theme(scene["suggestedTheme"]["key"])
    outputs = {}
    for name, (width, height, _) in targets.items():
        path = evidence / name
        actual = [width, height]
        if path.suffix == ".png":
            with Image.open(path) as image:
                actual = list(image.size)
        outputs[name] = {"sha256": sha256(path), "bytes": path.stat().st_size, "pixels": actual}
    report = {
        "schemaVersion": "figurestead.response-matrix-render/1",
        "result": "PASS",
        "renderer": "figurestead.extensions.matrix.categorical_matrix",
        "rendererSourceSha256": sha256(ROOT / "src" / "figurestead" / "extensions" / "matrix" / "renderer.py"),
        "sceneSha256": sha256(scene_path),
        "theme": {"key": theme.key, "tokensChanged": False},
        "environment": {
            "python": sys.version.split()[0],
            "matplotlib": matplotlib.__version__,
        },
        "contract": {"columns": 10, "rows": 6, "cells": 60, "valueDomain": normalized["valueScale"]["domain"]},
        "outputs": outputs,
    }
    (evidence / "render-metadata.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
