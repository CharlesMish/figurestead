# Responsive-header feasibility study

This is a study-only compositor. It does not add title or subtitle wrapping to Figurestead production code. The fixture is the current deterministic `watershed_storm_response` corpus scene, rendered in the light Slipware and dark Deep Observatory themes at 320, 362, and 390 CSS px.

The pre-study 362×196 baseline remains scale 0.55 with the nominal compact plot top at 72 px. The established subtitle baseline is 52.56 px, leaving 19.44 px baseline-to-plot slack. After actual text bounds are included, the study records 17.568 px of ink-to-plot clearance. Every exact line baseline/bound and plot rectangle is recorded in `evidence/metrics.json` for Chromium and Firefox.

## Compared policies

- **A — title-only wrapping:** fixed canvas, at most two title lines, one subtitle line. The extra 17.08 px title line comes directly out of plot height.
- **B — grow canvas:** at most two title and subtitle lines; canvas and plot move down enough to preserve the pre-wrap plot rectangle and height.
- **C — plot-floor guard:** fixed canvas with a study candidate floor of 72 px. The existing 120 px multi-panel floor is recorded as a reference, not adopted. Visual text truncates when wrapping would cross the candidate floor; the associated hidden description always retains the full strings.

| Width | Pre-wrap plot | A plot / cost | B canvas growth | C result | 120 px reference |
|---:|---:|---:|---:|---|---|
| 320 | 59.921 px | 42.841 px / −28.5% | 173→203 px / +17.3% | Even the baseline misses 72 px; title/subtitle truncate | Not met |
| 362 | 82.921 px | 65.841 px / −20.6% | 196→214 px / +9.2% | 72 px guard keeps the original plot and truncates the title | Not met |
| 390 | 97.921 px | 80.841 px / −17.4% | 211→229 px / +8.5% | Two title lines fit while retaining 80.841 px | Not met |

At 320 px, A also leaves the long current subtitle incomplete; at 362 and 390 px it is complete on one line. B is the only policy that keeps both strings visually complete at all three widths while preserving plot height. Its cost is explicit additional canvas height. C preserves fixed height and scientific area where the 72 px candidate is feasible, but requires deliberate visual truncation at 320 and 362 px. A is the least defensible default because its cost is paid directly by already-limited scientific geometry.

Recommendation for a separately authorized production pass: prefer a B-like height negotiation when the embedding surface permits it; otherwise define a single-panel plot floor from broader fixture evidence and use a C-like accessible truncation fallback. Do not adopt the multi-panel 120 px floor for these compact canvases: none of the current baselines reaches it. This study does not authorize either policy.

## Evidence

- Chromium: `evidence/chromium-320.png`, `chromium-362.png`, `chromium-390.png`
- Firefox: `evidence/firefox-320.png`, `firefox-362.png`, `firefox-390.png`
- Machine-readable measurements: `evidence/metrics.json`

Run in comparison mode:

```sh
node audit/responsive-header-study/run-study.cjs
```

Regeneration is intentional-only:

```sh
FIGURESTEAD_AUDIT_MODE=write node audit/responsive-header-study/run-study.cjs
```
