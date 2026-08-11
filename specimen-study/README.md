# Figurestead specimen study

Local, undeployed renderer and composition study built from the supplied **Figurestead Specimen Corpus v0.1**.

- `index.html` is the full twelve-scene laboratory: eight showcase candidates followed by four explicitly separate stress fixtures.
- `at-a-glance.html` is the exact eight-scene montage candidate.
- `corpus/` is a byte-for-byte working copy of the supplied deterministic synthetic corpus. Its generator and frozen checksums remain authoritative.
- `specimen-evaluation.json` records qualitative review at useful individual and montage scales.
- `evidence/` and `audit/` are generated verification outputs.

Serve the repository root so the study can import the existing browser package and theme packs:

```sh
python3 -m http.server 4179
```

Then open `http://127.0.0.1:4179/specimen-study/` or `http://127.0.0.1:4179/specimen-study/at-a-glance.html`.

The study adds no renderer, marker, theme, package, navigation, workflow, or deployment surface. The data are deterministic synthetic design fixtures, not observations or validated scientific models.
