# Orthogonal line-series semantics

Python slots carry marker/color identity; Python keys address authored line rhythm. Labels are display text. None of these imply a scientific meaning: authors explain their own convention, for example “solid = observed; dashed = predicted.” A triangle does not mean predicted.

```python
fig, ax = line(
    x, ys, labels=["Control", "Treatment", "Model"],
    series_slots=[0, 1, 2],
    series_keys=["control", "treatment", "model"],
    line_styles={"model": "dash"},
)
```

`series_keys` is an optional row-aligned sequence of unique, nonblank strings. `line_styles` requires those keys and accepts only `solid`, `dash`, `dot`, and `dash-dot`. A missing active key means solid; mapping entries for temporarily inactive keys are allowed and validated. Carry keys and slots with their rows when filtering/reordering. Repeated slots remain legal for ordinary lines: two traces can share marker/color identity while distinct keys select different rhythms. Display labels can be duplicated or changed without changing either channel.

Omitting both arguments preserves the previous behavior. Keys do not allocate marker/color slots or create a registry. Explicit poses are rejected when `line_styles` is supplied because they replace the supported default line grammar. Ordinary legends inherit the actual resolved body line, so a public authored rhythm requires no later artist mutation or legend reconstruction.

## Browser replacement boundary

Browser per-key `style.series` records may contain both marker/color identity and rhythm. Use `setData` for supported data-only updates; established keyed identity and partial overrides are retained. `setConfig` replaces the complete contract and resets registration. It is not a style patch.

```js
// Application-owned state carries the complete intended next style record.
const next = {
  ...contract,
  style: {
    ...contract.style,
    series: {
      ...contract.style.series,
      model: { ...applicationStyles.model, color: nextColor, lineStyle: "dash" },
    },
  },
};
figure.setConfig(next); // retains explicitly supplied dash

figure.setConfig({
  ...next,
  style: { ...next.style, series: { ...next.style.series, model: { color: nextColor } } },
}); // lineStyle was omitted: the ordinary positional default is resolved anew
```

For a first-three default line trace that default is solid. This example does not promise a new 4–6-series identity grammar: the existing broader browser fallback allocator can advance its rhythm cycle after exhausting its glyph cycle. That out-of-profile behavior is unchanged by this feature.

## Direct labels

[Direct labels](direct-series-labels.md) keep their existing compact marker → text treatment when all resolved lines are solid. If any participating line is non-solid, **every** row displays resolved line sample → actual body marker → text. Leaders remain neutral and solid; they do not communicate rhythm.

The sample copies the body's actual rhythm, color, weight, opacity and edge treatment in its renderer. Python reserves at least two complete resolved dash cycles (and at least 24 logical pixels); the browser reserves 32 CSS pixels, two cycles of its longest named pattern. Dash lengths need not match across runtimes. Sample stroke/edge extent and spacing count toward row boxes and the existing gutter cap. Samples are checked against the actual gutter substrate at the existing ink floor.

Adding a rhythm can therefore turn a placed treatment into `horizontal-capacity` fallback. The internal result includes `lineSamplesRequired` and `sampleWidth` for that case. All rows then return to the ordinary legend with their marker and authored rhythm intact; samples are never selectively omitted or compressed to force a fit. Repeated Python slots still use ordinary legends under the existing direct-label tie-break restriction. The two-or-three-series scope, endpoint rules and reference-theme designation are unchanged.

## Opt-in marker cadence

Ordinary lines accept Python `line(..., marker_stride=4)` and browser
`style: { ...style, markerStride: 4 }`. Omission (or 1) preserves a marker at
**every finite observation**. For wholly finite input, a positive integer N marks authored indices 0, N, 2N, ...
and always the final observation, without duplication. For 29 observations,
stride 4 selects `[0, 4, 8, 12, 16, 20, 24, 28]`; for 10 it selects
`[0, 4, 8, 9]`. Selection uses authored order, **not x-distance**.

This is explicit presentation density, not sampling or data reduction. Every
observation and line segment retains its coordinates; unmarked observations
remain in the continuous line but lose their explicit sampling-location glyph.
Only displayed markers clip their owning line. Other traces and grid content
are not erased. Cadence has no scientific meaning by itself and does not select
slots, keys, colors, shapes or rhythms. Stride 4 is an example, not a new default.

Python accepts positive Python/NumPy integers and rejects floats, booleans,
strings, zero and negatives; sparse cadence with an explicit pose is unsupported.
Browser accepts positive safe integer numbers and rejects booleans, strings,
null, fractional values, zero and negatives. JavaScript represents `4` and `4.0`
as the same number. The setting affects line markers, not other plot families.

For connected traces, ordinary legends still show a full line sample, actual marker and display label;
they teach identity, not marker frequency. Supported direct labels consume the
actual terminal marker, which is always retained for the supported finite profile. Non-solid rhythms still add
line samples to all direct-label rows, with the same measured-capacity rules and
atomic ordinary-legend fallback. The 2–3-series direct-label scope, default
marker grammar and existing higher-series overflow behavior are unchanged.

## Python explicit missing y (current source)

Ordinary static Python `line()` accepts IEEE NaN in y as an **explicit break**.
Shared x remains entirely finite and each y row keeps its original width/order.
There is no interpolation, imputation, sorting or reconnection across missing
records. Each row must contain at least one finite observation; an all-missing
row rejects the complete call before adding artists or changing caller axes.
Infinities, `None`, object/string sentinels and masked arrays (even zero-mask
arrays) remain unsupported. Gaps with explicit presentation poses/curves are
also unsupported in this first slice. Other plot families retain finite-only
numeric admission.

```python
fig, ax = line(
    [0, 1, 2, 3, 4, 5],
    [[1, 2, float("nan"), 3, 4, 5],
     [2, float("nan"), 3, float("nan"), 4, 5]],
    labels=["Control", "Model"], series_keys=["control", "model"],
    line_styles={"model": "dash"}, marker_stride=4,
)
```

Each series retains its slots, keys, colors, markers and authored rhythm. Within
each maximal finite run, rhythm continues across segment subdivisions and
own-marker holes. At a true missing-data gap the next run restarts at phase zero:
there is no imagined connection whose length could advance the phase.

With stride N, mark finite **original authored indices** divisible by N, plus
both endpoints of every finite run, once each. Singleton runs always show their
actual identity marker without a connecting segment. Missing records receive no
marker. A missing tail does not create a new endpoint: the last finite run's end
is marked at its own authored position. These endpoint safeguards expose existing
evidence boundaries, not new observations. Sparse markers still do not show
every sampling location and have no scientific meaning by themselves.

Automatic limits use all finite (x, y) pairs, including singletons and unmarked
finite observations. A missing y contributes neither y nor its paired x extent;
a finite peer can contribute that x normally. Explicit limits and normal clipping
remain intact; a clipped finite observation does not become missing.

A gapped series with connecting geometry retains its line + marker legend.
A NaN-bearing series consisting entirely of isolated points has a marker-only
legend entry, so it does not suggest connections absent from the body. Wholly
finite single-point legends retain their historical behavior. Any valid NaN in a
Python direct-label request gives atomic ordinary-legend fallback with internal
reason `missing-observations`, before gutter allocation. Invalid ordinary input
still raises. No-gap direct labels and marker selection are unchanged.

This is current-source Python behavior, not a claim about the published alpha.3
packages. Browser and portable validators remain finite-only. A later browser
slice should use explicit JSON `null` y, preserving shared finite x and original
row positions in descriptions rather than compacting records. A future Python
adapter would explicitly map accepted NaN to null with strict JSON, rejecting
infinity before serialization. That transport is not implemented here.
