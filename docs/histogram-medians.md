# Python histogram median ownership

Availability: published in Python `0.9.0a3`. Retained a2/alpha.3 bytes keep their earlier rendering.

For two or more datasets, each Python `histogram()` median vertical rule uses
that dataset's resolved series color. Common solid vertical-rule geometry
communicates the median role; series color and the dataset-to-value legend entry
communicate ownership. Each legend row combines the actual histogram fill/edge
and median-rule treatments with `authored label · median value`, under
**Dataset · median (vertical rule)**. Values use the x-axis's units.

Readouts begin at six significant digits, mark rounded values with `≈`, and
increase precision when distinct medians would otherwise display identically.
Equal medians may display the same value. Formatting never changes coordinates.
Coincident medians are not displaced: later paint can cover earlier paint, and
the legend records both owners. This does not make overlapping distributions
independently identifiable in grayscale or establish accessibility/print claims.

Counts, bins, histogram geometry, median calculation and rule weight/opacity are
unchanged. Exactly one dataset retains its existing `summary_core` median and
legend behavior, with no new value header. Other summary renderers and theme
palettes are unchanged. Long labels may still encounter ordinary Matplotlib
legend-layout pressure; this change does not add a layout solver.

This change shipped in Python a3 after alpha.3, not as a change to that
release's retained specimens or package bytes.

## Published alpha.4 release summary

Multi-dataset Python histograms now use dataset-colored median rules and a
combined fill/rule legend reporting each dataset's median value. The common
vertical-rule geometry identifies the median role while color and the legend
identify its owner. Coincident medians remain coincident. Single-dataset
histograms, counts, binning, median coordinates, theme palettes and unrelated
summary semantics are unchanged.

## Comparing distributions with common bins

An integer `bins=30` is resolved separately for each dataset. Datasets with
different ranges can therefore have different bin widths and boundaries, even
when they share one axes. For counts over comparable intervals, pass explicit
shared edges covering the intended data range:

```python
import numpy as np
from figurestead import PlotSpec, histogram

edges = np.arange(-20.0, 52.0, 2.0)  # 35 shared intervals, each 2 degrees wide
fig, ax = histogram(
    [[-10, 0, 10, 20, 30], [10, 20, 30, 40, 45]],
    labels=["Station A", "Station B"], bins=edges,
    spec=PlotSpec("Daily maximum temperature", xlabel="Daily maximum temperature (°C)", ylabel="Days"),
)
fig.savefig("shared-temperature-bins.png")
```

This recipe works in published Python `0.9.0a4`; it does not change the default
bin policy. Values outside the supplied edges are excluded from the histogram
counts, while median rules still summarize each complete input dataset. Choose
and report the interval deliberately. Counts also depend on
sample size: common edges do not normalize unequal-length datasets. Translucent
overlapping fills can remain difficult to separate; inspect the exported figure
and consider separate panels with the same edges and axis scales.
