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

Figurestead does not infer measurement units from arrays. Supply units in
`PlotSpec.xlabel` (for example, `Temperature (°C)`); the legend's median values
use those units and do not repeat a suffix. With one dataset, `labels=` names the
histogram artist but does not create a legend. Use the title or subtitle to name
the dataset and, when useful, report its full-data median with units. The
single-dataset median rule keeps the theme's `summary_core` treatment.

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

## Unreleased: disclose observations outside authored bins

In Python `0.9.0a5`, explicit bin edges that exclude observations emit
one `UserWarning` per affected dataset. Each warning identifies the dataset
index and label, reports the excluded and total observations, and states that
the median still uses the full dataset. The last bin includes its right edge,
as in NumPy. Covered data and integer-bin requests emit no exclusion warning.
Published Python `0.9.0a4` does not yet emit this warning.

The warning does not change counts, edges, medians, colors, or axis limits.
It is emitted before axes are allocated or changed, so promoting this warning
to an error leaves caller-owned axes intact. A runtime warning is not an export
caption: report the interval and excluded count visibly when showing a narrowed
range. To summarize only a chosen subset, select and describe that subset
explicitly before calling `histogram()`; do not silently reinterpret the
full-data median as a median of the visible bins.

## Executable small-multiples recipe

[`examples/python-histogram-small-multiples.py`](../examples/python-histogram-small-multiples.py)
uses clearly labeled synthetic temperatures, common four-degree bin edges,
shared x/y scales, and one distribution per panel. Each panel reports total,
binned, and excluded observations plus its full-data median in °C. The recipe
sets an integer count-axis locator; this is an explicit recipe choice and does
not change the library's default tick policy. A common count scale is useful
for equal sample sizes; unequal samples may call for a separately authored
normalized comparison.

This complete script requires the `save_figure` helper added in Python
`0.9.0a5`. For a source checkout, install it and run from the repository root:

```bash
python -m pip install .
python examples/python-histogram-small-multiples.py --output-dir ./figures
```

It writes `histogram-small-multiples.png` and `.svg`. Two synthetic datasets
intentionally contain an out-of-bin observation, so their warnings are expected
on Python `0.9.0a5`. Installing published `0.9.0a4` alone cannot run
this script because that package has no `save_figure` helper. Its plotting APIs
support the shared-bin comparison described above, but omit the exclusion
warning; an a4 consumer must use Matplotlib's `fig.savefig(...)` for export.
Small multiples improve separation without changing the default translucent
histogram treatment.
