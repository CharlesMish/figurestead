"""Presentation profiles independent of color themes."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Profile:
    key: str
    name: str
    marker: str
    marker_size: float
    marker_alpha: float
    edge_width: float
    core_fraction: float
    point_glow: bool
    grid_x: bool
    grid_y: bool
    grid_alpha: float
    rain_density: int
    rain_alpha: float
    summary_glow: bool
    title_family: str
    uppercase_title: bool = False


PROFILES: dict[str, Profile] = {
    "deep_scope": Profile(
        key="deep_scope",
        name="Deep Scope",
        marker="ring_core",
        marker_size=46,
        marker_alpha=0.80,
        edge_width=1.05,
        core_fraction=0.12,
        point_glow=True,
        grid_x=True,
        grid_y=True,
        grid_alpha=0.40,
        rain_density=24,
        rain_alpha=0.070,
        summary_glow=True,
        title_family="DejaVu Sans Mono",
        uppercase_title=False,
    ),
    "instrument": Profile(
        key="instrument",
        name="Instrument",
        marker="filled",
        marker_size=30,
        marker_alpha=0.62,
        edge_width=0.25,
        core_fraction=0.0,
        point_glow=False,
        grid_x=False,
        grid_y=True,
        grid_alpha=0.30,
        rain_density=20,
        rain_alpha=0.050,
        summary_glow=True,
        title_family="DejaVu Sans",
    ),
    "monograph": Profile(
        key="monograph",
        name="Monograph",
        marker="filled",
        marker_size=25,
        marker_alpha=0.70,
        edge_width=0.0,
        core_fraction=0.0,
        point_glow=False,
        grid_x=False,
        grid_y=True,
        grid_alpha=0.24,
        rain_density=0,
        rain_alpha=0.0,
        summary_glow=False,
        title_family="DejaVu Serif",
    ),
}


def get_profile(profile: str | Profile = "deep_scope") -> Profile:
    if isinstance(profile, Profile):
        return profile
    try:
        return PROFILES[profile]
    except KeyError as exc:
        choices = ", ".join(PROFILES)
        raise ValueError(f"Unknown profile {profile!r}; choose one of: {choices}") from exc
