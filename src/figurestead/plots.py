"""Reusable chart renderers built from figurestead primitives."""

from __future__ import annotations

from collections.abc import Sequence, Mapping

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
from ._sequential import sequential_colormap
from ._histogram_legend import histogram_legend
from ._line_identity import IdentityLine, IdentityLegend, LINE_IDENTITIES, line_marker_indices
from .presentation import FocusAnnotation, draw_focus_annotation, monotone_curve, resolve_pose


_STRING_LIKE = (str, bytes, bytearray)


def _input_error(path: str, message: str) -> ValueError:
    return ValueError(f"{path}: {message}")


def _masked_entry_count(value) -> int | None:
    if np.ma.isMaskedArray(value):
        return int(np.ma.count_masked(value))
    if isinstance(value, (list, tuple)):
        nested = [_masked_entry_count(item) for item in value]
        found = [count for count in nested if count is not None]
        return sum(found) if found else None
    return None


def _array(value, *, path: str) -> np.ndarray:
    masked_count = _masked_entry_count(value)
    if masked_count is not None:
        noun = "entry" if masked_count == 1 else "entries"
        raise _input_error(
            path,
            f"masked arrays are not currently supported ({masked_count} masked {noun})",
        )
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


def _line_y_array(value) -> np.ndarray:
    """Ordinary line-only admission: NaN is a break, never an imputed value."""
    array = _array(value, path="line.ys")
    if array.ndim not in (1, 2):
        raise _input_error("line.ys", "must be a 1 or 2-dimensional numeric array")
    if array.size == 0 or any(size == 0 for size in array.shape):
        raise _input_error("line.ys", "must contain at least one observation")
    if array.dtype.kind not in "iuf":
        raise _input_error("line.ys", "must contain only real numbers")
    if np.isinf(array).any():
        raise _input_error("line.ys", "must contain only finite numbers or NaN breaks; infinity is unsupported")
    for index, row in enumerate(np.atleast_2d(array)):
        if not np.isfinite(row).any():
            raise _input_error(f"line.ys[{index}]", "all-missing series must contain at least one finite observation")
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


