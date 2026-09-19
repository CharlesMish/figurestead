"""One synthetic dataset, ordinary versus direct identification, fixed size."""
from pathlib import Path
from figurestead import line, PlotSpec

X = [0, 1, 2]
YS = [[1, 2, 3], [2, 3, 3.05], [3, 4, 3.1]]
LABELS = ["Control", "Treatment", "Model"]


def make_figure(direct_labels=False):
    return line(X, YS, labels=LABELS, series_slots=[0, 1, 2],
                theme="lavender_fog_notebook", direct_labels=direct_labels,
                spec=PlotSpec("Three synthetic responses", xlabel="Time", ylabel="Response"))


if __name__ == "__main__":
    import argparse
    import matplotlib.pyplot as plt
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("."))
    output = parser.parse_args().output
    output.mkdir(parents=True, exist_ok=True)
    for direct in (False, True):
        fig, ax = make_figure(direct_labels=direct)
        fig.savefig(output / ("direct.png" if direct else "ordinary.png"), dpi=120)
        plt.close(fig)
