"""Versioned portable contract shared by Figurestead renderers.

The Python dataclasses remain canonical. This module serializes their semantic
values for other backends without exporting any Matplotlib geometry or drawing
implementation.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict
import json
import math
from pathlib import Path
from typing import Any, Mapping

from .core import PlotSpec
from .motion import MotionStyle, MotionTimeline
from .profiles import Profile, get_profile
from .themes import Theme, get_theme
from .application import ApplicationProfile, apply_application_profile


PORTABLE_SCHEMA_VERSION = "0.4"
RENDERER_API_VERSION = "1"
PORTABLE_RENDERERS = ("line", "scatter", "strip_summary")


class PortableContractError(ValueError):
    """Raised when a portable contract cannot be exported honestly."""


def _camel(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(part.title() for part in tail)


def _portable_dataclass(value) -> dict[str, Any]:
    data = {_camel(key): item for key, item in asdict(value).items() if item is not None}
    return json.loads(json.dumps(data))


def _as_spec(spec: PlotSpec | Mapping[str, Any]) -> dict[str, Any]:
    if isinstance(spec, PlotSpec):
        return {
            "title": spec.title,
            "subtitle": spec.subtitle,
            "xLabel": spec.xlabel,
            "yLabel": spec.ylabel,
            "note": spec.note,
            "signature": spec.signature,
        }
    if not isinstance(spec, Mapping):
        raise PortableContractError("spec must be a PlotSpec or mapping")
    normalized = dict(spec)
    if "xlabel" in normalized and "xLabel" not in normalized:
        normalized["xLabel"] = normalized.pop("xlabel")
    if "ylabel" in normalized and "yLabel" not in normalized:
        normalized["yLabel"] = normalized.pop("ylabel")
    if "sub" in normalized and "subtitle" not in normalized:
        normalized["subtitle"] = normalized.pop("sub")
    if "title" not in normalized or not str(normalized["title"]).strip():
        raise PortableContractError("spec.title is required")
    return normalized


def _numeric_sequence(data: Mapping[str, Any], key: str) -> list[float]:
    value = data.get(key)
    if not isinstance(value, (list, tuple)) or not value:
        raise PortableContractError(f"data.{key} must be a non-empty array")
    if any(isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(item) for item in value):
        raise PortableContractError(f"data.{key} must contain only finite numbers")
    return [float(item) for item in value]


def _optional_domain(data: Mapping[str, Any], key: str) -> None:
    if key not in data or data[key] is None:
        return
    domain = data[key]
    if not isinstance(domain, (list, tuple)) or len(domain) != 2:
        raise PortableContractError(f"data.{key} must contain exactly two numbers")
    if any(isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(item) for item in domain):
        raise PortableContractError(f"data.{key} must contain exactly two numbers")
    if domain[0] >= domain[1]:
        raise PortableContractError(f"data.{key} must be strictly increasing")


def _validate_data(renderer: str, data: Mapping[str, Any]) -> dict[str, Any]:
    if not isinstance(data, Mapping):
        raise PortableContractError("data must be a mapping")
    normalized = json.loads(json.dumps(data))
    _optional_domain(normalized, "xDomain")
    _optional_domain(normalized, "yDomain")

    if renderer == "line":
        x = _numeric_sequence(normalized, "x")
        series = normalized.get("series")
        if not isinstance(series, list) or not series:
            raise PortableContractError("data.series must be a non-empty array")
        keys: set[str] = set()
        for index, item in enumerate(series):
            if not isinstance(item, Mapping):
                raise PortableContractError(f"data.series[{index}] must be an object")
            key = str(item.get("key", "")).strip()
            if not key or key in keys:
                raise PortableContractError("line series keys must be non-empty and unique")
            keys.add(key)
            y = item.get("y")
            if not isinstance(y, list) or len(y) != len(x):
                raise PortableContractError(f"data.series[{index}].y must match data.x length")
            if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in y):
                raise PortableContractError(f"data.series[{index}].y must contain only numbers")
        reveal = normalized.get("revealOrder", "random")
        if reveal not in {"random", "x"}:
            raise PortableContractError("line data.revealOrder must be 'random' or 'x'")
        if reveal == "x" and any(a > b for a, b in zip(x, x[1:])):
            raise PortableContractError("line revealOrder 'x' requires nondecreasing x values")

    elif renderer == "scatter":
        x = _numeric_sequence(normalized, "x")
        y = _numeric_sequence(normalized, "y")
        if len(x) != len(y):
            raise PortableContractError("scatter data.x and data.y lengths must match")
        series = normalized.get("series")
        if series is not None and (not isinstance(series, list) or len(series) != len(x)):
            raise PortableContractError("scatter data.series must match data.x length")
        summary = normalized.get("summary")
        if summary not in {None, "linear_fit"}:
            raise PortableContractError("scatter data.summary must be null or 'linear_fit'")

    else:
        values = _numeric_sequence(normalized, "values")
        categories = normalized.get("groups")
        assignments = normalized.get("group")
        if not isinstance(categories, list) or not categories:
            raise PortableContractError("strip data.groups must be a non-empty category-order array")
        if len({str(value) for value in categories}) != len(categories):
            raise PortableContractError("strip data.groups must contain unique categories")
        if not isinstance(assignments, list) or len(assignments) != len(values):
            raise PortableContractError("strip data.group must match data.values length")
        unknown = sorted({str(value) for value in assignments} - {str(value) for value in categories})
        if unknown:
            raise PortableContractError(f"strip data.group contains unknown categories: {unknown}")
        series = normalized.get("series")
        if series is not None and (not isinstance(series, list) or len(series) != len(values)):
            raise PortableContractError("strip data.series must match data.values length")
        summary = normalized.get("summary")
        if summary not in {None, "median"}:
            raise PortableContractError("strip data.summary must be null or 'median'")
    return normalized


def export_contract(
    *,
    renderer: str,
    spec: PlotSpec | Mapping[str, Any],
    data: Mapping[str, Any],
    theme: str | Theme = "slipware",
    profile: str | Profile = "deep_scope",
    timeline: MotionTimeline | None = None,
    motion: MotionStyle | None = None,
    application_profile: str | ApplicationProfile = "atlas",
) -> dict[str, Any]:
    """Export one backend-neutral contract for a supported web renderer."""
    if renderer not in PORTABLE_RENDERERS:
        choices = ", ".join(PORTABLE_RENDERERS)
        raise PortableContractError(f"unsupported portable renderer {renderer!r}; choose: {choices}")
    theme_value = get_theme(theme)
    profile_value = get_profile(profile)
    timeline_value = timeline or MotionTimeline()
    motion_value = motion or MotionStyle()

    theme_data = _portable_dataclass(theme_value)
    theme_data["series"] = list(theme_value.series)
    profile_data = _portable_dataclass(profile_value)
    timeline_data = _portable_dataclass(timeline_value)
    motion_data = _portable_dataclass(motion_value)
    motion_data["durationMs"] = round(motion_value.frames / motion_value.fps * 1000)

    scale_type = "band" if renderer == "strip_summary" else "linear"
    contract = {
        "schemaVersion": PORTABLE_SCHEMA_VERSION,
        "rendererApiVersion": RENDERER_API_VERSION,
        "theme": theme_data,
        "profile": profile_data,
        "timeline": timeline_data,
        "motion": motion_data,
        "spec": _as_spec(spec),
        "layout": {"type": "grid", "columns": 1, "gap": 22, "sharedX": False, "sharedY": False},
        "panels": [{
            "id": "panel-1", "renderer": renderer, "spec": {},
            "xScale": {"type": scale_type}, "yScale": {"type": "linear"},
            "annotations": [], "encoding": {"interpolation": "linear"}, "data": _validate_data(renderer, data),
        }],
    }
    return apply_application_profile(contract, application_profile)


def export_figure(
    *, spec: PlotSpec | Mapping[str, Any], panels: list[Mapping[str, Any]],
    layout: Mapping[str, Any] | None = None, theme: str | Theme = "slipware",
    profile: str | Profile = "deep_scope", timeline: MotionTimeline | None = None,
    motion: MotionStyle | None = None,
    application_profile: str | ApplicationProfile = "atlas",
) -> dict[str, Any]:
    """Export a multi-panel semantic figure without backend geometry."""
    if not isinstance(panels, list) or not panels:
        raise PortableContractError("panels must be a non-empty list")
    first_panel = panels[0]
    if not isinstance(first_panel, Mapping) or "renderer" not in first_panel or "data" not in first_panel:
        raise PortableContractError("panels[0] must contain renderer and data")
    figure = export_contract(renderer=str(first_panel["renderer"]), spec=spec, data=first_panel["data"], theme=theme, profile=profile, timeline=timeline, motion=motion, application_profile=application_profile)
    normalized_panels = []
    for index, panel in enumerate(panels):
        if not isinstance(panel, Mapping):
            raise PortableContractError(f"panels[{index}] must be a mapping")
        renderer = str(panel.get("renderer", ""))
        if renderer not in PORTABLE_RENDERERS:
            raise PortableContractError(f"unsupported portable renderer {renderer!r}")
        if "data" not in panel:
            raise PortableContractError(f"panels[{index}].data is required")
        normalized_panels.append({
            "id": str(panel.get("id", f"panel-{index + 1}")), "renderer": renderer,
            "spec": dict(panel.get("spec", {})),
            "xScale": dict(panel.get("xScale", {"type": "band" if renderer == "strip_summary" else "linear"})),
            "yScale": dict(panel.get("yScale", {"type": "linear"})),
            "annotations": list(panel.get("annotations", [])),
            "encoding": dict(panel.get("encoding", {"interpolation": "linear"})),
            "data": _validate_data(renderer, panel["data"]),
            **({"presentation": dict(panel["presentation"])} if panel.get("presentation") is not None else {}),
        })
    figure["panels"] = normalized_panels
    figure["layout"] = {"type": "grid", "columns": 1, "gap": 22, "sharedX": False, "sharedY": False, **dict(layout or {})}
    return apply_application_profile(figure, application_profile)


def portable_schema() -> dict[str, Any]:
    """Return the canonical generated JSON Schema for browser contracts."""
    number_array = {"type": "array", "minItems": 1, "items": {"type": "number"}}
    domain = {
        "type": "array", "minItems": 2, "maxItems": 2,
        "items": {"type": "number"},
    }
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://figurestead.local/schema/contract-0.4.json",
        "title": "Figurestead portable contract",
        "type": "object",
        "additionalProperties": False,
        "required": ["schemaVersion", "rendererApiVersion", "theme", "profile", "timeline", "motion", "spec", "layout", "view", "panels"],
        "properties": {
            "schemaVersion": {"const": PORTABLE_SCHEMA_VERSION},
            "rendererApiVersion": {"const": RENDERER_API_VERSION},
            "theme": {"$ref": "#/$defs/theme"},
            "profile": {"$ref": "#/$defs/profile"},
            "timeline": {"$ref": "#/$defs/timeline"},
            "motion": {"$ref": "#/$defs/motion"},
            "spec": {"$ref": "#/$defs/spec"},
            "layout": {"$ref": "#/$defs/layout"},
            "view": {"$ref": "#/$defs/view"},
            "panels": {"type": "array", "minItems": 1, "items": {"$ref": "#/$defs/panel"}},
        },
        "$defs": {
            "color": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$"},
            "window": {"type": "array", "minItems": 2, "maxItems": 2, "items": {"type": "number", "minimum": 0, "maximum": 1}},
            "domain": domain,
            "theme": {
                "type": "object",
                "required": ["key", "name", "field", "panel", "grid", "spine", "label", "secondary", "faint", "primary", "summaryCore", "warm", "series"],
                "properties": {
                    **{key: {"$ref": "#/$defs/color"} for key in ("field", "panel", "grid", "spine", "label", "secondary", "faint", "primary", "summaryCore", "warm")},
                    "key": {"type": "string"}, "name": {"type": "string"},
                    "series": {"type": "array", "minItems": 1, "items": {"$ref": "#/$defs/color"}},
                    "primaryEdge": {"$ref": "#/$defs/color"},
                    "summaryEdge": {"$ref": "#/$defs/color"},
                    "seriesEdges": {"type": "array", "minItems": 1, "items": {"$ref": "#/$defs/color"}},
                },
            },
            "profile": {
                "type": "object",
                "required": ["key", "name", "marker", "markerSize", "markerAlpha", "edgeWidth", "coreFraction", "pointGlow", "gridX", "gridY", "gridAlpha", "summaryGlow"],
                "properties": {
                    "key": {"type": "string"}, "name": {"type": "string"}, "marker": {"type": "string"},
                    "markerSize": {"type": "number"}, "markerAlpha": {"type": "number"}, "edgeWidth": {"type": "number"}, "coreFraction": {"type": "number"},
                    "pointGlow": {"type": "boolean"}, "gridX": {"type": "boolean"}, "gridY": {"type": "boolean"}, "gridAlpha": {"type": "number"},
                    "rainDensity": {"type": "integer"}, "rainAlpha": {"type": "number"}, "summaryGlow": {"type": "boolean"},
                    "titleFamily": {"type": "string"}, "uppercaseTitle": {"type": "boolean"},
                },
            },
            "timeline": {
                "type": "object", "required": ["rainIn", "marksEnter", "summaryCompiles", "rainOut", "settle"],
                "properties": {key: {"$ref": "#/$defs/window"} for key in ("rainIn", "marksEnter", "summaryCompiles", "rainOut", "settle")},
            },
            "motion": {
                "type": "object", "required": ["frames", "fps", "durationMs", "rainStreams", "rainGlyphs", "lightingPeak", "trailAlpha", "seed"],
                "properties": {
                    "frames": {"type": "integer", "minimum": 1}, "fps": {"type": "integer", "minimum": 1}, "durationMs": {"type": "number", "exclusiveMinimum": 0},
                    "rainStreams": {"type": "integer", "minimum": 0}, "rainGlyphs": {"type": "integer", "minimum": 0},
                    "lightingPeak": {"type": "number", "minimum": 0}, "trailAlpha": {"type": "number", "minimum": 0}, "seed": {"type": "integer"},
                },
            },
            "spec": {
                "type": "object", "required": ["title"],
                "properties": {key: {"type": "string"} for key in ("title", "subtitle", "xLabel", "yLabel", "note", "signature", "description")},
            },
            "scale": {
                "type": "object", "required": ["type"],
                "properties": {
                    "type": {"enum": ["linear", "time", "band"]}, "domain": {"type": "array"},
                    "label": {"type": "string"}, "nice": {"type": "boolean"}, "padding": {"type": "number"},
                },
            },
            "layout": {
                "type": "object", "required": ["type", "columns", "gap", "sharedX", "sharedY"],
                "properties": {
                    "type": {"const": "grid"}, "columns": {"type": "integer", "minimum": 1},
                    "gap": {"type": "number", "minimum": 0}, "sharedX": {"type": "boolean"}, "sharedY": {"type": "boolean"},
                },
            },
            "view": {
                "type": "object", "additionalProperties": False,
                "required": ["profile", "motion", "ambient", "strategy"],
                "properties": {
                    "profile": {"enum": ["paper", "atlas", "talk"]},
                    "motion": {"enum": ["none", "semantic", "legacy"]},
                    "ambient": {"enum": ["none", "matrix"]},
                    "strategy": {"enum": ["auto", "none", "reveal", "points_then_connect", "bar_grow", "matrix_illuminate"]},
                },
            },
            "panel": {
                "type": "object", "additionalProperties": False,
                "required": ["id", "renderer", "spec", "xScale", "yScale", "annotations", "data"],
                "properties": {
                    "id": {"type": "string"}, "renderer": {"type": "string", "minLength": 1},
                    "spec": {"type": "object"}, "xScale": {"$ref": "#/$defs/scale"}, "yScale": {"$ref": "#/$defs/scale"},
                    "annotations": {"type": "array"}, "data": {"type": "object"},
                    "presentation": {"$ref": "#/$defs/presentation"},
                    "encoding": {"$ref": "#/$defs/encoding"},
                },
                "allOf": [
                    {"if": {"properties": {"renderer": {"const": "line"}}}, "then": {"properties": {"data": {"$ref": "#/$defs/lineData"}}}},
                    {"if": {"properties": {"renderer": {"const": "scatter"}}}, "then": {"properties": {"data": {"$ref": "#/$defs/scatterData"}}}},
                    {"if": {"properties": {"renderer": {"const": "strip_summary"}}}, "then": {"properties": {"data": {"$ref": "#/$defs/stripData"}}}},
                ],
            },
            "presentation": {
                "type": "object", "additionalProperties": False,
                "properties": {
                    "panelSurface": {"type": "boolean"}, "frame": {"type": "boolean"},
                    "curve": {"enum": ["linear", "monotone"]},
                    "legend": {"enum": ["auto", "top-right", "top-left", "bottom-right", "bottom-left", "outside-right", "none"]},
                    "lineWidth": {"type": "number", "minimum": 0.5, "maximum": 6},
                    "markerScale": {"type": "number", "minimum": 0.5, "maximum": 2.5},
                    "seriesMarkers": {"type": "array", "minItems": 1, "items": {"enum": ["ring", "square", "triangle", "diamond"]}},
                },
            },
            "encoding": {
                "type": "object", "additionalProperties": False,
                "properties": {"interpolation": {"enum": ["linear", "monotone"]}},
            },
            "lineData": {
                "type": "object", "required": ["x", "series"],
                "properties": {
                    "x": number_array, "series": {"type": "array", "minItems": 1, "items": {"type": "object", "required": ["key", "y"], "properties": {"key": {"type": "string"}, "label": {"type": "string"}, "y": number_array}}},
                    "revealOrder": {"enum": ["random", "x"]}, "xDomain": domain, "yDomain": domain,
                },
            },
            "scatterData": {
                "type": "object", "required": ["x", "y"],
                "properties": {"x": number_array, "y": number_array, "series": {"type": "array", "items": {"type": ["string", "number"]}}, "seriesLabels": {"type": "object"}, "summary": {"enum": ["linear_fit", None]}, "xDomain": domain, "yDomain": domain},
            },
            "stripData": {
                "type": "object", "required": ["groups", "values", "group"],
                "properties": {"groups": {"type": "array", "minItems": 1, "items": {"type": "string"}}, "values": number_array, "group": {"type": "array", "items": {"type": "string"}}, "series": {"type": "array", "items": {"type": ["string", "number"]}}, "seriesLabels": {"type": "object"}, "summary": {"enum": ["median", None]}, "yDomain": domain},
            },
        },
    }


def _write_json(path: str | Path, value: Mapping[str, Any]) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    schema_parser = subparsers.add_parser("schema", help="write the generated portable JSON Schema")
    schema_parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.command == "schema":
        print(_write_json(args.output, portable_schema()))


if __name__ == "__main__":
    main()
