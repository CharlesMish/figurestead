"""Reusable chart renderers built from figurestead primitives."""

from __future__ import annotations

from collections.abc import Sequence

import matplotlib.colors as mcolors
import matplotlib.pyplot as plt
import numpy as np
import matplotlib.patheffects as pe

from .core import (
    PlotSpec,
    add_note,
    draw_points,
    draw_summary_line,
    ensure_axes,
    resolve,
    series_colors,
    style_axes,
    style_legend,
)
from .presentation import FocusAnnotation, draw_focus_annotation, monotone_curve, resolve_pose


def _as_arrays(*items):
    arrays = [np.asarray(item) for item in items]
    lengths = {len(item) for item in arrays}
    if len(lengths) > 1:
        raise ValueError("All data vectors must have the same length")
    return arrays


def strip_summary(groups, values, *, series=None, order=None, spec=None,
                  theme="slipware", profile="deep_scope", ax=None, seed=42):
    """Jittered categorical points with class-level median bars."""
    groups, values = _as_arrays(groups, values)
    series = np.zeros(len(values), dtype=int) if series is None else np.asarray(series)
    if len(series) != len(values):
        raise ValueError("series must match values")
    order = list(dict.fromkeys(groups.tolist())) if order is None else list(order)
    spec = spec or PlotSpec("Strip summary")
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(ax)
    style_axes(ax, theme, profile, spec)
    rng = np.random.default_rng(seed)
    positions = {name: index for index, name in enumerate(order)}

    colors = series_colors(theme)
    for label, color in zip(np.unique(series), colors):
        mask = series == label
        x = np.array([positions[item] for item in groups[mask]], dtype=float)
        x += rng.uniform(-0.13, 0.13, size=mask.sum())
        draw_points(ax, x, values[mask], color=color, theme=theme,
                    profile=profile, label=str(label))

    for name, x in positions.items():
        selected = values[groups == name]
        if selected.size:
            draw_summary_line(ax, x - 0.28, x + 0.28, float(np.median(selected)),
                              theme=theme, profile=profile)
        ax.text(x, 0.965, f"n={selected.size}", transform=ax.get_xaxis_transform(),
                ha="center", va="top", color=theme.secondary, fontsize=6.2,
                fontfamily="DejaVu Sans Mono")

    ax.set_xticks(range(len(order)), order)
    ax.set_xlim(-0.55, len(order) - 0.45)
    if len(np.unique(series)) > 1:
        style_legend(ax, theme)
    add_note(ax, spec, theme)
    return fig, ax


def scatter(x, y, *, series=None, spec=None, theme="slipware",
            profile="deep_scope", ax=None):
    x, y = _as_arrays(x, y)
    series = np.zeros(len(x), dtype=int) if series is None else np.asarray(series)
    if len(series) != len(x):
        raise ValueError("series must match x and y")
    spec = spec or PlotSpec("Scatter")
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(ax)
    style_axes(ax, theme, profile, spec)
    for label, color in zip(np.unique(series), series_colors(theme)):
        mask = series == label
        draw_points(ax, x[mask], y[mask], color=color, theme=theme,
                    profile=profile, label=str(label))
    if len(np.unique(series)) > 1:
        style_legend(ax, theme)
    add_note(ax, spec, theme)
    return fig, ax


