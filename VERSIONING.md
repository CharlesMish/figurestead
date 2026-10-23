# Figurestead alpha version identities

## Current published release (2026-10-14 America/Chicago; 2026-10-15 UTC)

- Python: `figurestead` **0.9.0a5**.
- Browser: `@figurestead/web` **0.9.0-alpha.6**.
- Coordinated GitHub prerelease: [`v0.9.0-alpha.6`](https://github.com/CharlesMish/figurestead/releases/tag/v0.9.0-alpha.6).
- Release target: `56faf759a282d428602d0c02027112f6a508e471` (PR #59).
- npm `alpha` points to alpha.6; `latest` intentionally remains alpha.1.

The exact reviewed corrected archives were published and verified on TestPyPI,
PyPI, npm and GitHub. See [retained release records](release/README.md) and
[current package onboarding](docs/getting-started.md). Schema 0.4, renderer API 1,
dependency floors and the private tooling version are unchanged.

## Unpublished preparation candidate: a6 / alpha.7

Candidate identities are Python `0.9.0a6`, browser `0.9.0-alpha.7` and future
coordinated tag `v0.9.0-alpha.7`, prepared from protected main `7b9482a939da77bfc0d256682707ef03ee02332a`
after accepted PRs #60–#64. Registry and tag availability were checked before
preparation. They are not published versions; availability must be rechecked
immediately before any separately authorized publication.

See [candidate notes](release/notes/0.9.0a6-web-alpha.7.md). Schema 0.4,
renderer API 1 and consumer dependency floors remain unchanged. npm publication
is intended for `alpha`; `latest` must remain unchanged. A producing commit binds
package inputs, and a later retaining commit binds the exact archives and ledgers.
Neither source version strings nor a successful local build establish publication.

## Historical a4 / alpha.5 release

Python `0.9.0a4` and browser `0.9.0-alpha.5` were published 2026-10-04 at
`889b8d15f364b4edbc71a9eec4ce572f73d705b5`. The
[release](https://github.com/CharlesMish/figurestead/releases/tag/v0.9.0-alpha.5)
contains SVG typography/subtitle, dense-array validation, DirectLabels lifecycle,
authored matrix-domain and minimum-dependency compatibility repairs.
At publication, npm `alpha` pointed to alpha.5 and `latest` remained alpha.1.
The [preparation notes](release/notes/0.9.0a4-web-alpha.5.md), review record,
package-embedded READMEs and a4/alpha.5 gallery retain their original context.

## Historical a3 / alpha.4 release

Python `0.9.0a3` and browser `0.9.0-alpha.4` were published 2026-09-29 UTC at
`9260af190e60c621244072675c238db4822b8632`.
Their [release](https://github.com/CharlesMish/figurestead/releases/tag/v0.9.0-alpha.4)
and retained artifacts remain available. Their features carry forward into later releases.

## Historical a2 / alpha.3 foundation

Python `0.9.0a2` and browser `0.9.0-alpha.3` remain published historical versions. Their coordinated [prerelease](https://github.com/CharlesMish/figurestead/releases/tag/v0.9.0-alpha.3) was published 2026-09-20 UTC. B2 S1–S3 identity, `series_slots`, baseline direct labels and the bounded reference-theme designation already shipped there. Python a1 and browser alpha.1/alpha.2 remain historical as well.

The public landing page retains version-bound a4/alpha.5 gallery examples and a2/alpha.3 specimens alongside an earlier-alpha archive. Their image bytes and manifests are historical authority, not a5/alpha.6 output. Website status updates and deployment are separate from package publication; use the current GitHub onboarding for install versions.

## Version and retention conventions

Python uses PEP 440; npm and Git prerelease tags use SemVer spelling. The package counters are independent. The coordinated tag names both versions; it does not force their suffixes to match. Private repository tooling stays at 0.0.0; schema and renderer API versions are unchanged.

Exact-version installs are reproducible; `@alpha` intentionally follows the prerelease channel. Retained artifacts and source-input ledgers are immutable. Verify them against their producing authority, not later repository prose. Any future preparation and publication requires separate review and authorization; it must not replace published bytes or move historical tags.
