# Getting started with the published packages

Release snapshot: **2026-10-04**. Figurestead is an experimental scientific
figure system. Start with Python for a static figure or report; use the browser
package for a Canvas page or browser integration.

| Surface | Exact package | Consumer runtime |
| --- | --- | --- |
| Python | `figurestead==0.9.0a4` | Python >=3.10 |
| Browser | `@figurestead/web@0.9.0-alpha.5` | Node >=22.22.0 |

The [alpha.5 release](https://github.com/CharlesMish/figurestead/releases/tag/v0.9.0-alpha.5)
records publication at `889b8d15f364b4edbc71a9eec4ce572f73d705b5` and links the
verification runs. The Python and browser alpha counters are independent.
npm `alpha` currently follows alpha.5; `latest` remains alpha.1. Exact versions
select this release explicitly. Preserve your dependency lockfile or environment
record as well; the package pin alone does not fix every dependency version.

## First Python figure

Create a new directory outside a Figurestead source checkout. On macOS/Linux:

```sh
mkdir figurestead-first-figure
cd figurestead-first-figure
python3 -m venv .venv
source .venv/bin/activate
```

On Windows PowerShell:

```powershell
mkdir figurestead-first-figure
cd figurestead-first-figure
py -3 -m venv .venv
```

Use `.venv\Scripts\python.exe` in place of `python` below; activation is optional.

```sh
python -m pip install figurestead==0.9.0a4
python -c "from importlib.metadata import version; print(version('figurestead'))"
```

The version check should print `0.9.0a4`. Save this as `first_figure.py`:

```python
from figurestead import line

figure, axes = line([0, 1, 2], [[0, 1, 0]])
figure.savefig("figurestead-first-success.png", dpi=150)
```

Run `python first_figure.py` and open `figurestead-first-success.png`. It should
show a three-point line rising from 0 to 1 and returning to 0. These are synthetic
example values, not measurements. `figure.savefig("figurestead-first-success.svg")`
and `.pdf` filenames use Matplotlib's corresponding export formats.

For a reproducible record of this environment:

```sh
python --version
python -m pip freeze > requirements-resolved.txt
```

## A labeled Python example

Keep the three-point example above as a quick installation check. For named
series and axis units, copy [python-labeled-line.py](../examples/python-labeled-line.py)
into the same consumer directory and run `python python-labeled-line.py`. It uses
only the published a4 API and writes both PNG and SVG. See [theme selection](theme-selection.md)
and the [five-plotter reference](python-plotting.md) for the next step.

## First browser figure

In a fresh project, follow the [complete installed-package example](../web/README.md#first-figure).
It supplies both files and the Vite start command and needs no repository clone.
Check `node --version` before installation. After installation, confirm:

```sh
npm ls @figurestead/web
node --input-type=module -e 'import { FIGURESTEAD_PACKAGE_VERSION } from "@figurestead/web"; console.log(FIGURESTEAD_PACKAGE_VERSION)'
```

Both checks should identify `0.9.0-alpha.5`. Retain `package-lock.json`.
The browser API consumes a complete normalized contract; the Python convenience
plotter's short argument list is not a browser API.

## What to expect across surfaces

- Python's direct plotters include line, scatter, histogram, strip summary and
  heatmap. The browser core supports line, scatter and strip summary, with a
  separate temporal extension. A Python renderer's existence does not imply a
  matching browser renderer.
- Ordinary static Python lines accept explicit NaN y breaks under the
  [line-data rules](line-series-semantics.md). Browser numeric arrays must be
  dense and finite; browser missing observations are not implemented.
- Optional [direct labels](direct-series-labels.md) have a bounded 2–3-series
  ordinary-line profile and may fall back to an ordinary legend.
- Shared contract/theme semantics do not promise identical pixels. Inspect the
  exported artifact at the intended size, including labels, units and series
  identity.

## Published release versus source work

This guide targets a4/alpha.5. The open Python work in [#51](https://github.com/CharlesMish/figurestead/pull/51),
[#53](https://github.com/CharlesMish/figurestead/pull/53) and [#55](https://github.com/CharlesMish/figurestead/pull/55)
and browser work in [#52](https://github.com/CharlesMish/figurestead/pull/52) are
not part of those registry artifacts. In particular, these examples do not use
the proposed `save_figure` API, later footer/count-layout fixes or browser band
repairs. A source merge alone does not change an installed release.

## Documentation and agent version context

Start with this page and the live root/browser READMEs for current installation
status. The released packages contain immutable preparation-time READMEs that
may describe a4/alpha.5 as unpublished. Historical release notes, review records,
specimen images and older website pages also retain their own version context.
The completed GitHub release records publication; a new build is not needed to
resolve that historical wording.

For an agent consumer task, record the exact package version, runtime, dependency
record and documentation URLs read. Treat an operator skill pinned to an older
release as historical guidance, and check APIs against this release's public
documentation and installed signatures. Keep this dated release context separate
from reusable workflow instructions. A public-docs-only trial and a trial using
a maintained operator skill are different testing conditions; record which one
you used.
