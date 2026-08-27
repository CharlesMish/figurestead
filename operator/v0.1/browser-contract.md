# Browser contract

Use browser Figurestead for a normalized portable contract, Canvas/SVG/browser delivery, lifecycle control, or semantic motion. For an ordinary static figure, prefer the Python convenience API.

Authority: `@figurestead/web@0.9.0-alpha.2`, tag `v0.9.0-alpha.2`, source commit `0cd97599cce69b08957e61e900be53954ae39023`.

## Exact operator imports

```js
import {
  applyTheme,
  createFigurestead,
  resolveTheme,
  validateContract,
  validateThemePack,
} from "@figurestead/web";
```

For TypeScript, import `FiguresteadContract`, `FiguresteadController`, `CreateFiguresteadOptions`, `FiguresteadState`, `FiguresteadConfigError`, and `FiguresteadRuntimeErrorContext` from the package root. Runtime validation remains authoritative for finite values, cardinalities, ordered domains, canonical colors, and renderer-specific constraints.

The separate temporal entrypoint is `@figurestead/web/extensions/temporal`. Its released renderers are `temporal_coverage` and `temporal_observations`; do not treat them as root renderers.

## Anti-improvisation rule

Load [examples/browser-line.json](examples/browser-line.json), copy the complete object, and mutate only the scientifically intended `spec`, panel data, scale/domain, and presentation values. Do not reconstruct the normalized contract from memory. Validate with `validateContract` before creating the controller. If another curated theme is needed, load its package subpath and key from `themes.json`, call `resolveTheme(validateThemePack(pack), key)`, then use `applyTheme` rather than editing theme tokens.

Core browser renderers in this release are `line`, `scatter`, and `strip_summary`. Browser scatter supports `summary: "linear_fit"` only when the fit is identifiable. Browser core does not provide histogram, heatmap, or categorical-matrix rendering.

Minimal use after loading the JSON contract:

```js
const accepted = validateContract(contract);
const controller = createFigurestead(canvas, accepted, {
  autoplay: false,
  reducedMotion: true,
});
controller.resize();
```

Complete title/description strings belong in the contract for the accessibility companion. Inspect the live render at its real host width; successful validation does not prove unclipped or legible output.
