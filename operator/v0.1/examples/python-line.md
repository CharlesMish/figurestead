# Python line

Use for finite series measured over the same ordered numeric x values.

```python
from math import isfinite
from figurestead import PlotSpec, line

x = [0, 1, 2, 3, 4]
ys = [
    [0.18, 0.31, 0.47, 0.62, 0.74],
    [0.12, 0.26, 0.40, 0.55, 0.68],
    [0.08, 0.19, 0.33, 0.46, 0.59],
]
labels = ["Reference", "Treatment A", "Treatment B"]

if not all(isfinite(value) for value in x):
    raise ValueError("x must contain only finite values")
if len(labels) != len(ys) or any(len(series) != len(x) for series in ys):
    raise ValueError("labels and every series must match x exactly")
if not all(isfinite(value) for series in ys for value in series):
    raise ValueError("line responses must contain only finite values")

spec = PlotSpec(
    "Response by observation",
    subtitle="Three authored series",
    xlabel="Observation",
    ylabel="Response (a.u.)",
)
fig, _ = line(x, ys, labels=labels, spec=spec, theme="slipware", profile="monograph")
fig.savefig("figurestead-python-line.png", dpi=180, bbox_inches="tight")
```
