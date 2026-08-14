# Figurestead specimen study

Local, undeployed renderer and composition study built from **Figurestead Specimen Corpus v0.2**, with v0.1 retained as the historical input.

- `index.html` is the full fourteen-scene laboratory: eight accepted showcase scenes, one populated response-matrix candidate, and five explicitly separate stress fixtures.
- `matrix-study.html` is the focused sparse-versus-populated matrix comparison with a scoped accessible table and direct raw/derived data routes.
- `at-a-glance.html` is the exact eight-scene montage candidate.
- `corpus/` is the byte-identical historical v0.1 corpus.
- `corpus-v0.2/` carries the original twelve generated payloads unchanged, retains `habitat_class_response` as stress evidence, and adds `habitat_response_matrix` as the corrected candidate.
- `specimen-evaluation.json` preserves the accepted v0.1 evaluation; `specimen-evaluation-v0.2.json` records the populated-matrix comparison and montage decision.
- `evidence/corpus-v0.2/` and the `audit/corpus-v0.2-*` files are the separate v0.2 verification outputs.

Serve the repository root so the study can import the existing browser package and theme packs:

```sh
python3 -m http.server 4179
```

Then open `http://127.0.0.1:4179/specimen-study/`, `http://127.0.0.1:4179/specimen-study/matrix-study.html`, or the unchanged `http://127.0.0.1:4179/specimen-study/at-a-glance.html`.

The populated matrix is rendered by the unchanged `figurestead.extensions.matrix.categorical_matrix` Python extension through a study-local adapter. The browser core registry was not broadened. This pass adds no renderer, marker, theme, package, navigation, workflow, or deployment surface. The data and response bands are deterministic synthetic design fixtures, not observations, validated scientific models, ecological thresholds, or regulatory categories.
