# Opt-in direct series labels v1

This source feature replaces the ordinary legend atomically for an eligible line figure. It is off by default. It does not change B2 identities, palettes, thresholds or the bounded reference-theme designation, and does not imply availability in an already-published release.

```python
fig, ax = line(x, ys, labels=["Control", "Treatment", "Model"],
               series_slots=[0, 1, 2], direct_labels=True)
```

```js
const figure = createFigurestead(canvas, {
  ...contract,
  style: { ...contract.style, directLabels: true },
}, { reducedMotion: true });
```

The setting is separate from ordinary legend placement. Browser `presentation.legend: "none"` conflicts with direct labels and rejects, since a complete fallback legend is required. Python `line()` has no legend-disable configuration; removing/hiding the fallback legend after construction is not a supported direct-label control.

## Admission and endpoints

Processing is ordinary validation → common-profile eligibility → measured fit/visibility → all direct labels or the complete ordinary treatment. Direct labels never catch browser `FiguresteadConfigError` or bypass `validateEvidenceCoverage`. Browser inputs with *any* observation outside either resolved numeric domain remain configuration errors, with the same messages when disabled or enabled. Existing scientific-geometry tests remain unchanged.

Python ordinarily permits explicit clipping. With this opt-in, any observation outside either resolved domain instead makes the treatment fall back with `outside-common-admission-profile`; the Python figure remains valid. This narrow eligibility check is not a port of browser validation. Cross-runtime structural equivalence applies to the intersection of ordinarily admitted inputs, not to pre-existing differences in renderer admission.

The supported profile is one ordinary line panel, two or three series, a finite shared strictly increasing x vector with at least two observations, finite y, straight segments, increasing linear axes and ordinary rectangular clipping. Only single-line printable ASCII labels with nonblank content are supported, drawn literally (including `$`, `<` and `&`). Other text retains ordinary legend behavior. Explicit poses replacing this grammar, multiple panels, custom clipping, transitions and unsupported layout controls fall back. Browser compact responsive headers (width ≤480), annotations, and Python tight/constrained layout, explicit export bounding-box cropping and transparent substrates are outside v1. Python only accepts distinct carried slots for direct-label ordering; repeated slots retain the ordinary legend because they do not identify a stable tie-break.

The anchor is the final original observation in authored order. There is no greatest-x selection, backward scan or clipping intersection. An admitted center still needs its actual terminal marker ink fully inside the final plot clip; otherwise the whole treatment falls back with `terminal-marker-clipped`. Earlier observations are not alternate anchors.

## Identity and planning

Python reads `IdentityLine.identity_points`: its actual path, size, outline, edge effects, color and opacity. Browser reads the resolved terminal point mark and B2 geometry. Neither adapter creates a marker cycle or treats detached legend metadata as proof of drawn identity. Labels are display text only. Python carries `series_slots`; browser retains first-registration ranks through `setData`, alongside the established complete keyed styles and partial overrides. `setConfig` establishes a new contract and registration order.

Ordering is screen-down terminal height, then stable identity rank. Let `H` be the maximum measured text/marker ink height plus two-sided padding, and `s=H+g`. The solver minimizes squared displacement subject to center spacing `s` and full row containment. It subtracts `i*s`, performs pooled-adjacent-violators isotonic regression, clamps the pooled values to the common feasible interval, then restores `i*s`. A negative interval means vertical-capacity fallback. There is no recursive boundary search. Shared hand-derived vectors and an independent small feasible-grid objective comparison exercise the solver.

Text measurements use the actual renderer/font, not character estimates. Python includes font-outline overhang and renderer bounds; Canvas records advance, left/right ink overhang, ascent and descent in the font it draws. Copied marker extents include outline/edge, including the native Canvas/SVG polygon miter tips; Python uses its actual round-join path bounds. Common row boxes include marker-to-text space and outer padding. Missing trustworthy measurement falls back. Identical resolved measurements/geometry have the same capacity and solver semantics across runtimes; real fonts and geometry can legitimately produce different capacity outcomes.

