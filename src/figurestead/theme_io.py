"""Versioned, portable Figurestead theme packs."""

from __future__ import annotations

import argparse
from copy import deepcopy
from dataclasses import dataclass
import json
from pathlib import Path
import re
from typing import Any, Mapping
import warnings

from .themes import Theme


THEME_PACK_VERSION = "figurestead.theme-pack/1"
PALETTE_PACK_VERSION = "figurestead.palette-pack/2"
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
REQUIRED_TOKENS = (
    "field", "panel", "grid", "spine", "label", "secondary", "faint",
    "primary", "summary_core", "warm", "series",
)
THEME_KEY = re.compile(r"^[a-z][a-z0-9_]*$")
AUTHORING_ALIASES = (
    ("summary_core", "summaryCore"),
    ("primary_edge", "primaryEdge"),
    ("summary_edge", "summaryEdge"),
    ("series_edges", "seriesEdges"),
)
COMPILED_THEME_FIELDS = {
    "key", "name", "field", "panel", "grid", "spine", "label",
    "secondary", "faint", "primary", "primaryEdge", "summaryCore",
    "summaryEdge", "warm", "series", "seriesEdges",
}
AUTHORING_THEME_FIELDS = COMPILED_THEME_FIELDS | {
    "summary_core", "primary_edge", "summary_edge", "series_edges",
}


class ThemePackError(ValueError):
    """Raised when a theme pack cannot be normalized honestly."""


@dataclass(frozen=True)
class ThemePack:
    schema_version: str
    name: str
    themes: Mapping[str, Theme]
    drafts: Mapping[str, Mapping[str, Any]]


@dataclass(frozen=True)
class PaletteResolution:
    theme: Theme
    canonical: Mapping[str, str]
    scales: Mapping[str, tuple[str, ...]]
    derived: tuple[Mapping[str, Any], ...]


@dataclass(frozen=True)
class PalettePack:
    schema_version: str
    name: str
    palettes: Mapping[str, Mapping[str, PaletteResolution]]


def _color(value: Any, path: str) -> str:
    if not isinstance(value, str) or not HEX_COLOR.fullmatch(value):
        raise ThemePackError(f"{path}: must be a #RRGGBB color")
    return value.upper()


def _mix(left: str, right: str, amount: float) -> str:
    a = [int(left[index:index + 2], 16) for index in (1, 3, 5)]
    b = [int(right[index:index + 2], 16) for index in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * amount):02X}" for x, y in zip(a, b))


def _canonical(value: Any, path: str) -> dict[str, str]:
    if isinstance(value, list):
        if len(value) < 5:
            raise ThemePackError(f"{path}: must contain at least five canonical colors")
        return {str(index): _color(item, f"{path}[{index}]") for index, item in enumerate(value)}
    if not isinstance(value, Mapping) or len(value) < 5:
        raise ThemePackError(f"{path}: must contain at least five canonical colors")
    return {str(key): _color(item, f"{path}.{key}") for key, item in value.items()}


def _palette_color(value: Any, canonical: Mapping[str, str], path: str) -> str:
    if isinstance(value, str) and HEX_COLOR.fullmatch(value):
        return value.upper()
    if not isinstance(value, str):
        raise ThemePackError(f"{path}: must be a color or canonical reference")
    key = re.sub(r"^\$?canonical\.", "", value)
    if key not in canonical:
        raise ThemePackError(f"{path}: references unknown canonical color {key!r}")
    return canonical[key]


