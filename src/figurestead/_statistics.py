"""Internal statistical helpers shared by Figurestead output paths."""

from __future__ import annotations

import math
from typing import Iterable


def linear_fit(x: Iterable[float], y: Iterable[float]) -> tuple[float, float]:
    """Return mean-centered OLS coefficients for an identifiable straight line."""
    x_values = [float(value) for value in x]
    y_values = [float(value) for value in y]
    if len(x_values) != len(y_values):
        raise ValueError("linear_fit requires x and y arrays of equal length")
    if len(x_values) < 2:
        raise ValueError("linear_fit requires at least two finite observations")
    if not all(math.isfinite(value) for value in (*x_values, *y_values)):
        raise ValueError("linear_fit requires finite x and y values")
    if len(set(x_values)) < 2:
        raise ValueError("linear_fit requires at least two distinct finite x values")

    mean_x = sum(x_values) / len(x_values)
    mean_y = sum(y_values) / len(y_values)
    numerator = sum((x_value - mean_x) * (y_value - mean_y)
                    for x_value, y_value in zip(x_values, y_values))
    denominator = sum((x_value - mean_x) ** 2 for x_value in x_values)
    slope = numerator / denominator
    return slope, mean_y - slope * mean_x
