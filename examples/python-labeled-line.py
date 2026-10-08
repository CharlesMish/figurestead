"""A complete labeled figure using published figurestead==0.9.0a4.

Run outside a source checkout. Values are deterministic synthetic examples,
not measurements; no smoothing, fitting or inferred uncertainty is applied.
"""
from math import sin

from figurestead import PlotSpec, line


def make_figure():
    x = [i / 4 for i in range(25)]
    ys = [
        [sin(t + phase) + offset for t in x]
        for phase, offset in [(0, 0), (0.4, 0.8), (0.8, 1.6)]
    ]
    return line(
        x, ys, labels=["Control", "Treatment", "Model"],
        theme="lavender_fog_notebook",
        spec=PlotSpec(title="Synthetic responses", xlabel="Time (s)",
                      ylabel="Response (a.u.)"),
    )


if __name__ == "__main__":
    figure, axes = make_figure()
    figure.savefig("labeled-lavender.png", dpi=150)
    figure.savefig("labeled-lavender.svg")
