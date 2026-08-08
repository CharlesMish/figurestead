"""Static Matplotlib parity for Figurestead temporal renderers."""

from __future__ import annotations

from collections import defaultdict
from datetime import date

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import numpy as np

from figurestead.core import PlotSpec, add_note, draw_points, ensure_axes, resolve, style_axes
from .validation import PROVISIONAL_LABEL, normalize_reference_bands, validate_temporal_vectors


def _date_values(values):
    return np.asarray([date.fromisoformat(value) for value in values], dtype=object)


def coverage_timeline(
    dates, sites, *, site_order, spec=None, theme="slipware", profile="deep_scope", ax=None,
):
    """Draw exact-date site rugs and derived annual distinct-site counts."""
    dates, sites, site_order, _ = validate_temporal_vectors(dates, sites, site_order)
    spec = spec or PlotSpec("Temporal coverage", xlabel="Date", ylabel="Site")
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(ax)
    style_axes(ax, theme, profile, spec)
    parsed = _date_values(dates)
    positions = {site: index for index, site in enumerate(site_order)}
    for color_index, site in enumerate(site_order):
        selected = np.asarray([value == site for value in sites])
        if selected.any():
            y = positions[site]
            ax.vlines(parsed[selected], y - 0.22, y + 0.22, color=theme.series[color_index % len(theme.series)], linewidth=1.2, alpha=0.84, zorder=3)
    annual = defaultdict(set)
    for value, site in zip(dates, sites):
        annual[int(value[:4])].add(site)
    for year, sampled in sorted(annual.items()):
        ax.text(date(year, 7, 2), -0.68, str(len(sampled)), ha="center", va="center", color=theme.secondary,
                fontsize=6.5, fontfamily="DejaVu Sans Mono", clip_on=False)
    ax.text(0.0, 1.01, "Annual distinct-site counts", transform=ax.transAxes, ha="left", va="bottom",
            color=theme.secondary, fontsize=6.2, fontfamily="DejaVu Sans Mono")
    ax.set_yticks(range(len(site_order)), site_order)
    ax.set_ylim(len(site_order) - 0.5, -0.9)
    ax.xaxis.set_major_locator(mdates.AutoDateLocator(minticks=3, maxticks=7))
    ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(ax.xaxis.get_major_locator()))
    add_note(ax, spec, theme)
    return fig, ax


def faceted_temporal_observations(
    dates, values, sites, *, site_order, reference_bands=(), spec=None,
    theme="slipware", profile="deep_scope", axes=None,
):
    """Draw ordered site facets with shared date/value scales and no lines."""
    dates, sites, site_order, values = validate_temporal_vectors(dates, sites, site_order, values)
    bands = normalize_reference_bands(reference_bands)
    missing = [site for site in site_order if site not in sites]
    if missing:
        raise ValueError(f"site_order contains sites without observations: {missing}")
    spec = spec or PlotSpec("Temporal observations", xlabel="Date", ylabel="Value")
    theme, profile = resolve(theme, profile)
    if axes is None:
        fig, created = plt.subplots(len(site_order), 1, sharex=True, sharey=True, figsize=(8.4, max(4.8, 2.05 * len(site_order))), dpi=120, squeeze=False)
        axes = tuple(created[:, 0])
    else:
        axes = tuple(np.atleast_1d(axes).tolist())
        if len(axes) != len(site_order):
            raise ValueError(f"axes must contain exactly {len(site_order)} items")
        fig = axes[0].figure
    parsed = _date_values(dates)
    all_y = list(values) + [edge for band in bands for edge in (band["from"], band["to"])]
    low, high = min(all_y), max(all_y)
    padding = (high - low or max(abs(high), 1.0)) * 0.08
    for index, (ax, site) in enumerate(zip(axes, site_order)):
        panel_spec = PlotSpec(site, xlabel=spec.xlabel if index == len(axes) - 1 else "", ylabel=spec.ylabel,
                              note=spec.note if index == len(axes) - 1 else "", signature=spec.signature if index == len(axes) - 1 else "")
        style_axes(ax, theme, profile, panel_spec)
        for band_index, band in enumerate(bands):
            color = theme.series[(band_index + 1) % len(theme.series)]
            ax.axhspan(band["from"], band["to"], color=color, alpha=0.07, zorder=0)
            if index == 0:
                ax.text(0.995, band["to"], f"{band['label']} · {PROVISIONAL_LABEL}", transform=ax.get_yaxis_transform(),
                        ha="right", va="top", color=theme.secondary, fontsize=5.4, fontfamily="DejaVu Sans Mono")
        selected = np.asarray([value == site for value in sites])
        draw_points(ax, parsed[selected], np.asarray(values)[selected], color=theme.series[0], theme=theme, profile=profile)
        ax.set_ylim(low - padding, high + padding)
        ax.xaxis.set_major_locator(mdates.AutoDateLocator(minticks=3, maxticks=7))
        ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(ax.xaxis.get_major_locator()))
        ax.tick_params(axis="x", labelbottom=index == len(axes) - 1)
        add_note(ax, panel_spec, theme)
    fig.suptitle(spec.title, x=0.08, ha="left", color=theme.primary, fontsize=11, fontfamily=profile.title_family)
    fig.tight_layout()
    return fig, axes
