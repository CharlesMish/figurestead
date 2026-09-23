# Python sequential heatmaps — current source

The current-source Python `heatmap()` uses a theme-derived sequential ramp with monotone lightness. This is a source change after the published Python `0.9.0a2` / coordinated alpha.3 release, not a description of that release's retained heatmaps.

The ramp changes colors, not numeric values, admission, normalization or cell geometry. Equal numeric values map to equal colors. Nearest-neighbor rendering, opacity, axes, colorbar and typography are unchanged. Low values remain observations; a quiet low-value color does not mean missing data. No new missing-value semantics are introduced.

One construction serves all six shipped themes:

- Use the resolved theme's primary color as the hue seed.
- Mix it toward black and white to derive endpoints at CIELAB L* 24 and 92 (D65-relative Y, Yn=1), using 56 bounded bisection steps.
- Interpolate 256 entries directly in encoded sRGB. Higher values become **darker on light themes** and **lighter on dark themes**. Polarity follows the field/label luminance relationship, not theme names.

The endpoints are componentwise ordered, so every channel moves monotonically. Standard sRGB decoding and positive-weight luminance preserve that order. Per-channel 8-bit quantization may repeat adjacent colors, but does not reverse their lightness order. The implementation also brackets custom primary seeds outside the target lightness interval with black or white as needed.

The endpoint values are Figurestead design constants from the retained sequential-ramp study, not accessibility thresholds or a claim of optimality. Monotone lightness does **not** establish perceptual uniformity, CVD qualification, print qualification or 256 distinguishable levels.

Theme palettes themselves are unchanged. Line-series identity and browser rendering are unchanged. The categorical-matrix extension, including its annotation and missing/insufficient-cell policies, retains its existing ramp pending a separate migration. Historical specimens remain records of the source that produced them.

## Wording retained for a future release note

Python heatmaps now use a theme-derived sequential ramp with monotone lightness, replacing the field/panel/primary/summary token sequence. This changes heatmap colors while preserving data and normalization. Theme palettes and line-series identity are unchanged. The categorical-matrix extension retains its existing rendering until its separate migration.
