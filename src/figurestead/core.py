"""Backend-neutral-ish visual primitives for the Matplotlib adapter."""

from __future__ import annotations

from dataclasses import dataclass
from itertools import cycle
from typing import Iterable

import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
import numpy as np

from .profiles import Profile, get_profile
from .themes import Theme, get_theme


GLYPHS = np.array(list("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>[]{}|+-=αβγδε∑∫≈≠±∞"))


@dataclass(frozen=True)
class PlotSpec:
    title: str
    subtitle: str = ""
    xlabel: str = ""
    ylabel: str = ""
    note: str = ""
    signature: str = "figurestead"


def resolve(theme="slipware", profile="deep_scope") -> tuple[Theme, Profile]:
    return get_theme(theme), get_profile(profile)


def ensure_axes(ax=None, *, figsize=(8.4, 5.2)):
    if ax is None:
        fig, ax = plt.subplots(figsize=figsize, dpi=120)
    else:
        fig = ax.figure
    return fig, ax


def style_axes(ax, theme: Theme, profile: Profile, spec: PlotSpec, *, atmosphere=False, panel_surface=False, frame=False):
    fig = ax.figure
    fig.patch.set_facecolor(theme.field)
    ax.set_facecolor(theme.panel if panel_surface else theme.field)

    for side in ("top", "right"):
        ax.spines[side].set_visible(frame)
        ax.spines[side].set_alpha(0.48)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(theme.spine)
        ax.spines[side].set_linewidth(0.7)
    if frame:
        for side in ("top", "right"):
            ax.spines[side].set_color(theme.spine)
            ax.spines[side].set_linewidth(0.7)

    ax.tick_params(colors=theme.secondary, labelsize=8)
    ax.xaxis.label.set_color(theme.label)
    ax.yaxis.label.set_color(theme.label)
    ax.set_xlabel(spec.xlabel, fontsize=9)
    ax.set_ylabel(spec.ylabel, fontsize=9)
    ax.set_axisbelow(True)

    if profile.grid_x:
        ax.grid(axis="x", color=theme.grid, alpha=profile.grid_alpha * 0.55, linewidth=0.45)
    if profile.grid_y:
        ax.grid(axis="y", color=theme.grid, alpha=profile.grid_alpha, linewidth=0.45)

    title = spec.title.upper() if profile.uppercase_title else spec.title
    title_artist = ax.set_title(title, loc="left", color=theme.primary, fontsize=10.5,
                                fontfamily=profile.title_family, fontweight="medium", pad=18)
    if theme.primary_edge:
        title_artist.set_path_effects([pe.Stroke(linewidth=1.4, foreground=theme.primary_edge), pe.Normal()])
    if spec.subtitle:
        ax.text(0.0, 1.015, spec.subtitle, transform=ax.transAxes,
                ha="left", va="bottom", color=theme.secondary, fontsize=7.1,
                fontfamily="DejaVu Sans Mono", style="italic")
    if spec.signature:
        ax.text(0.005 if panel_surface else 0.995, 0.012, spec.signature, transform=ax.transAxes,
                ha="left" if panel_surface else "right", va="bottom", color=theme.faint, fontsize=5.4,
                fontfamily="DejaVu Sans Mono", zorder=20)
    if atmosphere and profile.rain_density:
        add_matrix_texture(ax, theme, profile)


def add_matrix_texture(ax, theme: Theme, profile: Profile, *, seed=99):
    """Add static ambient glyphs in axes coordinates behind the evidence."""
    rng = np.random.default_rng(seed)
    for _ in range(profile.rain_density):
        x = rng.uniform(0.01, 0.99)
        head = rng.uniform(0.02, 1.08)
        length = int(rng.integers(3, 9))
        spacing = rng.uniform(0.035, 0.065)
        for index in range(length):
            y = head - index * spacing
            if not 0.0 <= y <= 1.0:
                continue
            fade = max(0.05, 1.0 - index / length)
            alpha = profile.rain_alpha * fade * rng.uniform(0.55, 1.0)
            color = theme.summary_core if index == 0 else theme.primary
            ax.text(x, y, str(rng.choice(GLYPHS)), transform=ax.transAxes,
                    ha="center", va="center", color=color, alpha=alpha,
                    fontsize=5.3, fontfamily="DejaVu Sans Mono", zorder=-5,
                    clip_on=True)


def series_colors(theme: Theme) -> Iterable[str]:
    return cycle(theme.series)


def series_edge(theme: Theme, color: str) -> str | None:
    if not theme.series_edges:
        return None
    try:
        return theme.series_edges[theme.series.index(color)]
    except ValueError:
        return None


def draw_points(ax, x, y, *, color, theme: Theme, profile: Profile, label=None):
    x = np.asarray(x)
    y = np.asarray(y)
    if profile.marker == "ring_core":
        edge = series_edge(theme, color)
        if edge:
            ax.scatter(x, y, s=profile.marker_size * 1.18, facecolors="none",
                       edgecolors=edge, linewidths=max(1.5, profile.edge_width + 0.7),
                       alpha=profile.marker_alpha * 0.75, zorder=2.8)
        if profile.point_glow:
            ax.scatter(x, y, s=profile.marker_size * 1.75, facecolors="none",
                       edgecolors=color, linewidths=1.8, alpha=0.055, zorder=2)
        ax.scatter(x, y, s=profile.marker_size, facecolors="none",
                   edgecolors=color, linewidths=profile.edge_width,
                   alpha=profile.marker_alpha, label=label, zorder=3)
        ax.scatter(x, y, s=profile.marker_size * profile.core_fraction,
                   c=color, edgecolors="none", alpha=profile.marker_alpha * 0.58,
                   zorder=4)
    else:
        ax.scatter(x, y, s=profile.marker_size, c=color,
                   edgecolors=theme.field if profile.edge_width else "none",
                   linewidths=profile.edge_width, alpha=profile.marker_alpha,
                   label=label, zorder=3)


def draw_summary_line(ax, x0, x1, y, *, theme: Theme, profile: Profile):
    if profile.summary_glow:
        ax.plot([x0, x1], [y, y], color=theme.primary, linewidth=5.0,
                alpha=0.16, solid_capstyle="butt", zorder=5)
    if theme.summary_edge:
        ax.plot([x0, x1], [y, y], color=theme.summary_edge, linewidth=2.7,
                alpha=0.8, solid_capstyle="butt", zorder=5.5)
    ax.plot([x0, x1], [y, y], color=theme.summary_core, linewidth=1.55,
            alpha=0.96, solid_capstyle="butt", zorder=6)


def style_legend(ax, theme: Theme, *, location="best"):
    legend = ax.legend(frameon=False, fontsize=7, labelcolor=theme.label,
                       handletextpad=0.5, borderaxespad=0.3, loc=location)
    return legend


def add_note(ax, spec: PlotSpec, theme: Theme):
    if spec.note:
        ax.text(0.5, -0.16, spec.note, transform=ax.transAxes,
                ha="center", va="top", color=theme.warm, fontsize=6.5,
                fontfamily="DejaVu Sans Mono", style="italic")
