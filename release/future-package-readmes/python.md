# Figurestead

Experimental scientific figures for Python. Create static line, scatter,
histogram, strip-summary and heatmap figures with explicit labels and themes.

## Tested example baseline: 0.9.0a4

Requires Python >=3.10. In a fresh virtual environment:

```sh
python -m pip install figurestead==0.9.0a4
```

```python
from figurestead import PlotSpec, line

figure, axes = line(
    [0, 1, 2], [[0, 1, 0]],
    theme="lavender_fog_notebook",
    spec=PlotSpec(title="Synthetic response", xlabel="Time (s)", ylabel="Response (a.u.)"),
)
figure.savefig("response.png", dpi=150)
figure.savefig("response.svg")
```

These are synthetic example values, not measurements. Inspect the exported
figure at its intended size. Shared Python/browser semantics do not imply
identical pixels or matching renderer coverage.

[Installation and runtime boundaries](https://github.com/CharlesMish/figurestead/blob/main/docs/getting-started.md)
· [Line behavior and limits](https://github.com/CharlesMish/figurestead/blob/v0.9.0-alpha.5/docs/line-series-semantics.md)
· [Source](https://github.com/CharlesMish/figurestead)
· [Issue tracker](https://github.com/CharlesMish/figurestead/issues)

MIT licensed. Reference themes have a bounded three-series line designation,
not universal accessibility or physical-print qualification.
