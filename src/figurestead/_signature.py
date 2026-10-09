"""Optional axes-owned branding, measured outside evidence on every draw."""

from __future__ import annotations

import numpy as np
from matplotlib.axes import Axes
from matplotlib.image import FigureImage
from matplotlib.text import Annotation, Text
from matplotlib.transforms import Bbox

from ._note import NoteText


def _axes_tree(axes):
    for ax in axes:
        if ax.get_visible():
            yield ax
            yield from _axes_tree(ax.child_axes)


def _figure_tree(figure):
    yield figure
    for child in figure.subfigs:
        if child.get_visible():
            yield from _figure_tree(child)


class SignatureText(Text):
    """Use spare footer space; omit branding when that space is occupied.

    Unlike a source note, a signature is optional decoration. It never changes
    axes positions or participates in layout allocation. Measurement and drawing
    make the same decision, including when the direct-label planner asks for its
    extent before axes painting. Omission does not change caller visibility, so
    a later resize can restore it. Clearing the axes retires it naturally.
    """

    def __init__(self, ax, value, *, left=False, **kwargs):
        super().__init__(0 if left else 1, 0, value, transform=ax.transAxes,
                         ha="left" if left else "right", va="top",
                         clip_on=False, **kwargs)
        self.set_in_layout(False)
        ax.add_artist(self)

    def _root_figure(self):
        figure = self.get_figure()
        while figure.get_figure() not in (None, figure):
            figure = figure.get_figure()
        return figure

    def _candidate(self, renderer):
        ax = self.axes
        bottom = ax.bbox.y0
        if ax.axison and ax.xaxis.get_visible():
            box = ax.xaxis.get_tightbbox(renderer)
            if box is not None:
                bottom = min(bottom, box.y0)
        for text in ax.texts:
            if text.get_visible() and (isinstance(text, NoteText)
                    or getattr(text, "_figurestead_strip_count", False)):
                bottom = min(bottom, text.get_window_extent(renderer).y0)
        x = ax.bbox.x0 if self.get_ha() == "left" else ax.bbox.x1
        self.set_position(ax.transAxes.inverted().transform(
            (x, bottom - renderer.points_to_pixels(3))))
        return super().get_window_extent(renderer)

    def _obstacles(self, renderer):
        fig = self._root_figure()

        def bounds(artist):
            if artist is self or not artist.get_visible():
                return
            if isinstance(artist, SignatureText):
                if artist.get_text():
                    yield artist._candidate(renderer)
            elif isinstance(artist, Text):
                if (artist.get_text() or isinstance(artist, Annotation)
                        and artist.arrow_patch is not None):
                    yield artist.get_window_extent(renderer)
                    if artist.get_bbox_patch() is not None:
                        artist.update_bbox_position_size(renderer)
                        yield artist.get_bbox_patch().get_window_extent(renderer)
            elif isinstance(artist, FigureImage):
                # FigureImage has no display bounding box; do not assume its
                # pixel-positioned image leaves room across export backends.
                yield fig.bbox
            else:
                box = artist.get_window_extent(renderer)
                if np.isfinite(box.extents).all():
                    yield box
                elif not artist.get_clip_on():
                    # An unclipped collection may expose no display extent.
                    yield fig.bbox

        for ax in _axes_tree(fig.axes):
            # Match the geometry that this axes will use even if it paints
            # later than our parent (notably top ticks and automatic titles).
            locator = ax.get_axes_locator()
            ax.apply_aspect(locator(ax, renderer) if locator else None)
            ax._update_title_position(renderer)
            # Protect the whole evidence rectangle, including empty regions.
            yield ax.bbox
            if ax.axison:
                for axis in (ax.xaxis, ax.yaxis):
                    if axis.get_visible():
                        box = axis.get_tightbbox(renderer)
                        if box is not None:
                            yield box
            for artist in ax.get_children():
                if isinstance(artist, Axes) or artist in (ax.xaxis, ax.yaxis):
                    continue
                yield from bounds(artist)
        for figure in _figure_tree(fig):
            for artist in figure.get_children():
                if (artist is figure.patch or isinstance(artist, Axes)
                        or artist in figure.subfigs):
                    continue
                yield from bounds(artist)

    def _prepare(self, renderer):
        # "Best" legends measure axes text while locating themselves. Nested
        # queries get candidates, not full placement, across the whole figure;
        # otherwise neighboring legends/signatures cause combinatorial work.
        fig = self._root_figure()
        if getattr(fig, "_figurestead_signature_measuring", False):
            return self._candidate(renderer)
        ax = self.axes
        empty = Bbox.from_bounds(ax.bbox.x0, ax.bbox.y0 - 1, 0, 0)
        if not self.get_visible() or not self.get_text():
            return empty
        box = self._candidate(renderer)
        frame = self.get_figure().bbox
        tolerance = 1e-7
        if (not np.isfinite(box.extents).all()
                or box.x0 < max(frame.x0, ax.bbox.x0) - tolerance
                or box.x1 > min(frame.x1, ax.bbox.x1) + tolerance
                or box.y0 < frame.y0 - tolerance or box.y1 > frame.y1 + tolerance):
            return empty
        gap = renderer.points_to_pixels(1)
        fig._figurestead_signature_measuring = True
        try:
            for other in self._obstacles(renderer):
                if np.isfinite(other.extents).all() and box.overlaps(other.padded(gap)):
                    return empty
        finally:
            del fig._figurestead_signature_measuring
        return box

    def get_window_extent(self, renderer=None, dpi=None):
        if renderer is None:
            renderer = self._renderer or self.get_figure()._get_renderer()
        if dpi is not None:
            from matplotlib import cbook
            with cbook._setattr_cm(self.get_figure(), dpi=dpi):
                return self._prepare(renderer)
        return self._prepare(renderer)

    def draw(self, renderer):
        if self._prepare(renderer).width > 0:
            super().draw(renderer)
        self.stale = False
