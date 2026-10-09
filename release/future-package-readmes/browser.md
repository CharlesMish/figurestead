# @figurestead/web

Experimental framework-free scientific figures in the browser. The core
supports line, scatter and strip summary; additional temporal renderers have
a separate extension entrypoint. Python-only plotters are not implied.

## Tested example baseline: 0.9.0-alpha.5

Requires Node >=22.22.0. In a fresh consumer directory:

```sh
npm init -y
npm install --save-exact @figurestead/web@0.9.0-alpha.5
npm install --save-dev --save-exact vite@8.2.1
```

Copy both files from the
[complete installed-package first figure](https://github.com/CharlesMish/figurestead/blob/main/web/README.md#first-figure),
then run `npx vite --host 127.0.0.1`. Keep `package-lock.json`. The renderer
requires a complete normalized contract, not only data arrays. npm's
unqualified `latest` tag does not select this example's version.

Numeric arrays must be dense and finite; missing observations are unsupported.
Python/browser semantics do not promise identical pixels. The reference
light/dark themes have a bounded three-series ordinary-line designation,
not universal accessibility or physical-print qualification.

[Package source and types](https://github.com/CharlesMish/figurestead/tree/v0.9.0-alpha.5/web)
· [Direct-label limits](https://github.com/CharlesMish/figurestead/blob/v0.9.0-alpha.5/docs/direct-series-labels.md)
· [Issue tracker](https://github.com/CharlesMish/figurestead/issues)

MIT licensed.
