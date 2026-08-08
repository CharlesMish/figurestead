"""Static Matplotlib renderer for the categorical-matrix extension grammar."""

from __future__ import annotations

from collections.abc import Mapping
import math

import matplotlib.colors as mcolors
import matplotlib.pyplot as plt
from matplotlib.patches import Patch, Rectangle
from matplotlib.ticker import FuncFormatter
import numpy as np

from figurestead.core import PlotSpec, add_note, ensure_axes, resolve, style_axes


FORMATS = {"percent", "integer", "decimal"}
STATUSES = {"observed", "insufficient", "missing"}


def _categories(value, path: str) -> list[str]:
    if not isinstance(value, (list, tuple)) or not value:
        raise ValueError(f"{path} must be a non-empty category array")
    normalized = [str(item).strip() for item in value]
    if any(not item for item in normalized):
        raise ValueError(f"{path} categories must be non-empty strings")
    if len(set(normalized)) != len(normalized):
        raise ValueError(f"{path} categories must be unique")
    return normalized


def _finite(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def normalize_matrix_data(data: Mapping) -> dict:
    """Validate and normalize the cross-runtime categorical-matrix data shape."""
    if not isinstance(data, Mapping):
        raise ValueError("data must be a mapping")
    x_categories = _categories(data.get("xCategories"), "data.xCategories")
    y_categories = _categories(data.get("yCategories"), "data.yCategories")
    scale = data.get("valueScale")
    if not isinstance(scale, Mapping):
        raise ValueError("data.valueScale must be a mapping")
    domain = scale.get("domain")
    if not isinstance(domain, (list, tuple)) or len(domain) != 2 or not all(_finite(item) for item in domain) or domain[0] >= domain[1]:
        raise ValueError("data.valueScale.domain must contain two strictly increasing finite numbers")
    label = str(scale.get("label", "")).strip()
    if not label:
        raise ValueError("data.valueScale.label must be a non-empty string")
    value_format = scale.get("format", "decimal")
    if value_format not in FORMATS:
        raise ValueError("data.valueScale.format must be percent, integer, or decimal")
    source_cells = data.get("cells")
    if not isinstance(source_cells, (list, tuple)) or not source_cells:
        raise ValueError("data.cells must be a non-empty cell array")
    known_x, known_y, seen, cells = set(x_categories), set(y_categories), set(), []
    for index, source in enumerate(source_cells):
        path = f"data.cells[{index}]"
        if not isinstance(source, Mapping):
            raise ValueError(f"{path} must be a mapping")
        x, y = str(source.get("x", "")).strip(), str(source.get("y", "")).strip()
        if x not in known_x:
            raise ValueError(f"{path}.x contains unknown category {x!r}")
        if y not in known_y:
            raise ValueError(f"{path}.y contains unknown category {y!r}")
        key = (x, y)
        if key in seen:
            raise ValueError(f"{path} duplicates an existing x/y cell")
        seen.add(key)
        status = source.get("status", "observed")
        if status not in STATUSES:
            raise ValueError(f"{path}.status must be observed, insufficient, or missing")
        value = source.get("value")
        if status == "observed":
            if not _finite(value):
                raise ValueError(f"{path}.value must be finite for an observed cell")
            if value < domain[0] or value > domain[1]:
                raise ValueError(f"{path}.value must fall within data.valueScale.domain")
            value = float(value)
        elif value is not None:
            raise ValueError(f"{path}.value must be null for a status cell")
        label_value = source.get("label", "")
        if label_value is not None and not isinstance(label_value, str):
            raise ValueError(f"{path}.label must be a string")
        cells.append({"x": x, "y": y, "value": value, "status": status, "label": label_value or ""})
    supplied_labels = data.get("statusLabels")
    if "statusLabels" in data and not isinstance(supplied_labels, Mapping):
        raise ValueError("data.statusLabels must be a mapping")
    unexpected_labels = set(supplied_labels or {}) - {"insufficient", "missing"}
    if unexpected_labels:
        raise ValueError(f"data.statusLabels contains unsupported keys: {sorted(unexpected_labels)}")
    labels = {"insufficient": "Insufficient sample", "missing": "No data", **dict(supplied_labels or {})}
    if any(not isinstance(labels[key], str) or not labels[key].strip() for key in ("insufficient", "missing")):
        raise ValueError("data.statusLabels values must be non-empty strings")
    labels = {key: value.strip() for key, value in labels.items()}
    return {
        "xCategories": x_categories,
        "yCategories": y_categories,
        "cells": cells,
        "valueScale": {"domain": [float(domain[0]), float(domain[1])], "label": label, "format": value_format},
        "statusLabels": labels,
    }


def _format(value: float, kind: str) -> str:
    if kind == "percent":
        return f"{value * 100:.0f}%" if value in (0, 1) else f"{value * 100:.1f}%"
    if kind == "integer":
        return str(round(value))
    return f"{value:.4g}"


def _relative_luminance(color) -> float:
    channels = []
    for value in mcolors.to_rgb(color):
        channels.append(value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def _contrast(left, right) -> float:
    bright, dark = sorted((_relative_luminance(left), _relative_luminance(right)), reverse=True)
    return (bright + 0.05) / (dark + 0.05)


def _annotation_color(theme, fill):
    return theme.label if _contrast(theme.label, fill) >= _contrast(theme.field, fill) else theme.field


def categorical_matrix(data, *, spec=None, theme="slipware", profile="deep_scope", ax=None):
    """Render a categorical value matrix with explicit missing/insufficient cells."""
    data = normalize_matrix_data(data)
    spec = spec or PlotSpec("Categorical matrix")
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(ax)
    style_axes(ax, theme, profile, spec, atmosphere=False)
    ax.grid(False)

    x_categories, y_categories = data["xCategories"], data["yCategories"]
    x_lookup = {value: index for index, value in enumerate(x_categories)}
    y_lookup = {value: index for index, value in enumerate(y_categories)}
    matrix = np.full((len(y_categories), len(x_categories)), np.nan)
    lookup = {(cell["x"], cell["y"]): cell for cell in data["cells"]}
    materialized = []
    for y in y_categories:
        for x in x_categories:
            cell = lookup.get((x, y), {"x": x, "y": y, "value": None, "status": "missing", "label": ""})
            materialized.append(cell)
            if cell["status"] == "observed":
                matrix[y_lookup[y], x_lookup[x]] = cell["value"]

    colors = [theme.panel, theme.primary, theme.summary_core]
    cmap = mcolors.LinearSegmentedColormap.from_list(f"figurestead_extension_{theme.key}", [(0, colors[0]), (0.68, colors[1]), (1, colors[2])]).with_extremes(bad=theme.field)
    norm = mcolors.Normalize(*data["valueScale"]["domain"])
    image = ax.imshow(np.ma.masked_invalid(matrix), cmap=cmap, norm=norm, aspect="auto", interpolation="nearest", zorder=2)
    present_statuses = set()
    for cell in materialized:
        xi, yi = x_lookup[cell["x"]], y_lookup[cell["y"]]
        if cell["status"] != "observed":
            present_statuses.add(cell["status"])
            patch = Rectangle((xi - 0.5, yi - 0.5), 1, 1, facecolor=theme.field if cell["status"] == "missing" else theme.panel,
                              edgecolor=theme.warm if cell["status"] == "insufficient" else theme.spine,
                              hatch="///" if cell["status"] == "insufficient" else None, linewidth=0.6, zorder=3)
            ax.add_patch(patch)
        if cell.get("label"):
            fill = cmap(norm(cell["value"])) if cell["status"] == "observed" else theme.panel
            ax.text(xi, yi, cell["label"], ha="center", va="center", color=_annotation_color(theme, fill) if cell["status"] == "observed" else theme.label,
                    fontsize=6.2, fontfamily="DejaVu Sans Mono", clip_on=True, zorder=4)

    ax.set_xticks(range(len(x_categories)), x_categories, rotation=45, ha="right", rotation_mode="anchor")
    ax.set_yticks(range(len(y_categories)), y_categories)
    ax.set_xlim(-0.5, len(x_categories) - 0.5)
    ax.set_ylim(len(y_categories) - 0.5, -0.5)
    colorbar = fig.colorbar(image, ax=ax, fraction=0.046, pad=0.04)
    colorbar.set_label(data["valueScale"]["label"], color=theme.label, fontsize=8)
    colorbar.outline.set_edgecolor(theme.spine)
    colorbar.ax.tick_params(colors=theme.secondary, labelsize=7)
    if data["valueScale"]["format"] == "percent":
        colorbar.ax.yaxis.set_major_formatter(FuncFormatter(lambda value, _: _format(value, "percent")))
    handles = []
    if "insufficient" in present_statuses:
        handles.append(Patch(facecolor=theme.panel, edgecolor=theme.warm, hatch="///", label=data["statusLabels"]["insufficient"]))
    if "missing" in present_statuses:
        handles.append(Patch(facecolor=theme.field, edgecolor=theme.spine, label=data["statusLabels"]["missing"]))
    if handles:
        ax.legend(handles=handles, frameon=False, fontsize=7, labelcolor=theme.label, loc="upper left", bbox_to_anchor=(0, -0.16))
    add_note(ax, spec, theme)
    return fig, ax
