"""Literal labels on owned artists, without changing Matplotlib's selection."""

from matplotlib.legend import Legend

from ._line_identity import IdentityLine, IdentityLegend


def authored_label(artist, label):
    """Mark only the actual authored handle, never anonymous/support artists.

    Keep the artist's real label intact. Ownership lives on the handle, so clear
    and removal need no axes registry, and caller relabelling remains observable.
    Empty/None labels retain their existing no-label behavior.
    """
    artist._figurestead_authored_label = label is not None and str(label) != ""
    return artist


def legend_handlers(handler_map=None):
    return {IdentityLine: IdentityLegend(), **(handler_map or {})}


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
    return handles, texts


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
