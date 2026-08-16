# @figurestead/web experimental public alpha

```sh
npm install @figurestead/web@0.9.0-alpha.1
```

The package root provides Figurestead's accepted core rendering and custom
renderer-registry APIs. The complete temporal extension is available from
`@figurestead/web/extensions/temporal`; it is intentionally not a root export.

Repository HEAD also owns first-party declarations for the root and temporal
surfaces. Import contract, controller, option, state, error, theme, and temporal
types directly from those package entrypoints—no downstream declaration shim
or shadow schema is needed. TypeScript provides structural guidance; runtime
validation remains authoritative for semantic constraints such as finite data,
ordered domains, canonical colors, and matching cardinalities.

Rendering requires a complete normalized figure contract. The repository's
[runnable browser first-success example](https://github.com/CharlesMish/figurestead/tree/main/examples/browser-first-success)
defines every identifier and imports the package's corresponding source entry.
From a repository checkout, run `python3 -m http.server 4173`, then open
`http://127.0.0.1:4173/examples/browser-first-success/`.

Curated theme packs are distributed from the canonical repository JSON rather
than retyped as JavaScript constants. For example, in Node 24 and TypeScript:

```ts
import {
  applyTheme,
  resolveTheme,
  type FiguresteadContract,
} from "@figurestead/web";
import slipwarePack from "@figurestead/web/themes/slipware" with { type: "json" };

export function withSlipware(contract: FiguresteadContract): FiguresteadContract {
  return applyTheme(contract, resolveTheme(slipwarePack, "slipware"));
}
```

The same explicit subpath works through the tested Vite browser route. Other
curated subpaths are `registration-ink`, `ultraviolet-laboratory`,
`lavender-fog-notebook`, `midnight-transit-signal-slate`, and
`deep-observatory-sage-core` under `@figurestead/web/themes/`.

These declarations and curated-theme subpaths are prepared at repository HEAD
for a future authorized npm release. This pass does not republish or alter the
existing registry artifact `0.9.0-alpha.1`.

Python and browser surfaces share normalized contract vocabulary and selected
theme definitions. Shared semantics do not imply pixel-identical output or
identical renderer coverage. In particular, the populated categorical matrix
is currently Python-rendered; this package does not claim a browser categorical
matrix renderer.

## Controller failures

`setConfig(next)` is transactional: a validation, compilation, renderer
preparation, scene-resolution, composition, or accessibility-description error
leaves the last accepted contract, scenes, pixels, companion, and motion state
active. The original configuration error is thrown to the caller.

Hosts may observe asynchronous renderer failures with the existing creation
options pattern:

```js
const figure = createFigurestead(canvas, contract, {
  onError(error, context) {
    // context.phase is "draw" or "height-negotiation".
    // error is the original renderer or host-callback error object.
  },
});
```

After a draw failure the controller is stopped, reports `playing: false` and
`runtimeFailed: true`, and will not redraw through play, replay, resize, or
reduced-motion changes. A later valid `setConfig()` clears that state and
renders normally. Lifecycle notifications remain on `onState`; runtime failures
are reported only through `onError`.

## Responsive headers and host-owned height

At compact live-Canvas widths, Figurestead preserves the established plot
geometry and uses a bounded two-line title plus a one-line ellipsized subtitle
when the host does not opt in to more height. Complete strings remain in the
associated accessibility companion. Figurestead never changes host CSS by
default.

An auto-height host may opt in with one mount-scoped adapter. Figurestead's
current measurement convention is the CSS-pixel border box reported by
`canvas.getBoundingClientRect()` (including any reflected CSS transform). Retain
the baseline independently in that same measurement space; do not derive it
from the canvas after applying an earlier request:

```js
const baselineHeight = 196;
const figure = createFigurestead(canvas, contract, {
  heightNegotiation: {
    getBaselineHeight() { return baselineHeight; },
    requestPreferredHeight({ preferredHeight, signal }) {
      if (!signal.aborted) canvas.style.height = `${preferredHeight}px`;
    },
  },
});
```

State-driven or delayed hosts may apply on a later frame. The return value is
not an acknowledgement; the host applies the absolute height and Figurestead's
existing resize observation resolves the granted layout:

```js
requestPreferredHeight({ preferredHeight, signal }) {
  requestAnimationFrame(() => {
    if (!signal.aborted) canvas.style.height = `${preferredHeight}px`;
  });
}
```

Accepted contract, width, baseline, remount, and destroy transitions abort the
prior signal. A host may decline or clamp a request; the fixed-height fallback
then remains active without automatic retry in that generation. Host-applied
CSS remains host state after `destroy()`. Before remount, the host either keeps
that height intentionally or restores its independent baseline source; residual
preferred height is never inferred as the next baseline by Figurestead.
Height negotiation applies only to live Canvas rendering. SVG, paper, and
explicitly dimensioned exports retain their requested dimensions.

Version 0.9.0-alpha.1. [Source and full project documentation](https://github.com/CharlesMish/figurestead).
