"""Application profiles for publication, atlas, and presentation output."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Mapping


APPLICATION_PROFILE_VERSION = "figurestead.application-profile/1"


@dataclass(frozen=True)
class ApplicationProfile:
    key: str
    name: str
    surface: str
    density: str
    typography: str
    legend: str
    ambient: str
    motion: str
    line_width: float
    marker_scale: float
    panel_surface: bool
    frame: bool


APPLICATION_PROFILES = {
    "paper": ApplicationProfile("paper", "Paper", "neutral", "compact", "publication", "outside", "none", "none", 1.55, .92, False, False),
    "atlas": ApplicationProfile("atlas", "Atlas", "themed", "balanced", "scientific", "auto", "none", "semantic", 2.15, 1.12, True, True),
    "talk": ApplicationProfile("talk", "Talk", "themed", "open", "display", "auto", "none", "semantic", 2.75, 1.34, True, True),
}


def get_application_profile(profile: str | ApplicationProfile = "atlas") -> ApplicationProfile:
    if isinstance(profile, ApplicationProfile):
        return profile
    try:
        return APPLICATION_PROFILES[profile]
    except KeyError as exc:
        raise ValueError(f"Unknown application profile {profile!r}; choose: {', '.join(APPLICATION_PROFILES)}") from exc


def apply_application_profile(contract: Mapping[str, Any], profile: str | ApplicationProfile = "atlas", *, motion: str | None = None, ambient: str | None = None) -> dict[str, Any]:
    result = deepcopy(dict(contract))
    value = get_application_profile(profile)
    previous = get_application_profile(result.get("view", {}).get("profile", "atlas"))
    previous_presentation = {
        "panelSurface": previous.panel_surface, "frame": previous.frame,
        "legend": "outside-right" if previous.legend == "outside" else "auto" if previous.legend == "auto" else "bottom-right",
        "lineWidth": previous.line_width, "markerScale": previous.marker_scale,
    }
    result["view"] = {"profile": value.key, "motion": motion or value.motion, "ambient": ambient or value.ambient, "strategy": "auto" if (motion or value.motion) == "semantic" else "none"}
    for panel in result.get("panels", []):
        overrides = {key: item for key, item in dict(panel.get("presentation", {})).items() if previous_presentation.get(key) != item}
        panel["presentation"] = {
            "panelSurface": value.panel_surface, "frame": value.frame,
            "legend": "outside-right" if value.legend == "outside" else "auto" if value.legend == "auto" else "bottom-right",
            "lineWidth": value.line_width, "markerScale": value.marker_scale,
            **overrides,
        }
    return result
