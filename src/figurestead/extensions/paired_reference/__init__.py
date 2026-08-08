"""Paired observations and scientific-reference comparisons for Figurestead.

The browser and Matplotlib implementations share semantic contracts, not pixel
geometry.  These renderers intentionally remain outside the central registry so
the Figurestead 0.4 core stays frozen.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date
import math
from typing import Any

import numpy as np

from figurestead.core import PlotSpec, add_note, ensure_axes, resolve, style_axes


PAIRED_POINTS_KEY = "paired_points"
REFERENCE_IMPROVEMENT_KEY = "reference_improvement"


def _error(path: str, message: str) -> ValueError:
    return ValueError(f"{path}: {message}")


def _mapping(value: Any, path: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise _error(path, "must be a mapping")
    return value


def _text(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise _error(path, "must be a non-empty string")
    return value


def _number(value: Any, path: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise _error(path, "must be a finite number")
    return float(value)


def _order(value: Any, path: str) -> list[str]:
    if not isinstance(value, (list, tuple)) or not value:
        raise _error(path, "must be a non-empty category-order array")
    normalized = [_text(item, f"{path}[{index}]") for index, item in enumerate(value)]
    if len(set(normalized)) != len(normalized):
        raise _error(path, "categories must be unique")
    return normalized


def _domain(value: Any, path: str) -> tuple[float, float] | None:
    if value is None:
        return None
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise _error(path, "must contain exactly two finite numbers")
    low, high = (_number(item, f"{path}[{index}]") for index, item in enumerate(value))
    if low >= high:
        raise _error(path, "must be strictly increasing")
    return low, high


def _iso_date(value: Any, path: str) -> str:
    text = _text(value, path)
    try:
        parsed = date.fromisoformat(text)
    except ValueError as exc:
        raise _error(path, "must be an ISO calendar date (YYYY-MM-DD)") from exc
    if parsed.isoformat() != text:
        raise _error(path, "must be an ISO calendar date (YYYY-MM-DD)")
    return text


def _endpoint(value: Any, path: str) -> dict[str, Any]:
    item = _mapping(value, path)
    return {"label": _text(item.get("label"), f"{path}.label"),
            "value": _number(item.get("value"), f"{path}.value")}


def normalize_paired_points_data(data: Mapping[str, Any], path: str = "data") -> dict[str, Any]:
    """Validate and copy the semantic paired-points contract."""
    data = _mapping(data, path)
    supplied_columns = data.get("differenceColumns")
    if not isinstance(supplied_columns, (list, tuple)) or not supplied_columns:
        raise _error(f"{path}.differenceColumns", "must be a non-empty difference-column array")
    columns: list[dict[str, str]] = []
    column_keys: set[str] = set()
    for index, supplied in enumerate(supplied_columns):
        column_path = f"{path}.differenceColumns[{index}]"
        supplied = _mapping(supplied, column_path)
        key = _text(supplied.get("key"), f"{column_path}.key")
        if key in column_keys:
            raise _error(f"{column_path}.key", "must be unique")
        column_keys.add(key)
        unit = supplied.get("unit")
        if unit is not None and not isinstance(unit, str):
            raise _error(f"{column_path}.unit", "must be a string when provided")
        columns.append({"key": key, "label": _text(supplied.get("label"), f"{column_path}.label"),
                        "unit": "" if unit is None else unit})

    supplied_pairs = data.get("pairs")
    if not isinstance(supplied_pairs, (list, tuple)) or not supplied_pairs:
        raise _error(f"{path}.pairs", "must be a non-empty pair array")
    pairs: list[dict[str, Any]] = []
    ids: set[str] = set()
    for index, supplied in enumerate(supplied_pairs):
        pair_path = f"{path}.pairs[{index}]"
        supplied = _mapping(supplied, pair_path)
        pair_id = _text(supplied.get("id"), f"{pair_path}.id")
        if pair_id in ids:
            raise _error(f"{pair_path}.id", "must be unique")
        ids.add(pair_id)
        raw_differences = _mapping(supplied.get("differences"), f"{pair_path}.differences")
        differences: dict[str, float | None] = {}
        for column in columns:
            if column["key"] not in raw_differences:
                raise _error(f"{pair_path}.differences.{column['key']}", "must be a finite number or null")
            raw = raw_differences[column["key"]]
            differences[column["key"]] = None if raw is None else _number(raw, f"{pair_path}.differences.{column['key']}")
        pairs.append({
            "id": pair_id,
            "date": _iso_date(supplied.get("date"), f"{pair_path}.date"),
            "endpointA": _endpoint(supplied.get("endpointA"), f"{pair_path}.endpointA"),
            "endpointB": _endpoint(supplied.get("endpointB"), f"{pair_path}.endpointB"),
            "differences": differences,
        })
    x_domain = _domain(data.get("xDomain"), f"{path}.xDomain")
    values = [pair[key]["value"] for pair in pairs for key in ("endpointA", "endpointB")]
    if x_domain and any(value < x_domain[0] or value > x_domain[1] for value in values):
        raise _error(f"{path}.xDomain", "must contain every endpoint value")
    return {"pairs": pairs, "differenceColumns": columns, "xDomain": x_domain}


def normalize_reference_improvement_data(data: Mapping[str, Any], path: str = "data") -> dict[str, Any]:
    """Validate and copy the semantic reference-improvement contract."""
    data = _mapping(data, path)
    target_order = _order(data.get("targetOrder"), f"{path}.targetOrder")
    fold_order = _order(data.get("foldOrder"), f"{path}.foldOrder")
    temporality_order = _order(data.get("temporalityOrder"), f"{path}.temporalityOrder")
    supplied_labels = data.get("temporalityLabels", {})
    supplied_labels = _mapping(supplied_labels, f"{path}.temporalityLabels")
    temporality_labels = {key: _text(supplied_labels.get(key, key), f"{path}.temporalityLabels.{key}")
                          for key in temporality_order}
    supplied_rows = data.get("rows")
    if not isinstance(supplied_rows, (list, tuple)) or not supplied_rows:
        raise _error(f"{path}.rows", "must be a non-empty row array")
    rows: list[dict[str, Any]] = []
    combinations: set[tuple[str, str]] = set()
    for index, supplied in enumerate(supplied_rows):
        row_path = f"{path}.rows[{index}]"
        supplied = _mapping(supplied, row_path)
        target = _text(supplied.get("target"), f"{row_path}.target")
        fold = _text(supplied.get("fold"), f"{row_path}.fold")
        temporality = _text(supplied.get("trainingTemporality"), f"{row_path}.trainingTemporality")
        if target not in target_order:
            raise _error(f"{row_path}.target", f"unknown category {target}")
        if fold not in fold_order:
            raise _error(f"{row_path}.fold", f"unknown category {fold}")
        if temporality not in temporality_order:
            raise _error(f"{row_path}.trainingTemporality", f"unknown category {temporality}")
        combination = (target, fold)
        if combination in combinations:
            raise _error(row_path, "target/fold combination must be unique")
        combinations.add(combination)
        rows.append({"target": target, "fold": fold, "trainingTemporality": temporality,
                     "improvement": _number(supplied.get("improvement"), f"{row_path}.improvement")})
    x_domain = _domain(data.get("xDomain"), f"{path}.xDomain")
    if x_domain and not (x_domain[0] < 0 < x_domain[1]):
        raise _error(f"{path}.xDomain", "must strictly straddle the zero reference")
    if x_domain and any(row["improvement"] < x_domain[0] or row["improvement"] > x_domain[1] for row in rows):
        raise _error(f"{path}.xDomain", "must contain every improvement")
    zero_label = _text(data.get("zeroLabel", "zero — no direction-normalized improvement"), f"{path}.zeroLabel")
    return {"rows": rows, "targetOrder": target_order, "foldOrder": fold_order,
            "temporalityOrder": temporality_order, "temporalityLabels": temporality_labels,
            "xDomain": x_domain, "zeroLabel": zero_label}


def _extent(values: Sequence[float], padding: float = 0.1) -> tuple[float, float]:
    low, high = min(values), max(values)
    span = high - low or max(abs(high), 1.0)
    return low - span * padding, high + span * padding


def _symmetric_domain(values: Sequence[float]) -> tuple[float, float]:
    maximum = max((abs(value) for value in values), default=0.0)
    bound = 1.0 if maximum == 0 else maximum * 1.12
    return -bound, bound


def _clean_points(ax, x, y, *, color: str, marker: str = "o", label: str | None = None,
                  marker_size: float = 28.0, edge_width: float = 0.9):
    ax.scatter(x, y, s=marker_size, marker=marker, facecolors="none", edgecolors=color,
               linewidths=edge_width, alpha=0.88, label=label, zorder=4)
    ax.scatter(x, y, s=marker_size * 0.12, marker="o", c=color, edgecolors="none",
               alpha=0.50, zorder=5)


def describe_paired_points(data: Mapping[str, Any], *, value_label: str = "value") -> dict[str, Any]:
    normalized = normalize_paired_points_data(data)
    columns = normalized["differenceColumns"]
    headers = ["date", "endpoint A", f"A {value_label}", "endpoint B", f"B {value_label}"]
    headers.extend(f"{column['label']} ({column['unit']})" if column["unit"] else column["label"] for column in columns)
    rows = []
    for pair in normalized["pairs"]:
        differences = ["not available" if pair["differences"][column["key"]] is None
                       else pair["differences"][column["key"]] for column in columns]
        rows.append([pair["date"], pair["endpointA"]["label"], pair["endpointA"]["value"],
                     pair["endpointB"]["label"], pair["endpointB"]["value"], *differences])
    return {"summary": f"{len(rows)} explicitly encoded same-date pairs. Connectors do not imply common local rain, collection time, flow, or exposure.",
            "headers": headers, "rows": rows}


def describe_reference_improvement(data: Mapping[str, Any]) -> dict[str, Any]:
    normalized = normalize_reference_improvement_data(data)
    rows = [[row["target"], row["fold"], normalized["temporalityLabels"][row["trainingTemporality"]], row["improvement"]]
            for row in normalized["rows"]]
    return {"summary": f"{len(rows)} direction-normalized improvements around the scientific reference “{normalized['zeroLabel']}”. These values are not a combined score, and a blocked holdout is not general prospective forecasting.",
            "headers": ["target", "fold", "training temporality", "direction-normalized improvement"],
            "rows": rows}


def paired_points(data: Mapping[str, Any], *, spec: PlotSpec | None = None,
                  theme="slipware", profile="deep_scope", ax=None):
    """Render explicitly identified endpoint pairs as date-labelled dumbbells."""
    normalized = normalize_paired_points_data(data)
    spec = spec or PlotSpec("Paired observations", xlabel="value", ylabel="eligible shared date")
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(ax)
    style_axes(ax, theme, profile, spec, atmosphere=False)
    pairs = normalized["pairs"]
    y = np.arange(len(pairs) - 1, -1, -1, dtype=float)
    a = np.array([pair["endpointA"]["value"] for pair in pairs])
    b = np.array([pair["endpointB"]["value"] for pair in pairs])
    for pair, row_y, left, right in zip(pairs, y, a, b):
        line, = ax.plot([left, right], [row_y, row_y], color=theme.secondary, linewidth=1.1,
                        alpha=0.72, zorder=2)
        line.set_gid(f"paired-connector:{pair['id']}")
    _clean_points(ax, a, y, color=theme.series[0], label="endpoint A",
                  marker_size=profile.marker_size, edge_width=profile.edge_width)
    _clean_points(ax, b, y, color=theme.series[1 % len(theme.series)], label="endpoint B",
                  marker_size=profile.marker_size, edge_width=profile.edge_width)
    x_domain = normalized["xDomain"] or _extent([*a, *b])
    ax.set_xlim(*x_domain)
    ax.set_ylim(-0.5, max(0.5, len(pairs) - 0.5))
    ax.set_yticks(y, [pair["date"] for pair in pairs])
    ax.legend(frameon=False, fontsize=7, labelcolor=theme.label, loc="upper right")
    add_note(ax, spec, theme)
    return fig, ax


def reference_improvement(data: Mapping[str, Any], *, spec: PlotSpec | None = None,
                          theme="slipware", profile="deep_scope", ax=None):
    """Render signed improvements around an explicit scientific zero reference."""
    normalized = normalize_reference_improvement_data(data)
    spec = spec or PlotSpec("Model increment", xlabel="direction-normalized improvement", ylabel="target · fold")
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(ax)
    style_axes(ax, theme, profile, spec, atmosphere=False)
    slots = [(target, fold) for target in normalized["targetOrder"] for fold in normalized["foldOrder"]]
    positions = {slot: len(slots) - 1 - index for index, slot in enumerate(slots)}
    x_domain = normalized["xDomain"] or _symmetric_domain([row["improvement"] for row in normalized["rows"]])
    ax.set_xlim(*x_domain)
    ax.set_ylim(-0.5, max(0.5, len(slots) - 0.5))
    zero = ax.axvline(0, color=theme.warm, linewidth=1.0, alpha=0.92,
                      linestyle=(0, (4, 3)), zorder=2)
    zero.set_gid("scientific-zero-reference")
    ax.text(0, 1.01, normalized["zeroLabel"], transform=ax.get_xaxis_transform(),
            ha="center", va="bottom", color=theme.warm, fontsize=6.3,
            fontfamily="DejaVu Sans Mono")
    markers = ["o", "D", "s", "^"]
    for index, temporality in enumerate(normalized["temporalityOrder"]):
        selected = [row for row in normalized["rows"] if row["trainingTemporality"] == temporality]
        _clean_points(ax, [row["improvement"] for row in selected],
                      [positions[(row["target"], row["fold"])] for row in selected],
                      color=theme.series[index % len(theme.series)], marker=markers[index % len(markers)],
                      label=normalized["temporalityLabels"][temporality], marker_size=profile.marker_size,
                      edge_width=profile.edge_width)
    y = np.arange(len(slots) - 1, -1, -1, dtype=float)
    ax.set_yticks(y, [f"{target} · {fold}" for target, fold in slots])
    for index in range(1, len(normalized["targetOrder"])):
        ax.axhline(len(slots) - index * len(normalized["foldOrder"]) - 0.5,
                   color=theme.spine, linewidth=0.45, alpha=0.55, zorder=1)
    ax.legend(frameon=False, fontsize=7, labelcolor=theme.label, loc="upper right")
    add_note(ax, spec, theme)
    return fig, ax


__all__ = [
    "PAIRED_POINTS_KEY",
    "REFERENCE_IMPROVEMENT_KEY",
    "describe_paired_points",
    "describe_reference_improvement",
    "normalize_paired_points_data",
    "normalize_reference_improvement_data",
    "paired_points",
    "reference_improvement",
]
