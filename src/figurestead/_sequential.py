"""Theme-primary tint/shade ramp for the ordinary Python heatmap only."""

import numpy as np
from matplotlib.colors import ListedColormap, to_rgb


# Figurestead design constants, not accessibility or perceptual thresholds.
_DARK_LSTAR = 24.0
_LIGHT_LSTAR = 92.0
_ENTRIES = 256
_BISECTION_STEPS = 56


def _luminance(rgb):
    """D65-relative Y (Yn=1) from encoded sRGB."""
    rgb = np.asarray(rgb, dtype=float)
    linear = np.where(rgb <= 0.04045, rgb / 12.92,
                      ((rgb + 0.055) / 1.055) ** 2.4)
    return linear @ np.array([0.2126, 0.7152, 0.0722])


def _lightness(rgb):
    y = _luminance(rgb)
    return np.where(y > (6 / 29) ** 3,
                    116 * np.cbrt(y) - 16, (29 / 3) ** 3 * y)


def _anchor(primary, target):
    # Bracket the target with the seed and black/white. For every shipped theme
    # the dark target shades the seed and the light target tints it. Bracketing
    # also handles custom seeds whose own L* lies outside the design interval.
    low, high = ((np.zeros(3), primary) if _lightness(primary) >= target
                 else (primary, np.ones(3)))
    left, right = 0.0, 1.0
    for _ in range(_BISECTION_STEPS):
        amount = (left + right) / 2
        if _lightness(low + amount * (high - low)) < target:
            left = amount
        else:
            right = amount
    return low + (left + right) / 2 * (high - low)


def sequential_colormap(theme):
    """Return the study's 256-entry RGB tint/shade candidate A.

    Componentwise ordered endpoints and encoded-sRGB interpolation preserve
    luminance order, including after per-channel quantization. This guarantees
    ordering, not perceptual uniformity or 256 distinguishable levels.
    """
    primary = np.array(to_rgb(theme.primary))
    dark = _anchor(primary, _DARK_LSTAR)
    light = _anchor(primary, _LIGHT_LSTAR)
    rgb = dark + np.linspace(0, 1, _ENTRIES)[:, None] * (light - dark)
    if not _luminance(to_rgb(theme.field)) < _luminance(to_rgb(theme.label)):
        rgb = rgb[::-1]
    return ListedColormap(rgb, name=f"figurestead_{theme.key}")
