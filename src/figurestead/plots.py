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


_STRING_LIKE = (str, bytes, bytearray)


def _input_error(path: str, message: str) -> ValueError:
    return ValueError(f"{path}: {message}")


def _array(value, *, path: str) -> np.ndarray:
    try:
        return np.asarray(value)
    except (TypeError, ValueError) as exc:
        raise _input_error(path, "must have a regular array shape") from exc


def _numeric_array(
    value, *, path: str, dimensions: tuple[int, ...], allow_empty: bool = False
) -> np.ndarray:
    array = _array(value, path=path)
    if array.ndim not in dimensions:
        expected = " or ".join(str(item) for item in dimensions)
        raise _input_error(path, f"must be a {expected}-dimensional numeric array")
    if not allow_empty and (array.size == 0 or any(size == 0 for size in array.shape)):
        raise _input_error(path, "must contain at least one observation")
    if array.dtype.kind not in "iuf":
        raise _input_error(path, "must contain only real numbers")
    if not np.isfinite(array).all():
        raise _input_error(path, "must contain only finite numbers")
    return array


def _category_vector(
    value, *, path: str, allow_empty: bool = False
) -> tuple[np.ndarray, np.ndarray]:
    array = _array(value, path=path)
    if array.ndim != 1:
        raise _input_error(path, "must be a one-dimensional category sequence")
    if not allow_empty and array.size == 0:
        raise _input_error(path, "must contain at least one category")
    for index, item in enumerate(array.tolist()):
        try:
            hash(item)
        except TypeError as exc:
            raise _input_error(f"{path}[{index}]", "category values must be hashable") from exc
        if isinstance(item, (int, float, np.integer, np.floating)) and not np.isfinite(item):
            raise _input_error(f"{path}[{index}]", "numeric category values must be finite")
    try:
        unique = np.unique(array)
    except TypeError as exc:
        raise _input_error(path, "category values must be mutually comparable") from exc
    return array, unique


def _same_length(*items: tuple[str, np.ndarray]) -> None:
    lengths = {len(array) for _, array in items}
    if len(lengths) > 1:
        observed = ", ".join(f"{path}={len(array)}" for path, array in items)
        raise _input_error(items[0][0], f"paired vectors must have equal lengths ({observed})")


def _metadata(value, *, path: str, expected: int) -> list:
    if isinstance(value, _STRING_LIKE):
        raise _input_error(path, f"must be a non-string sequence with exactly {expected} entries")
    try:
        result = list(value)
    except TypeError as exc:
        raise _input_error(path, f"must be a sequence with exactly {expected} entries") from exc
    if len(result) != expected:
        raise _input_error(path, f"expected {expected} entries, found {len(result)}")
    return result


def _explicit_order(value, *, observed: Sequence) -> list:
    if isinstance(value, _STRING_LIKE):
        raise _input_error("strip_summary.order", "must be a non-string sequence of unique categories")
    try:
        order = list(value)
    except TypeError as exc:
        raise _input_error("strip_summary.order", "must be a sequence of unique categories") from exc
    positions = {}
    for index, item in enumerate(order):
        try:
            duplicate = item in positions
            positions[item] = index
        except TypeError as exc:
            raise _input_error(f"strip_summary.order[{index}]", "category values must be hashable") from exc
        if duplicate:
            raise _input_error(f"strip_summary.order[{index}]", f"duplicate category {item!r}")
        if isinstance(item, (int, float, np.integer, np.floating)) and not np.isfinite(item):
            raise _input_error(f"strip_summary.order[{index}]", "numeric category values must be finite")
    for item in observed:
        if item not in positions:
            raise _input_error("strip_summary.order", f"observed category {item!r} is missing")
    return order


def _histogram_datasets(values) -> list[np.ndarray]:
    if isinstance(values, (list, tuple)):
        if not values:
            raise _input_error("histogram.values", "must contain at least one observation")
        item_dimensions = [_array(item, path=f"histogram.values[{index}]").ndim
                           for index, item in enumerate(values)]
        if all(dimension == 0 for dimension in item_dimensions):
            return [_numeric_array(values, path="histogram.values", dimensions=(1,))]
        if any(dimension == 0 for dimension in item_dimensions):
            raise _input_error(
                "histogram.values",
                "must be one numeric dataset or a sequence of one-dimensional datasets; scalar and nested values cannot be mixed",
            )
        return [
            _numeric_array(item, path=f"histogram.values[{index}]", dimensions=(1,))
            for index, item in enumerate(values)
        ]

    array = _numeric_array(values, path="histogram.values", dimensions=(1, 2))
    return [array] if array.ndim == 1 else [row for row in array]


