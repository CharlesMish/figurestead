# Figurestead Specimen Corpus v0.2

This package is a **design and renderer-evaluation corpus**, not a scientific dataset collection.

It contains **13 deterministic synthetic scenes** built around data structures Figurestead already supports:
`line`, `scatter`, `strip_summary`, `temporal_coverage`, and `temporal_observations`.

- **8 showcase candidates** are intended to test whether Figurestead can communicate a wider range of scientific-looking problems in a compact specimen gallery.
- **1 showcase candidate under review**, `habitat_class_response`, probes ten populated categorical groups without entering the accepted eight-scene montage automatically.
- **4 stress cases** deliberately probe denser or awkward conditions. A stress scene rendering successfully does **not** automatically authorize a new public capability claim.

Every scene is supplied as:
- `scenes/<id>.json` — Figurestead-ready data plus scene brief, suggested spec/scales/theme, provenance, and stressors.
- `tables/<id>.csv` — a human-readable flat table using renderer-neutral column names.
- `scene-matrix.csv` — one-row-per-scene planning view.
- `manifest.json` — corpus-level intent and scene index.
- `generate_corpus.py` — standard-library regeneration of the frozen v0.1 payloads plus the seeded v0.2 categorical fixture.
- `expected-checksums.json` — hashes for the generated scene/table files.

## v0.2 categorical fixture

`habitat_class_response` adds 90 observations across ten ordered, full-name habitat classes: headwater, riffle, deep pool, side channel, floodplain, wet meadow, tidal creek, mudflat, seagrass bed, and open estuary. It uses one semantic series and per-group median rules; category membership is not encoded as ten colors or ten point identities.

The generator uses `random.Random(15401)` to make nine standard-normal-like draws per group, standardizes each group to its stated target sample center and spread, and rounds to four decimal places. This is deterministic synthetic layout evidence—not ecological measurements, a fitted ecological model, or a basis for scientific inference.

The original twelve scene and table files are byte-identical to v0.1. The historical v0.1 corpus remains separately available at `../corpus/`; v0.2 does not silently replace that input.

## Why the corpus remains all-synthetic

The immediate question is **what range of data problems Figurestead can present coherently**, not whether we can find a famous dataset that flatters the current renderers.

Synthetic data lets us deliberately include:
- crossings and near-overlap,
- signed values and zero crossings,
- nonlinear relationships,
- heteroscedasticity and leverage,
- similar centers with different spreads,
- sparse and clustered temporal coverage,
- threshold crossings with explicitly provisional reference bands.

No scene is an observation set or a validated physical/biological model. Units and scientific contexts are illustrative.

A real, openly licensed dataset should be added later as a **separate provenance-bearing specimen**, after the montage composition and scene selection are proven.

## Proposed public montage pool

The eight `showcase` scenes are the starting pool:

1. `watershed_storm_response`
2. `circadian_phase_shift`
3. `instrument_calibration`
4. `dose_response_plate`
5. `treatment_replicates`
6. `paired_seasonal_distributions`
7. `field_sampling_coverage`
8. `reservoir_oxygen_thresholds`

This gives the future GitHub specimen sheet:
- two line figures,
- two scatter figures,
- two distribution figures,
- two temporal figures,
while rotating through all six current public-alpha themes.

The v0.2 categorical fixture first lives beside the montage as a `showcase_candidate`. It may replace `treatment_replicates` only if the rendered scene independently rates strong at the required compact and wide compositions; otherwise the accepted montage remains unchanged.

The four stress scenes should initially live beside the montage as engineering/evaluation fixtures, not marketing material:
- `gene_expression_recovery`
- `particle_size_relationship`
- `lab_precision`
- `migration_monitoring_coverage`

## Important scope notes for Codex / future implementation

1. **Do not add new renderers just to consume this corpus.**
2. **Do not change theme tokens to make a scene prettier.** If a scene exposes a weakness, record it.
3. **Do not treat suggested themes as requirements.** They are a deliberate first-pass rotation so the specimen book exercises the current public set.
4. `lab_precision` intentionally stresses six point-only identities under the current four-glyph vocabulary. It must not be used to claim universal six-way hue-independent point identity.
5. `gene_expression_recovery` intentionally places six signed line series on one axis; line-style redundancy is part of the test.
6. The temporal reference bands in `reservoir_oxygen_thresholds` are explicitly `provisional_project_constant`, matching Figurestead's current temporal extension semantics.
7. The watershed scene intentionally preserves the corrected V2 showcase values as a continuity anchor.
8. `habitat_class_response` tests category-label density, not new renderer, marker, palette, or public API semantics.

## Suggested next implementation question

The next pass should answer:

> Can Figurestead render the eight showcase candidates into a coherent, figure-dominant specimen sheet that is immediately legible as “one system, many scientific data problems,” while the four stress scenes remain useful regression/evaluation fixtures?

That pass should render first, then decide what deserves public placement. It should not invent new product surface in advance.
