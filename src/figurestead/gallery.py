"""Render a deterministic multi-family design proof."""

from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from .core import PlotSpec
from .plots import heatmap, histogram, line, scatter, strip_summary
from .profiles import get_profile
from .themes import get_theme


def build_gallery(output, *, theme="slipware", profile="deep_scope"):
    rng = np.random.default_rng(42)
    theme_obj = get_theme(theme)
    profile_obj = get_profile(profile)
    fig, axes = plt.subplots(2, 3, figsize=(14.4, 8.2), dpi=140)
    fig.patch.set_facecolor(theme_obj.field)

    group_names = np.array(["0–24h", "72h", "7d", "30d"])
    groups = np.repeat(group_names, 42)
    site = np.tile(np.repeat(np.arange(3), 14), 4)
    offsets = np.repeat([0.10, 0.0, -0.12, 0.08], 42)
    values = np.clip(rng.lognormal(-0.32 + offsets, 0.48), 0.1, 4.8)
    strip_summary(groups, values, series=site, order=group_names,
                  spec=PlotSpec("Strip summary", "rings preserve density; pale bars carry the statistic",
                                ylabel="response (mg/L)"),
                  theme=theme_obj, profile=profile_obj, ax=axes[0, 0])

    x = rng.normal(size=105)
    cohort = np.repeat(["A", "B", "C"], 35)
    y = 0.68 * x + np.where(cohort == "B", 0.8, np.where(cohort == "C", -0.45, 0))
    y += rng.normal(scale=0.52, size=len(x))
    scatter(x, y, series=cohort,
            spec=PlotSpec("Relationship", "the profile survives outside categorical geometry",
                          xlabel="predictor", ylabel="response"),
            theme=theme_obj, profile=profile_obj, ax=axes[0, 1])

    t = np.linspace(0, 12, 100)
    curves = np.vstack([
        np.sin(t * 0.72) * np.exp(-t / 25),
        0.72 * np.cos(t * 0.72 + 0.45) * np.exp(-t / 22),
    ])
    line(t, curves, labels=["sensor A", "sensor B"],
         spec=PlotSpec("Time series", "traces stay crisp; rain remains atmospheric",
                       xlabel="time (s)", ylabel="normalized signal"),
         theme=theme_obj, profile=profile_obj, ax=axes[0, 2])

    histogram([rng.normal(-0.25, 0.72, 260), rng.normal(0.62, 0.55, 210)],
              labels=["baseline", "treated"], bins=24,
              spec=PlotSpec("Distribution", "translucent mass; median as a pale instrument trace",
                            xlabel="measurement", ylabel="count"),
              theme=theme_obj, profile=profile_obj, ax=axes[1, 0])

    matrix = np.outer(np.linspace(0.2, 1.0, 7), np.linspace(0.1, 1.0, 10))
    matrix += rng.normal(0, 0.065, matrix.shape)
    heatmap(matrix, xlabels=[str(i) for i in range(10)],
            ylabels=[f"S{i + 1}" for i in range(7)],
            spec=PlotSpec("Heatmap", "literal rain recedes when the data already occupy the field",
                          xlabel="interval", ylabel="sensor"),
            theme=theme_obj, profile=profile_obj, ax=axes[1, 1])

    ax = axes[1, 2]
    ax.set_facecolor(theme_obj.field)
    ax.axis("off")
    ax.text(0.0, 0.96, "SYSTEM GRAMMAR", transform=ax.transAxes,
            color=theme_obj.primary, fontsize=11, fontfamily="DejaVu Sans Mono",
            fontweight="medium", va="top")
    principles = [
        "theme = semantic color roles",
        "profile = marks, grid, motion density",
        "renderer = graph-specific geometry",
        "rain = optional atmosphere, never a data scale",
        "summary core = brightest value",
        "stable registry key = durable plot identity",
    ]
    for index, principle in enumerate(principles):
        ax.text(0.0, 0.82 - index * 0.105, f"0{index + 1}  {principle}",
                transform=ax.transAxes, color=theme_obj.label if index < 4 else theme_obj.secondary,
                fontsize=8.3, fontfamily="DejaVu Sans Mono", va="top")
    for index, color in enumerate(theme_obj.series[:5]):
        ax.plot([0.02 + index * 0.095, 0.085 + index * 0.095], [0.12, 0.12],
                transform=ax.transAxes, color=color, linewidth=5, solid_capstyle="butt")
    ax.text(0.0, 0.03, f"{theme_obj.name}  ×  {profile_obj.name}",
            transform=ax.transAxes, color=theme_obj.faint, fontsize=7,
            fontfamily="DejaVu Sans Mono")

    fig.suptitle("figurestead / multi-graph proof", color=theme_obj.summary_core,
                 fontsize=14, fontfamily="DejaVu Sans Mono", x=0.035, ha="left")
    fig.subplots_adjust(left=0.055, right=0.97, top=0.89, bottom=0.08,
                        wspace=0.30, hspace=0.42)
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output, facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close(fig)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="figurestead_gallery.png")
    parser.add_argument("--theme", default="slipware")
    parser.add_argument("--profile", default="deep_scope")
    args = parser.parse_args()
    path = build_gallery(args.output, theme=args.theme, profile=args.profile)
    print(path)


if __name__ == "__main__":
    main()