def _compile_palette(key: str, source: Mapping[str, Any], path: str, mode: str) -> PaletteResolution:
    if not isinstance(source, Mapping):
        raise ThemePackError(f"{path}: must be an object")
    canonical = _canonical(source.get("canonical"), f"{path}.canonical")
    mode_raw = dict(source.get("modes", {}).get(mode, {}))
    raw = {**dict(source.get("roles", {})), **mode_raw}
    roles = {name: _palette_color(value, canonical, f"{path}.roles.{name}") for name, value in raw.items()}
    mode_roles = {name: _palette_color(value, canonical, f"{path}.modes.{mode}.{name}") for name, value in mode_raw.items()}
    values = list(canonical.values())
    field = mode_roles.get("field", "#FFFFFF") if mode == "paper" else roles.get("field", values[0])
    panel = mode_roles.get("panel", "#F7F7F5") if mode == "paper" else roles.get("panel", values[1])
    label = mode_roles.get("label", "#1C2422") if mode == "paper" else roles.get("label", values[3])
    primary, summary = roles.get("primary", values[2]), roles.get("summaryCore", roles.get("summary_core", values[4]))
    derived: list[Mapping[str, Any]] = []
    def role(name: str, fallback: str, method: str, sources: list[str]) -> str:
        if name in roles:
            return roles[name]
        derived.append({"token": name, "method": method, "sources": sources})
        return fallback
    qualitative = source.get("qualitative", values[2:])
    if not isinstance(qualitative, list) or not qualitative:
        raise ThemePackError(f"{path}.qualitative: must be a non-empty array")
    series = tuple(_palette_color(item, canonical, f"{path}.qualitative[{index}]") for index, item in enumerate(qualitative))
    edges = source.get("edges")
    series_edges = None if edges is None else tuple(_palette_color(item, canonical, f"{path}.edges[{index}]") for index, item in enumerate(edges))
    if series_edges is not None and len(series_edges) != len(series):
        raise ThemePackError(f"{path}.edges: must contain exactly {len(series)} colors")
    theme = Theme(
        key=key, name=str(source.get("name", key)), field=field, panel=panel,
        grid=role("grid", _mix(panel, label, .17 if mode == "paper" else .2), "mix", ["panel", "label"]),
        spine=role("spine", _mix(panel, label, .34), "mix", ["panel", "label"]),
        label=label, secondary=role("secondary", _mix(label, panel, .3), "mix", ["label", "panel"]),
        faint=role("faint", _mix(label, field, .58), "mix", ["label", "field"]),
        primary=primary, summary_core=summary, warm=role("warm", summary, "alias", ["summaryCore"]),
        series=series, series_edges=series_edges,
    )
    def scale_values(name: str, fallback: list[str]) -> tuple[str, ...]:
        raw_scale = source.get(name, fallback)
        return tuple(_palette_color(item, canonical, f"{path}.{name}") for item in raw_scale)
    return PaletteResolution(theme, canonical, {
        "qualitative": series,
        "sequential": scale_values("sequential", [panel, primary, summary]),
        "diverging": scale_values("diverging", [primary, panel, summary]),
    }, tuple(derived))


def load_palette_pack(source: str | Path | Mapping[str, Any]) -> PalettePack:
    value = _read(Path(source)) if isinstance(source, (str, Path)) else source
    if not isinstance(value, Mapping) or value.get("schema_version", value.get("schemaVersion")) != PALETTE_PACK_VERSION:
        raise ThemePackError(f"schema_version: expected {PALETTE_PACK_VERSION!r}")
    raw = value.get("palettes")
    if not isinstance(raw, Mapping) or not raw:
        raise ThemePackError("palettes: must be a non-empty object")
    palettes = {key: {mode: _compile_palette(key, item, f"palettes.{key}", mode) for mode in ("paper", "atlas", "talk")} for key, item in sorted(raw.items())}
    return PalettePack(PALETTE_PACK_VERSION, str(value.get("name", "Figurestead palette pack")), palettes)


def resolve_palette(source: str | Path | Mapping[str, Any], key: str, *, mode: str = "atlas") -> PaletteResolution:
    pack = load_palette_pack(source)
    if key not in pack.palettes:
        raise ThemePackError(f"unknown palette {key!r}; choose: {', '.join(pack.palettes)}")
    if mode not in {"paper", "atlas", "talk"}:
        raise ThemePackError("mode must be paper, atlas, or talk")
    return pack.palettes[key][mode]


def _unknown_fields(value: Mapping[str, Any], allowed: set[str], path: str) -> None:
    for field in value:
        if field not in allowed:
            raise ThemePackError(f"{path}.{field}: is not an allowed field")


