# Python strip summary

Use an explicit unique order when category order carries meaning.

```python
from math import isfinite
from figurestead import PlotSpec, strip_summary

order = ["Winter", "Spring", "Summer", "Autumn"]
groups = ["Winter"] * 3 + ["Spring"] * 3 + ["Summer"] * 3 + ["Autumn"] * 3
values = [2.1, 2.5, 2.3, 3.0, 3.4, 3.2, 5.0, 5.6, 5.3, 3.8, 4.0, 3.7]
if len(groups) != len(values) or not all(isfinite(value) for value in values):
    raise ValueError("groups and finite values must match exactly")
if len(order) != len(set(order)) or set(order) != set(groups):
    raise ValueError("order must uniquely account for every observed category")

spec = PlotSpec(
    "Seasonal observations",
    subtitle="Points show observations; bars show category medians",
    xlabel="Season",
    ylabel="Measurement (units)",
)
fig, _ = strip_summary(
    groups,
    values,
    order=order,
    spec=spec,
    theme="lavender_fog_notebook",
    profile="monograph",
    seed=42,
)
fig.savefig("figurestead-python-strip-summary.png", dpi=180, bbox_inches="tight")
```
