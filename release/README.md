# Figurestead retained release artifacts

Python artifacts and npm candidates use separate retained-byte
lifecycles. See [`npm/README.md`](npm/README.md) for the npm
candidate process; no original npm `0.9.0-alpha.1` candidate is present here.

## Python registry workflow

This directory binds the accepted `figurestead` Python alpha artifacts to a manually dispatched, OIDC-only TestPyPI/PyPI workflow. It never builds or repacks them.

## Published a2 / alpha.3

Python `0.9.0a2` and npm `0.9.0-alpha.3` are public. The coordinated [GitHub prerelease](https://github.com/CharlesMish/figurestead/releases/tag/v0.9.0-alpha.3) was published 2026-09-20 UTC. Their retained artifacts and a2 source ledger remain unchanged; `python/verify_candidate.py --version 0.9.0a2` verifies that historical binding without comparing it to later main. The [original preparation notes](notes/0.9.0a2-web-alpha.3.md) remain historical.

## Next candidate a3 / alpha.4 (not authorized for publication)

See [candidate notes](notes/0.9.0a3-web-alpha.4.md). Python distributions live in `python/0.9.0a3/dist`, with strict `SHA256SUMS.txt` and `SOURCE_INPUTS.json` bindings. Run `python release/python/verify_candidate.py --version 0.9.0a3 --check-source` from the producing checkout to verify exact bytes, metadata, README, wheel/sdist source and the expanded a3 docs inventory. Historical verification omits `--check-source`; later main never redefines retained artifacts.

The ledger binds package-input contents without a circular commit hash. The coordinated record in `release/reviews/0.9.0a3-web-alpha.4.json` records the producing authority, tool versions, archive/source hashes and consumer checks; its retaining commit binds artifacts and ledger. Publication never builds or repacks. Independent acceptance and separate publication authorization are required.

## Next dispatch phrases (only after acceptance and authorization)

- TestPyPI: `publish figurestead 0.9.0a3 to testpypi`
- PyPI: `publish figurestead 0.9.0a3 to pypi`

The `expected_commit` input must be the exact 40-character commit selected in GitHub's **Run workflow** control. The production path also requires the identical wheel and sdist to exist publicly on TestPyPI.

## Historical accepted a1 files (unchanged)

| File | SHA-256 |
|---|---|
| `figurestead-0.9.0a1-py3-none-any.whl` | `29bdfb3f38d0933a237248fc9cdf5e6b92ebf1dff47a734fc363f07061e4ddb5` |
| `figurestead-0.9.0a1.tar.gz` | `935d3344ceb1e6e43fbe96215115079dda9783320c7c53d16e03a08dc75570bb` |

## Integrity rule

The updated workflow consumes only the two versioned a3 distributions and their exact embedded hashes, after protected-main/commit/confirmation and source-input gates. PyPI requires the same bytes verified on TestPyPI first. Never replace historical a1/a2 bytes or retag their records as a3. Candidate bytes and their bindings require independent acceptance before any authorized publication.