def _validate_bins(datasets: list[np.ndarray], bins) -> None:
    try:
        np.histogram_bin_edges(np.concatenate(datasets), bins=bins)
    except (TypeError, ValueError) as exc:
        raise _input_error("histogram.bins", f"invalid bin specification: {exc}") from exc


def strip_summary(groups, values, *, series=None, order=None, spec=None,
                  theme="slipware", profile="deep_scope", ax=None, seed=42):
    """Jittered categorical points with class-level median bars.

    An explicit order must be unique and include every observed group.
    """
    groups, _ = _category_vector(groups, path="strip_summary.groups", allow_empty=True)
    values = _numeric_array(
        values, path="strip_summary.values", dimensions=(1,), allow_empty=True
    )
    if series is None:
        series = np.zeros(len(values), dtype=int)
        series_keys = np.unique(series)
    else:
        series, series_keys = _category_vector(
            series, path="strip_summary.series", allow_empty=True
        )
    _same_length(
        ("strip_summary.groups", groups),
        ("strip_summary.values", values),
        ("strip_summary.series", series),
    )
    observed = list(dict.fromkeys(groups.tolist()))
    order = observed if order is None else _explicit_order(order, observed=observed)
    spec = spec or PlotSpec("Strip summary")
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(ax)
    style_axes(ax, theme, profile, spec)
    rng = np.random.default_rng(seed)
    positions = {name: index for index, name in enumerate(order)}

    colors = series_colors(theme)
    for label, color in zip(series_keys, colors):
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
    if len(series_keys) > 1:
        style_legend(ax, theme)
    add_note(ax, spec, theme)
    return fig, ax


def scatter(x, y, *, series=None, spec=None, theme="slipware",
            profile="deep_scope", ax=None):
    """Draw paired finite numeric vectors as categorized points."""
    x = _numeric_array(x, path="scatter.x", dimensions=(1,))
    y = _numeric_array(y, path="scatter.y", dimensions=(1,))
    if series is None:
        series = np.zeros(len(x), dtype=int)
        series_keys = np.unique(series)
    else:
        series, series_keys = _category_vector(series, path="scatter.series")
    _same_length(("scatter.x", x), ("scatter.y", y), ("scatter.series", series))
    spec = spec or PlotSpec("Scatter")
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(ax)
    style_axes(ax, theme, profile, spec)
    for label, color in zip(series_keys, series_colors(theme)):
        mask = series == label
        draw_points(ax, x[mask], y[mask], color=color, theme=theme,
                    profile=profile, label=str(label))
    if len(series_keys) > 1:
        style_legend(ax, theme)
    add_note(ax, spec, theme)
    return fig, ax


def line(x, ys, *, labels=None, spec=None, theme="slipware",
         profile="deep_scope", ax=None, pose=None, focus: FocusAnnotation | None = None):
    """Draw one or more finite numeric series sharing one x vector."""
    x = _numeric_array(x, path="line.x", dimensions=(1,))
    ys = _numeric_array(ys, path="line.ys", dimensions=(1, 2))
    ys = np.atleast_2d(ys)
    if ys.shape[1] != len(x):
        raise _input_error(
            "line.ys",
            f"each series must match line.x length {len(x)}; found width {ys.shape[1]}",
        )
    labels = ([f"series {index + 1}" for index in range(len(ys))]
              if labels is None else _metadata(labels, path="line.labels", expected=len(ys)))
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
    """Draw finite distributions.

    A flat numeric sequence is one dataset. A nested sequence contains one
    one-dimensional dataset per entry. Supplied labels must match that count.
    """
    datasets = _histogram_datasets(values)
    labels = ([f"series {index + 1}" for index in range(len(datasets))]
              if labels is None else _metadata(labels, path="histogram.labels", expected=len(datasets)))
    _validate_bins(datasets, bins)
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
    """Draw a nonempty finite numeric matrix with optional axis labels."""
    matrix = _numeric_array(matrix, path="heatmap.matrix", dimensions=(2,))
    if xlabels is not None:
        xlabels = _metadata(xlabels, path="heatmap.xlabels", expected=matrix.shape[1])
    if ylabels is not None:
        ylabels = _metadata(ylabels, path="heatmap.ylabels", expected=matrix.shape[0])
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
