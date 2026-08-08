"""Stable plot identities; callers never depend on filename positions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from . import plots


@dataclass(frozen=True)
class PlotRegistration:
    key: str
    renderer: Callable
    family: str
    cost: str
    enabled_by_default: bool = True


PLOTS: dict[str, PlotRegistration] = {
    "strip_summary": PlotRegistration("strip_summary", plots.strip_summary, "distribution", "low"),
    "scatter": PlotRegistration("scatter", plots.scatter, "relationship", "low"),
    "line": PlotRegistration("line", plots.line, "trend", "low"),
    "histogram": PlotRegistration("histogram", plots.histogram, "distribution", "low"),
    "heatmap": PlotRegistration("heatmap", plots.heatmap, "matrix", "medium"),
}


def available_plots() -> tuple[str, ...]:
    return tuple(PLOTS)


def render(key: str, /, **kwargs):
    try:
        registration = PLOTS[key]
    except KeyError as exc:
        choices = ", ".join(PLOTS)
        raise ValueError(f"Unknown plot {key!r}; choose one of: {choices}") from exc
    return registration.renderer(**kwargs)
