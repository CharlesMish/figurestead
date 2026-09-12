# Static palette and rendered series contrast

`contrast_audit(theme)` / `contrastAudit(theme)` retain their existing authored-palette semantics. They inspect opaque tokens on named theme surfaces. Their legacy series-edge exemption is not a measurement of an edge or composited ink. A static result does not establish contrast in a rendered figure.

`rendered_series_audit` / `renderedSeriesAudit` measure the **colors in the supplied theme under a caller-supplied single-layer source-over context**, using three required facts:

- `substrate`: the actual opaque `#RRGGBB` background beneath the mark;
- `opacity`: effective opacity, a finite number from 0 through 1;
- `compositing`: exactly `"srgb-source-over"` (encoded sRGB channels).

There are no renderer or surface defaults. Use the resolved theme and actual drawing facts; this function does not resolve profile, motion, color overrides or layout on the caller's behalf. It audits each entry in that theme's series. Contract/per-series style overrides may independently replace the rendered color or introduce an edge, even when the theme has no `seriesEdges`. Those overrides are outside this theme-level check; the caller must account for them before treating the result as a measurement of the rendered mark. Passing an unchanged authored theme is insufficient when the effective mark differs.

```python
from figurestead import rendered_series_audit
from figurestead.themes import get_theme

theme = get_theme("slipware")
# Facts for a default Python line polyline, without a presentation pose or overrides:
rows = rendered_series_audit(theme, substrate=theme.field,
                             opacity=0.88, compositing="srgb-source-over")
failures = [row for row in rows if not row["passes"]]
```

```js
import { renderedSeriesAudit } from '@figurestead/web';
// `theme` is the resolved theme actually used for terminal atlas line segments, with no color or edge overrides.
const rows = renderedSeriesAudit(theme, {
  substrate: theme.panel,
  opacity: 0.78,
  compositing: 'srgb-source-over',
});
const failures = rows.filter(row => !row.passes);
```

Verified primitive contexts (not presets implemented by the API):

| Primitive measured | Substrate | Effective opacity |
|---|---|---:|
| Python default line **polyline** | field | .88 |
| Canvas terminal line **segment** | panel | .78 |
| Canvas terminal line **segment** | field | .78 |
| SVG line **segment** | panel | 1 |
| SVG line **segment** | field | 1 |

These values do not describe every series-colored primitive in the figure. Companion markers/points can have different opacity and are not measured by these polyline/segment contexts. Canvas motion multiplies segment alpha; Python presentation poses and layered glow are outside the verified contexts. Firefox exposes the requested Canvas .78 as the float32 value `0.7799999713897705`; Chromium exposes .78. Both observed variants are regression inputs with exact values. Pass the actual primitive facts rather than inferring them from a renderer name.

Every row reports `token`, authored `color`, `substrate`, `opacity`, `compositing`, `effectiveColor` (unrounded encoded-sRGB channels in [0,1]), unrounded `ratio`, `minimum: 3`, and `passes`. Blending precedes relative-luminance calculation. A ratio strictly below 3 fails; display rounding never changes the decision. Opacity zero yields the substrate itself and ratio 1. Low values are results to report, not instructions to recolor the figure. The policy is exactly `passes = ratio >= 3`, with no epsilon. At floating-point precision, values effectively on the threshold may classify differently across Python/JavaScript because their final ULPs need not match. This audit is not a physical-certification boundary.

## Edges and limits

Nonempty **theme-level** `series_edges` / `seriesEdges` are conservatively rejected. Empty theme-level edge arrays do not establish that the rendered mark has no edge: browser contract/style overrides can independently introduce one. The audit does not inspect those overrides and therefore does not detect or reject every layered rendered mark. Callers must account for effective colors and layers before applying the single-layer result to a rendered primitive.

Python path effects and Canvas two-pass strokes can place edge ink beneath series ink; a token alone does not specify opacity, geometry or compositing. An edge token is never evidence that a low-contrast fill is adequate. No generalized style or layer resolver is introduced here.

This API does not grade edge redundancy, motion, glow, overlapping marks, antialias boundaries, CVD distinguishability or whole-figure accessibility. Future edge support requires a verified layered context and a separate redundancy claim; it must not weaken the reported fill contrast. No renderer, colors, opacity, thresholds or version changed for this API.

## Regression evidence

`audit/rendered-contrast/reference.py` is a tiny independent test oracle, importing no Figurestead code. Its fixture covers every series in all six shipped themes and five source contexts plus the two observed native-opacity variants. Python and browser tests compare both ratios and failure sets, preserve static findings, reject missing/invalid/unknown context, and cover a value below 3 that displays as 3.00. Real renderer checks and retained before/after hashes verify that this measurement-only API leaves the picture unchanged.
