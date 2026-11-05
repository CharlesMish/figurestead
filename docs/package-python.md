# Figurestead

Experimental scientific figures for Python: line, scatter, histogram,
strip-summary and heatmap figures with explicit labels and themes.

## Python 0.9.0a6

Requires Python >=3.10, Matplotlib >=3.7, NumPy >=1.24 and Pillow >=10.
Published on PyPI from the independently reviewed retained a6 artifacts. In a fresh virtual environment:

```sh
python -m pip install figurestead==0.9.0a6
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

Carried forward from a5: measured note and sample-count placement, warnings when
explicit histogram edges exclude observations, and optional signatures fitted
only where there is measured spare space. Callers supplying axes own their margins;
an insufficient source-note footer raises sizing guidance. See the frozen
[layout and export contract](https://github.com/CharlesMish/figurestead/blob/7b9482a939da77bfc0d256682707ef03ee02332a/docs/python-layout-and-comparison.md)
for the behavior incorporated into this version.

Numeric NaN/infinity category identities reject before string coercion; literal
string labels remain valid. Appended labeled lines retain truthful accumulated
legends; anonymous scatter/strip layers do not acquire scientific labels.

New in published a6: opt-in monotone interpolation preserves each interval's
endpoint bounds; ordinary line drawing limits marker-protection work to nearby
candidates while preserving marker interiors and continuous authored rhythm.
The categorical-matrix extension measures all required decorations, including
rotated labels and the status legend after native colorbar removal. Insufficient
space raises sizing guidance rather than silently exporting clipped content.
These repairs do not change observations, normalization, palette values or the
bounded line-identity profile. Performance gains depend on geometry and density.
The auxiliary `compile_terminal_scene` rejects unsupported contracts rather than
silently claiming fidelity; it remains finite-only and is not NaN-gap transport.

Inspect exports at their intended size. Shared Python/browser semantics do not
imply identical pixels or matching renderer coverage. Reference themes have a
bounded three-series line designation, not universal accessibility or physical
print qualification.

[Line behavior and limits](https://github.com/CharlesMish/figurestead/blob/7b9482a939da77bfc0d256682707ef03ee02332a/docs/line-series-semantics.md)
· [Source](https://github.com/CharlesMish/figurestead)
· [Issue tracker](https://github.com/CharlesMish/figurestead/issues)

MIT licensed.
