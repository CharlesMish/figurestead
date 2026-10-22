# Python plotting reference

This compact reference targets published **figurestead==0.9.0a5**. Each plotter
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
| `scatter(x, y)` | Paired finite numeric vectors; no fit is inferred | `series` supplies one category per point |
| `histogram(values)` | One finite vector or nested vectors; counts and dataset medians | `labels`, `bins=20`; explicit shared bin edges aid comparisons |
| `strip_summary(groups, values)` | One group per finite value; deterministic jitter and group median bars | `series`, `order`, `seed=42` |
| `heatmap(matrix)` | A nonempty finite 2D matrix; sequential color ramp and colorbar | `xlabels`, `ylabels` must match columns and rows |

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
