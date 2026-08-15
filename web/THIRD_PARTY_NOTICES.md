# Third-party factual notice inventory

Status: `EXPERIMENTAL PUBLIC-ALPHA FACTUAL NOTICE`

This inventory records the dependency evidence used for the Figurestead
experimental alpha; it makes no legal conclusion. Runtime dependencies are not
vendored into the wheel, sdist, or npm tarball. The canonical Figurestead MIT
text is supplied separately as `LICENSE`.

## Python dependency observations

An external Python 3.14.6 evidence environment resolved the current declared
constraints on 2026-08-05 to Matplotlib 3.11.1, NumPy 2.5.1, Pillow 12.3.0,
PyYAML 6.0.3, and setuptools 82.0.1, plus contourpy 1.3.3, cycler 0.12.1,
fonttools 4.63.0, kiwisolver 1.5.0, packaging 26.3, pyparsing 3.3.2,
python-dateutil 2.9.0.post0, and six 1.17.0. These versions are an evidence
snapshot, not an approved runtime lock.

The static-site PNGs are first-party deterministic synthetic Figurestead render
outputs produced through Matplotlib. No font file is embedded as a separate
site member. Matplotlib's evidence distribution includes its own license plus
DejaVu and STIX font notices; rendered glyph provenance remains a review
consideration. Site CSS names
only system font families and carries no downloaded font bytes or remote URL.

## Browser tooling observations

The alpha verification environment uses Playwright 1.62.0 and
playwright-core 1.62.0 as
Apache-2.0 development/test tooling and optional fsevents 2.3.2 as MIT. These
packages and downloaded browsers are not intended npm-tarball members or
top-level archive members. They remain test-tool provenance only.

## Placement and maintenance

Each Figurestead wheel, sdist, npm package, static-site bundle, and composition
archive carries this file and `TRADEMARKS.md` beside its canonical `LICENSE`.
Any newly resolved dependency version, copied source, font, image, or other
byte requires a corresponding inventory update and review.