def _theme(
    key: str,
    value: Any,
    path: str,
    *,
    authoring: bool,
    require_key: bool,
    exact: bool = True,
) -> Theme:
    if not isinstance(value, Mapping):
        raise ThemePackError(f"{path}: must be an object")
    value = dict(value)
    if exact:
        _unknown_fields(value, AUTHORING_THEME_FIELDS if authoring else COMPILED_THEME_FIELDS, path)
    input_names = {
        snake: (snake if snake in value else camel if camel in value else camel if exact else snake)
        for snake, camel in AUTHORING_ALIASES
    }
    if authoring and exact:
        for snake, camel in AUTHORING_ALIASES:
            if snake in value and camel in value:
                raise ThemePackError(f"{path}.{camel}: must use exactly one alias spelling")
            if snake not in value and camel in value:
                value[snake] = value[camel]
    else:
        for snake, camel in AUTHORING_ALIASES:
            if snake not in value and camel in value:
                value[snake] = value[camel]
    if require_key and "key" not in value:
        raise ThemePackError(f"{path}.key: is required")
    if "key" in value and value["key"] != key:
        raise ThemePackError(f"{path}.key: must equal its theme map key")
    missing = [token for token in REQUIRED_TOKENS if token not in value]
    name = value.get("name") if exact else value.get("name", key)
    if not isinstance(name, str) or not name.strip():
        raise ThemePackError(f"{path}.name: must be a non-empty string")
    if missing:
        if exact:
            raise ThemePackError(f"{path}.{input_names.get(missing[0], missing[0])}: is required")
        raise ThemePackError(f"{path}: missing required tokens: {', '.join(missing)}")
    series = value["series"]
    if not isinstance(series, list) or not series:
        raise ThemePackError(f"{path}.series: must be a non-empty color array")
    series_edges_name = input_names["series_edges"]
    edges = value.get("series_edges")
    if edges is not None:
        if not isinstance(edges, list) or len(edges) != len(series):
            raise ThemePackError(f"{path}.{series_edges_name}: must contain exactly {len(series)} colors")
        edges = tuple(_color(item, f"{path}.{series_edges_name}[{index}]") for index, item in enumerate(edges))
    scalars = {
        token: _color(value[token], f"{path}.{input_names.get(token, token)}")
        for token in REQUIRED_TOKENS if token != "series"
    }
    return Theme(
        key=key, name=name.strip(), series=tuple(_color(item, f"{path}.series[{index}]") for index, item in enumerate(series)),
        primary_edge=_color(value["primary_edge"], f"{path}.{input_names['primary_edge']}") if value.get("primary_edge") is not None else None,
        summary_edge=_color(value["summary_edge"], f"{path}.{input_names['summary_edge']}") if value.get("summary_edge") is not None else None,
        series_edges=edges, **scalars,
    )


def _read(path: Path) -> Mapping[str, Any]:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        value = json.loads(text)
    elif path.suffix.lower() in {".yaml", ".yml"}:
        try:
            import yaml
        except ImportError as exc:
            raise ThemePackError("YAML loading requires the 'themes' extra: pip install figurestead[themes]") from exc
        value = yaml.safe_load(text)
    else:
        raise ThemePackError(f"{path}: expected .json, .yaml, or .yml")
    if not isinstance(value, Mapping):
        raise ThemePackError(f"{path}: theme pack root must be an object")
    return value


def _strict_theme_pack(value: Any, *, authoring: bool) -> ThemePack:
    path = "themeAuthoring" if authoring else "themePack"
    if not isinstance(value, Mapping):
        raise ThemePackError(f"{path}: must be an object")
    value = dict(value)
    root_fields = {"schema_version", "schemaVersion", "name", "themes", "drafts"} if authoring else {"schemaVersion", "name", "themes", "drafts"}
    _unknown_fields(value, root_fields, path)
    if authoring and "schema_version" in value and "schemaVersion" in value:
        raise ThemePackError(f"{path}.schemaVersion: must use exactly one version spelling")
    version_field = "schema_version" if authoring and "schema_version" in value else "schemaVersion"
    version = value.get(version_field)
    if version != THEME_PACK_VERSION:
        raise ThemePackError(f"{path}.{version_field}: expected {THEME_PACK_VERSION!r}")
    name = value.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ThemePackError(f"{path}.name: must be a non-empty string")
    raw_themes = value.get("themes")
    if not isinstance(raw_themes, Mapping) or not raw_themes:
        raise ThemePackError(f"{path}.themes: must be a non-empty object")
    for key in raw_themes:
        if not isinstance(key, str) or not THEME_KEY.fullmatch(key):
            raise ThemePackError(f"{path}.themes.{key}: must match ^[a-z][a-z0-9_]*$")
    themes: dict[str, Theme] = {}
    for key, item in sorted(raw_themes.items()):
        themes[key] = _theme(
            key, item, f"{path}.themes.{key}",
            authoring=authoring, require_key=not authoring,
        )
    drafts = value.get("drafts", {})
    if not isinstance(drafts, Mapping):
        raise ThemePackError(f"{path}.drafts: must be an object")
    return ThemePack(THEME_PACK_VERSION, name.strip(), themes, deepcopy(dict(drafts)))


