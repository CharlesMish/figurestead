"""Render the three-family semantic motion proof."""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import numpy as np

from .core import PlotSpec
from .motion import MotionStyle, animate_line, animate_scatter, animate_strip_summary


def build_motion_gallery(output_dir, *, theme="slipware", profile="deep_scope",
                         frames=72, fps=12):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    motion = MotionStyle(frames=frames, fps=fps)
    rng = np.random.default_rng(42)

    categories = np.array(["0–24h", "72h", "7d", "30d"])
    groups = np.repeat(categories, 34)
    series = np.tile(np.repeat(np.arange(3), [12, 11, 11]), 4)
    offsets = np.repeat([0.12, 0.0, -0.10, 0.07], 34)
    values = np.clip(rng.lognormal(-0.31 + offsets, 0.46), 0.12, 4.6)
    animate_strip_summary(
        groups, values, series=series, order=categories,
        labels=["Site Alpha", "Site Beta", "Site Gamma"],
        spec=PlotSpec("Regional response", "Data trickle into exact positions; medians compile afterward.",
                      ylabel="response (mg/L)", signature="figurestead · strip_summary"),
        theme=theme, profile=profile, motion=motion,
        output=output_dir / "01_strip_trickle.gif",
    )

    x = rng.normal(size=90)
    cohort = np.repeat(np.array(["A", "B", "C"]), 30)
    y = 0.64 * x + np.where(cohort == "B", 0.72, np.where(cohort == "C", -0.42, 0))
    y += rng.normal(scale=0.48, size=len(x))
    animate_scatter(
        x, y, series=cohort, labels=["cohort A", "cohort B", "cohort C"],
        spec=PlotSpec("Instrument relationship", "Marks resolve first; the fitted relation conducts second.",
                      xlabel="predictor", ylabel="response", signature="figurestead · scatter"),
        theme=theme, profile=profile, motion=motion,
        output=output_dir / "02_scatter_trickle.gif",
    )

    t = np.linspace(0, 12, 42)
    curves = np.vstack([
        np.sin(t * 0.72) * np.exp(-t / 25),
        0.72 * np.cos(t * 0.72 + 0.45) * np.exp(-t / 22),
    ])
    animate_line(
        t, curves, labels=["sensor A", "sensor B"],
        spec=PlotSpec("Signal arrival", "Samples descend in time order; traces conduct through them.",
                      xlabel="time (s)", ylabel="normalized signal", signature="figurestead · line"),
        theme=theme, profile=profile, motion=motion,
        output=output_dir / "03_line_trickle.gif",
    )
    return output_dir


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default="outputs/motion")
    parser.add_argument("--theme", default="slipware")
    parser.add_argument("--profile", default="deep_scope")
    parser.add_argument("--frames", type=int, default=72)
    parser.add_argument("--fps", type=int, default=12)
    args = parser.parse_args()
    print(build_motion_gallery(args.output_dir, theme=args.theme, profile=args.profile,
                               frames=args.frames, fps=args.fps))


if __name__ == "__main__":
    main()
