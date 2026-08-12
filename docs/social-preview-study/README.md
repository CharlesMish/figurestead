# Figurestead GitHub social-preview A/B study

This review-only packet compares the accepted 1280×640 montage-derived
candidate A with three deterministic alternatives. It does not change the
README, accepted README assets, scientific figures, site, renderer, corpus,
themes, packages, releases, or deployment state.

## Candidates

- **A — accepted baseline:** maximum eight-panel range, weakest individual
  figure legibility at small preview size.
- **B — four-family identity rail:** strong immediate identity and balanced
  variety, but the four figures still compress toward texture at 25% size.
- **C — lead figure plus supporting pair:** most editorial and visually
  dynamic; the large lead figure is excellent, though the right pair becomes
  less equal in emphasis.
- **D — two-figure focus:** best raw figure legibility and calmest composition,
  but narrower evidence of Figurestead's range.

## Recommendation

Replace baseline A with **candidate C** when the repository owner configures a
GitHub social preview. Its `Figurestead` identity is immediate, its lead
scientific figure remains meaningfully inspectable at 25% delivery size, and
two accepted supporting figures communicate range without turning the preview
into a miniature gallery.

Candidate D is the restrained fallback if small-thumbnail legibility is valued
above renderer-family range. Candidate B remains the stronger equal-weight
four-family option for larger previews.

All source paths, source hashes, full-frame crop geometry, destinations,
delivery hashes, font hashes, and rationales are recorded in `manifest.json`.
The comparison sheet shows candidates at 50% delivery size; the companion
small-preview strip tests all four at 25% delivery size.
