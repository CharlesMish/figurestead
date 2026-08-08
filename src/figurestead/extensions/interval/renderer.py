"""Static Matplotlib parity for the interval-comparison renderer family."""

from __future__ import annotations

from dataclasses import dataclass
import re
from types import MappingProxyType
from typing import Any, Mapping

import numpy as np

from figurestead.core import PlotSpec, add_note, ensure_axes, resolve, style_axes, style_legend
from figurestead.registry import PlotRegistration


MARKS = frozenset({"interval", "point"})
ROLES = frozenset({"context", "reference", "primary", "observed", "summary"})
SAFE_KEY = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


@dataclass(frozen=True)
class IntervalSeries:
    key: str
    label: str
    mark: str
    role: str
    color_index: int


@dataclass(frozen=True)
class IntervalRow:
    category: str
    values: Mapping[str, float | tuple[float, float]]


@dataclass(frozen=True)
class IntervalDenominator:
    value: int
    label: str


@dataclass(frozen=True)
class IntervalData:
    categories: tuple[str, ...]
    series: tuple[IntervalSeries, ...]
    rows: tuple[IntervalRow, ...]
    x_domain: tuple[float, float] | None
    denominator: IntervalDenominator | None


def _fail(message: str, path: str) -> None:
    raise ValueError(f"{path}: {message}")