def line(x, ys, *, labels=None, series_slots=None, series_keys=None, line_styles=None, spec=None, theme="slipware",
         profile="deep_scope", ax=None, pose=None, focus: FocusAnnotation | None = None,
         direct_labels=False, marker_stride=1):
    """Draw numeric series sharing a finite x vector; NaN y breaks ordinary lines.

    ``direct_labels=True`` requests an atomic right-gutter replacement for the
    ordinary legend on 2–3 default-line series. It requires strictly increasing
    shared x, printable single-line ASCII, linear axes, all observations inside
    both resolved domains and fully contained terminal markers. Unsupported
    geometry/text/layout or insufficient measured space uses the ordinary legend.
    Tight/constrained layout, custom clipping and explicit poses are unsupported.
    The private ``ax._figurestead_direct_labels.result`` records each draw's plan.

    ``series_slots`` optionally supplies one zero-based, nonnegative integer per
    input series (Python or NumPy integers, not booleans). Omission uses row
    positions. Carry the original slots when filtering or reordering rows, e.g.
    ``series_slots=[1, 2]`` retains the second/third colors and square/triangle
    default markers. Labels are display text only; duplicates are permitted.

    Slots may repeat and have no upper bound. Colors, optional theme edges, and
    markers each cycle modulo their own sequence length: the default marker
    cycle is circle, square, upright triangle, diamond. An explicit pose keeps
    its own marker cycle, indexed by the same slots. Cycling is a style-selection
    rule, not a claim of distinguishability for additional series. Slots do not
    select line rhythm. Python slots carry marker/color identity; Python keys
    address authored line rhythm. Optional ``series_keys`` must be unique,
    nonblank strings aligned with rows. ``line_styles`` maps these keys to
    solid/dash/dot/dash-dot; missing active keys resolve to solid and inactive
    keys may remain in the mapping. Carry keys AND slots when rebuilding rows.
    Labels are never parsed as keys; rhythm has no inferred scientific meaning.
    Authored rhythm is supported only on the ordinary (non-pose) line route.

    ``marker_stride`` is a positive Python/NumPy integer (not bool or float),
    default 1. Mark indices 0, N, 2N, ... and the final observation, once each.
    This ordinary-line presentation control follows authored order, not x
    distance. It leaves all data/segments intact; unmarked observations lose
    their explicit point glyph. Cadence has no scientific meaning by itself.
    Sparse cadence is unsupported with explicit poses.

    NaN y means an explicit break on the ordinary static route. Each series
    needs finite evidence; infinities, masks and other sentinels are unsupported.
    Cadence uses finite original indices divisible by N plus every finite-run
    endpoint (including singletons). Rhythm restarts at gaps, not marker holes.
    Gapped figures use ordinary legends even when direct labels are requested.
    No interpolation, imputation or reconnection occurs.
    """
    if isinstance(marker_stride, (bool, np.bool_)) or not isinstance(marker_stride, (int, np.integer)) or marker_stride < 1:
        raise _input_error("line.marker_stride", "must be a positive integer (not boolean)")
    marker_stride = int(marker_stride)
    if not isinstance(direct_labels, bool):
        raise _input_error("line.direct_labels", "must be boolean")
    x = _numeric_array(x, path="line.x", dimensions=(1,))
    ys = _line_y_array(ys)
    ys = np.atleast_2d(ys)
    if ys.shape[1] != len(x):
        raise _input_error(
            "line.ys",
            f"each series must match line.x length {len(x)}; found width {ys.shape[1]}",
        )
    labels = ([f"series {index + 1}" for index in range(len(ys))]
              if labels is None else _metadata(labels, path="line.labels", expected=len(ys)))
    if _masked_entry_count(series_slots) is not None:
        raise _input_error("line.series_slots", "masked arrays are not currently supported")
    slots = (list(range(len(ys))) if series_slots is None else
             _metadata(series_slots, path="line.series_slots", expected=len(ys)))
    for index, slot in enumerate(slots):
        if isinstance(slot, (bool, np.bool_)) or not isinstance(slot, (int, np.integer)) or slot < 0:
            raise _input_error(f"line.series_slots[{index}]", "must be a nonnegative integer (not boolean)")
    slots = [int(slot) for slot in slots]
    keys = None if series_keys is None else _metadata(series_keys, path="line.series_keys", expected=len(ys))
    if keys is not None:
        if any(not isinstance(key, str) or not key.strip() for key in keys):
            raise _input_error("line.series_keys", "must contain unique nonblank strings; keys address rhythm, not marker/color slots")
        if len(set(keys)) != len(keys):
            raise _input_error("line.series_keys", "must be unique")
    if line_styles is not None and keys is None:
        raise _input_error("line.line_styles", "requires series_keys; slots carry marker/color identity, keys address rhythm")
    rhythms = {"solid": "-", "dash": "--", "dot": ":", "dash-dot": "-."}
    if line_styles is not None:
        if not isinstance(line_styles, Mapping):
            raise _input_error("line.line_styles", "must be a mapping from series keys to named rhythms")
        for key, style in line_styles.items():
            if not isinstance(key, str) or not key.strip():
                raise _input_error("line.line_styles", "keys must be nonblank strings")
            if not isinstance(style, str) or style not in rhythms:
                raise _input_error("line.line_styles", "styles must be solid, dash, dot or dash-dot")
    resolved_rhythms = ([{} for _ in ys] if keys is None else
                        [{"linestyle": rhythms[(line_styles or {}).get(key, "solid")]} for key in keys])
    spec = spec or PlotSpec("Line")
    theme, profile = resolve(theme, profile)
    presentation = resolve_pose(pose)
    if line_styles is not None and presentation is not None:
        raise _input_error("line.line_styles", "authored rhythm is unsupported with explicit presentation poses")
    if marker_stride != 1 and presentation is not None:
        raise _input_error("line.marker_stride", "sparse cadence is unsupported with explicit presentation poses")
    if np.isnan(ys).any() and presentation is not None:
        raise _input_error("line.ys", "NaN breaks are unsupported with explicit presentation poses")
    fig, ax = ensure_axes(ax)
    style_axes(ax, theme, profile, spec, panel_surface=presentation.panel_surface if presentation else False, frame=presentation.frame if presentation else False)
    identity_lines = []
    for series_index, y, label, rhythm in zip(slots, ys, labels, resolved_rhythms):
        selected = line_marker_indices(y, marker_stride)
        color = theme.series[series_index % len(theme.series)]
        draw_x, draw_y = monotone_curve(x, y) if presentation and presentation.curve == "monotone" else (x, y)
        width = presentation.line_width if presentation else 1.45
        if presentation:
            ax.plot(draw_x, draw_y, color=color, linewidth=width + 3.2, alpha=0.13, zorder=2.6)
        if presentation:
            path, = ax.plot(draw_x, draw_y, color=color, linewidth=width, alpha=0.92, label=label, zorder=3)
        else:
            path = IdentityLine(draw_x, draw_y, color=color, linewidth=width,
                                alpha=0.88, label=label, zorder=3, **rhythm)
            ax.add_line(path)
        identity_lines.append(path)
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
            marker, size = LINE_IDENTITIES[series_index % len(LINE_IDENTITIES)]
            points = ax.scatter(x[selected], y[selected], s=size ** 2, marker=marker, facecolors="none",
                                edgecolors=color, linewidths=1., alpha=1., zorder=4)
            if theme.series_edges:
                points.set_path_effects([pe.Stroke(linewidth=2.1, foreground=theme.series_edges[series_index % len(theme.series_edges)]), pe.Normal()])
            path.identity_marker, path.identity_points = marker, points
            path.identity_stride = marker_stride
            path.identity_edge_width = 1.45 if theme.series_edges else 0.
    if len(ys) > 1:
        style_legend(ax, theme, location=presentation.legend_location if presentation else "best",
                     handler_map=None if presentation else {IdentityLine: IdentityLegend()})
    if focus is not None:
        draw_focus_annotation(ax, focus, theme)
    add_note(ax, spec, theme)
    if direct_labels:
        from ._direct_labels import DirectLabels
        DirectLabels(ax, identity_lines, labels, slots, theme, unsupported=presentation is not None or focus is not None)
    return fig, ax


