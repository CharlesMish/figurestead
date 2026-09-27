"""Backend-neutral terminal evidence scene used by static and expressive output."""

from __future__ import annotations

from copy import deepcopy
import math
from typing import Any, Mapping

from .application import get_application_profile


TERMINAL_SCENE_VERSION = "figurestead.scene/1"
GLYPHS = ("ring", "square", "triangle", "diamond")
DEFAULT_LINE_STYLES = ("solid",)


def _id_component(value: Any) -> str:
    result = []
    for char in str(value):
        if char.isascii() and (char.isalnum() or char in "_.-"):
            result.append(char)
        elif 0xD800 <= ord(char) <= 0xDFFF:
            result.append(f"~u{ord(char):04X}")
        else:
            result.extend(f"~{byte:02X}" for byte in char.encode("utf-8"))
    return "".join(result)


def _id(*parts: Any) -> str:
    return "/".join(_id_component(part) for part in parts)


def _keys(panel: Mapping[str, Any]) -> list[str]:
    series = panel.get("data", {}).get("series", [])
    if series and isinstance(series[0], Mapping):
        return [str(item["key"]) for item in series]
    return list(dict.fromkeys(str(item) for item in series)) or ["series"]


def _finite_coordinates(values, path):
    for index, value in enumerate(values):
        try:
            valid = math.isfinite(value)
        except (TypeError, ValueError, OverflowError):
            valid = False
        if not valid:
            raise ValueError(f"{path}[{index}]: auxiliary scenes require finite numeric coordinates; NaN gaps are supported only by ordinary Python line()")


def compile_terminal_scene(contract: Mapping[str, Any]) -> dict[str, Any]:
    """Compile finite-only semantic records; not a transport for Python NaN gaps."""
    source = deepcopy(dict(contract))
    # Validate before constructing any marks, including coordinates zip would omit.
    for panel_index, panel in enumerate(source.get("panels", [])):
        data = panel["data"]
        path = f"panels[{panel_index}].data"
        if panel["renderer"] in ("line", "scatter"):
            _finite_coordinates(data["x"], f"{path}.x")
            if panel["renderer"] == "line":
                for index, row in enumerate(data["series"]):
                    _finite_coordinates(row["y"], f"{path}.series[{index}] ({row['key']!r}).y")
            else:
                _finite_coordinates(data["y"], f"{path}.y")
    theme = source["theme"]
    keys: list[str] = []
    for panel in source.get("panels", []):
        for key in _keys(panel):
            if key not in keys:
                keys.append(key)
    # Missing rhythm is solid at every slot. Explicit contract rhythm keeps its
    # effective glyph-block allocation; a keyed rhythm wins for that trace.
    style = source.get("style") or {}
    glyphs = style.get("glyphs") if style.get("glyphs") is not None else GLYPHS
    line_styles = style.get("lineStyles") if style.get("lineStyles") is not None else DEFAULT_LINE_STYLES
    if not isinstance(glyphs, (list, tuple)) or not glyphs or any(g not in GLYPHS for g in glyphs):
        raise ValueError("style.glyphs: expected a nonempty list of ring, square, triangle or diamond")
    rhythms = ("solid", "dash", "dot", "dash-dot")
    if not isinstance(line_styles, (list, tuple)) or not line_styles or any(r not in rhythms for r in line_styles):
        raise ValueError("style.lineStyles: expected a nonempty list of named rhythms")
    overrides = style.get("series") or {}
    styles = {}
    for index, key in enumerate(keys):
        color_index = index % len(theme["series"])
        styles[key] = {
            "key": key, "colorIndex": color_index, "color": theme["series"][color_index],
            "edge": (theme.get("seriesEdges") or [None] * len(theme["series"]))[color_index],
            "glyph": glyphs[index % len(glyphs)],
            "lineStyle": line_styles[(index // len(glyphs)) % len(line_styles)],
        }
        override = overrides.get(key, {})
        if "glyph" in override and override["glyph"] not in GLYPHS:
            raise ValueError(f"style.series[{key!r}].glyph: unsupported glyph")
        if "lineStyle" in override and override["lineStyle"] not in rhythms:
            raise ValueError(f"style.series[{key!r}].lineStyle: unsupported rhythm")
        styles[key].update({name: override[name] for name in
                           ("color", "edge", "glyph", "lineStyle", "hatch", "lineWidth") if name in override})
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
