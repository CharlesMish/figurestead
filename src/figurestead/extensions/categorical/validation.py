"""Validation shared by the Matplotlib renderer and contract builder."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any


RENDERERS = {"categorical_bar", "categorical_layered_bar"}


def _is_number(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def normalize_categorical_data(data: Mapping[str, Any], *, layered: bool = False) -> dict[str, Any]:
    """Return a JSON-safe normalized categorical data mapping."""
    if not isinstance(data, Mapping):
        raise ValueError("data must be a mapping")
    categories_value = data.get("categories")
    if not isinstance(categories_value, Sequence) or isinstance(categories_value, (str, bytes)) or not categories_value:
        raise ValueError("data.categories must be a non-empty sequence")
    categories: list[str] = []
    for index, item in enumerate(categories_value):
        if not isinstance(item, str) or not item.strip():
            raise ValueError(f"data.categories[{index}] must be a non-empty string")
        categories.append(item)
    if len(set(categories)) != len(categories):
        raise ValueError("data.categories must contain unique values")

    orientation = data.get("orientation", "vertical")
    if orientation not in {"horizontal", "vertical"}:
        raise ValueError("data.orientation must be 'horizontal' or 'vertical'")
    value_format = data.get("valueFormat", "number")
    if value_format not in {"number", "percent"}:
        raise ValueError("data.valueFormat must be 'number' or 'percent'")
    supplied_labels = data.get("categoryLabels", {})
    if not isinstance(supplied_labels, Mapping):
        raise ValueError("data.categoryLabels must be a mapping")
    category_labels: dict[str, str] = {}
    for category in categories:
        label = supplied_labels.get(category, category)
        if not isinstance(label, str) or not label.strip():
            raise ValueError(f"data.categoryLabels.{category} must be a non-empty string")
        category_labels[category] = label

    series_value = data.get("series")
    if not isinstance(series_value, Sequence) or isinstance(series_value, (str, bytes)) or not series_value:
        raise ValueError("data.series must be a non-empty sequence")
    if layered and len(series_value) < 2:
        raise ValueError("data.series must contain a base and at least one overlay")
    keys: set[str] = set()
    series = []
    for series_index, item in enumerate(series_value):
        if not isinstance(item, Mapping):
            raise ValueError(f"data.series[{series_index}] must be a mapping")
        key = item.get("key")
        if not isinstance(key, str) or not key.strip():
            raise ValueError(f"data.series[{series_index}].key must be a non-empty string")
        if key in keys:
            raise ValueError(f"data.series[{series_index}].key must be unique")
        keys.add(key)
        label = item.get("label", key)
        if not isinstance(label, str) or not label.strip():
            raise ValueError(f"data.series[{series_index}].label must be a non-empty string")
        values_value = item.get("values")
        if not isinstance(values_value, Sequence) or isinstance(values_value, (str, bytes)) or len(values_value) != len(categories):
            raise ValueError(f"data.series[{series_index}].values must contain exactly {len(categories)} items")
        values: list[float | None] = []
        for value_index, value in enumerate(values_value):
            if value is None:
                values.append(None)
            elif not _is_number(value) or value < 0:
                raise ValueError(f"data.series[{series_index}].values[{value_index}] must be null or a non-negative finite number")
            else:
                values.append(float(value))
        series.append({"key": key, "label": label, "values": values})

    domain_value = data.get("valueDomain")
    value_domain = None
    if domain_value is not None:
        if not isinstance(domain_value, Sequence) or isinstance(domain_value, (str, bytes)) or len(domain_value) != 2 or domain_value[0] != 0 or not _is_number(domain_value[1]) or domain_value[1] <= 0:
            raise ValueError("data.valueDomain must be [0, positive finite maximum]")
        value_domain = [0.0, float(domain_value[1])]
        if any(value is not None and value > value_domain[1] for item in series for value in item["values"]):
            raise ValueError("data.valueDomain must contain every series value")
    if value_format == "percent":
        for series_index, item in enumerate(series):
            for value_index, value in enumerate(item["values"]):
                if value is not None and value > 1:
                    raise ValueError(f"data.series[{series_index}].values[{value_index}] must be no greater than 1 for percent formatting")
        if value_domain and value_domain[1] > 1:
            raise ValueError("data.valueDomain maximum must be no greater than 1 for percent formatting")

    if layered:
        base = series[0]["values"]
        for series_index, overlay in enumerate(series[1:], 1):
            for value_index, value in enumerate(overlay["values"]):
                if value is not None and (base[value_index] is None or value > base[value_index]):
                    raise ValueError(f"data.series[{series_index}].values[{value_index}] must be null or no greater than the base value")

    return {
        "categories": categories,
        "categoryLabels": category_labels,
        "orientation": orientation,
        "series": series,
        "valueDomain": value_domain,
        "valueFormat": value_format,
    }