def line(x, ys, *, labels=None, spec=None, theme="slipware",
         profile="deep_scope", ax=None, pose=None, focus: FocusAnnotation | None = None):
    x = np.asarray(x)
    ys = np.atleast_2d(np.asarray(ys))
    if ys.shape[1] != len(x):
        raise ValueError("Each line must match x")
    labels = labels or [f"series {index + 1}" for index in range(len(ys))]
    spec = spec or PlotSpec("Line")
    theme, profile = resolve(theme, profile)
    presentation = resolve_pose(pose)
    fig, ax = ensure_axes(ax)
    style_axes(ax, theme, profile, spec, panel_surface=presentation.panel_surface if presentation else False, frame=presentation.frame if presentation else False)
    for series_index, (y, label, color) in enumerate(zip(ys, labels, series_colors(theme))):
        draw_x, draw_y = monotone_curve(x, y) if presentation and presentation.curve == "monotone" else (x, y)
        width = presentation.line_width if presentation else 1.45
        if presentation:
            ax.plot(draw_x, draw_y, color=color, linewidth=width + 3.2, alpha=0.13, zorder=2.6)
        path, = ax.plot(draw_x, draw_y, color=color, linewidth=width, alpha=0.92 if presentation else 0.88, label=label, zorder=3)
        if theme.series_edges:
            path.set_path_effects([pe.Stroke(linewidth=width + 1.45, foreground=theme.series_edges[series_index % len(theme.series_edges)], alpha=0.75), pe.Normal()])
        if presentation:
            marker = presentation.series_markers[series_index % len(presentation.series_markers)]
            edge = theme.series_edges[series_index % len(theme.series_edges)] if theme.series_edges else color
            ax.scatter(x, y, s=40 * presentation.marker_scale, marker=marker, facecolors=theme.panel,
                       edgecolors=edge, linewidths=2.1, alpha=0.9, zorder=4)
            ax.scatter(x, y, s=26 * presentation.marker_scale, marker=marker, facecolors="none",
                       edgecolors=color, linewidths=1.2, alpha=0.96, zorder=4.2)
        else:
            ax.scatter(x[::max(1, len(x) // 18)], y[::max(1, len(x) // 18)],
                       s=7, color=color, alpha=0.62, edgecolors="none", zorder=4)
    if len(ys) > 1:
        style_legend(ax, theme, location=presentation.legend_location if presentation else "best")
    if focus is not None:
        draw_focus_annotation(ax, focus, theme)
    add_note(ax, spec, theme)
    return fig, ax


def histogram(values, *, labels=None, bins=20, spec=None, theme="slipware",
              profile="deep_scope", ax=None):
    datasets = values if isinstance(values, (list, tuple)) else [values]
    datasets = [np.asarray(item) for item in datasets]
    labels = labels or [f"series {index + 1}" for index in range(len(datasets))]
    spec = spec or PlotSpec("Distribution")
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(ax)
    style_axes(ax, theme, profile, spec)
    for data, label, color in zip(datasets, labels, series_colors(theme)):
        ax.hist(data, bins=bins, histtype="stepfilled", color=color, alpha=0.15,
                edgecolor=color, linewidth=1.0, label=label, zorder=3)
        ax.axvline(np.median(data), color=theme.summary_core, linewidth=1.1,
                   alpha=0.85, zorder=4)
    if len(datasets) > 1:
        style_legend(ax, theme)
    add_note(ax, spec, theme)
    return fig, ax


def heatmap(matrix, *, xlabels=None, ylabels=None, spec=None,
            theme="slipware", profile="deep_scope", ax=None):
    matrix = np.asarray(matrix)
    if matrix.ndim != 2:
        raise ValueError("matrix must be two-dimensional")
    spec = spec or PlotSpec("Heatmap")
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(ax)
    # Rain is intentionally suppressed on dense color fields; the identity is
    # carried by typography, structure, and the semantic palette instead.
    style_axes(ax, theme, profile, spec, atmosphere=False)
    cmap = mcolors.LinearSegmentedColormap.from_list(
        f"figurestead_{theme.key}", [theme.field, theme.panel, theme.primary, theme.summary_core]
    )
    image = ax.imshow(matrix, cmap=cmap, aspect="auto", interpolation="nearest")
    if xlabels is not None:
        ax.set_xticks(range(len(xlabels)), xlabels)
    if ylabels is not None:
        ax.set_yticks(range(len(ylabels)), ylabels)
    cbar = fig.colorbar(image, ax=ax, fraction=0.046, pad=0.035)
    cbar.outline.set_edgecolor(theme.spine)
    cbar.ax.tick_params(colors=theme.secondary, labelsize=7)
    add_note(ax, spec, theme)
    return fig, ax
