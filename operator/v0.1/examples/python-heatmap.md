# Python heatmap

Use for a finite numeric matrix with exact labels on both categorical axes.

```python
from math import isfinite
from figurestead import PlotSpec, heatmap

matrix = [
    [0.12, 0.21, 0.33, 0.45, 0.50],
    [0.18, 0.30, 0.44, 0.55, 0.63],
    [0.25, 0.39, 0.51, 0.68, 0.75],
    [0.31, 0.46, 0.60, 0.79, 0.88],
]
xlabels = ["0", "1", "2", "3", "4"]
ylabels = ["Site A", "Site B", "Site C", "Site D"]
column_count = len(matrix[0])
if not matrix or any(len(row) != column_count for row in matrix):
    raise ValueError("matrix must be nonempty and rectangular")
if not all(isfinite(value) for row in matrix for value in row):
    raise ValueError("matrix values must be finite")
if len(xlabels) != column_count or len(ylabels) != len(matrix):
    raise ValueError("axis labels must match matrix geometry")

spec = PlotSpec(
    "Response matrix",
    subtitle="Rows are sites; columns are dose levels",
    xlabel="Dose level",
    ylabel="Site",
)
fig, _ = heatmap(
    matrix,
    xlabels=xlabels,
    ylabels=ylabels,
    spec=spec,
    theme="registration_ink",
    profile="monograph",
)
fig.savefig("figurestead-python-heatmap.png", dpi=180, bbox_inches="tight")
```
