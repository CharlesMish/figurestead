"""Backend-neutral terminal evidence scene used by static and expressive output."""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any, Mapping

from .application import get_application_profile


TERMINAL_SCENE_VERSION = "figurestead.scene/1"
GLYPHS = ("ring", "square", "triangle", "diamond")
LINE_STYLES = ("solid", "dash", "dot", "dash-dot")


def _id(*parts: Any) -> str:
    return "/".join(re.sub(r"[^a-zA-Z0-9_.-]+", "-", str(part)) for part in parts)


def _keys(panel: Mapping[str, Any]) -> list[str]:
    series = panel.get("data", {}).get("series", [])
    if series and isinstance(series[0], Mapping):
        return [str(item["key"]) for item in series]
    return list(dict.fromkeys(str(item) for item in series)) or ["series"]


def compile_terminal_scene(contract: Mapping[str, Any]) -> dict[str, Any]:
    """Compile stable semantic IDs and styles without backend geometry."""
    source = deepcopy(dict(contract))
    theme = source["theme"]
    keys: list[str] = []
    for panel in source.get("panels", []):
        for key in _keys(panel):
            if key not in keys:
                keys.append(key)
    styles = {}
    for index, key in enumerate(keys):
        color_index = index % len(theme["series"])
        styles[key] = {
            "key": key, "colorIndex": color_index, "color": theme["series"][color_index],
            "edge": (theme.get("seriesEdges") or [None] * len(theme["series"]))[color_index],
            "glyph": GLYPHS[index % len(GLYPHS)],
            "lineStyle": LINE_STYLES[(index // len(GLYPHS)) % len(LINE_STYLES)],
        }
    panels = []
    for panel in source.get("panels", []):
        renderer, data, panel_id = panel["renderer"], panel["data"], panel["id"]
        marks = []
        if renderer == "line":
            for series in data["series"]:
                key = str(series["key"])
                for index, (x, y) in enumerate(zip(data["x"], series["y"])):
                    marks.append({"id": _id(panel_id, "point", key, index), "kind": "point", "series": key, "x": x, "y": y, "style": styles[key]})
                for index in range(1, len(data["x"])):
                    marks.append({"id": _id(panel_id, "segment", key, index - 1, index), "kind": "segment", "series": key, "from": {"x": data["x"][index - 1], "y": series["y"][index - 1]}, "to": {"x": data["x"][index], "y": series["y"][index]}, "interpolation": panel.get("encoding", {}).get("interpolation", "linear"), "style": styles[key]})
        elif renderer == "scatter":
            series = [str(item) for item in data.get("series", ["series"] * len(data["x"]))]
            for index, (x, y, key) in enumerate(zip(data["x"], data["y"], series)):
                marks.append({"id": _id(panel_id, "point", key, index), "kind": "point", "series": key, "x": x, "y": y, "style": styles[key]})
        panels.append({"id": panel_id, "renderer": renderer, "encoding": deepcopy(panel.get("encoding", {})), "marks": marks})
    view = source.get("view", {"profile": "atlas", "motion": "semantic", "ambient": "none", "strategy": "auto"})
    return {"schemaVersion": TERMINAL_SCENE_VERSION, "contractSchemaVersion": source.get("schemaVersion"), "spec": deepcopy(source.get("spec", {})), "theme": deepcopy(theme), "applicationProfile": get_application_profile(view["profile"]).__dict__, "view": deepcopy(view), "seriesStyles": styles, "panels": panels}
