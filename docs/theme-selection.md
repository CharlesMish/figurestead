# Choose a theme

For published Python **0.9.0a4** and browser **0.9.0-alpha.5**. A theme chooses
colors; a profile chooses typography, markers and emphasis. Python plotters
default to `theme="slipware", profile="deep_scope"`. Selecting a reference theme
does not change that default or qualify every plot family.

These values come from the [canonical theme JSON](../src/figurestead/themes/).
The browser column is the suffix under `@figurestead/web/themes/`.

| Theme | Python key | Browser subpath suffix | Background (`field`) | Accent (`primary`) |
| --- | --- | --- | --- | --- |
| Deep Observatory / Sage Core | `deep_observatory_sage_core` | `deep-observatory-sage-core` | `#10171D` | `#5A9FA4` |
| Lavender Fog Notebook | `lavender_fog_notebook` | `lavender-fog-notebook` | `#F4F1F8` | `#6855A8` |
| Midnight Transit / Signal Slate | `midnight_transit_signal_slate` | `midnight-transit-signal-slate` | `#0A1522` | `#5EA5C8` |
| Registration Ink | `registration_ink` | `registration-ink` | `#E7DFD2` | `#9C3038` |
| Slipware | `slipware` | `slipware` | `#E0D3C4` | `#1B4C8A` |
| Ultraviolet Laboratory | `ultraviolet_laboratory` | `ultraviolet-laboratory` | `#0D0B18` | `#B59BFF` |

## Python

```python
from figurestead import PlotSpec, line

figure, axes = line(
    [0, 1, 2], [[0, 1, 0]],
    theme="lavender_fog_notebook",
    spec=PlotSpec(title="Synthetic response", xlabel="Time (s)", ylabel="Response (a.u.)"),
)
figure.savefig("response.png", dpi=150)
```

## Browser

Use the [complete installed-package example](../web/README.md#first-figure),
then replace its theme import and resolution with:

```js
import lavenderPack from "@figurestead/web/themes/lavender-fog-notebook" with { type: "json" };
const theme = resolveTheme(validateThemePack(lavenderPack), "lavender_fog_notebook");
```

The import path uses hyphens; the key inside the pack uses underscores.
Pass the resolved `theme` in the complete contract. A theme pack alone is not
a figure contract.

Lavender Fog Notebook is the reference light theme and Ultraviolet Laboratory
the reference dark theme for the [bounded three-series ordinary-line profile](reference-themes.md).
Series use open circle, square and upright triangle identities. Additional
series have deterministic fallback, without a distinguishability guarantee.
A palette's length is not a validated series capacity. Inspect the actual
output at its intended size; no theme has a universal CVD or print guarantee.
