# Python plotting reference

This compact reference targets published **figurestead==0.9.0a6**. Each plotter
below returns `(figure, axes)`. Use `save_figure(figure, "figure.png", dpi=150)`
from `figurestead` for a transactional single-path export, or Matplotlib's
`figure.savefig("figure.svg")` for its direct-write behavior. Start with [installation](getting-started.md) and the
[complete labeled example](../examples/python-labeled-line.py).

## Labels with PlotSpec

```python
from figurestead import PlotSpec

spec = PlotSpec(
    title="Synthetic response",
    subtitle="Three deterministic example series",
    xlabel="Time (s)",
    ylabel="Response (a.u.)",
)
```

| Field | Purpose | Default |
| --- | --- | --- |
| `title` | Figure heading | Required when constructing `PlotSpec` |
| `subtitle` | Supporting heading | `""` |
| `xlabel`, `ylabel` | Axis labels, including caller-supplied units | `""` |
| `note` | Footer note | `""` |
| `signature` | Small signature | `"figurestead"` |

The plotters create their own default title when `spec` is omitted. In a5,
notes wrap using measured font metrics and fail explicitly when available space
is insufficient; optional signatures use spare space or are omitted. Caller-owned
axes keep caller-owned margins. See [layout and safe exports](python-layout-and-comparison.md).

## Literal dollars and intentional MathText

Python text uses Matplotlib's MathText interpretation of paired unescaped `$`.
This includes titles, subtitles, notes, axis labels and ticks, legend labels,
category/status labels and matrix cell/colorbar labels. For monetary amounts,
write `r"Cost: \$0.50 to \$2"` or unambiguous `USD` text. Intentional mathematical
text remains supported; Figurestead does not automatically escape input or change
Matplotlib's `parse_math` policy.

Known limitation in a5 and current source: subtitle wrapping can split a dollar
pair, changing whether a displayed row is interpreted as math at different widths.
Inspect the rendered subtitle at the export size; `Text.get_text()` alone does
not show this change. A future repair must preserve intentional math and existing
escaped dollars. This note does not claim that direct-label text supports MathText;
that treatment retains its separate literal-ASCII contract.

## Five plotters

All accept `spec=`, `theme="slipware"`, `profile="deep_scope"` and `ax=None`.
Passing `ax` draws into an existing Matplotlib axes. Choose a
[theme](theme-selection.md) without changing the data or their meaning.

| Call | Input and output meaning | Common optional arguments |
| --- | --- | --- |
| `line(x, ys)` | One finite shared x vector; one or more matching y series | `labels`, `series_slots`, `series_keys`, `line_styles`, `marker_stride=1`, `direct_labels=False` |
| `scatter(x, y)` | Paired finite numeric vectors; no fit is inferred | `series` supplies one category per point; optional `series_slots`, `point_style`, `series_styles`, `draw_order`, and `legend_order` |
| `histogram(values)` | One finite vector or nested vectors; counts and dataset medians | `labels`, `bins=20`, `shared_bins=False`; explicit edges already name common intervals |
| `strip_summary(groups, values)` | One group per finite value; deterministic jitter and group median bars | `series`, `order` (x-axis groups only), `seed=42`; optional `series_slots`, `point_style`, `series_styles`, `draw_order`, and `legend_order` |
| `heatmap(matrix)` | A nonempty finite 2D matrix; sequential color ramp and colorbar | `xlabels`, `ylabels` must match columns and rows |

`scatter` and `strip_summary` accept an optional `series_slots` mapping from
series keys to nonnegative integer slots. Booleans are not slots. Omitting the
map keeps the profile's circle marks and first-appearance colors. An explicit
map must name every observed key; unused keys are allowed and checked. Each
slot selects that series' color and one step of the circle, square, triangle,
diamond cycle. On the ring/core profile, the slot also selects the theme edge
the profile already draws. Filled profiles keep their face and field edge.
Repeated slots share one style. The map does not follow row order, category
order, or drawing order, and it does not change which observations are drawn.
On `strip_summary` it also leaves counts, pooled group medians, group order,
and seeded jitter alone. Anonymous points have no keys, so a map is rejected.
An explicit numeric category `0` is a real series. Underscore labels stay in
the legend. This is a style assignment. It is not a grayscale, color-vision,
print, or accessibility qualification.

