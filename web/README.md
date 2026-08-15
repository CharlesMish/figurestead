# @figurestead/web experimental public alpha

```sh
npm install @figurestead/web@0.9.0-alpha.1
```

The package root provides Figurestead's accepted core rendering and custom
renderer-registry APIs. The complete temporal extension is available from
`@figurestead/web/extensions/temporal`; it is intentionally not a root export.

Rendering requires a complete normalized figure contract. The repository's
[runnable browser first-success example](https://github.com/CharlesMish/figurestead/tree/main/examples/browser-first-success)
defines every identifier and imports the package's corresponding source entry.
From a repository checkout, run `python3 -m http.server 4173`, then open
`http://127.0.0.1:4173/examples/browser-first-success/`.

Python and browser surfaces share normalized contract vocabulary and selected
theme definitions. Shared semantics do not imply pixel-identical output or
identical renderer coverage. In particular, the populated categorical matrix
is currently Python-rendered; this package does not claim a browser categorical
matrix renderer.

Version 0.9.0-alpha.1. [Source and full project documentation](https://github.com/CharlesMish/figurestead).
