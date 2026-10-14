# Figurestead

Experimental scientific figures for Python: line, scatter, histogram,
strip-summary and heatmap figures with explicit labels and themes.

## Python 0.9.0a5

Requires Python >=3.10, Matplotlib >=3.7, NumPy >=1.24 and Pillow >=10.
In a fresh virtual environment:

```sh
python -m pip install figurestead==0.9.0a5
```

```python
from figurestead import PlotSpec, line, save_figure

figure, axes = line(
    [0, 1, 2], [[0, 1, 0]],
    theme="lavender_fog_notebook",
    spec=PlotSpec(title="Synthetic response", xlabel="Time (s)",
                  ylabel="Response (a.u.)", note="Synthetic example; not measurements."),
)
save_figure(figure, "response.png", dpi=150)
save_figure(figure, "response.svg")
```

The destination directory must exist. `save_figure` stages and replaces a single
output file only after a successful save. Rendering errors propagate and leave
an existing destination unchanged. For streams or intentionally external SVG
images, use Matplotlib's `figure.savefig` and manage those outputs directly.

This version repairs note and sample-count placement, warns when explicit
histogram edges exclude observations, and fits the optional signature only
where there is measured spare space. Callers supplying axes own their margins;
an insufficient source-note footer raises sizing guidance. See the frozen
[layout and export contract](https://github.com/CharlesMish/figurestead/blob/e729f3c030b5ccf0764933f710957bcea47ee636/docs/python-layout-and-comparison.md)
for the behavior incorporated into this version.

Inspect exports at their intended size. Shared Python/browser semantics do not
imply identical pixels or matching renderer coverage. Reference themes have a
bounded three-series line designation, not universal accessibility or physical
print qualification.

[Line behavior and limits](https://github.com/CharlesMish/figurestead/blob/e729f3c030b5ccf0764933f710957bcea47ee636/docs/line-series-semantics.md)
· [Source](https://github.com/CharlesMish/figurestead)
· [Issue tracker](https://github.com/CharlesMish/figurestead/issues)

MIT licensed.
