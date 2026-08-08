"""Strict records and CSV ingress for existing portable contracts.

This module deliberately performs no inference, coercion, aggregation, sorting,
interpolation, or imputation.  Validation completes before ``export_contract``
is called so rejected input cannot produce partial Figurestead evidence.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import csv
import math
import os
from pathlib import Path
import re
from typing import Any

from figurestead import portable


_CSV_NUMBER = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$")


class TabularIngressError(ValueError):
    """Raised when tabular input cannot be converted without ambiguity."""


def _error(path: str, message: str) -> TabularIngressError:
    return TabularIngressError(f"{path}: {message}")


def _column_name(value: Any, argument: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise _error(argument, "must be a nonblank column-name string")
    return value


def _validate_dataframe_columns(source: Any) -> None:
    try:
        columns = source.columns
    except AttributeError:
        return
    except Exception as exc:
        raise _error("header", f"DataFrame-like column metadata could not be read: {exc}") from exc
    if isinstance(columns, (str, bytes, bytearray)):
        raise _error("header", "DataFrame-like columns must be an iterable of unique labels")
    try:
        labels = list(columns)
    except TypeError as exc:
        raise _error("header", "DataFrame-like columns must be an iterable of unique labels") from exc
    seen: set[Any] = set()
    for index, label in enumerate(labels):
        try:
            duplicate = label in seen
            seen.add(label)
        except TypeError as exc:
            raise _error(f"header[{index}]", "DataFrame-like column labels must be hashable") from exc
        if duplicate:
            path = f"header.{label}" if isinstance(label, str) and label else f"header[{index}]"
            raise _error(path, "duplicate column name")


def _record_rows(source: Any, required: set[str]) -> list[dict[str, Any]]:
    if isinstance(source, (str, bytes, bytearray, Mapping)):
        raise _error("source", "must be a non-string sequence of mappings or DataFrame-like object")
    if hasattr(source, "to_dict"):
        _validate_dataframe_columns(source)
        try:
            source = source.to_dict(orient="records")
        except Exception as exc:  # the foreign object owns the concrete failure
            raise _error("source", f"to_dict(orient='records') failed: {exc}") from exc
    if not isinstance(source, Sequence) or isinstance(source, (str, bytes, bytearray)):
        raise _error("source", "must be a non-string sequence of mappings or DataFrame-like object")
    rows: list[dict[str, Any]] = []
    for index, row in enumerate(source, 1):
        if not isinstance(row, Mapping):
            raise _error(f"row {index}", "must be a mapping")
        copied = dict(row)
        missing = sorted(required - copied.keys())
        if missing:
            raise _error(f"row {index}.{missing[0]}", "required column is missing")
        rows.append(copied)
    if not rows:
        raise _error("source", "must contain at least one data row")
    return rows


def _reject_url(value: str) -> None:
    if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*://", value):
        raise _error("source", "network URLs are not accepted")


def _csv_text(source: Any) -> str:
    if isinstance(source, str):
        _reject_url(source)
        if "\n" in source or "\r" in source:
            raise _error("source", "inline CSV strings are not accepted; use a path or text stream")
        path = Path(source)
        try:
            return path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            raise _error("source", f"CSV path could not be read: {exc}") from exc
    if isinstance(source, os.PathLike):
        path = Path(source)
        try:
            return path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            raise _error("source", f"CSV path could not be read: {exc}") from exc
    if isinstance(source, (bytes, bytearray)):
        raise _error("source", "binary CSV input is not accepted")
    reader = getattr(source, "read", None)
    if not callable(reader):
        raise _error("source", "must be a filesystem path or readable text stream")
    try:
        text = reader()
    except Exception as exc:
        raise _error("source", f"text stream could not be read: {exc}") from exc
    if not isinstance(text, str):
        raise _error("source", "binary streams are not accepted")
    return text


def _csv_rows(source: Any, required: set[str]) -> list[dict[str, str]]:
    text = _csv_text(source)
    try:
        parsed = list(csv.reader(text.splitlines(), strict=True))
    except csv.Error as exc:
        raise _error("source", f"malformed CSV: {exc}") from exc
    if not parsed:
        raise _error("header", "CSV header is required")
    header = parsed[0]
    if not header:
        raise _error("header", "CSV header is required")
    seen: set[str] = set()
    for name in header:
        if not name:
            raise _error("header", "column names must be nonblank")
        if name in seen:
            raise _error(f"header.{name}", "duplicate column name")
        seen.add(name)
    missing = sorted(required - seen)
    if missing:
        raise _error(f"header.{missing[0]}", "required column is missing")
    rows: list[dict[str, str]] = []
    for index, values in enumerate(parsed[1:], 1):
        if len(values) != len(header):
            raise _error(f"row {index}", f"expected {len(header)} columns, found {len(values)}")
        rows.append(dict(zip(header, values, strict=True)))
    if not rows:
        raise _error("source", "must contain at least one data row")
    return rows


def _record_number(row: Mapping[str, Any], row_index: int, column: str) -> float:
    value = row[column]
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise _error(f"row {row_index}.{column}", "must be a finite int or float (bool and numeric strings are rejected)")
    return float(value)


def _csv_number(row: Mapping[str, str], row_index: int, column: str) -> float:
    value = row[column]
    if value != value.strip() or not _CSV_NUMBER.fullmatch(value):
        raise _error(f"row {row_index}.{column}", "must exactly match the finite CSV numeric grammar")
    result = float(value)
    if not math.isfinite(result):
        raise _error(f"row {row_index}.{column}", "must parse to a finite number")
    return result


def _category(row: Mapping[str, Any], row_index: int, column: str) -> str:
    value = row[column]
    if not isinstance(value, str) or not value.strip():
        raise _error(f"row {row_index}.{column}", "must be a nonblank string")
    return value


def _numeric_order(value: Any, argument: str) -> list[float]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)) or not value:
        raise _error(argument, "must be a nonempty sequence of unique finite numbers")
    result: list[float] = []
    for index, item in enumerate(value):
        if isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(item):
            raise _error(f"{argument}[{index}]", "must be a finite number")
        number = float(item)
        if number in result:
            raise _error(f"{argument}[{index}]", "duplicate order member")
        result.append(number)
    return result


def _string_order(value: Any, argument: str) -> list[str]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)) or not value:
        raise _error(argument, "must be a nonempty sequence of unique nonblank strings")
    result: list[str] = []
    for index, item in enumerate(value):
        if not isinstance(item, str) or not item.strip():
            raise _error(f"{argument}[{index}]", "must be a nonblank string")
        if item in result:
            raise _error(f"{argument}[{index}]", "duplicate order member")
        result.append(item)
    return result


def _domain(value: Any, argument: str) -> list[float] | None:
    if value is None:
        return None
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)) or len(value) != 2:
        raise _error(argument, "must contain exactly two finite increasing numbers")
    result = []
    for index, item in enumerate(value):
        if isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(item):
            raise _error(f"{argument}[{index}]", "must be a finite number")
        result.append(float(item))
    if result[0] >= result[1]:
        raise _error(argument, "must be strictly increasing")
    return result


def _require_members(observed: list[Any], order: list[Any], argument: str, column: str) -> None:
    unknown = [item for item in observed if item not in order]
    if unknown:
        raise _error(column, f"observed member {unknown[0]!r} is absent from {argument}")
    extras = [item for item in order if item not in observed]
    if extras:
        raise _error(argument, f"member {extras[0]!r} is not observed")


def _common_columns(*values: tuple[Any, str]) -> set[str]:
    return {_column_name(value, argument) for value, argument in values}


def _line(rows: list[Mapping[str, Any]], *, numeric, spec, x: str, series: str,
          value: str, x_order, series_order, x_domain, y_domain, reveal_order,
          theme, profile, timeline, motion, application_profile):
    x_values = _numeric_order(x_order, "x_order")
    series_values = _string_order(series_order, "series_order")
    if reveal_order not in {"random", "x"}:
        raise _error("reveal_order", "must be 'random' or 'x'")
    cells: dict[tuple[float, str], float] = {}
    observed_x: list[float] = []
    observed_series: list[str] = []
    for index, row in enumerate(rows, 1):
        row_x = numeric(row, index, x)
        row_series = _category(row, index, series)
        row_value = numeric(row, index, value)
        if row_x not in observed_x:
            observed_x.append(row_x)
        if row_series not in observed_series:
            observed_series.append(row_series)
        cell = (row_x, row_series)
        if cell in cells:
            raise _error(f"row {index}.{value}", f"duplicate line cell for x={row_x!r}, series={row_series!r}")
        cells[cell] = row_value
    _require_members(observed_x, x_values, "x_order", x)
    _require_members(observed_series, series_values, "series_order", series)
    missing = [(row_x, row_series) for row_x in x_values for row_series in series_values if (row_x, row_series) not in cells]
    if missing:
        raise _error("data", f"incomplete line grid; missing x={missing[0][0]!r}, series={missing[0][1]!r}")
    data: dict[str, Any] = {
        "x": x_values,
        "series": [{"key": key, "label": key, "y": [cells[(row_x, key)] for row_x in x_values]} for key in series_values],
        "revealOrder": reveal_order,
    }
    if (domain := _domain(x_domain, "x_domain")) is not None:
        data["xDomain"] = domain
    if (domain := _domain(y_domain, "y_domain")) is not None:
        data["yDomain"] = domain
    return portable.export_contract(renderer="line", spec=spec, data=data, theme=theme,
                                    profile=profile, timeline=timeline, motion=motion,
                                    application_profile=application_profile)


def _scatter(rows: list[Mapping[str, Any]], *, numeric, spec, x: str, y: str,
             series: str | None, x_domain, y_domain, summary, theme, profile,
             timeline, motion, application_profile):
    if series is not None:
        _column_name(series, "series")
    xs, ys, identities = [], [], []
    for index, row in enumerate(rows, 1):
        xs.append(numeric(row, index, x))
        ys.append(numeric(row, index, y))
        identities.append(_category(row, index, series) if series is not None else "series")
    labels = {key: key for key in dict.fromkeys(identities)}
    data: dict[str, Any] = {"x": xs, "y": ys, "series": identities, "seriesLabels": labels}
    if summary is not None:
        data["summary"] = summary
    if (domain := _domain(x_domain, "x_domain")) is not None:
        data["xDomain"] = domain
    if (domain := _domain(y_domain, "y_domain")) is not None:
        data["yDomain"] = domain
    return portable.export_contract(renderer="scatter", spec=spec, data=data, theme=theme,
                                    profile=profile, timeline=timeline, motion=motion,
                                    application_profile=application_profile)


def _strip(rows: list[Mapping[str, Any]], *, numeric, spec, value: str, group: str,
           group_order, series: str | None, summary, y_domain, theme, profile,
           timeline, motion, application_profile):
    groups = _string_order(group_order, "group_order")
    if series is not None:
        _column_name(series, "series")
    values, assignments, identities = [], [], []
    for index, row in enumerate(rows, 1):
        values.append(numeric(row, index, value))
        assignments.append(_category(row, index, group))
        identities.append(_category(row, index, series) if series is not None else "series")
    _require_members(list(dict.fromkeys(assignments)), groups, "group_order", group)
    labels = {key: key for key in dict.fromkeys(identities)}
    data: dict[str, Any] = {
        "values": values, "groups": groups, "group": assignments,
        "series": identities, "seriesLabels": labels,
    }
    if summary is not None:
        data["summary"] = summary
    if (domain := _domain(y_domain, "y_domain")) is not None:
        data["yDomain"] = domain
    return portable.export_contract(renderer="strip_summary", spec=spec, data=data,
                                    theme=theme, profile=profile, timeline=timeline,
                                    motion=motion, application_profile=application_profile)


def line_from_records(records_or_dataframe_like, *, spec, x, series, value,
                      x_order, series_order, x_domain=None, y_domain=None,
                      reveal_order="random", theme="slipware",
                      profile="deep_scope", timeline=None, motion=None,
                      application_profile="atlas"):
    required = _common_columns((x, "x"), (series, "series"), (value, "value"))
    rows = _record_rows(records_or_dataframe_like, required)
    return _line(rows, numeric=_record_number, spec=spec, x=x, series=series,
                 value=value, x_order=x_order, series_order=series_order,
                 x_domain=x_domain, y_domain=y_domain, reveal_order=reveal_order,
                 theme=theme, profile=profile, timeline=timeline, motion=motion,
                 application_profile=application_profile)


def line_from_csv(source, *, spec, x, series, value, x_order, series_order,
                  x_domain=None, y_domain=None, reveal_order="random",
                  theme="slipware", profile="deep_scope", timeline=None,
                  motion=None, application_profile="atlas"):
    required = _common_columns((x, "x"), (series, "series"), (value, "value"))
    rows = _csv_rows(source, required)
    return _line(rows, numeric=_csv_number, spec=spec, x=x, series=series,
                 value=value, x_order=x_order, series_order=series_order,
                 x_domain=x_domain, y_domain=y_domain, reveal_order=reveal_order,
                 theme=theme, profile=profile, timeline=timeline, motion=motion,
                 application_profile=application_profile)


def scatter_from_records(records_or_dataframe_like, *, spec, x, y, series=None,
                         x_domain=None, y_domain=None, summary=None,
                         theme="slipware", profile="deep_scope", timeline=None,
                         motion=None, application_profile="atlas"):
    required = _common_columns((x, "x"), (y, "y"), *((series, "series"),) if series is not None else ())
    rows = _record_rows(records_or_dataframe_like, required)
    return _scatter(rows, numeric=_record_number, spec=spec, x=x, y=y,
                    series=series, x_domain=x_domain, y_domain=y_domain,
                    summary=summary, theme=theme, profile=profile,
                    timeline=timeline, motion=motion,
                    application_profile=application_profile)


def scatter_from_csv(source, *, spec, x, y, series=None, x_domain=None,
                     y_domain=None, summary=None, theme="slipware",
                     profile="deep_scope", timeline=None, motion=None,
                     application_profile="atlas"):
    required = _common_columns((x, "x"), (y, "y"), *((series, "series"),) if series is not None else ())
    rows = _csv_rows(source, required)
    return _scatter(rows, numeric=_csv_number, spec=spec, x=x, y=y,
                    series=series, x_domain=x_domain, y_domain=y_domain,
                    summary=summary, theme=theme, profile=profile,
                    timeline=timeline, motion=motion,
                    application_profile=application_profile)


def strip_from_records(records_or_dataframe_like, *, spec, value, group,
                       group_order, series=None, summary=None, y_domain=None,
                       theme="slipware", profile="deep_scope", timeline=None,
                       motion=None, application_profile="atlas"):
    required = _common_columns((value, "value"), (group, "group"), *((series, "series"),) if series is not None else ())
    rows = _record_rows(records_or_dataframe_like, required)
    return _strip(rows, numeric=_record_number, spec=spec, value=value,
                  group=group, group_order=group_order, series=series,
                  summary=summary, y_domain=y_domain, theme=theme,
                  profile=profile, timeline=timeline, motion=motion,
                  application_profile=application_profile)


def strip_from_csv(source, *, spec, value, group, group_order, series=None,
                   summary=None, y_domain=None, theme="slipware",
                   profile="deep_scope", timeline=None, motion=None,
                   application_profile="atlas"):
    required = _common_columns((value, "value"), (group, "group"), *((series, "series"),) if series is not None else ())
    rows = _csv_rows(source, required)
    return _strip(rows, numeric=_csv_number, spec=spec, value=value,
                  group=group, group_order=group_order, series=series,
                  summary=summary, y_domain=y_domain, theme=theme,
                  profile=profile, timeline=timeline, motion=motion,
                  application_profile=application_profile)
