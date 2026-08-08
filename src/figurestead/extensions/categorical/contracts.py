"""Schema 0.4 contract builders for the categorical extension pack."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import asdict
import json
from typing import Any

from ...core import PlotSpec
from ...motion import MotionStyle, MotionTimeline
from ...profiles import Profile, get_profile
from ...themes import Theme, get_theme
from .validation import RENDERERS, normalize_categorical_data


def _camel(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(part.title() for part in tail)


def _tokens(value) -> dict[str, Any]:
    return json.loads(json.dumps({_camel(key): item for key, item in asdict(value).items()}))


def _spec(value: PlotSpec | Mapping[str, Any]) -> dict[str, Any]:
    if isinstance(value, PlotSpec):
        return {"title": value.title, "subtitle": value.subtitle, "xLabel": value.xlabel, "yLabel": value.ylabel, "note": value.note, "signature": value.signature}
    if not isinstance(value, Mapping) or not str(value.get("title", "")).strip():
        raise ValueError("spec.title is required")
    return dict(value)


def categorical_panel(
    *, renderer: str, categories: Sequence[str], series: Sequence[Mapping[str, Any]],
    id: str = "panel-1", spec: Mapping[str, Any] | None = None,
    category_labels: Mapping[str, str] | None = None, orientation: str = "vertical",
    value_domain: Sequence[float] | None = None, value_format: str = "number",
) -> dict[str, Any]:
    """Build one normalized extension panel."""
    if renderer not in RENDERERS:
        raise ValueError(f"renderer must be one of: {', '.join(sorted(RENDERERS))}")
    if not isinstance(id, str) or not id.strip():
        raise ValueError("id must be a non-empty string")
    data = normalize_categorical_data({
        "categories": categories, "categoryLabels": category_labels or {}, "orientation": orientation,
        "series": series, "valueDomain": value_domain, "valueFormat": value_format,
    }, layered=renderer == "categorical_layered_bar")
    horizontal = data["orientation"] == "horizontal"
    return {
        "id": id, "renderer": renderer, "spec": dict(spec or {}),
        "xScale": {"type": "linear" if horizontal else "band"},
        "yScale": {"type": "band" if horizontal else "linear"},
        "annotations": [], "data": data,
    }


def export_categorical_figure(
    *, spec: PlotSpec | Mapping[str, Any], panels: Sequence[Mapping[str, Any]],
    layout: Mapping[str, Any] | None = None, theme: str | Theme = "slipware",
    profile: str | Profile = "deep_scope", timeline: MotionTimeline | None = None,
    motion: MotionStyle | None = None,
) -> dict[str, Any]:
    """Build a complete JSON-safe schema 0.4 categorical figure contract."""
    if not isinstance(panels, Sequence) or isinstance(panels, (str, bytes)) or not panels:
        raise ValueError("panels must be a non-empty sequence")
    normalized_panels = []
    ids: set[str] = set()
    for index, panel in enumerate(panels):
        if not isinstance(panel, Mapping):
            raise ValueError(f"panels[{index}] must be a mapping")
        required = {"id", "renderer", "spec", "xScale", "yScale", "annotations", "data"}
        if set(panel) != required or panel["renderer"] not in RENDERERS:
            raise ValueError(f"panels[{index}] must be produced by categorical_panel")
        if panel["id"] in ids:
            raise ValueError("panel ids must be unique")
        ids.add(panel["id"])
        normalized_panels.append(json.loads(json.dumps(panel)))
    theme_value, profile_value = get_theme(theme), get_profile(profile)
    timeline_value, motion_value = timeline or MotionTimeline(), motion or MotionStyle()
    theme_data = _tokens(theme_value); theme_data["series"] = list(theme_value.series)
    motion_data = _tokens(motion_value); motion_data["durationMs"] = round(motion_value.frames / motion_value.fps * 1000)
    layout_data = {"type": "grid", "columns": 1, "gap": 22, "sharedX": False, "sharedY": False, **dict(layout or {})}
    return {
        "schemaVersion": "0.4", "rendererApiVersion": "1", "theme": theme_data,
        "profile": _tokens(profile_value), "timeline": _tokens(timeline_value), "motion": motion_data,
        "spec": _spec(spec), "layout": layout_data, "panels": normalized_panels,
    }
