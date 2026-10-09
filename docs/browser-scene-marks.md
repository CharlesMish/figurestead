# Browser scene marks

Availability: unreleased source changes after browser `0.9.0-alpha.5`.
The published alpha.5 package does not include this repair.

## Closed vocabulary

`MARK_KINDS` is a frozen runtime list of the 14 scene discriminators. Public
`Mark` and `ResolvedMark` types expose the corresponding tagged union and
geometry, so checking `mark.kind` narrows the available fields. Terminal,
resolved and composed scene panels expose typed `marks` arrays.

`assertMarkKind(value, path?)` checks the discriminator at runtime and preserves
the caller's existing type knowledge. It does **not** validate a complete mark.
Finite numbers, ordered domains, colors and scientific constraints remain the
responsibility of runtime validators.

The built-in painters recognize `point`, `segment`, `summary-line`, `bar`,
`cell`, `interval`, `median-rule`, `connector`, `reference-band`,
`baseline-rule`, `row-band`, `rug`, and `temporal-bar`. These include low-level
marks consumed by optional/legacy adapters; the list does not add plotters to
the public renderer registry. `renderer-mark` is the explicit custom-renderer
compatibility case.

Unknown kinds raise an error at evidence coverage, geometry resolution, motion,
layer partitioning, Canvas drawing and SVG export. They do not disappear because
they have null geometry or zero opacity. A known mark sent to an incompatible
built-in geometry resolver also raises an error.

## Bands and rendering parity

The Canvas dispatcher now paints reference bands and row bands using the
existing helpers. Previously SVG exported these marks, but Canvas omitted the
band while still drawing the temporal reference-band key. Bands remain clipped
to the evidence frame, below data marks, and follow their existing motion and
opacity rules.

The parity suite covers every built-in painting kind by checking actual Canvas
operations against SVG geometry. It also exercises a real
`temporal_observations` contract and a low-level row-band scene at intermediate
and terminal frames. This verifies shared evidence geometry and visible output;
it does not promise pixel-identical Canvas and SVG rasterization.

A native Chromium/Firefox gate compares reference-band interior pixels with an
otherwise identical band-removed frame at intermediate and terminal progress.
It also checks the exported SVG's band bounds and native decoded pixels, with
unchanged exterior control pixels.

## Evidence coverage and custom rendering

Coverage checks required numeric/time coordinates and categorical membership.
Segment endpoints are evidence; derived curve controls and model extrapolation
may legitimately be clipped. Cell values belong to color encoding, and temporal
site counts use their separate count plot, so neither is compared with an
unrelated numeric axis domain.

Registered custom renderers retain their own `draw` method. Their
`renderer-mark.evidence` may contain conventional point coordinates (`x`/`y`,
or `group`/`yCategory` for band axes), which the shared checker inspects. Valid
`Date` values remain supported for custom time coordinates. Opaque evidence
without a complete recognizable coordinate pair does not get a clean report:

```js
{
  clean: false,
  complete: false,
  checkedPanels: 1,
  findings: [],
  uncheckedMarks: [
    { panelId: "custom", markId: "sample", reason: "custom-renderer-evidence" }
  ]
}
```

The report describes the scene marks supplied to the checker, not arbitrary
painting performed by a custom draw function. Out-of-domain or unreadable
required coordinates still throw. Built-in fully inspected scenes return
`clean: true`, `complete: true`, and an empty `uncheckedMarks` array.

Compatibility geometry still resolves conventional custom points for inspection
and preserves known custom non-point marks without assigning built-in geometry.
Shared SVG export cannot serialize an arbitrary custom draw method. Built-in
Canvas/SVG dispatch rejects a `renderer-mark` placeholder explicitly; custom
live Canvas drawing continues through its registered implementation.

## Adding a mark

Extend the runtime list, the public union and geometry type, and the relevant
geometry, evidence, layer and painting policies together. Keep the custom
placeholder policy explicit. The runtime inventory, TypeScript exhaustive
fixture, and per-kind rendering fixtures must agree; the packed consumer check
verifies the declarations delivered in the npm tarball.

The repository-wide optional `tsc --allowJs --checkJs` audit remains separate.
Its 14 existing diagnostics under pinned TypeScript 7.0.2 concern inferred
callbacks, readonly/default types and dynamic object fields. The new focused
consumer fixture is enforced in the packed-package CI checks without adding a
noisy whole-source gate.
