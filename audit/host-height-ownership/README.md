# Host-height ownership mechanism study

> Closure note: the recommended mechanism B is now implemented as the
> mount-scoped `heightNegotiation` adapter. This document remains the accepted
> pre-production ownership study and does not claim that its study actors are
> the production implementation.

Disposition: **`READY_FOR_HEIGHT_OWNERSHIP_API`**

This is study-only evidence. It adds no production sizing option, callback,
wrapper, CSS-height mutation, header wrapping/truncation, TypeScript surface, or
export behavior. The fixed-height default remains the previously accepted C
concept: protect the current scientific plot geometry and keep complete header
strings in accessibility output.

## Current ownership diagnosis

`resizeCanvas()` reads `canvas.getBoundingClientRect()` (then client/intrinsic
fallbacks) as authoritative CSS size. It writes only the canvas backing-store
`width` and `height` attributes. `createFigurestead()` observes the canvas,
re-resolves the live scene after resize, and does not write CSS dimensions.

The accessibility companion is inserted as the canvas's next sibling. Destroy
disconnects both observers, destroys the clock, and removes that companion. It
does not restore backing-store attributes; those are renderer state rather than
CSS ownership. Explicit `height`, `height:auto`, and `aspect-ratio` therefore
remain host CSS inputs today.

This matters for a future owned-height mode: after Figurestead has changed the
canvas backing dimensions, an `auto` canvas can use those attributes as its new
intrinsic ratio. Merely removing an owned inline height does not necessarily
recover the original host baseline.

## Mechanisms

| Mechanism | Study mutation | Baseline | Destroy behavior | Result |
|---|---|---|---|---|
| A — direct canvas ownership | Figurestead-side actor writes an absolute `canvas.style.height` | Pre-owned canvas CSS snapshot; must temporarily relinquish height to re-read | Restores the exact style attribute; backing attributes remain | Stable for fixed, explicit aspect-ratio, and signalled external-height hosts; auto and flex/grid intrinsic baselines drift |
| B — host-applied request | Figurestead-side actor emits one absolute preferred height; host writes it | Independent host-owned baseline, updated when host layout changes | Figurestead removes only its own DOM; host-applied height remains host state and host may clean it up | Stable in all five hosts; recommended |
| C — owned sizing target | Figurestead-side actor writes a dedicated target height and makes canvas fill it | Pre-owned target snapshot | Restores target and canvas style attributes | Adds structure without solving auto/flex intrinsic baseline ambiguity |

A and C each passed only three of five bounded stress hosts in both engines.
They failed the natural/auto and flex/grid cases by accumulating the previously
rendered intrinsic ratio; destroy/remount likewise failed to reproduce a clean
first mount in those cases. Their inline CSS restoration itself was exact, but
the canvas backing attributes correctly retained by the renderer made the
baseline ambiguous.

B passed all five hosts. The host reasserted its own baseline before applying
the absolute preferred request, so Figurestead's addition never became the next
baseline. A direct fixed `196px` host can decline the request and remain on C;
all ten cross-engine decline cases stayed fixed with complete accessible text.
An aspect-ratio host must explicitly choose between maintaining that ratio and
accepting the requested height—opt-in does not make both constraints true.

## Browser and stability results

Chromium and Firefox each ran:

- 225 primary cases: three mechanisms × five hosts × five accepted fixtures ×
  320/362/390 CSS px;
- 15 stress cases, including both directional sequences, the repeated
  390→362→320→362→390 sequence, and ten-plus oscillating width changes;
- three valid/invalid contract-transition cases;
- three runtime-failure/recovery cases;
- five next-animation-frame host applications;
- five declined host requests;
- 15 destroy/remount cases.

The 450 primary cases reproduced the accepted 0–30 px demand (13 px median),
retained the baseline plot height in the study-only B geometry, and settled at
the requested box with at most one observed resize callback. The harness makes
one explicit verification resize after settlement, so its recorded draw count
is two rather than a proposed production requirement.

For B, all 190 stress transitions (95 per engine) returned the exact same height
for the same width, with one observed resize callback and two harness draws per
transition. There was no accumulation, one-pixel jitter, or oscillation.
Chromium/Firefox differ only in normal aspect-ratio subpixels (at most 0.012 px),
below the study's 0.02 px structural-comparison tolerance; no meaningful
ownership or header-demand divergence was found.

