# Figurestead alpha version identities

## Current published release (2026-10-04)

- Python: `figurestead` **0.9.0a4**.
- Browser: `@figurestead/web` **0.9.0-alpha.5**.
- Coordinated GitHub prerelease: [`v0.9.0-alpha.5`](https://github.com/CharlesMish/figurestead/releases/tag/v0.9.0-alpha.5).
- Release title: **Figurestead alpha.5 — Python 0.9.0a4 / web 0.9.0-alpha.5**.
- Release target: `889b8d15f364b4edbc71a9eec4ce572f73d705b5`.
- npm `alpha` points to alpha.5; `latest` intentionally remains alpha.1.

The release records publication and public-byte verification on TestPyPI, PyPI,
npm and GitHub. See [retained release records](release/README.md) and
[current package onboarding](docs/getting-started.md).

## Published maintenance scope

Schema 0.4, renderer API 1, dependency floors and the private tooling version
are unchanged.

The release contains the merged SVG typography/subtitle, dense-array
validation, DirectLabels lifecycle, authored matrix-domain and minimum-dependency
compatibility repairs. The [preparation notes](release/notes/0.9.0a4-web-alpha.5.md),
review record and package-embedded READMEs retain their pre-publication wording.
They are immutable preparation snapshots; the GitHub release is the completed
publication record. Later living documentation does not redefine those bytes.

## Historical a3 / alpha.4 release

Python `0.9.0a3` and browser `0.9.0-alpha.4` were published 2026-09-29 UTC at
`9260af190e60c621244072675c238db4822b8632`.
Their [release](https://github.com/CharlesMish/figurestead/releases/tag/v0.9.0-alpha.4)
and retained artifacts remain available. Their features carry forward into
a4/alpha.5.

## Historical a2 / alpha.3 foundation

Python `0.9.0a2` and browser `0.9.0-alpha.3` remain published historical versions. Their coordinated [prerelease](https://github.com/CharlesMish/figurestead/releases/tag/v0.9.0-alpha.3) was published 2026-09-20 UTC. B2 S1–S3 identity, `series_slots`, baseline direct labels and the bounded reference-theme designation already shipped there. Python a1 and browser alpha.1/alpha.2 remain historical as well.

The public landing page retains version-bound a2/alpha.3 specimens alongside an explicitly separate earlier-alpha archive. Their image bytes and manifests are historical authority, not a4/alpha.5 output. Website status updates and deployment are separate from package publication; use the current GitHub onboarding for install versions.

## Version and retention conventions

Python uses PEP 440; npm and Git prerelease tags use SemVer spelling. The package counters are independent. The coordinated tag names both versions; it does not force their suffixes to match. Private repository tooling stays at 0.0.0; schema and renderer API versions are unchanged.

Exact-version installs are reproducible; `@alpha` intentionally follows the prerelease channel. Retained artifacts and source-input ledgers are immutable. Verify them against their producing authority, not later repository prose. Any future preparation and publication requires separate review and authorization; it must not replace published bytes or move historical tags.

## Proposed next candidate

Python `0.9.0a5` / browser `0.9.0-alpha.6` are prepared from reviewed main
`e729f3c030b5ccf0764933f710957bcea47ee636`. Package publication, registry tags and a public
release remain unauthorized. Schema 0.4, renderer API 1 and runtime floors
are unchanged. See [candidate notes](release/notes/0.9.0a5-web-alpha.6.md).
