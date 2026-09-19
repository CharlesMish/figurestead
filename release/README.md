# Figurestead retained release artifacts

Python artifacts and future npm candidates use separate retained-byte
lifecycles. See [`npm/README.md`](npm/README.md) for the prospective npm
candidate process; no original npm `0.9.0-alpha.1` candidate is present here.

## Python registry workflow

This directory binds the accepted `figurestead` Python alpha artifacts to a manually dispatched, OIDC-only TestPyPI/PyPI workflow. It never builds or repacks them.

## Candidate a2 (not authorized for publication)

The next coordinated candidate is Python `0.9.0a2` / npm `0.9.0-alpha.3`. See [prerelease notes](notes/0.9.0a2-web-alpha.3.md). The new Python distributions are retained separately in `python/0.9.0a2/dist`, with strict `SHA256SUMS.txt` and `SOURCE_INPUTS.json` bindings. The read-only `python/verify_candidate.py --version 0.9.0a2` gate checks both exact retained files, package metadata, sdist inputs, and wheel source against the frozen source-input ledger. Preparation also runs `--check-source` against the producing checkout; later main changes do not redefine the retained artifacts. Build tools and installed-consumer results are recorded in the candidate review; publication never rebuilds these files.

The source-input ledger is content-addressed to avoid a self-referential commit hash. Its retaining commit binds that ledger and the artifacts; the review report records the final commit/tree. Candidate acceptance and separate publication authorization are still required.

## Next dispatch phrases (only after acceptance and authorization)

- TestPyPI: `publish figurestead 0.9.0a2 to testpypi`
- PyPI: `publish figurestead 0.9.0a2 to pypi`

The `expected_commit` input must be the exact 40-character commit selected in GitHub's **Run workflow** control. The production path also requires the identical wheel and sdist to exist publicly on TestPyPI.

## Historical accepted a1 files (unchanged)

| File | SHA-256 |
|---|---|
| `figurestead-0.9.0a1-py3-none-any.whl` | `29bdfb3f38d0933a237248fc9cdf5e6b92ebf1dff47a734fc363f07061e4ddb5` |
| `figurestead-0.9.0a1.tar.gz` | `935d3344ceb1e6e43fbe96215115079dda9783320c7c53d16e03a08dc75570bb` |

## Integrity rule

The updated workflow consumes only the two versioned a2 distributions and their exact embedded hashes, after protected-main/commit/confirmation and source-input gates. PyPI requires the same bytes verified on TestPyPI first. Never replace historical a1 bytes or retag their records as a2. Candidate bytes and their bindings require independent acceptance before any authorized publication.
