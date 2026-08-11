# Figurestead specimen study

Local, undeployed renderer and composition study built from **Figurestead Specimen Corpus v0.2**, with v0.1 retained as the historical input.

- `index.html` is the full thirteen-scene laboratory: eight accepted showcase candidates, one categorical candidate under review, and four explicitly separate stress fixtures.
- `at-a-glance.html` is the exact eight-scene montage candidate.
- `corpus/` is the byte-identical historical v0.1 corpus.
- `corpus-v0.2/` carries the original twelve generated payloads unchanged plus `habitat_class_response`.
- `specimen-evaluation.json` preserves the accepted v0.1 evaluation; `specimen-evaluation-v0.2.json` records the categorical comparison and montage decision.
- `evidence/corpus-v0.2/` and the `audit/corpus-v0.2-*` files are the separate v0.2 verification outputs.

Serve the repository root so the study can import the existing browser package and theme packs:

```sh
python3 -m http.server 4179
```

Then open `http://127.0.0.1:4179/specimen-study/` or `http://127.0.0.1:4179/specimen-study/at-a-glance.html`.

The v0.2 pass adds no renderer, marker, theme, package, navigation, workflow, or deployment surface. One internal layout guard was narrowed so a plot minimum cannot overwrite measured annotation bands when a canvas is unusually short. The data are deterministic synthetic design fixtures, not observations or validated scientific models.
