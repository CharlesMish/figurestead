# Standalone SVG typography and panel subtitles

Status: current-source repair after the published browser `0.9.0-alpha.4`.
The published package and retained exports are unchanged; consuming this repair
from npm requires a separately reviewed new release.

SVG exports now declare their existing intended font stack on the root element:
`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`. Ordinary SVG
text inherits that declaration without requiring a surrounding webpage or its
CSS. The existing explicit direct-label font declaration remains separate.
These are system-font fallbacks, not bundled fonts or a requirement that every
host have a particular named font. Actual glyph metrics may vary by host; this
does not promise Canvas/SVG pixel identity or universal text fit.

The ordinary panel-header branch now serializes an authored subtitle as visible,
escaped italic text, using the resolved subtitle baseline where present. Its
fallback uses a separate row below the unchanged SVG title position. This
covers wide single-panel exports, paper exports and multi-panel local headers.
The existing compact single-panel fixed-height title/subtitle policy is
unchanged. Empty subtitles do not add a row. Requested dimensions, plot/data
geometry, accessible title/description and XML escaping remain intact.

The alpha.4 failure had two independent causes: the SVG font-stack constant was
never applied to ordinary exported text, and the non-responsive header branch
returned only a title. At 760 × 520 the subtitle was absent from visible XML,
not clipped; it could still occur in the accessible description. Compact
non-paper single-panel exports at width ≤480 already serialized subtitles.

Regression checks parse every public SVG export route, including literal text
with XML-sensitive characters, and render independent SVG documents in Chromium
and Firefox at compact, 480/481-boundary, 760 × 520, wide, paper and multi-panel
sizes with both reference themes. They check inherited font intent and visible
subtitle bounds without requiring an installed named font or identical pixels.
These checks do not introduce a general long-header overflow solver, root-level
multi-panel subtitle policy, new scientific semantics or reference qualification.