def _strict_source(source: str | Path | Mapping[str, Any], *, authoring: bool) -> Mapping[str, Any]:
    if not isinstance(source, (str, Path)):
        return source
    path = Path(source)
    suffix = path.suffix.lower()
    allowed = {".yaml", ".yml"} if authoring else {".json"}
    if suffix not in allowed:
        contract_path = "themeAuthoring" if authoring else "themePack"
        expected = ".yaml or .yml" if authoring else ".json"
        raise ThemePackError(f"{contract_path}.source: expected {expected}")
    return _read(path)


def load_authored_theme_pack(source: str | Path | Mapping[str, Any]) -> ThemePack:
    """Load the strict official YAML authoring contract or an authored mapping."""
    return _strict_theme_pack(_strict_source(source, authoring=True), authoring=True)


def load_compiled_theme_pack(source: str | Path | Mapping[str, Any]) -> ThemePack:
    """Load the strict canonical compiled JSON contract or a compiled mapping."""
    return _strict_theme_pack(_strict_source(source, authoring=False), authoring=False)


def normalize_theme_pack_lenient(source: Mapping[str, Any]) -> ThemePack:
    """Normalize a legacy mapping only; this is not an official file loader."""
    if isinstance(source, (str, Path)) or not isinstance(source, Mapping):
        raise ThemePackError("themePackLenient: accepts mappings only")
    version = source.get("schema_version", source.get("schemaVersion"))
    if version != THEME_PACK_VERSION:
        raise ThemePackError(f"themePackLenient.schemaVersion: expected {THEME_PACK_VERSION!r}")
    raw_themes = source.get("themes")
    if not isinstance(raw_themes, Mapping) or not raw_themes:
        raise ThemePackError("themePackLenient.themes: must be a non-empty object")
    themes: dict[str, Theme] = {}
    for key, item in sorted(raw_themes.items()):
        if not isinstance(key, str) or not key.strip():
            raise ThemePackError("themePackLenient.themes: keys must be non-empty strings")
        if not isinstance(item, Mapping):
            raise ThemePackError(f"themePackLenient.themes.{key}: must be an object")
        value = dict(item)
        for snake, camel in AUTHORING_ALIASES:
            if snake not in value and camel in value:
                value[snake] = value[camel]
        themes[key] = _theme(
            key, value, f"themePackLenient.themes.{key}",
            authoring=True, require_key=False, exact=False,
        )
    drafts = source.get("drafts", {})
    if not isinstance(drafts, Mapping):
        raise ThemePackError("themePackLenient.drafts: must be an object")
    return ThemePack(
        THEME_PACK_VERSION,
        str(source.get("name") or "Figurestead theme pack"),
        themes,
        deepcopy(dict(drafts)),
    )


def load_theme_pack(source: str | Path | Mapping[str, Any]) -> ThemePack:
    """Route official files strictly; retain warned mapping-only compatibility."""
    if isinstance(source, (str, Path)):
        suffix = Path(source).suffix.lower()
        if suffix in {".yaml", ".yml"}:
            return load_authored_theme_pack(source)
        if suffix == ".json":
            return load_compiled_theme_pack(source)
        raise ThemePackError(f"{source}: expected .json, .yaml, or .yml")
    warnings.warn(
        "mapping input to load_theme_pack is deprecated; use a strict loader or normalize_theme_pack_lenient",
        DeprecationWarning,
        stacklevel=2,
    )
    return normalize_theme_pack_lenient(source)


def load_theme(source: str | Path | Mapping[str, Any], key: str) -> Theme:
    pack = load_theme_pack(source)
    try:
        return pack.themes[key]
    except KeyError as exc:
        choices = ", ".join(pack.themes)
        draft_note = "; draft themes are intentionally unavailable" if key in pack.drafts else ""
        raise ThemePackError(f"unknown active theme {key!r}; choose: {choices}{draft_note}") from exc


def theme_to_contract(theme: Theme) -> dict[str, Any]:
    result: dict[str, Any] = {
        "key": theme.key, "name": theme.name, "field": theme.field, "panel": theme.panel,
        "grid": theme.grid, "spine": theme.spine, "label": theme.label,
        "secondary": theme.secondary, "faint": theme.faint, "primary": theme.primary,
        "summaryCore": theme.summary_core, "warm": theme.warm, "series": list(theme.series),
    }
    if theme.primary_edge is not None:
        result["primaryEdge"] = theme.primary_edge
    if theme.summary_edge is not None:
        result["summaryEdge"] = theme.summary_edge
    if theme.series_edges is not None:
        result["seriesEdges"] = list(theme.series_edges)
    return result


