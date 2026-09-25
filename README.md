# Figurestead

Figurestead is an experimental scientific figure system with Python and framework-free browser surfaces. It shares figure-contract and theme semantics across runtimes while keeping scientific output deterministic and inspectable.

Coordinated release target: Python `figurestead==0.9.0a2` and browser `@figurestead/web@0.9.0-alpha.3`. The package counters are independent. Registry commands below require those exact versions to be available; review candidates use the retained files in [release preparation](release/README.md).

## Start here

### Python

```bash
python -m pip install "figurestead==0.9.0a2"
```

```python
from figurestead import line

figure, axes = line([0, 1, 2], [[0, 1, 0]])
figure.savefig("figurestead-first-success.png", dpi=150)
```

[Open the exact Python example](examples/python-first-success.py).

### Browser

```bash
npm install @figurestead/web@0.9.0-alpha.3
```

The package exports `createFigurestead`; rendering requires a complete normalized figure contract. The repository includes one with every identifier defined. From a checkout:

```bash
python3 -m http.server 4173
```

Open <http://127.0.0.1:4173/examples/browser-first-success/>. [Inspect the exact browser example and its inline contract](examples/browser-first-success/).

Python and browser surfaces share normalized figure-contract vocabulary and selected theme definitions. Each surface renders through its own implementation; shared semantics do not imply pixel-identical output.

## Series identity and optional direct labels

Default line series combine color with persistent open **circle (S1), square (S2), and upright triangle (S3)** markers and matching line-and-marker legends. Line rhythm remains an independent semantic channel. Python callers can carry `series_slots=[1, 2]` when rebuilding filtered S2/S3 rows; browser `setData` retains established keyed identity through supported filtering/reordering and partial style overrides. `setConfig` replaces the contract.

Lavender Fog Notebook is the reference light theme; Ultraviolet Laboratory is the reference dark theme for the [bounded three-series line profile](https://github.com/CharlesMish/figurestead/blob/main/docs/reference-themes.md), not universal accessibility, CVD or print qualification. Product defaults are unchanged.

Opt in with Python `line(..., direct_labels=True)` or browser `style: { directLabels: true }`. Direct labels reuse the actual body marker identity beside the traces. V1 covers ordinary one-panel, 2–3-series line figures with single-line printable ASCII labels. Unsupported or insufficient layouts fall back atomically to the ordinary legend. This treatment does not support Unicode, multiline or math interpretation; printable ASCII math punctuation is literal. Active browser transitions use ordinary treatment until settled, and exports without trustworthy measurement retain the ordinary legend.

See the [ordinary/direct-label example](https://github.com/CharlesMish/figurestead/tree/main/examples/direct-series-labels) and [detailed direct-label contract](https://github.com/CharlesMish/figurestead/blob/main/docs/direct-series-labels.md). The [explicit rendered-series contrast audit](https://github.com/CharlesMish/figurestead/blob/main/docs/rendered-series-contrast.md) measures caller-specified rendering facts separately from the static palette audit.

## Figurestead at a glance

[![Eight deterministic synthetic Figurestead specimens spanning line, scatter, distribution, and temporal figure families](docs/assets/readme/figurestead-at-a-glance.png)](docs/assets/readme/figurestead-at-a-glance.png)

This retained montage records earlier rendering, including prior dash-backed overflow. It is historical imagery, not a demonstration of current implicit rhythm. The montage spans temporal response, periodic series, calibration and nonlinear relationships, distributions, grouped distributions, exact temporal coverage, and sparse observations. These are deterministic synthetic design and renderer-evaluation fixtures—not scientific measurements or findings.

## Beyond the montage

[![Populated categorical response matrix with habitat columns, response-band rows, sequential fills, percentages, and exact counts](docs/assets/readme/populated-categorical-response-matrix.png)](docs/assets/readme/populated-categorical-response-matrix.png)

The populated categorical response matrix preserves ten habitat columns and six response-band rows. Fill encodes bounded within-habitat share while each cell retains its percentage and exact count. The fixture is deterministic and synthetic; its project-defined bands are not ecological or regulatory thresholds. [Inspect the source scene, raw observations, and derived matrices](specimen-study/matrix-study.html).

## Python and browser

Figurestead's two surfaces share a normalized contract vocabulary, selected theme definitions, and evidence-oriented conventions. They do not promise identical pixels or identical renderer coverage.

- Python provides the compact plotting API used by the first-success example and the existing categorical-matrix extension shown above.
- The framework-free browser package provides its accepted core renderer registry plus the temporal extension at `@figurestead/web/extensions/temporal`.
- The populated categorical matrix is currently Python-rendered; this README does not imply a browser categorical-matrix renderer exists.

## Evidence and documentation

- [Public overview](https://charlesmish.github.io/figurestead/)
- [Evidence Atlas](https://charlesmish.github.io/figurestead/evidence/)
- [Python first-success example](examples/python-first-success.py)
- [Browser first-success example](examples/browser-first-success/)
- [Python sequential heatmap ramp](docs/sequential-heatmaps.md) — current-source color mapping; numeric normalization unchanged
- [Static palette versus rendered-series contrast](docs/rendered-series-contrast.md)
- [Reference light/dark themes for the bounded three-series line profile](docs/reference-themes.md) — current-source exemplars, not universal qualification
- [Deterministic specimen corpus and local visual lab](specimen-study/README.md)
- [Technical-showcase reviewer packet](technical-showcase/reviewer-packet/README.md) — repository-local and undeployed

## Status and limits

Figurestead is an experimental public alpha, not a mature universal plotting library.

- The bounded persistent-identity reference profile covers the first three ordinary line series. Additional series use deterministic color/marker fallback but are not claimed to be independently distinguishable. Unconfigured lines remain solid at every series count; non-solid rhythm is authored semantics. This is [current-source behavior](docs/line-series-semantics.md), not a retroactive change to published alpha.3.
- Digital paper evidence records a 6.372 pt minimum label against Figurestead's internal 6 pt project floor; it is not physical-printer certification or an external typographic standard.
- Color-vision-deficiency plates are simulations with documented model limits, not medical or universal-accessibility certification.
- Renderer coverage differs between Python and browser runtimes, and all specimens shown here are deterministic synthetic evaluation fixtures.

Figurestead is MIT licensed. See [versioning](VERSIONING.md), [third-party notices](THIRD_PARTY_NOTICES.md), and [trademarks](TRADEMARKS.md).
