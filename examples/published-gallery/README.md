# Published a4 / alpha.5 gallery

Six deterministic synthetic examples: Python line, scatter, histogram, strip
summary and heatmap, plus a browser line. These are demonstrations, not
measurements or a new reference-theme qualification. They use the released
registry packages, without the open Python #51/#53/#55 or browser #52 changes.

The [fixture](fixture.json) contains every value and axis label. The line has
25 observations per series (rounded to 12 decimal places); it follows
`sin(x + phase) + offset`, using phases/offsets `(0,0)`, `(0.4,0.8)`, `(0.8,1.6)`.
No fit, smoothing or uncertainty is inferred. Scatter has 10 points per group.
Histogram bins cover all 15 values per dataset; the vertical rules show the
full-data medians (A: 0.7, B: 1.3). Strip summary has 9 values per group, seed 42
for horizontal jitter and an explicit y domain [0,2]. Its a4 count labels stay
inside the plot. Heatmap is a 4x6 response field with its own min/max scaling.

## Python: fresh installed-package consumer

Copy this example directory outside the source checkout. Use Python 3.12
(the retained capture used 3.12.13), then from the copied directory:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python render_python.py --output output
```

On Windows use `.venv\Scripts\python.exe`. The requirements file records the
complete dependency environment used for these renders, including a4. Output
is five 1008x624 PNGs plus SVGs and `python-render.json`. The generator requires
an installed a4 package and does not import repository implementation code.
It uses `figure.savefig`, not the unreleased `save_figure` API. A constant SVG
hash salt and omitted SVG date make repeated captures stable in this environment.

## Browser: fresh installed-package consumer

Copy `browser/` outside the source checkout. Its identical fixture copy is
validated against the Python fixture. With Node 22.22.0 or later:

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run dev
```

Open the printed local URL. For a settled 1008x624 Canvas PNG and an independent
SVG export, stop the dev server and run:

```sh
npm run capture -- ./output
```

The capture script starts and stops its own Vite server on 127.0.0.1:43181;
`GALLERY_PORT` can override that port. It records package, browser, source and
output hashes in `browser-render.json`. No manual pixel editing occurs. The
browser render uses Ultraviolet Laboratory; Python uses Lavender Fog Notebook.
Shared data does not imply identical layout or pixels. Browser observations
are all dense and finite, and the example uses no bands or missing values.

The [published-site manifest](../../site/published-a4-alpha5/manifest.json)
binds the package archive hashes, fixtures, exact generator files, captured
environment and 12 output files. Pixel/font output can differ on another OS,
browser or dependency stack; byte reproducibility is scoped to the recorded
environment. The source files remain useful runnable consumer examples.

Small-multiples demonstrations and a broader browser gallery are deliberately
left for a later slice. The old `site/current-alpha/`, earlier-alpha images and
their manifests are preserved; new outputs have their own directory.