For authored non-solid rhythm, see [orthogonal line semantics](line-series-semantics.md). All-solid figures keep the compact marker/text treatment. If any body line is non-solid, every row adds an actual-body line sample before its marker. Samples and their stroke/edge extent participate in measurement, collision boxes and gutter capacity; leaders stay neutral and solid. `horizontal-capacity` with `lineSamplesRequired: true` means the complete sampled treatment did not fit, so the ordinary legend is restored.

## Gutter, leaders and lifecycle

Output size, domains, scientific coordinates, plot height and font size remain fixed. Planning starts with the ordinary layout, uses available right margin first, then proposes at most a 25% reduction of baseline plot width. The browser's existing 160 CSS-px minimum is retained; Python uses a 160 logical-pixel v1 floor at 96 dpi, scaled for output DPI. No text is truncated, ellipsized or shrunk. Failed proposals restore the ordinary legend and layout.

Internal layout choices (not perceptual thresholds) are 2 px outer padding, 4 px row gap, 6 px marker/text gap, a 12 px leader corridor and .75 px vertical-displacement tolerance. Python scales these logical pixels with DPI. Leaders appear only beyond that displacement tolerance, begin after terminal-marker clearance and end before marker/text collision boxes. Their straight, order-preserving geometry has no general routing policy; obstructing annotations cause fallback. Coincident anchors may share an origin and are not made independently identifiable by this treatment.

Leaders use full-opacity `secondary`, or full-opacity `label` when necessary, at the existing 3:1 thin-evidence floor on both actual plot and gutter substrates. If neither qualifies, the treatment falls back. Copied marker ink/edge and text are also checked on the actual gutter substrate at that floor. This is an ink check, not a new general text/accessibility certification. No palette changes or low-opacity quieting are used.

Python restores baseline geometry before each figure draw, measures with the current renderer and installs one complete plan before axes paint. The same bounded artists are used across redraw, resize and PNG/SVG export DPI changes, without appending artists or accumulating gutter width. Layout-engine changes restore ordinary treatment. Custom axes positioning is unsupported and falls back. Arbitrary Matplotlib mutations beyond these supported controls are not an additional public layout API.

Browser resolution performs one proposal from the ordinary resolved layout. Canvas and `resolvedSceneToSvg()` consume that composed plan; they do not select endpoints, identities, ordering or fallback themselves. Animated frames use the ordinary baseline and legend; only the settled frame uses the direct plan. Unmeasured `sceneToSvg()` / contract export uses the ordinary legend. A caller supplying `resolveTerminalScene(..., {measureText})` must supply trustworthy metrics for the documented browser font stack, including `left`, `right`, `ascent`, `descent` and `width`. External SVG font substitution remains a fit limitation; serialization alone does not certify text fit.

## Internal results and checks

Inspection uses private Python `ax._figurestead_direct_labels.result` or browser `getComposedScene().directLabelPlan` (the settled plan); `resolveSceneFrame` reports the actual transitional fallback. This is a small implementation/testing record, not a new public diagnostics framework. Reasons are:

- `outside-common-admission-profile` (Python only);
- `terminal-marker-clipped`;
- `unsupported-series-count`, `unsupported-geometry`, `unsupported-text`, `unsupported-layout`;
- `horizontal-capacity`, `vertical-capacity`, `ink-contrast`.

Direct regressions: `audit/current-head-hardening/test_direct_labels.py`, `web/test/direct-labels.mjs`, and `ci/check-direct-labels.cjs`, using the existing Python/core/browser jobs. Visual examples remain development review, not a qualification or reference-status update.

For current-source Python gapped lines, valid NaN y causes whole-treatment
`missing-observations` fallback before gutter allocation. The ordinary legend
remains truthful (marker-only for NaN-bearing all-isolated traces). Invalid
ordinary input still raises. Browser missing-y support is not implemented; see
[Python missing-y semantics](line-series-semantics.md#python-explicit-missing-y-current-source).
