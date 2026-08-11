# Figurestead specimen study — reviewer note

## Decision

The supplied corpus renders cleanly through existing Figurestead contracts. The exact eight-scene showcase pool supports a coherent 4 × 2, figure-dominant wide montage without an alternate composition. The four stress scenes remain separate in the full lab.

This is a **local, undeployed design and renderer-evaluation study**. The scenes are deterministic synthetic fixtures, not observations or validated scientific models. Nothing here changes the accepted public R3 Overview/Atlas or the accepted V2 Technical Showcase.

## Surfaces

- `index.html` — all twelve scenes at useful individual scale, with restrained scene/source disclosures.
- `at-a-glance.html` — only the exact eight required showcase scenes, in the frozen source order.
- `specimen-evaluation.json` — qualitative communication, figure-quality, theme-fit, and montage-suitability findings.
- `evidence/` — Chromium and Firefox full-lab, montage, narrow, and standardized individual captures.
- `audit/summary.json` — machine-readable responsive, accessibility, determinism, and preservation gates.
- `evidence/layout-hardening/` — compact-canvas before/after bounds, screenshots, DPR2 evidence, V2 check, and paper/SVG export evidence.

## Method

1. The supplied `generate_corpus.py` was run in an isolated copy.
2. All 24 generated scene/table files were compared with `expected-checksums.json` by SHA-256 and byte count.
3. The validated corpus was copied into `specimen-study/corpus/` without editing.
4. Each scene was adapted locally into schema `0.4` using its authored renderer, data, suggested scales, suggested theme, note, title, subtitle, and deterministic seed.
5. Existing theme packs, the four-glyph marker vocabulary, existing line-style cycling, core registry, temporal extension, static motion recipe, and accessibility companion were used directly.
6. No theme alternate was introduced because the first-pass pairings were all at least usable and weak pairings are more informative when preserved.

## Reading the montage

The wide target is 1920 × 1080 with a 4 × 2 grid. It is a range statement, not the final inspection surface for every exact label. `field_sampling_coverage` is intentionally classified **weak at montage scale** because dense exact-visit marks compress to texture; its full-lab rendering remains strong. The 390 px view is a diagnostic, single-column reflow with the same source order, not a claim of equal inspection scale.

The lab preserves two important semantic limits:

- `gene_expression_recovery` has six line series, so identities beyond the four glyphs depend on the existing dash cycle.
- `lab_precision` has six point-only identities, so it cannot demonstrate universal six-way hue-independent point identity.

No fifth glyph was added. That remains a separately authorized product decision.

## Compact annotation layout hardening

The follow-up renderer pass replaces unrelated fixed annotation offsets with a
measured internal layout pass. It reserves only the bands that are present and
re-resolves scales against the resulting plot rectangle. The scientific font
sizes, corpus inputs, themes, marks, series styles, and public contract are
unchanged. See `../audit/compact-layout/README.md` and
`evidence/layout-hardening/after/bounds.json` for the before/after geometry and
acceptance assertions.

## Verification

Run from the repository root while it is served at port 4179:

```sh
NODE_PATH="$FIGURESTEAD_NODE_MODULES" "$FIGURESTEAD_NODE" \
  specimen-study/audit/run-specimen-audit.cjs

"$FIGURESTEAD_PYTHON" specimen-study/audit/verify-preservation.py
```

The reviewer evidence records exact engine versions and case-by-case findings. Machine-specific executable paths are not stored in the reviewer artifacts.
