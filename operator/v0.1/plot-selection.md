# Plot selection

Choose from the evidence relationship, not from visual novelty.

| Scientific intent | Figurestead surface | Runtime |
|---|---|---|
| ordered response over a numeric sequence | line | Python or browser core |
| paired numeric observations | scatter | Python or browser core |
| explicitly requested linear fit | scatter; use a named caller-computed model in Python or browser `linear_fit` | Python or browser core |
| one or more numeric distributions | histogram | Python |
| observations grouped by authored categories, with medians | strip summary | Python or browser core |
| numeric response matrix on two categorical axes | heatmap | Python |
| dated coverage across named sites | temporal coverage | browser temporal extension |
| dated observations for one site, optionally with provisional reference bands | temporal observations | browser temporal extension |

Prefer Python for a normal static deliverable. Choose browser Figurestead only when the host needs a normalized portable contract, Canvas/SVG/browser output, lifecycle control, or semantic motion. Shared semantics do not imply pixel-identical output or equal renderer coverage.

## Do not force Figurestead

Use another tool, or state the unsupported boundary, when the request requires an unlisted renderer, map, network, three-dimensional view, interactive editor, arbitrary dashboard grammar, browser histogram/heatmap, or browser categorical matrix. Do not disguise an unsupported requirement as the nearest supported plot. Ask before selecting a fit model, aggregating data, dropping observations, inventing category order, or choosing scientific limits.
