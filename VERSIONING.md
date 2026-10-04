# Figurestead alpha version identities

## Current published release (verified 2026-09-29)

- Python: `figurestead` **0.9.0a3**.
- Browser: `@figurestead/web` **0.9.0-alpha.4**.
- Coordinated GitHub prerelease: [`v0.9.0-alpha.4`](https://github.com/CharlesMish/figurestead/releases/tag/v0.9.0-alpha.4).
- Release title: **Figurestead alpha.4 — Python 0.9.0a3 / web 0.9.0-alpha.4**.
- Release target: `9260af190e60c621244072675c238db4822b8632`.
- npm `alpha` points to alpha.4; `latest` intentionally remains alpha.1.

The exact retained files were published and independently verified on TestPyPI, PyPI, npm and the coordinated GitHub prerelease. See [retained release records](release/README.md). The separately prepared, unpublished next candidate is described below.

## Proposed a4 / alpha.5 candidate (2026-10-04)

This checkout prepares Python `figurestead` **0.9.0a4** and browser
`@figurestead/web` **0.9.0-alpha.5** for review. The proposed coordinated identity
is `v0.9.0-alpha.5`, titled **Figurestead alpha.5 — Python 0.9.0a4 / web 0.9.0-alpha.5**.
These identities were unused in registry/tag reads at preparation time; no tag
has been created and no publication is authorized. Registry availability must
be rechecked before any separately authorized publication. Schema 0.4,
renderer API 1, dependency floors and the private tooling version are unchanged.

The candidate contains only the merged SVG typography/subtitle, dense-array
validation, DirectLabels lifecycle, authored matrix-domain and minimum-dependency
compatibility repairs. See [candidate notes](release/notes/0.9.0a4-web-alpha.5.md).
Current public installs and retained historical evidence remain a3/alpha.4 and
their own earlier producing versions until publication is independently verified.

## Historical a2 / alpha.3 foundation

Python `0.9.0a2` and browser `0.9.0-alpha.3` remain published historical versions. Their coordinated [prerelease](https://github.com/CharlesMish/figurestead/releases/tag/v0.9.0-alpha.3) was published 2026-09-20 UTC. B2 S1–S3 identity, `series_slots`, baseline direct labels and the bounded reference-theme designation already shipped there. Python a1 and browser alpha.1/alpha.2 remain historical as well.

The public landing page retains version-bound a2/alpha.3 specimens alongside an explicitly separate earlier-alpha archive. Their image bytes and manifests are historical authority, not alpha.4 output.

## Version and retention conventions

Python uses PEP 440; npm and Git prerelease tags use SemVer spelling. The package counters are independent. The coordinated tag names both versions; it does not force their suffixes to match. Private repository tooling stays at 0.0.0; schema and renderer API versions are unchanged.

Exact-version installs are reproducible; `@alpha` intentionally follows the prerelease channel. Retained artifacts and source-input ledgers are immutable. Verify them against their producing authority, not later repository prose. Any future preparation and publication requires separate review and authorization; it must not replace published bytes or move historical tags.
