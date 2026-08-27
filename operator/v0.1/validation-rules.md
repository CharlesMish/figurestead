# Validation and refusal rules

Validate before rendering, then inspect the rendered artifact. Passing one does not replace the other.

## Data boundary

- Require numeric observations to be finite. Refuse `NaN` and infinity.
- Treat masked arrays and missing values as unresolved scientific state. Do not coerce, fill, drop, or unmask them without an explicit scientific rule.
- Require exact cardinality: line x/each y; scatter x/y/series; histogram datasets/labels; strip groups/values/series; heatmap columns/x labels and rows/y labels.
- Require rectangular two-dimensional heatmap data.
- Do not rely on permissive Python iteration or `zip`: the released convenience API does not reject every excess label or malformed category case.

## Categories and domains

- Preserve an authored category order exactly. It must be unique and account for every observed category.
- If an order contains an unobserved category or omits an observed category, ask whether an empty/omitted category is scientifically intended; do not choose a policy silently.
- Use explicit domains only when scientifically authored or required for comparison. Domains must be finite, strictly increasing, and contain the intended evidence.
- Never repair clipping by silently changing a scientific limit. Report the conflict.

## Fits and summaries

- Do not infer that a requested “trend” authorizes a model. Ask which model or use an explicitly supplied one.
- Python static scatter has no automatic convenience-fit argument; compute and label an authorized model in caller code.
- Browser scatter accepts only `summary: "linear_fit"` in this core release. Require at least two distinct finite x values and enough matched observations.
- Strip-summary bars are medians. Do not relabel them as means or uncertainty intervals.

## Browser contract

- Copy the pinned complete example; never invent normalized fields.
- Run `validateContract` and use the resulting path-aware error without weakening validation.
- Load curated themes from exact package subpaths; do not retype or edit palette tokens.
- Respect reduced motion, accessible title/description content, and the host's actual rendering size.

## Inspection and refusal

Inspect marks, axes, legends, annotations, clipping, category order, color/marker/dash identity, and accessible description. If Figurestead lacks the required renderer or the scientific interpretation remains ambiguous, stop and explain the boundary instead of producing a plausible but unsupported figure.