`point_style` and `series_styles` are optional on `scatter` and
`strip_summary` only. `point_style` applies one record to every series,
including anonymous points. `series_styles` maps series keys to records and
is rejected when no series was supplied. Each record may set `size` (finite
positive primary marker area in pt²), `alpha` (finite opacity from 0 through
1), and `marker` (`circle`, `square`, `triangle`, or `diamond`). Other fields
are rejected. A record may be partial. Inactive keys are checked and not
drawn. Key lookup is the same as `series_slots`, including the existing
mixed-type string coercion: `series=[0, "A"]` is stored as `"0"`.

Resolution order is the profile and any slot glyph, then `point_style`, then
the series record. The slot still chooses color and, unless a marker field
overrides it, the glyph. Empty mappings leave the figure unchanged. Ring,
backing, core, and glow keep their area ratios, and their opacities follow
the resolved primary opacity. At alpha 0 every observation-mark layer for
those observations is invisible; the observations stay in the data, strip
counts, and pooled medians. The legend sample is the labelled primary mark, so its glyph, area, and
opacity follow that resolution. When a theme-edge ring was recorded, the
legend keeps that ring at 1.18 times the primary area and 0.75 times the
primary opacity. Core and glow stay on the axes. Drawing order and legend
order are unchanged. A lighter mark is not a foreground-order control. These
arguments do not change coordinates, inclusion, seeded jitter, category
order, data limits, or slot assignment.

`draw_order` and `legend_order` are optional on `scatter` and `strip_summary`
only. `draw_order` lists series keys from back to front. `legend_order` lists
them in legend reading order. On `strip_summary`, `order` stays the x-axis
group order. Omitting both leaves painting and the legend as they are.
`legend_order` alone does not change which point layer is in front.
`draw_order` alone does not change legend reading order.

An explicit order must be a list, tuple, or one-dimensional array and must
name every active series once. Sets, frozensets, mappings, iterators, and
other containers are rejected before they are read.
Duplicates and unknown keys are rejected. A key that is declared in
`series_slots` and is not in the data may be included; it is not drawn and
does not add a legend entry. Key matching is the same as `series_slots`,
including mixed-type string coercion. `series=[0, "A"]` is stored as `"0"`.
Underscore labels stay literal. Anonymous points have no keys, so either
argument is rejected before axes are created or changed. A single series
still omits its ordinary legend.

Explicit `draw_order` places every layer of a background series under every
layer of a foreground series: glow, theme edge, primary mark, and core.
Those observation layers stay below strip median bars. The guarantee applies
only to observations from that call. Caller-owned artists keep their depths.
Legend order applies only to that call's handles. A later plot that rebuilds
the legend reorders each call's surviving handles only within the positions
those handles currently occupy; other handles stay in native order. The
arguments do not change first-appearance colors,
slots, resolved `point_style` or `series_styles`, which rows are drawn,
offsets, seeded jitter, group counts, pooled medians, or axis limits. This
is not a grayscale, color-vision, print, or accessibility qualification.

`shared_bins=False` is the histogram default and keeps the current per-dataset
bin policy. An integer count, including a NumPy integer, or an automatic rule
that NumPy accepts is resolved separately for each dataset.
`shared_bins=True` resolves that count or rule once against the pooled
observations and draws every dataset with those exact edges. Datasets `[0, 2]`
and `[10, 14]` with `bins=2` use edges `[0, 1, 2]` and `[10, 12, 14]` by
default, and edges `[0, 7, 14]` for both when the option is on. Explicit bin
edges already select the intervals, so their counts, exclusion warnings, and
full-dataset medians stay the same either way. `shared_bins` must be a boolean
and is rejected before axes are created or changed. One dataset keeps the theme
summary color and does not gain a legend. Counts remain raw counts.

Do not pass mismatched vectors, silently discard missing observations, or treat
these examples as statistical analysis. `order` must include every observed
strip group exactly once. Strip counts in a5 are measured outside the data
rectangle; allow enough footer space and inspect them. Histograms report medians
from the full input even when explicit edges exclude values. In a5, such exclusions
emit warnings; use covering edges or explain exclusions visibly in the figure.

Ordinary static Python lines can use NaN y values as explicit breaks under the
[documented line rules](line-series-semantics.md). They do not reconnect or
impute; shared x remains finite. Browser arrays remain dense and finite.
The [direct-label treatment](direct-series-labels.md) is limited to supported
ordinary one-panel 2–3-series layouts and may retain the complete ordinary
legend. No palette length establishes a qualified series count.

This is an entrypoint reference, not the complete exported API. Advanced
contracts, theme authoring and extensions have separate requirements; consult
their public documentation and the exact installed signatures before use.
