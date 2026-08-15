# Figurestead controller-integrity correction

An external React-host feasibility exercise independently surfaced these
failures. The defect and repair are framework-neutral Figurestead controller
concerns; no React-specific lifecycle or error semantics were added.

## Before reproduction

On protected `main` at `e9c0ce9f2b781a658e7bd8ddb29386a4eb6251ed`, a
valid A → invalid B replacement produced:

- `FiguresteadConfigError` at `config.panels`;
- `getState().renderers === []` and profile `report` from rejected B;
- terminal, resolved, composed, and accessibility state still describing A;
- initially unchanged pixels, followed by different pixels after `resize()`
  mixed rejected-B chrome with retained-A panel state.

An inert asynchronous renderer exception produced one uncaught page error,
zero host `onError` calls, and stale state with `playing: true` after the
animation callback had terminated.

## Corrected invariants

Replacement now prepares the normalized contract, renderer data, terminal and
resolved scenes, composition, atmosphere, and a detached accessibility
companion before changing live controller state. Any preparation failure leaves
contract, scene identities, pixels, accessibility, profile, renderer selection,
and motion state on the last accepted configuration.

`createFigurestead(..., { onError })` observes draw failures as their original
error objects with `{ phase: "draw", progress }` context. The clock then has
`playing: false` and `runtimeFailed: true`; automatic and lifecycle redraw paths
remain stopped. A later valid `setConfig()` clears the failure and renders the
new accepted contract. A host callback that throws is contained and cannot
restart or recursively destabilize the draw loop.

## Required regression

```sh
FIGURESTEAD_SPECIMEN_URL=http://127.0.0.1:4179/specimen-study/ \
npm run test:browser-controller-integrity
```

`ci/check-controller-integrity.cjs` runs 31 explicit assertions in Chromium and
31 in Firefox. The required browser CI job executes it before the existing V2,
compact-layout, specimen, response-matrix, and CVD preservation gates.
