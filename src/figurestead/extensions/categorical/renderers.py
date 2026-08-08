"""Static Matplotlib parity for the categorical Canvas renderer pack."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.ticker import PercentFormatter

from ...core import PlotSpec, add_note, ensure_axes, resolve, series_colors, style_axes, style_legend
from .validation import normalize_categorical_data


def _data(categories, series, category_labels, orientation, value_domain, value_format):
    return {
        "categories": categories,
        "categoryLabels": category_labels or {},
        "orientation": orientation,
        "series": series,
        "valueDomain": value_domain,
        "valueFormat": value_format,
    }


def _domain(data):
    if data["valueDomain"]:
        return tuple(data["valueDomain"])
    values = [value for series in data["series"] for value in series["values"] if value is not None]
    maximum = max([0.0, *values])
    return (0.0, maximum * 1.08 if maximum > 0 else 1.0)


def _finish_axes(ax, data, domain, spec, theme):
    positions = np.arange(len(data["categories"]), dtype=float)
    labels = [data["categoryLabels"][key] for key in data["categories"]]
    if data["orientation"] == "horizontal":
        ax.set_yticks(positions, labels)
        ax.set_xlim(domain)
        ax.invert_yaxis()
        if data["valueFormat"] == "percent":
            ax.xaxis.set_major_formatter(PercentFormatter(xmax=1))
    else:
        ax.set_xticks(positions, labels)
        ax.set_ylim(domain)
        if len(labels) > 8:
            stride = max(1, int(np.ceil(len(labels) / 8)))
            shown = [label if index % stride == 0 or index == len(labels) - 1 else "" for index, label in enumerate(labels)]
            ax.set_xticks(positions, shown)
        if data["valueFormat"] == "percent":
            ax.yaxis.set_major_formatter(PercentFormatter(xmax=1))
    add_note(ax, spec, theme)


def _marker(ax, position, *, horizontal, missing, color):
    marker = "x" if missing else "o"
    x, y = (0, position) if horizontal else (position, 0)
    if missing:
        ax.scatter([x], [y], marker=marker, s=18, color=color, linewidths=0.9, zorder=6)
    else:
        ax.scatter([x], [y], marker=marker, s=12, facecolors="none", edgecolors=color, linewidths=0.9, zorder=6)


def categorical_bar(
    categories: Sequence[str], series: Sequence[Mapping[str, Any]], *,
    category_labels: Mapping[str, str] | None = None, orientation: str = "vertical",
    value_domain: Sequence[float] | None = None, value_format: str = "number", spec: PlotSpec | None = None,
    theme="slipware", profile="deep_scope", ax=None,
):
    """Render grouped nonnegative bars from an honest zero baseline."""
    data = normalize_categorical_data(_data(categories, series, category_labels, orientation, value_domain, value_format))
    spec = spec or PlotSpec("Categorical bars")
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(ax)
    style_axes(ax, theme, profile, spec)
    positions = np.arange(len(data["categories"]), dtype=float)
    colors = series_colors(theme)
    width = 0.76 / len(data["series"])
    for series_index, (item, color) in enumerate(zip(data["series"], colors)):
        offsets = positions - 0.38 + width * (series_index + 0.5)
        present = np.array([value is not None and value > 0 for value in item["values"]])
        values = np.array([0 if value is None else value for value in item["values"]], dtype=float)
        if data["orientation"] == "horizontal":
            ax.barh(offsets[present], values[present], height=width * 0.76, color=color, edgecolor=color, alpha=0.62, linewidth=0.7, label=item["label"], zorder=3)
        else:
            ax.bar(offsets[present], values[present], width=width * 0.76, color=color, edgecolor=color, alpha=0.62, linewidth=0.7, label=item["label"], zorder=3)
        for index, value in enumerate(item["values"]):
            if value is None or value == 0:
                _marker(ax, offsets[index], horizontal=data["orientation"] == "horizontal", missing=value is None, color=theme.warm if value is None else color)
    if len(data["series"]) > 1:
        style_legend(ax, theme)
    _finish_axes(ax, data, _domain(data), spec, theme)
    return fig, ax


def categorical_layered_bar(
    categories: Sequence[str], series: Sequence[Mapping[str, Any]], *,
    category_labels: Mapping[str, str] | None = None, orientation: str = "vertical",
    value_domain: Sequence[float] | None = None, value_format: str = "number", spec: PlotSpec | None = None,
    theme="slipware", profile="deep_scope", ax=None,
):
    """Render a base bar with narrower nonnegative subset overlays."""
    data = normalize_categorical_data(_data(categories, series, category_labels, orientation, value_domain, value_format), layered=True)
    spec = spec or PlotSpec("Layered categorical bars")
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(ax)
    style_axes(ax, theme, profile, spec)
    positions = np.arange(len(data["categories"]), dtype=float)
    colors = series_colors(theme)
    for series_index, (item, color) in enumerate(zip(data["series"], colors)):
        width = max(0.28, 0.76 - series_index * 0.18)
        present = np.array([value is not None and value > 0 for value in item["values"]])
        values = np.array([0 if value is None else value for value in item["values"]], dtype=float)
        alpha = 0.30 if series_index == 0 else 0.68
        if data["orientation"] == "horizontal":
            ax.barh(positions[present], values[present], height=width, color=color, edgecolor=color, alpha=alpha, linewidth=0.8, label=item["label"], zorder=3 + series_index)
        else:
            ax.bar(positions[present], values[present], width=width, color=color, edgecolor=color, alpha=alpha, linewidth=0.8, label=item["label"], zorder=3 + series_index)
        for index, value in enumerate(item["values"]):
            if value is None or value == 0:
                _marker(ax, positions[index], horizontal=data["orientation"] == "horizontal", missing=value is None, color=theme.warm if value is None else color)
    style_legend(ax, theme)
    _finish_axes(ax, data, _domain(data), spec, theme)
    return fig, ax
