"""Literal labels on owned artists, without changing Matplotlib's selection."""

import numpy as np
from matplotlib.collections import PathCollection
from matplotlib.legend import Legend
from matplotlib.legend_handler import HandlerPathCollection

from ._line_identity import IdentityLine, IdentityLegend


def authored_label(artist, label):
    """Mark only the actual authored handle, never anonymous/support artists.

    Keep the artist's real label intact. Ownership lives on the handle, so clear
    and removal need no axes registry, and caller relabelling remains observable.
    Empty/None labels retain their existing no-label behavior.
    """
    artist._figurestead_authored_label = label is not None and str(label) != ""
    return artist


class PointTreatmentLegend(HandlerPathCollection):
    """Show the labelled point mark, and the ring/core theme edge when one was drawn.

    The labelled collection carries the resolved glyph, area, and opacity, so
    this handler does not apply a second size scale. A recorded edge is the
    larger open ring already drawn behind a ring/core mark, at the same 1.18
    area ratio and the primary opacity times 0.75. No recorded edge, including
    an unslotted override that only changes area or opacity, keeps the ordinary
    collection glyph.
    """

    def create_artists(self, legend, orig_handle, xdescent, ydescent, width, height, fontsize, trans):
        artists = super().create_artists(
            legend, orig_handle, xdescent, ydescent, width, height, fontsize, trans)
        treatment = getattr(orig_handle, "_figurestead_point_treatment", None)
        edge = None if not treatment else treatment.get("edge")
        if not edge:
            return artists
        primary = artists[0]
        sizes = np.asarray(primary.get_sizes(), dtype=float) * 1.18
        widths = np.asarray(primary.get_linewidths(), dtype=float)
        alpha = primary.get_alpha()
        halo = type(primary)(
            primary.get_paths(), sizes=sizes, offsets=np.array(primary.get_offsets()),
            offset_transform=primary.get_offset_transform(), facecolors="none",
            edgecolors=edge, linewidths=np.maximum(1.5, widths + 0.7),
            alpha=None if alpha is None else float(np.max(np.atleast_1d(alpha))) * 0.75,
        )
        halo.set_transform(primary.get_transform())
        halo.set_figure(primary.get_figure())
        halo.set_clip_box(None)
        halo.set_clip_path(None)
        return [halo, primary]


def legend_handlers(handler_map=None):
    return {IdentityLine: IdentityLegend(), PathCollection: PointTreatmentLegend(),
            **(handler_map or {})}


def legend_entries(ax, handler_map=None):
    """Collect attached handles in native order, adding owned literal labels.

    Native artists still pass through Matplotlib's eligibility and handler rules.
    Only explicitly labelled Figurestead handles opt out of underscore filtering.
    """
    handlers = legend_handlers(handler_map)
    native, labels = ax.get_legend_handles_labels(legend_handler_map=handlers)
    native_labels = {id(handle): label for handle, label in zip(native, labels)}
    supported = {**Legend.get_default_handler_map(), **handlers}
    handles, texts, seen = [], [], set()
    for handle in [*ax.get_children(), *ax.containers, *native]:
        if id(handle) in seen:
            continue
        seen.add(id(handle))
        label = native_labels.get(id(handle))
        if getattr(handle, "_figurestead_authored_label", False):
            label = handle.get_label()
            if Legend.get_legend_handler(supported, handle) is None:
                continue
        if label:
            handles.append(handle)
            texts.append(label)
    return _apply_legend_ranks(handles, texts)


def _apply_legend_ranks(handles, texts):
    """Reorder only handles that recorded a legend rank, in the slots they occupy.

    Unranked handles, including caller-owned artists, stay where native order
    put them. Ranks are private to scatter and strip_summary series orders.
    """
    if not any(getattr(handle, "_figurestead_legend_rank", None) is not None for handle in handles):
        return handles, texts
    pairs = list(zip(handles, texts))
    ranked = [index for index, (handle, _) in enumerate(pairs)
              if getattr(handle, "_figurestead_legend_rank", None) is not None]
    chosen = sorted(
        (pairs[index] for index in ranked),
        key=lambda pair: pair[0]._figurestead_legend_rank,
    )
    for index, pair in zip(ranked, chosen):
        pairs[index] = pair
    return [handle for handle, _ in pairs], [text for _, text in pairs]


def literal_legend(ax, handles, labels, **kwargs):
    # Matplotlib 3.7 also filters explicitly supplied underscore labels. Empty
    # construction labels bypass that version-dependent rule; set the actual
    # text before any draw. No fake text or altered body labels are exposed.
    if not handles:
        return ax.legend(**kwargs)
    legend = ax.legend(handles, [""] * len(handles), **kwargs)
    for text, label in zip(legend.get_texts(), labels):
        text.set_text(label)
    return legend
