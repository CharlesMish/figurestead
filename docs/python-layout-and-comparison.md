# Python layout and comparison recipes

The sizing, calendar-tick and shared-bin recipes below work with published
Python `0.9.0a4`. Layout repairs described separately below are unreleased source
changes; installing registry `0.9.0a4` does not include them.

## Figure size

Plotters return the Matplotlib figure and axes. Resize the returned figure, or
create your own axes and pass `ax=`:

```python
import matplotlib.pyplot as plt
from figurestead import PlotSpec, line

fig, ax = plt.subplots(figsize=(10, 6), dpi=120)
fig.subplots_adjust(bottom=0.20)  # caller owns layout when supplying ax=
line([0, 1, 2], [[1, 2, 3], [3, 2, 1]], labels=["A", "B"],
     spec=PlotSpec("Response over time", xlabel="Time", ylabel="Response"), ax=ax)
fig.set_size_inches(11, 6)
fig.savefig("response.png", dpi=150)
```

There is no plotter `figsize=` argument. Figure size is measured in inches;
export DPI controls raster resolution. Direct labels support ordinary figure
resizing but retain their [bounded layout contract](direct-series-labels.md).

## Calendar labels on numeric x

`line()` accepts real numeric x, so convert dates before calling it. This recipe
uses Matplotlib date numbers (elapsed days) and formats them back as calendar
ticks. Irregular elapsed intervals remain irregular on the x axis.

```python
from datetime import date
import matplotlib.dates as mdates
from figurestead import PlotSpec, line

dates = [date(2025, 6, 1), date(2025, 6, 3), date(2025, 6, 8)]
x = mdates.date2num(dates)
fig, ax = line(x, [20, 24, 22],
               spec=PlotSpec("Temperature by date", xlabel="Date", ylabel="Temperature (°C)"))
ax.set_xticks(x)
ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
fig.savefig("calendar-ticks.png")
```

Date objects and NumPy `datetime64` arrays are not accepted directly. This
conversion does not fill missing dates or observations. Use explicit NaN y
values for [line breaks](line-series-semantics.md#python-explicit-missing-y-published-in-090a3)
when the scientific meaning calls for a gap.

## Comparable histogram intervals

Use [explicit common bin edges](histogram-medians.md#comparing-distributions-with-common-bins)
when comparing counts across datasets. Integer bin counts are resolved per
dataset. Record the edges, sample sizes and any excluded observations alongside
the figure.

## Note and sample-count placement (unreleased)

Source after Python `0.9.0a4` repairs two layout defects found in a consumer
field test. Ordinary PNG and SVG exports place `PlotSpec.note` below the actual
x-axis decorations and wrap it to the plot width. Figures created by a plotter
reserve footer space when a note is present. Notes are remeasured after resizing
and at export DPI; they do not require `bbox_inches="tight"`.
Math expressions enclosed in paired dollar signs stay together during wrapping;
an expression wider than the available footer raises the same sizing error.

Remeasuring a note does not automatically move or shrink the axes. For a figure
created by a plotter, the footer margin is allocated when the figure is created
and remains the same fraction of figure height after `fig.set_size_inches()`.
A shorter figure therefore leaves less physical space for the note; reducing
width can also add wrapped lines. Increase the subplot margin after resizing
when necessary, including when you did not supply `ax=`:

```python
from figurestead import PlotSpec, line

fig, ax = line([0, 1, 2], [20, 24, 22],
               spec=PlotSpec("Daily observations", xlabel="Sampling day",
                             ylabel="Temperature (°C)",
                             note="Source: station observations; no imputation."))
fig.set_size_inches(6.5, 4.0)
fig.subplots_adjust(bottom=0.25)  # fraction of the new figure height
fig.savefig("resized-observations.png")
fig.savefig("resized-observations.svg")
```

The margin above is a starting point, not a guaranteed fit for every note,
font or figure size. More wrapped lines, tick labels or a strip count row may
need a larger margin or a taller figure. For axes positioned manually with
`ax.set_position()`, adjust that position to leave more space below the axes.

`strip_summary()` places its `n=` readouts below the data rectangle, above the
category labels. Counts include every admitted observation in the category;
an explicitly ordered empty category displays `n=0`. Moving this text does not
change observations, jitter, medians or y-axis limits.

When supplying `ax=`, you own its position and margins. Leave enough room below
the x-axis labels for the note; `fig.subplots_adjust(bottom=0.20)` before
plotting is a useful starting point for a single default-sized panel. A very
small figure, long labels or a long note can still exhaust the available
space. An insufficient note footer raises a `ValueError` with sizing/margin
guidance rather than exporting clipped source text. Increase the height or
bottom margin, or shorten the note, and draw again. Tight cropping still starts
with a normal draw, so it cannot rescue an initially insufficient footer.

Ordinary direct labels remain supported within their existing capacity rules.
Tight bounding-box export and tight/constrained layout continue to use the
ordinary legend under the [direct-label contract](direct-series-labels.md).
These changes do not expand the supported direct-label profile.
