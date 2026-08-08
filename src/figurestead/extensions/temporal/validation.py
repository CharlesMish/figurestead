"""Shared semantic validation for the temporal Matplotlib extension."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date
import math
from numbers import Real
import re


PROVISIONAL_STATUS = "provisional_project_constant"
PROVISIONAL_LABEL = "Provisional project constant; not a regulatory threshold"
DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _vector(values, path: str, *, allow_empty: bool = False) -> tuple:
    if isinstance(values, (str, bytes, Mapping)) or not isinstance(values, Iterable):
        raise ValueError(f"{path} must be a {'date ' if path == 'dates' else ''}sequence")
    normalized = tuple(values)
    if not allow_empty and not normalized:
        raise ValueError(f"{path} must be a non-empty {'date ' if path == 'dates' else ''}sequence")
    return normalized


def normalize_dates(values, path: str = "dates") -> tuple[str, ...]:
    values = _vector(values, path)
    if not values:
        raise ValueError(f"{path} must be a non-empty date sequence")
    normalized = []
    for index, value in enumerate(values):
        if not isinstance(value, str) or not DATE_ONLY.fullmatch(value):
            raise ValueError(f"{path}[{index}] must be a UTC date in YYYY-MM-DD form")
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise ValueError(f"{path}[{index}] must be a valid calendar date") from exc
        if parsed.isoformat() != value:
            raise ValueError(f"{path}[{index}] must be a canonical calendar date")
        normalized.append(parsed.isoformat())
    return tuple(normalized)


def normalize_site_order(values, path: str = "site_order") -> tuple[str, ...]:
    supplied = _vector(values, path)
    for index, value in enumerate(supplied):
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{path}[{index}] must be a non-empty string")
    normalized = tuple(str(value) for value in supplied)
    if len(set(normalized)) != len(normalized):
        raise ValueError(f"{path} must contain unique sites")
    return normalized


def normalize_sites(values, length: int, site_order, path: str = "sites") -> tuple[str, ...]:
    supplied = _vector(values, path, allow_empty=True)
    if len(supplied) != length:
        raise ValueError(f"{path} must contain exactly {length} items")
    normalized = []
    for index, value in enumerate(supplied):
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{path}[{index}] must be a non-empty string")
        name = str(value)
        if name not in site_order:
            raise ValueError(f"{path}[{index}] contains unknown site {value!r}")
        normalized.append(name)
    return tuple(normalized)


def normalize_values(values, length: int, path: str = "values") -> tuple[float, ...]:
    values = _vector(values, path, allow_empty=True)
    if len(values) != length:
        raise ValueError(f"{path} must contain exactly {length} items")
    normalized = []
    for index, value in enumerate(values):
        if isinstance(value, (bool, str, bytes)) or not isinstance(value, Real) or not math.isfinite(float(value)):
            raise ValueError(f"{path}[{index}] must be a finite number")
        normalized.append(float(value))
    return tuple(normalized)


def normalize_reference_bands(values, path: str = "reference_bands") -> tuple[dict, ...]:
    if values is None:
        return ()
    values = _vector(values, path, allow_empty=True)
    normalized = []
    for index, item in enumerate(values):
        item_path = f"{path}[{index}]"
        if not isinstance(item, Mapping):
            raise ValueError(f"{item_path} must be a mapping")
        if item.get("type", "reference_band") != "reference_band":
            raise ValueError(f"{item_path}.type must be reference_band")
        lower, upper = item.get("from"), item.get("to")
        if any(isinstance(v, (bool, str, bytes)) or not isinstance(v, Real) or not math.isfinite(float(v)) for v in (lower, upper)):
            raise ValueError(f"{item_path}.from and .to must be finite numbers")
        if lower >= upper:
            raise ValueError(f"{item_path}.from must be less than .to")
        label = item.get("label")
        if not isinstance(label, str) or not label.strip():
            raise ValueError(f"{item_path}.label must be a non-empty string")
        if item.get("status") != PROVISIONAL_STATUS:
            raise ValueError(f"{item_path}.status must be {PROVISIONAL_STATUS!r}")
        normalized.append({"type": "reference_band", "from": float(lower), "to": float(upper), "label": str(label), "status": PROVISIONAL_STATUS})
    for index, band in enumerate(normalized[1:], start=1):
        if band["from"] < normalized[index - 1]["to"]:
            raise ValueError(f"{path}[{index}] overlaps or is out of order")
    return tuple(normalized)


def validate_temporal_vectors(dates, sites, site_order, values=None):
    normalized_dates = normalize_dates(dates)
    normalized_order = normalize_site_order(site_order)
    normalized_sites = normalize_sites(sites, len(normalized_dates), normalized_order)
    normalized_values = None if values is None else normalize_values(values, len(normalized_dates))
    return normalized_dates, normalized_sites, normalized_order, normalized_values
