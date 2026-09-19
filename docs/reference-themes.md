# Reference light and dark themes: bounded line-figure profile

Lavender Fog Notebook and Ultraviolet Laboratory are Figurestead’s reference light and dark themes for its bounded three-series line-figure profile. They serve as evidence-backed exemplars for demonstration and regression review. The profile combines color with persistent circle, square and upright-triangle identities and matching line-and-marker legends. Its evidence includes verified line/background contrast contexts and normal-color and grayscale inspection of the recorded Python and terminal-Canvas reference specimens at their declared sizes. The designation applies to the documented rendering conditions; close or overlapping observations may remain difficult to distinguish.

Here, **reference** means a maintained, evidence-backed exemplar of a specified Figurestead rendering profile, used to demonstrate its intended visual grammar and detect regressions. It does not mean universal qualification.

## Source authority, not a release or default selection

This designation applies to repository revision [`2a0509b9df88753dd9bcf881a546b4cd7806b1eb`](https://github.com/CharlesMish/figurestead/commit/2a0509b9df88753dd9bcf881a546b4cd7806b1eb), containing merged [PR #25](https://github.com/CharlesMish/figurestead/pull/25). It does not assert that an already-published Python or npm release contains this exact B2/reference-profile behavior, and it does not select or change product defaults. The external design/evidence review concluded `REFERENCE_PAIR_READY_FOR_BOUNDED_DESIGNATION`; this document records that bounded decision, not a new qualification campaign.

The designation belongs to the profile, source revision and recorded specimens together. A theme name alone does not carry this evidence through arbitrary changes to opacity, substrate, marker treatment, pose, density or viewing geometry.

## Profile and supported identity contracts

| Series | Default line | Persistent open marker |
|---|---|---|
| S1 | Solid, equal semantic weight | Circle |
| S2 | Solid, equal semantic weight | Square |
| S3 | Solid, equal semantic weight | Upright triangle |

Existing theme colors remain the normal-view cue. Marker shape supplies persistent non-color identity; line rhythm stays available for independent author semantics. Each legend uses the resolved body style to show a line sample, matching marker and label. Only the owning series line is clipped beneath its open markers: there is no opaque background patch erasing the grid or other series. Marker outlines still occupy their own pixels.

Python `line()` preserves identity on a rebuild when original nonnegative `series_slots` are carried with the rows; omission retains positional behavior. Labels are display text, not identity. Browser `setData` retains complete established keyed line styles through filter/reorder/restore, with partial overrides applied field by field. New keys use first-encounter position; `setConfig` explicitly replaces the contract. Independent browser rebuilds must carry the corresponding `style.series` mapping. These are supported contracts, not a global identity registry. Explicit poses or overrides that replace the profile's properties are outside this designation.

## Recorded specimens and inspection conditions

| Route | Reference geometry | Recorded runtime / line facts |
|---|---|---|
| Default Python line | 1008 × 624 pixels; 8.4 × 5.2 in at 120 dpi | Python 3.12.13 / Matplotlib 3.11.2; field substrate, 1.45 pt polyline, opacity .88 |
| Terminal Canvas, Atlas | 760 × 520 CSS and raster pixels, DPR 1 | Chromium 151.0.7922.34; panel substrate, nominal 2.15 CSS-px segments, opacity .78 |

Inspect the linked original PNGs at 100% raster size without scaling or enhancement. They are retained evidence, copied byte-for-byte; no images were regenerated for this designation.

| Theme / route | Normal color | Grayscale |
|---|---|---|
| Lavender / Python | [PNG](assets/reference-themes/python/lavender_fog_notebook/normal.png) | [PNG](assets/reference-themes/python/lavender_fog_notebook/grayscale.png) |
| Ultraviolet / Python | [PNG](assets/reference-themes/python/ultraviolet_laboratory/normal.png) | [PNG](assets/reference-themes/python/ultraviolet_laboratory/grayscale.png) |
| Lavender / terminal Canvas | [PNG](assets/reference-themes/canvas/lavender_fog_notebook/normal.png) | [PNG](assets/reference-themes/canvas/lavender_fog_notebook/grayscale.png) |
| Ultraviolet / terminal Canvas | [PNG](assets/reference-themes/canvas/ultraviolet_laboratory/normal.png) | [PNG](assets/reference-themes/canvas/ultraviolet_laboratory/grayscale.png) |

At the declared reference sizes, the inspected reference specimens retain visible circle, square and upright-triangle identities and corresponding legend samples when hue is removed, supporting series recognition and reacquisition. The crowded converging tail is a disclosed limitation, not a blocker for this designation. This observation does not establish uninterrupted tracing through every convergence, distinguishability of coincident observations, arbitrary thumbnail/reduced-size readability, black-and-white print qualification or CVD-user accessibility.

The [specimen manifest](assets/reference-themes/manifest.json) records all eight hashes, dimensions, retained origin paths, runtime facts, grayscale method and provenance hashes. Origin paths identify retained local evidence; they are not public links. The images originated in the B2 development candidate before the stable-slot and keyed-style follow-ups. The manifest separately binds the original render-source hashes and designated main-source hashes, plus the retained compatibility and image-preservation records; it does not mislabel these images as a fresh render of the merge commit. Grayscale transforms the complete image using linear-light Rec.709 luminance and sRGB re-encoding. The original dataset, render and instrument records are hash-identified without importing their historical machinery.

## Bounded rendered contrast evidence

The [rendered-context documentation](rendered-series-contrast.md) defines primitive-specific substrate, opacity and compositing semantics. The existing [independent fixture](../audit/rendered-contrast/expected.json) contains the following recorded results, with current palette input hashes authenticated in the specimen manifest:

| Theme | Candidate line/background rows | Failures at the existing 3:1 floor | Minimum recorded ratio |
|---|---:|---:|---:|
| Lavender Fog Notebook | 42 | 0 | 3.175463968369672 (approximately 3.175464) |
| Ultraviolet Laboratory | 42 | 0 | 4.605489333576838 (approximately 4.605489) |

Each theme's 42 rows cover six palette entries across seven recorded primitive contexts: Python field polyline; Canvas panel/field segments at .78 and their observed float32-opacity variants; and opaque SVG panel/field segments. That broader numeric inventory is not six-series identity qualification. The designated specimens use only S1–S3. The policy remains exactly `ratio >= 3`, without epsilon or presentation rounding. These minima are not universal whole-figure contrast guarantees, marker measurements or whole-figure SVG qualification. B2 persistent non-color identity was inspected separately at reference size.

## Limits of the designation

Reproducible Machado severity-100 simulation diagnostics, B2's persistent identity cue independent of hue, and actual evidence from CVD users are three different things. Simulations are diagnostics; they do not establish CVD-user accessibility. No such user evidence is established here. Small simulated color separations, especially under deutan simulation, remain relevant limitations of color-only identity. These themes are not “CVD certified” or “colorblind safe.”

This designation does not establish universal accessibility, physical black-and-white or color-print qualification, readability at arbitrary reductions/densities/overlaps, six-series qualification, unrelated plot-family coverage, or blanket approval of semantic tokens and text roles. In particular, it does not establish `faint` as suitable for essential text in every context, every annotation/background combination, or universal typography minimums. It concerns the documented three-series line-figure grammar only. It neither restores nor changes historical Slipware or Resume qualification status.