def _mapping(value: Any, path: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        _fail("must be an object", path)
    return value


def _text(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail("must be a non-empty string", path)
    return value


def _finite(value: Any) -> bool:
    return isinstance(value, (int, float, np.integer, np.floating)) and not isinstance(value, bool) and np.isfinite(value)


def normalize_interval_data(data: Mapping[str, Any] | IntervalData, base_path: str = "data") -> IntervalData:
    """Validate and freeze the JSON-compatible interval grammar."""
    if isinstance(data, IntervalData):
        data = {
            "categories": list(data.categories),
            "series": [
                {"key": item.key, "label": item.label, "mark": item.mark, "role": item.role, "colorIndex": item.color_index}
                for item in data.series
            ],
            "rows": [
                {"category": row.category, "values": dict(row.values)}
                for row in data.rows
            ],
            "xDomain": list(data.x_domain) if data.x_domain is not None else None,
            "denominator": ({"value": data.denominator.value, "label": data.denominator.label} if data.denominator else None),
        }
    source = _mapping(data, base_path)
    raw_categories = source.get("categories")
    if not isinstance(raw_categories, (list, tuple)) or not raw_categories:
        _fail("must be a non-empty category array", f"{base_path}.categories")
    categories = tuple(_text(value, f"{base_path}.categories[{index}]") for index, value in enumerate(raw_categories))
    if len(set(categories)) != len(categories):
        _fail("categories must be unique", f"{base_path}.categories")

    raw_series = source.get("series")
    if not isinstance(raw_series, (list, tuple)) or not raw_series:
        _fail("must be a non-empty series array", f"{base_path}.series")
    series: list[IntervalSeries] = []
    seen_series: set[str] = set()
    for index, raw in enumerate(raw_series):
        path = f"{base_path}.series[{index}]"
        item = _mapping(raw, path)
        key = _text(item.get("key"), f"{path}.key")
        if not SAFE_KEY.fullmatch(key):
            _fail("must start with a letter and contain only letters, numbers, and underscores", f"{path}.key")
        if key in seen_series:
            _fail("must be unique", f"{path}.key")
        seen_series.add(key)
        mark = item.get("mark")
        if mark not in MARKS:
            _fail("must be 'interval' or 'point'", f"{path}.mark")
        role = item.get("role", "primary")
        if role not in ROLES:
            _fail(f"must be one of {', '.join(sorted(ROLES))}", f"{path}.role")
        color_index = item.get("colorIndex", index)
        if not isinstance(color_index, int) or isinstance(color_index, bool) or color_index < 0:
            _fail("must be a non-negative integer", f"{path}.colorIndex")
        label = key if item.get("label") is None else _text(item.get("label"), f"{path}.label")
        series.append(IntervalSeries(key, label, mark, role, color_index))

    raw_rows = source.get("rows")
    if not isinstance(raw_rows, (list, tuple)) or not raw_rows:
        _fail("must be a non-empty row array", f"{base_path}.rows")
    category_set = set(categories)
    seen_rows: set[str] = set()
    row_source_index: dict[str, int] = {}
    rows: list[IntervalRow] = []
    for index, raw in enumerate(raw_rows):
        path = f"{base_path}.rows[{index}]"
        item = _mapping(raw, path)
        category = _text(item.get("category"), f"{path}.category")
        if category not in category_set:
            _fail(f"unknown category {category!r}", f"{path}.category")
        if category in seen_rows:
            _fail("must be unique", f"{path}.category")
        seen_rows.add(category)
        row_source_index[category] = index
        raw_values = _mapping(item.get("values"), f"{path}.values")
        unknown = next((key for key in raw_values if key not in seen_series), None)
        if unknown is not None:
            _fail(f"unknown series {unknown!r}", f"{path}.values.{unknown}")
        values: dict[str, float | tuple[float, float]] = {}
        for definition in series:
            value_path = f"{path}.values.{definition.key}"
            value = raw_values.get(definition.key)
            if definition.mark == "point":
                if not _finite(value):
                    _fail("must be a finite number", value_path)
                values[definition.key] = float(value)
            else:
                if not isinstance(value, (list, tuple)) or len(value) != 2 or not all(_finite(part) for part in value):
                    _fail("must be a two-number interval", value_path)
                low, high = float(value[0]), float(value[1])
                if low > high:
                    _fail("interval low must not exceed high", value_path)
                values[definition.key] = (low, high)
        rows.append(IntervalRow(category, MappingProxyType(values)))
    missing = next((category for category in categories if category not in seen_rows), None)
    if missing is not None:
        _fail(f"missing row for category {missing!r}", f"{base_path}.rows")
    if len(rows) != len(categories):
        _fail("must contain exactly one row per category", f"{base_path}.rows")
    row_by_category = {row.category: row for row in rows}
    rows = [row_by_category[category] for category in categories]

    raw_domain = source.get("xDomain")
    x_domain = None
    if raw_domain is not None:
        if not isinstance(raw_domain, (list, tuple)) or len(raw_domain) != 2 or not all(_finite(value) for value in raw_domain) or raw_domain[0] >= raw_domain[1]:
            _fail("must be two strictly increasing finite numbers", f"{base_path}.xDomain")
        x_domain = (float(raw_domain[0]), float(raw_domain[1]))
        for row in rows:
            for definition in series:
                raw_value = row.values[definition.key]
                values = (raw_value,) if definition.mark == "point" else raw_value
                if any(value < x_domain[0] or value > x_domain[1] for value in values):
                    _fail("must fall within xDomain", f"{base_path}.rows[{row_source_index[row.category]}].values.{definition.key}")

    denominator = None
    raw_denominator = source.get("denominator")
    if raw_denominator is not None:
        item = _mapping(raw_denominator, f"{base_path}.denominator")
        value = item.get("value")
        if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
            _fail("must be a positive integer", f"{base_path}.denominator.value")
        denominator = IntervalDenominator(value, _text(item.get("label"), f"{base_path}.denominator.label"))
        for row in rows:
            for definition in series:
                raw_value = row.values[definition.key]
                values = (raw_value,) if definition.mark == "point" else raw_value
                if any(part < 0 or part > denominator.value for part in values):
                    _fail("must fall between zero and denominator", f"{base_path}.rows[{row_source_index[row.category]}].values.{definition.key}")

    return IntervalData(categories, tuple(series), tuple(rows), x_domain, denominator)


def _role_color(theme, definition: IntervalSeries) -> str:
    if definition.role == "context":
        return theme.secondary
    if definition.role == "observed":
        return theme.warm
    if definition.role == "summary":
        return theme.summary_core
    if definition.role == "primary":
        return theme.primary
    return theme.series[definition.color_index % len(theme.series)]


def _limits(data: IntervalData) -> tuple[float, float]:
    if data.x_domain is not None:
        return data.x_domain
    values: list[float] = []
    for row in data.rows:
        for definition in data.series:
            value = row.values[definition.key]
            values.extend([value] if definition.mark == "point" else value)
    low, high = min(values), max(values)
    span = high - low or max(abs(high), 1.0)
    return low - span * 0.08, high + span * 0.08


def interval_comparison(data, *, spec=None, theme="slipware", profile="deep_scope", ax=None):
    """Render ordered horizontal point and descriptive-interval comparisons."""
    normalized = normalize_interval_data(data)
    spec = spec or PlotSpec("Interval comparison")
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(ax, figsize=(8.8, 5.4))
    style_axes(ax, theme, profile, spec, atmosphere=False)
    positions = {category: index for index, category in enumerate(normalized.categories)}

    for definition in normalized.series:
        color = _role_color(theme, definition)
        if definition.mark == "interval":
            linewidth = 3.0 if definition.role == "primary" else 1.0 if definition.role == "context" else 1.7
            alpha = 0.62 if definition.role == "context" else 0.9
            for index, row in enumerate(normalized.rows):
                low, high = row.values[definition.key]
                y = positions[row.category]
                label = definition.label if index == 0 else "_nolegend_"
                ax.hlines(y, low, high, color=color, linewidth=linewidth, alpha=alpha, label=label, zorder=4)
                ax.vlines([low, high], y - 0.075, y + 0.075, color=color, linewidth=max(0.8, linewidth * 0.72), alpha=alpha, zorder=5)
        else:
            x = [row.values[definition.key] for row in normalized.rows]
            y = [positions[row.category] for row in normalized.rows]
            marker = "D" if definition.role == "observed" else "|" if definition.role == "summary" else "o"
            size = 54 if definition.role == "summary" else 31 if definition.role == "observed" else 28
            hollow = definition.role in {"reference", "context"}
            if definition.role == "summary":
                ax.scatter(x, y, marker=marker, s=size, c=color, linewidths=1.15,
                           alpha=0.96, label=definition.label, zorder=7)
            else:
                ax.scatter(x, y, marker=marker, s=size, facecolors="none" if hollow else color,
                           edgecolors=color, linewidths=1.15, alpha=0.96, label=definition.label, zorder=7)

    ax.set_xlim(*_limits(normalized))
    ax.set_ylim(-0.5, len(normalized.categories) - 0.5)
    ax.set_yticks(range(len(normalized.categories)), normalized.categories)
    ax.invert_yaxis()
    if normalized.denominator:
        ax.text(0.995, 1.015, f"{normalized.denominator.label}: {normalized.denominator.value}",
                transform=ax.transAxes, ha="right", va="bottom", color=theme.warm,
                fontsize=6.5, fontfamily="DejaVu Sans Mono")
    style_legend(ax, theme)
    add_note(ax, spec, theme)
    return fig, ax


INTERVAL_REGISTRATION = PlotRegistration(
    key="interval_comparison",
    renderer=interval_comparison,
    family="interval",
    cost="medium",
    enabled_by_default=False,
)

INTERVAL_PLOTS = MappingProxyType({INTERVAL_REGISTRATION.key: INTERVAL_REGISTRATION})
