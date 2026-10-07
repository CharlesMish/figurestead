"""Compare synthetic distributions with shared bins, scales, and disclosures.

Run after installing Figurestead:
    python examples/python-histogram-small-multiples.py --output-dir ./figures

These invented temperatures illustrate layout and bin policy, not station data.
"""

import argparse
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator
import numpy as np

from figurestead import PlotSpec, get_theme, histogram, save_figure


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path("."))
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    datasets = {
        "Cool scenario": [-4, 0, 2, 2, 4, 5, 6, 7, 8, 9, 10, 12],
        "Mild scenario": [2, 4, 6, 8, 10, 11, 12, 13, 14, 16, 18, 22],
        "Warm scenario": [8, 10, 12, 14, 16, 17, 18, 19, 20, 22, 24, 28],
    }
    # Authored intervals: four degrees wide; the final edge (24) is included.
    edges = np.arange(0.0, 25.0, 4.0)
    counts = [np.histogram(values, bins=edges)[0] for values in datasets.values()]
    medians = [float(np.median(values)) for values in datasets.values()]
    # Cover all bin intervals and median rules without changing either.
    xlimits = (min(edges[0], min(medians)), max(edges[-1], max(medians)))
    ylimits = (0, max(int(row.max()) for row in counts) + 1)
    theme = get_theme("slipware")
    fig, axes = plt.subplots(1, len(datasets), figsize=(10.8, 4.3), sharex=True, sharey=True)
    fig.subplots_adjust(left=0.07, right=0.98, bottom=0.23, top=0.70, wspace=0.20)
    fig.suptitle("Comparing synthetic temperature distributions", x=0.07, y=0.97,
                 ha="left", fontsize=14, color=theme.primary)
    fig.text(0.07, 0.88, "One dataset per panel · identical bin edges and count scales",
             fontsize=10, color=theme.secondary)

    for index, (ax, (label, values), row, median) in enumerate(
        zip(axes, datasets.items(), counts, medians)
    ):
        included = int(row.sum())
        excluded = len(values) - included
        # Counts describe the authored interval; the median describes all input.
        # The warning on excluded data is deliberately left visible in stderr.
        histogram(
            values, labels=[label], bins=edges, ax=ax,
            spec=PlotSpec(
                title=label,
                subtitle=f"n={len(values)} · binned={included} · excluded={excluded}\n"
                         f"Full-data median = {median:g} °C",
                xlabel="Temperature (°C)",
                ylabel="Observations per 4 °C bin" if index == 0 else "",
                signature="",
            ),
        )
        ax.set_xlim(xlimits)
        ax.set_ylim(ylimits)
        ax.set_xticks(edges)
        ax.yaxis.set_major_locator(MaxNLocator(nbins=5, integer=True))

    fig.text(0.07, 0.075,
             "Synthetic observations. Counts include 0–24 °C; excluded values remain in the median.\n"
             "Vertical rules show full-data medians. Equal sample sizes here; counts are not normalized.",
             fontsize=8, color=theme.secondary, va="bottom")
    for suffix in ("png", "svg"):
        output = args.output_dir / f"histogram-small-multiples.{suffix}"
        kwargs = {"metadata": {"Date": None}} if suffix == "svg" else {}
        save_figure(fig, output, dpi=150, **kwargs)
        print(f"Wrote {output}")
    plt.close(fig)


if __name__ == "__main__":
    main()