def compile_theme_pack(source: str | Path | Mapping[str, Any]) -> dict[str, Any]:
    """Return deterministic browser-ready JSON data."""
    pack = load_authored_theme_pack(source)
    return {
        "schemaVersion": pack.schema_version,
        "name": pack.name,
        "themes": {key: theme_to_contract(theme) for key, theme in sorted(pack.themes.items())},
        "drafts": deepcopy(dict(pack.drafts)),
    }


def apply_theme(contract: Mapping[str, Any], theme: Theme) -> dict[str, Any]:
    """Clone a portable contract and embed a resolved theme."""
    result = deepcopy(dict(contract))
    result["theme"] = theme_to_contract(theme)
    return result


def _luminance(color: str) -> float:
    channels = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    linear = [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast_ratio(left: str, right: str) -> float:
    high, low = sorted((_luminance(left), _luminance(right)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def contrast_audit(theme: Theme) -> list[dict[str, Any]]:
    """Report contrast risks without mutating the supplied colors."""
    checks = [
        ("label", theme.label, 4.5), ("secondary", theme.secondary, 4.5),
        ("primary", theme.primary, 3.0), ("summary_core", theme.summary_core, 3.0),
    ]
    findings = []
    for surface_name, surface in (("field", theme.field), ("panel", theme.panel)):
        for token, color, minimum in checks:
            ratio = contrast_ratio(color, surface)
            if ratio < minimum:
                findings.append({"level": "warning", "token": token, "surface": surface_name, "ratio": round(ratio, 2), "minimum": minimum})
    for index, color in enumerate(theme.series):
        ratio = contrast_ratio(color, theme.panel)
        edge = theme.series_edges[index] if theme.series_edges else None
        if ratio < 3 and edge is None:
            findings.append({"level": "warning", "token": f"series[{index}]", "surface": "panel", "ratio": round(ratio, 2), "minimum": 3.0})
    return findings


def preview_theme_pack(source: str | Path | Mapping[str, Any], output: str | Path) -> Path:
    """Render a synthetic Matplotlib comparison for active themes."""
    import matplotlib.pyplot as plt
    import numpy as np
    from .core import PlotSpec
    from .presentation import FocusAnnotation
    from .plots import line

    pack = load_theme_pack(source)
    themes = list(pack.themes.values())
    figure, axes = plt.subplots(1, len(themes), figsize=(7.4 * len(themes), 5.2), dpi=150, squeeze=False)
    x = np.array([4, 8, 12, 18, 27, 36, 48, 68, 88])
    values = np.array([
        [0.49, 0.56, 0.63, 0.70, 0.76, 0.82, 0.865, 0.895, 0.915],
        [0.43, 0.50, 0.58, 0.66, 0.73, 0.79, 0.84, 0.87, 0.89],
    ])
    for axis, theme in zip(axes[0], themes, strict=True):
        line(x, values, labels=["Signal path", "Reference"], spec=PlotSpec(theme.name, "Synthetic public preview", "Retained latent capacity (%)", "Structural fidelity"), theme=theme, ax=axis, pose="scientific", focus=FocusAnnotation(27, 0.76, "sweet spot"))
        axis.fill_between(x, values[0] - 0.012, values[0] + 0.012, color=theme.primary, alpha=0.14, linewidth=0)
        axis.set_xlim(0, 92); axis.set_ylim(0.38, 1.0)
    figure.patch.set_facecolor("#111016")
    figure.subplots_adjust(wspace=0.28, left=0.06, right=0.98, top=0.88, bottom=0.13)
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    figure.savefig(target, facecolor=figure.get_facecolor(), bbox_inches="tight", pad_inches=0.18)
    plt.close(figure)
    return target


def _write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate and compile Figurestead theme packs")
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("validate", "compile", "preview"):
        item = commands.add_parser(command)
        item.add_argument("source")
        if command in {"compile", "preview"}:
            item.add_argument("--output", required=True)
    args = parser.parse_args()
    pack = load_theme_pack(args.source)
    if args.command == "compile":
        _write_json(Path(args.output), compile_theme_pack(args.source))
        print(args.output)
    elif args.command == "preview":
        print(preview_theme_pack(args.source, args.output))
    else:
        report = {key: contrast_audit(theme) for key, theme in pack.themes.items()}
        print(json.dumps({"valid": True, "activeThemes": list(pack.themes), "drafts": list(pack.drafts), "contrast": report}, indent=2))


if __name__ == "__main__":
    main()
