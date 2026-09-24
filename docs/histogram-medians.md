# Python histogram median ownership — current source

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

This is a current-source change after published alpha.3, not a claim about that
release's retained specimens or package bytes.

## Wording retained for a future release note

Multi-dataset Python histograms now use dataset-colored median rules and a
combined fill/rule legend reporting each dataset's median value. The common
vertical-rule geometry identifies the median role while color and the legend
identify its owner. Coincident medians remain coincident. Single-dataset
histograms, counts, binning, median coordinates, theme palettes and unrelated
summary semantics are unchanged.
