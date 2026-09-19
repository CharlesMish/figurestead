# Figurestead alpha version identities

- Python candidate: `figurestead` **0.9.0a2** (previous release: 0.9.0a1).
- Browser candidate: `@figurestead/web` **0.9.0-alpha.3** (previous release: 0.9.0-alpha.2).
- Retained static site bundle: **0.9.0-alpha.1**, unchanged by this candidate.
- Proposed coordinated GitHub prerelease tag: **`v0.9.0-alpha.3`**.
- Proposed title: **Figurestead next alpha — Python 0.9.0a2 / web 0.9.0-alpha.3**.

Python uses PEP 440; npm and Git prerelease tags use SemVer spelling. Python and npm prerelease counters are independent; the coordinated tag is a release label, not a requirement that package counters match. Existing GitHub prereleases use `v0.9.0-alpha.N` tags; the proposed next unused tag follows that convention and names both package identities explicitly.

These are preparation targets, not publication claims. No tag or release is created by candidate preparation. The website remains an earlier-alpha showcase. Exact package files and hashes follow [retained release conventions](release/README.md). Eventual npm publication uses **alpha**, never an implicit change to **latest**. Exact-version installs are reproducible; `@alpha` intentionally follows the prerelease channel.
