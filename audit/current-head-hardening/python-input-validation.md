# Core Python input-validation hardening

Baseline: `eb2440e0178a4f88ef81529a0695716d00c7d3f7`

The registered direct plotting surface is exactly `strip_summary`, `scatter`,
`line`, `histogram`, and `heatmap`. Motion, portable-contract, and extension
entrypoints have separate validation and are not direct plotters in this audit.

## Baseline inventory and policy matrix

| Function | Data shape and cardinality | Metadata/category semantics | Baseline finite/empty behavior | Baseline allocation point | Corrected boundary |
|---|---|---|---|---|---|
| `strip_summary` | One-dimensional `groups`, `values`, and optional `series`; equal lengths | Default order is first-observed; explicit order defines positions | Non-finite values were accepted; no optional-empty behavior is documented, but declared empty order slots already render as `n=0` | After length checks, before order completeness is known | Equal one-dimensional vectors; finite numeric values; finite numeric category identities; unique explicit order containing every observed group |
| `scatter` | One-dimensional `x`, `y`, and optional `series`; equal lengths | Series identities are optional and default to one series | Empty and non-finite numeric vectors were accepted | After length checks | Nonempty, equal, finite real numeric vectors; matching optional series |
| `line` | One-dimensional `x`; one- or two-dimensional `ys`; each row matches `x` | Omitted labels are generated; supplied labels previously had no cardinality check | Empty/non-finite numeric data could reach Matplotlib; no optional-empty behavior is documented | After shape check and theme/presentation resolution | Nonempty finite real arrays; every supplied label maps to exactly one row |
| `histogram` | One dataset or multiple one-dimensional datasets | Omitted labels are generated; supplied labels previously had no cardinality check | A flat NumPy array acted as one dataset, while an equivalent flat list was split into scalars and failed after allocation; empty behavior is undocumented | Before the first `ax.hist`, after figure creation | A flat numeric container is one dataset; nested containers/2-D arrays represent datasets by entry/row; datasets are nonempty and finite; labels match exactly; bin specifications preflight before allocation |
| `heatmap` | One two-dimensional numeric matrix | Optional x/y label sequences correspond to columns/rows | Non-finite data was accepted; empty matrices failed downstream; label cardinality was unchecked | After the 2-D check | Nonempty finite real matrix; supplied x/y labels match columns/rows exactly |

The direct convenience functions now share the normalized-contract invariant
that scientific numeric observations are finite. Python continues to offer its
documented/direct container conveniences and does not expand the portable
contract.

## Before reproduction

The following was reproduced headlessly at the baseline with Python 3.13.13,
Matplotlib 3.11.1, and NumPy 2.5.2:

| Fixture | Baseline result | Open figures |
|---|---|---|
| `histogram([1, 2, 3])` | `TypeError: len() of unsized object` | `0 -> 1` |
| Two histogram datasets, one label | Returned only one dataset artist | `0 -> 1` |
| Two line series, one label | Returned only one line | `0 -> 1` |
| Observed strip group omitted from `order` | Raw `KeyError` | `0 -> 1` |
| Duplicate strip `order` | Returned a malformed duplicated axis | `0 -> 1` |
| Non-finite strip/scatter/line/heatmap data | Usually returned a figure | `0 -> 1` |
| Non-finite histogram data | Matplotlib `ValueError` | `0 -> 1` |
| Heatmap x-label mismatch | Returned a mislabeled figure | `0 -> 1` |

## Corrected error and resource contract

Determinable input failures use the existing public `ValueError` convention
with an argument path, for example `line.labels: expected 2 entries, found 1`.
No new exception taxonomy was added. Validation and histogram-bin preflight
finish before theme resolution and `ensure_axes`, so rejected input neither
creates a Figurestead figure nor mutates a caller-provided axes.

The still-held declared empty-category decision remains held. Existing explicit
unobserved strip-order slots, including a fully declared empty order, are not
reclassified by this pass. Only duplicate order entries and omission of an
actually observed category are newly rejected.

The counted regression is
`audit/current-head-hardening/test_python_plot_inputs.py`: 37 unittest cases,
including 15 non-finite subcases spanning all five direct functions. Every
invalid fixture asserts that `ensure_axes` was not called and that the set of
open Matplotlib figures did not change. It also covers an existing caller axes
and a valid render after rejection.

The suite passes under Python 3.10.20, 3.12.13, and 3.14.6. The accepted Python
first-success remains 1260 x 780 pixels at SHA-256
`34b1117229b84cc6ce1d493253d993d4605697131ba30cb31ae6586e305a2fa8`.
The complete direct-function gallery generated from the baseline and corrected
source under the same local environment is byte-identical at SHA-256
`5914467364549c5e04bc739145a565ed7369686081a13e88ab8a67ae71fe6b95`.