Immediate host application settles in the same cycle. Next-animation-frame
application intentionally leaves one frame at the baseline height, then settles
exactly; identical subsequent requests are suppressed. That one-frame
intermediate is a real cost for state-driven framework hosts, not hidden by the
study.

## Contract, runtime, lifecycle, and accessibility

For all three mechanisms, the accepted transition trace was:

`short A 193 → long B 223 → short A 193 → long B 223 → invalid stays 223 → valid C 206`

The invalid replacement preserved both the negotiated height and accepted scene
identity. A draw-time failure emitted one first-party runtime error, entered the
stopped failed state, and preserved the accepted 223 px height. A later valid
replacement recovered normally at 206 px.

Every one of the 450 primary cases had exactly one companion adjacent to the
canvas, complete title/subtitle text, and no clipping by a sizing ancestor.
Every destroy removed it. B's host-applied height deliberately remains after
destroy; when the host resets its retained baseline, every remount matches a
clean first mount. No mechanism requires moving the companion or adding
`overflow:hidden`.

## Smallest plausible production boundary

The recommended concept is one explicit **host-owned height negotiation**
adapter, not several booleans. Names remain deliberately unfrozen. Its minimum
semantic contract is:

1. the host retains the baseline height independently of Figurestead's applied
   addition;
2. Figurestead emits an absolute preferred live Canvas height only after a
   successfully accepted contract/layout;
3. the host may apply, delay, or decline it;
4. duplicate requests are suppressed, and a host baseline change begins a new
   negotiation;
5. default/no adapter means the host remains authoritative and fixed-height C
   applies;
6. SVG, paper, and explicitly dimensioned exports never participate.

| Criterion | A | B | C |
|---|---|---|---|
| API complexity | Low-looking, but baseline signalling leaks in | Moderate; one ownership adapter | Moderate-high; target plus ownership policy |
| Host burden | Low until external changes/restoration | Explicit baseline retention and request application | Must provide/accept a dedicated target shape |
| Figurestead complexity | High baseline inference/restoration risk | Clear calculation/request separation | Wrapper/target lifecycle plus canvas fill behavior |
| CSS interoperability | Weak for auto/intrinsic and flex/grid | Strong because host resolves its own CSS | Better isolation, but still ambiguous for auto flow |
| Lifecycle/restoration | Figurestead must restore exact host CSS | Host cleans up host-applied state | Figurestead must restore two elements |
| Framework neutrality | Usable but mutation can fight frameworks | Natural in DOM callbacks or component state | Framework ownership of target is ambiguous |
| Misuse risk | High: opt-in can clobber existing height | Moderate: host can decline and default stays C | Moderate-high: arbitrary parent mutation is tempting |
| Backwards compatibility | Explicit opt-in possible | Explicit opt-in; default unchanged | Explicit opt-in plus new DOM expectation |

B is framework-neutral: plain JavaScript can assign the requested height;
React can store it in state; Vue/Svelte-like hosts can bind it reactively. No
framework-specific lifecycle is required. The main production risk is making
the independent host baseline and acknowledgement/update semantics impossible
to confuse with the post-request canvas height. That should be resolved in the
API design and regression suite, not inferred from ResizeObserver alone.

## Evidence and commands

- Machine record: `evidence/metrics.json`
- Representative contact sheets:
  `evidence/{chromium,firefox}-mechanism-contact.png`

Exact local comparison:

```sh
npm run test:host-height-ownership
```

Intentional regeneration:

```sh
FIGURESTEAD_AUDIT_MODE=write npm run test:host-height-ownership
```

PR CI sets `FIGURESTEAD_HOST_HEIGHT_COMPARE_EVIDENCE=0`; it protects the
structural and lifecycle assertions without requiring platform-specific font
or aspect-ratio subpixels to reproduce accepted macOS evidence.

## Decision

**`READY_FOR_HEIGHT_OWNERSHIP_API`**

Recommend B: an explicit, host-applied absolute preferred-height request backed
by a host-retained baseline. The backwards-compatible default remains host-owned
height with fixed-height C. Remaining implementation risks are the exact single
adapter shape, host acknowledgement/baseline-update semantics, suppression of
redundant requests, and integration of the already accepted B header layout.
None is implemented in this study.
