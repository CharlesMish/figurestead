"""Render five examples with the installed, published figurestead==0.9.0a4.

Run from an isolated consumer directory; no checkout import or private API.
The output directory must be new or dedicated to this gallery generation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from importlib.metadata import version
from pathlib import Path
import platform
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image
import figurestead
from figurestead import PlotSpec, heatmap, histogram, line, scatter, strip_summary


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    assert version("figurestead") == "0.9.0a4", "Use the published a4 consumer environment"
    assert "site-packages" in str(Path(figurestead.__file__).resolve()), "Do not render from checkout source"
    fixture_path = Path(__file__).with_name("fixture.json")
    fixture = json.loads(fixture_path.read_text())
    args.output.mkdir(parents=True, exist_ok=True)
    matplotlib.rcParams["svg.hashsalt"] = "figurestead-published-a4-gallery-v1"
    theme = "lavender_fog_notebook"
    spec = lambda item: PlotSpec(title=item["title"], xlabel=item["xlabel"], ylabel=item["ylabel"])
    item = fixture["line"]
    figures = [("python-line", line(item["x"], item["ys"], labels=item["labels"], theme=theme, spec=spec(item)))]
    item = fixture["scatter"]
    figures.append(("python-scatter", scatter(item["x"], item["y"], series=item["series"], theme=theme, spec=spec(item))))
    item = fixture["histogram"]
    assert all(item["bins"][0] <= x <= item["bins"][-1] for row in item["values"] for x in row)
    figures.append(("python-histogram", histogram(item["values"], labels=item["labels"], bins=item["bins"], theme=theme, spec=spec(item))))
    item = fixture["strip"]
    strip_fig, strip_ax = strip_summary(item["groups"], item["values"], order=item["order"], seed=item["seed"], theme=theme, spec=spec(item))
    strip_ax.set_ylim(*item["ylim"])
    figures.append(("python-strip", (strip_fig, strip_ax)))
    item = fixture["heatmap"]
    figures.append(("python-heatmap", heatmap(item["matrix"], xlabels=item["xlabels"], ylabels=item["ylabels"], theme=theme, spec=spec(item))))
    images=[]
    for name, (fig, ax) in figures:
        fig.canvas.draw()
        for extension in ("png", "svg"):
            path = args.output / f"{name}.{extension}"
            kwargs = {"dpi": 120} if extension == "png" else {"metadata": {"Date": None}}
            fig.savefig(path, **kwargs)
            entry = {"file": path.name, "bytes": path.stat().st_size, "sha256": sha(path), "theme": theme}
            if extension == "png":
                with Image.open(path) as im:
                    entry.update(width=im.width, height=im.height)
                    assert (im.width, im.height) == (1008, 624)
            images.append(entry)
        plt.close(fig)
    record = {
        "package": "figurestead", "version": version("figurestead"),
        "python": platform.python_version(), "platform": platform.platform(),
        "importSource": "installed site-packages", "backend": matplotlib.get_backend(),
        "dependencies": {key: version(key) for key in ("matplotlib", "numpy", "Pillow", "fonttools")},
        "geometry": {"inches": [8.4, 5.2], "dpi": 120},
        "fixtureSha256": sha(fixture_path), "generatorSha256": sha(Path(__file__)),
        "images": images,
    }
    (args.output / "python-render.json").write_text(json.dumps(record, indent=2)+"\n")
    print(json.dumps({"result": "PASS", "figures": len(figures), "outputs": len(images), "python": sys.version.split()[0]}))


if __name__ == "__main__":
    main()