def histogram(values, *, labels=None, bins=20, spec=None, theme="slipware",
              profile="deep_scope", ax=None):
    """Draw finite distributions.

    A flat numeric sequence is one dataset. A nested sequence contains one
    one-dimensional dataset per entry. Supplied labels must match that count.
    Multi-dataset median rules inherit dataset color; the paired legend reports
    dataset labels and median values. Coincident medians are not displaced.
    A single dataset retains summary_core and its existing legend behavior.
    """
    datasets = _histogram_datasets(values)
    labels = ([f"series {index + 1}" for index in range(len(datasets))]
              if labels is None else _metadata(labels, path="histogram.labels", expected=len(datasets)))
    _validate_bins(datasets, bins)
    spec = spec or PlotSpec("Distribution")
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(ax)
    style_axes(ax, theme, profile, spec)
    multiple = len(datasets) > 1
    pairs, medians = [], []
    for data, label, color in zip(datasets, labels, series_colors(theme)):
        _, _, patches = ax.hist(data, bins=bins, histtype="stepfilled", color=color, alpha=0.15,
                                edgecolor=color, linewidth=1.0, label=label, zorder=3)
        median = np.median(data)
        rule = ax.axvline(median, color=color if multiple else theme.summary_core, linewidth=1.1,
                          alpha=0.85, zorder=4)
        if multiple:
            pairs.append((patches[0], rule))
            medians.append(median)
    if multiple:
        histogram_legend(ax, theme, pairs, labels, medians)
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
    cmap = sequential_colormap(theme)
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
