# Figurestead Python registry workflow

This directory binds the accepted `figurestead` Python alpha artifacts to a manually dispatched, OIDC-only TestPyPI/PyPI workflow. It never builds or repacks them.

## Exact dispatch phrases

- TestPyPI: `publish figurestead 0.9.0a1 to testpypi`
- PyPI: `publish figurestead 0.9.0a1 to pypi`

The `expected_commit` input must be the exact 40-character commit selected in GitHub's **Run workflow** control. The production path also requires the identical wheel and sdist to exist publicly on TestPyPI.

## Accepted files

| File | SHA-256 |
|---|---|
| `figurestead-0.9.0a1-py3-none-any.whl` | `29bdfb3f38d0933a237248fc9cdf5e6b92ebf1dff47a734fc363f07061e4ddb5` |
| `figurestead-0.9.0a1.tar.gz` | `935d3344ceb1e6e43fbe96215115079dda9783320c7c53d16e03a08dc75570bb` |

## Integrity rule

The workflow publishes only the two repository-retained distributions whose
hashes appear above. If either artifact byte changes, replace the files and all
embedded hashes only after a fresh independent acceptance.
