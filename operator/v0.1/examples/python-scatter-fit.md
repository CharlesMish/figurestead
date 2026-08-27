# Python scatter with an authorized linear fit

The caller computes and names the model; Figurestead does not choose it.

```python
import numpy as np
from figurestead import PlotSpec, get_theme, scatter

x = np.array([0.0, 0.8, 1.6, 2.4, 3.2, 4.0, 4.8])
y = np.array([0.18, 0.30, 0.42, 0.61, 0.66, 0.83, 0.91])
if x.ndim != 1 or y.ndim != 1 or x.size != y.size or x.size < 2:
    raise ValueError("x and y must be matched one-dimensional observations")
if not np.isfinite(x).all() or not np.isfinite(y).all():
    raise ValueError("scatter observations must be finite")
if np.unique(x).size < 2:
    raise ValueError("OLS linear fit requires at least two distinct x values")

slope, intercept = np.polyfit(x, y, 1)
fit_x = np.array([x.min(), x.max()])
fit_y = intercept + slope * fit_x
spec = PlotSpec(
    "Dose and response",
    subtitle="Observed values with ordinary least-squares linear fit",
    xlabel="Dose (mg/L)",
    ylabel="Response (a.u.)",
)
fig, ax = scatter(
    x,
    y,
    series=np.repeat("Observed", x.size),
    spec=spec,
    theme="slipware",
    profile="monograph",
)
ax.plot(fit_x, fit_y, color=get_theme("slipware").summary_core, linewidth=1.5, label="OLS linear fit")
ax.legend(frameon=False)
fig.savefig("figurestead-python-scatter-fit.png", dpi=180, bbox_inches="tight")
```
