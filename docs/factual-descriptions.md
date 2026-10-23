# Current facts and authored context

Begins with the unpublished alpha.7 candidate. The retained alpha.6 packages and
their historical outputs remain unchanged.

Browser core line, scatter and strip-summary descriptions report current finite
observations. Line/scatter ranges are **observed data ranges**, not fitted-curve
extrema, visible clipped bounds, or inferred scientific conclusions. Marker
cadence does not reduce the observation count.

A requested scatter fit reports its slope and intercept across all admitted
observations, using the same prepared fit as the drawn model. Strip summaries
report each declared group's sample count and, when drawn, its median. An empty
group has `n=0` and no median. These facts come from the rendering preparation,
not a second statistical calculation. They update after `setData()` alongside
the actual marks.

Generated facts appear in renderer `describe()`, the browser's accessibility
companion and SVG `<desc>`. Authored figure/panel `description` remains separately
identified context; it cannot replace current facts. An authored sentence such
as “three observations” is not automatically rewritten when data changes. The
application still owns its narrative and any scientific interpretation.

Factual prose starts with six significant digits, increases precision when
distinct values would otherwise look identical, and marks rounded values as
“approximately”. Raw data tables retain their original numeric values and full
labels. The display formatter does not change statistics or geometry.

`spec.note` is source context in the companion and SVG description. It is **not
painted as a browser footer**. A host-page caption or hidden companion does not
survive a raw PNG download, and SVG metadata is not visible text. Python's
ordinary `PlotSpec.note` remains its existing painted footer with layout checks.
No browser footer layout or Python/browser pixel-parity promise is introduced.

These descriptions are structural text alternatives, not a screen-reader-user
qualification. The portable/browser line route remains finite-only; no missing
observations or uncertainty channels are inferred from unknown data fields.
