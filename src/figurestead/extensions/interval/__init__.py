"""Interval-comparison extension for Figurestead's Matplotlib adapter."""

from .renderer import (
    INTERVAL_PLOTS,
    INTERVAL_REGISTRATION,
    IntervalData,
    IntervalDenominator,
    IntervalRow,
    IntervalSeries,
    interval_comparison,
    normalize_interval_data,
)

__all__ = [
    "INTERVAL_PLOTS",
    "INTERVAL_REGISTRATION",
    "IntervalData",
    "IntervalDenominator",
    "IntervalRow",
    "IntervalSeries",
    "interval_comparison",
    "normalize_interval_data",
]
