# Responsive-header cross-renderer validation

This is study-only evidence. It adds no production wrapping, height negotiation,
truncation, plot floor, host option, or SVG behavior. The historical policy A
result remains in `audit/responsive-header-study/`; this study compares only B
and C across five current deterministic specimen scenes.

## Authority and method

The five fixtures are used without changing their strings, data, seed, authored
domains, renderer, or recommended theme:

| Fixture | Renderer | Theme |
|---|---|---|
| `watershed_storm_response` | line | Slipware |
| `circadian_phase_shift` | line | Deep Observatory / Sage Core |
| `instrument_calibration` | scatter + `linear_fit` | Registration Ink |
| `paired_seasonal_distributions` | strip summary | Lavender Fog Notebook |
| `field_sampling_coverage` | temporal coverage | Deep Observatory / Sage Core |

The accepted specimen lab gives these figures one current responsive baseline:
the `116:70` aspect ratio declared by `.specimen canvas` in
`specimen-study/specimen-study.css`. Rounded baseline canvases are therefore
320×193, 362×218, and 390×235. The study still uses each renderer's resolved
scientific layout; label refinement produces small, meaningful plot-height
differences.

Each source canvas is a real settled Figurestead rendering. The study compositor
retains the renderer body pixels and mark/data counts. B translates that intact
body down by the measured additional header requirement and grows the canvas;
C retains the exact baseline canvas and plot rectangle while deterministically
ellipsizing only visual header text that cannot fit. Both retain the complete
title and subtitle in associated accessibility text.

## B — height negotiation

Across the 15 fixture/width combinations in each browser, the added canvas
height ranges from 0 to 30 px; the median is 13 px. The maximum represents
29.23 px of measured header need rounded to a 30 px canvas addition, or 15.544%
of the 320×193 baseline. Three 320 px cases share that maximum:

- `watershed_storm_response`
- `instrument_calibration`
- `field_sampling_coverage`

| Fixture | 320 px | 362 px | 390 px |
|---|---:|---:|---:|
| watershed | +30 px / 15.544% | +18 px / 8.257% | +18 px / 7.660% |
| circadian | +13 px / 6.736% | 0 | 0 |
| calibration | +30 px / 15.544% | +13 px / 5.963% | +13 px / 5.532% |
| seasonal distributions | +13 px / 6.736% | +13 px / 5.963% | 0 |
| field coverage | +30 px / 15.544% | +13 px / 5.963% | 0 |

B retained complete visual and accessible titles/subtitles, exact baseline plot
height, and identical data/mark counts in all 30 engine-independent cases. The
growth is visually modest for a responsive document flow, including the three
worst cases, but it is not safe to impose on an explicitly height-constrained
host.

## C — fixed-height fallback and floor evidence

C preserves each baseline plot rectangle. Titles remain complete at all tested
widths, using up to two lines. Subtitles truncate at 320 px for all five
fixtures; at 362 px they truncate for calibration, seasonal distributions, and
field coverage; at 390 px only calibration still truncates. Associated
accessibility text remains complete everywhere.

| Width | Watershed | Circadian | Calibration | Seasonal distributions | Field coverage |
|---:|---|---|---|---|---|
| 320 | 79.921 px · usable | 79.926 px · usable | 79.950 px · usable | 79.765 px · marginal | 77.958 px · not defensible |
| 362 | 104.921 px · comfortable | 104.926 px · comfortable | 104.950 px · comfortable | 104.765 px · usable | 102.958 px · marginal |
| 390 | 121.921 px · comfortable | 121.926 px · comfortable | 121.950 px · comfortable | 121.765 px · comfortable | 119.958 px · usable |

These labels are human, renderer-specific inspection judgments, not a generated
scientific-adequacy score. The machine record includes the exact rationale for
curve/marker/tick/legend, scatter/fit, strip/median/category, and temporal-row
observations.

All 15 baselines clear both 60 and 72 px, yet the 320 px temporal case is not
defensible and the 320 px strip case is marginal. Conversely, the 390 px
temporal case is usable at 119.958 px while missing the 120 px reference by
0.042 px. Only four of 15 baselines clear 120 px. Therefore none of 60, 72, or
120 has stable renderer-independent meaning; protecting the fixture's existing
baseline geometry is better supported than declaring one universal floor.

## Resize stability

The study exercises 390→362→320, 320→362→390, and
390→362→320→362→390 for every fixture in both engines. Heights are recomputed
from each fixture's fully resolved renderer layout. Every transition is exact,
monotonic by width, reversible, free of accumulated height and oscillation, and
settles within at most two ResizeObserver callbacks. No hysteresis or stateful
memory was required by the study function.

This does not make automatic production mutation safe. `resizeCanvas()` reads
the host-controlled canvas box, while `createFigurestead()` observes the canvas
itself and exposes no distinction between responsive/auto-height and explicit
height constraints. CSS `height`, `height:auto`, and `aspect-ratio` remain host
authority. Production B therefore needs the smallest possible host-sizing
decision—most likely an explicit opt-in defining who owns responsive height—so
Figurestead does not fight CSS or create a ResizeObserver feedback loop.

## Canvas and SVG

Height negotiation belongs only to an opted-in live Canvas presentation.
Current SVG and physical export calls accept explicit width/height geometry;
they should not mutate authored publication or paper dimensions. If responsive
header degradation is later authorized for export, fixed-size SVG should use a
C-like visual-header rule while preserving complete `<title>`/`<desc>` text,
not B-like dimension mutation.

## Decision

`NEEDS_HOST_SIZING_DECISION`

B generalizes visually and geometrically across the tested families. For a
fixed-height embedding, the smallest truthful fallback is: preserve the current
baseline plot rectangle, keep accepted typography floors, permit two title
lines only when they fit, ellipsize the one-line visual subtitle when required,
and retain complete accessible text. Do not add a universal numeric plot floor.

## Evidence and commands

- Machine-readable record: `evidence/metrics.json`
- By-width contact sheets: `evidence/{chromium,firefox}-{320,362,390}-contact.png`
- Enlarged material-tradeoff sheets: `evidence/{chromium,firefox}-{320,362,390}-focus.png`

Exact local comparison:

```sh
npm run test:responsive-header-cross-renderer
```

Intentional regeneration:

```sh
FIGURESTEAD_AUDIT_MODE=write npm run test:responsive-header-cross-renderer
```

PR CI sets `FIGURESTEAD_CROSS_HEADER_COMPARE_EVIDENCE=0` and reruns all
structural/policy assertions without requiring Linux fallback-font pixels to be
byte-identical to the recorded macOS evidence.
