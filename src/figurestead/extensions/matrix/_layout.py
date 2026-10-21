"""Measured ownership of categorical-matrix headers, axes and footer.

Only a matrix-created figure may allocate more space. Caller axes retain their
positions (apart from the pre-existing Matplotlib colorbar allocation).
"""
from types import MethodType

import numpy as np
from matplotlib.artist import Artist
from matplotlib.legend import Legend
from matplotlib.text import Text
from matplotlib.transforms import Bbox

from figurestead._note import NoteText
from figurestead._subtitle import SubtitleLayout


_TOLERANCE = 1e-7  # display-pixel round-off, not an exterior padding allowance
_PASSES = 12


def _error(detail):
    return ValueError(
        f"categorical_matrix: insufficient decoration space ({detail}); "
        "enlarge the figure, shorten category/status labels, or adjust caller "
        "subplot margins before drawing"
    )


class MatrixLegend(Legend):
    """A required status key below the measured x-axis, never an axes fraction."""

    def _place(self, renderer):
        ax = self.axes
        axis = ax.xaxis.get_tightbbox(renderer) if ax.axison else None
        bottom = min(ax.bbox.y0, axis.y0) if axis is not None else ax.bbox.y0
        point = ax.transAxes.inverted().transform(
            (ax.bbox.x0, bottom - renderer.points_to_pixels(3)))
        self.set_bbox_to_anchor(point, transform=ax.transAxes)

    def get_window_extent(self, renderer=None):
        renderer = renderer or self.figure._get_renderer()
        self._place(renderer)
        return super().get_window_extent(renderer)

    def get_tightbbox(self, renderer=None):
        return self.get_window_extent(renderer)

    def draw(self, renderer):
        self._place(renderer)
        super().draw(renderer)


class MatrixNote(NoteText):
    """Keep the ordinary measured/wrapped note beneath the required status key."""

    def _layout(self, renderer):
        box = super()._layout(renderer)
        legend = self.axes.get_legend()
        if isinstance(legend, MatrixLegend) and legend.get_visible():
            top = legend.get_window_extent(renderer).y0 - renderer.points_to_pixels(3)
            self.set_position(self.axes.transAxes.inverted().transform(
                ((self.axes.bbox.x0 + self.axes.bbox.x1) / 2, top)))
            box = Text.get_window_extent(self, renderer)
        return box


def _positions(figure):
    return [(ax, ax.get_position().frozen(), ax.get_position(original=True).frozen(),
             ax.get_in_layout()) for ax in figure.axes]


def _restore_positions(positions):
    for ax, active, original, in_layout in positions:
        ax._set_position(original, which="original")
        ax._set_position(active, which="active")
        ax.set_in_layout(in_layout)


def _draw(figure, renderer, original):
    layouts = [a for a in figure.artists if isinstance(a, MatrixLayout) and a.active()]
    if not layouts:
        return original(renderer)
    positions = _positions(figure)
    subplot = {k: getattr(figure.subplotpars, k)
               for k in ("left", "right", "bottom", "top", "wspace", "hspace")}
    headers = [(a, a._state()) for a in figure.artists if isinstance(a, SubtitleLayout)]
    notes = [(t, t.get_text(), t.get_position()) for a in figure.axes
             for t in a.texts if isinstance(t, MatrixNote)]
    states = [(layout, layout.baseline, layout.last, layout.subplot) for layout in layouts]
    try:
        for layout in layouts:
            layout.start()
        result = original(renderer)
        for layout in layouts:
            layout.last = tuple(a.get_position(original=True).frozen() for a in layout.layout_axes)
        return result
    except Exception as error:
        _restore_positions(positions)
        figure.subplotpars.update(**subplot)
        for header, state in headers:
            header._restore(state)
        for note, text, position in notes:
            Text.set_text(note, text)
            note.set_position(position)
        for layout, baseline, last, subplot_state in states:
            layout.baseline, layout.last, layout.subplot = baseline, last, subplot_state
        if (isinstance(error, RuntimeError)
                and str(error) == "PlotSpec.subtitle: layout did not converge within 12 allocation passes"):
            raise _error("layout engine did not converge within 12 allocation passes") from error
        raise


class MatrixLayout(Artist):
    """Validate the complete decoration set before the first axes is painted."""

    def __init__(self, ax, image, colorbar, *, owned):
        super().__init__()
        self.ax, self.image = ax, image
        self.layout_axes = (ax, colorbar.ax)
        self.owned = owned
        self.baseline = tuple(a.get_position(original=True).frozen() for a in self.layout_axes)
        self.last = self.baseline
        self.subplot = {k: getattr(ax.figure.subplotpars, k)
                        for k in ("left", "right", "bottom", "top", "wspace", "hspace")}
        self.set_zorder(-100)
        self.set_in_layout(False)
        ax.figure.add_artist(self)
        if not hasattr(ax.figure, "_figurestead_matrix_draw"):
            original = ax.figure.draw
            def draw(figure, renderer):
                return _draw(figure, renderer, original)
            adapter = MethodType(draw, ax.figure)
            ax.figure._figurestead_matrix_draw = original, adapter
            ax.figure.draw = adapter

    def active(self):
        return (self.ax in self.figure.axes and self.layout_axes[1] in self.figure.axes
                and self.image in self.ax.images)

    def cropped(self):
        return tuple(self.figure.transFigure.transform_bbox(Bbox.unit()).bounds) != tuple(self.figure.bbox.bounds)

    def start(self):
        engine = self.figure.get_layout_engine()
        if (engine is not None and not engine.colorbar_gridspec
                and self.layout_axes[1].get_subplotspec() is not None):
            raise _error("select constrained layout before creating the matrix/colorbar")
        if not self.owned or self.cropped():
            return
        current = tuple(a.get_position(original=True).frozen() for a in self.layout_axes)
        # Honor explicit caller adjustments between draws. Our own allocation
        # is always measured again from the same input, not accumulated.
        if any(not np.array_equal(a.extents, b.extents) for a, b in zip(current, self.last)):
            self.baseline = current
            self.subplot = {k: getattr(self.figure.subplotpars, k) for k in self.subplot}
        self.figure.subplotpars.update(**self.subplot)
        for ax, position in zip(self.layout_axes, self.baseline):
            ax._set_position(position)

    def decorations(self, renderer):
        boxes = []
        def text(name, artist):
            if artist.get_visible() and artist.get_text():
                box = artist.get_window_extent(renderer)
                if box.width > 0 and box.height > 0:
                    boxes.append((name, box))
        for ax in self.layout_axes:
            locator = ax.get_axes_locator()
            ax.apply_aspect(locator(ax, renderer) if locator else None)
            for axis in (ax.xaxis, ax.yaxis):
                if ax.axison and axis.get_visible():
                    axis.get_tightbbox(renderer)
            ax._update_title_position(renderer)
        for header in self.figure.artists:
            if isinstance(header, SubtitleLayout) and header.ax is self.ax:
                header._prepare(renderer)
                text("subtitle", header.text)
        for index, ax in enumerate(self.layout_axes):
            prefix = "colorbar " if index else ""
            for kind, axis in (("x", ax.xaxis), ("y", ax.yaxis)):
                if ax.axison and axis.get_visible():
                    for tick in axis.get_ticklabels():
                        text(prefix + kind + " tick", tick)
                    text(prefix + kind + " label", axis.label)
                    text(prefix + kind + " offset", axis.offsetText)
            for title in (ax.title, ax._left_title, ax._right_title):
                text(prefix + "title", title)
        boxes.append(("colorbar", self.layout_axes[1].bbox.frozen()))
        legend = self.ax.get_legend()
        if isinstance(legend, MatrixLegend):
            if not legend.get_visible():
                raise _error("required status legend is hidden")
            boxes.append(("status legend", legend.get_window_extent(renderer)))
        for note in self.ax.texts:
            if isinstance(note, MatrixNote):
                text("note", note)
        return boxes

    def draw(self, renderer):
        if not self.active():
            return
        frame = self.figure.bbox
        for _ in range(_PASSES):
            boxes = self.decorations(renderer)
            if any(not np.isfinite(box.extents).all() for _, box in boxes):
                raise _error("non-finite decoration geometry")
            extent = Bbox.union([box for _, box in boxes] + [self.ax.bbox])
            overflow = np.array([max(0, frame.x0 - extent.x0), max(0, frame.y0 - extent.y0),
                                 max(0, extent.x1 - frame.x1), max(0, extent.y1 - frame.y1)])
            if max(overflow) <= _TOLERANCE:
                break
            if not self.owned or self.cropped():
                raise _error("required text or status key lies outside the figure")
            # Allocate exactly the measured excess plus a small physical gap.
            # Preserve the image/colorbar relation, data limits and cell values.
            old = Bbox.union([a.get_position(original=True) for a in self.layout_axes])
            old = self.figure.transFigure.transform_bbox(old)
            gap = renderer.points_to_pixels(3)
            delta = np.where(overflow > _TOLERANCE, overflow + gap, 0)
            new = Bbox.from_extents(old.x0 + delta[0], old.y0 + delta[1],
                                    old.x1 - delta[2], old.y1 - delta[3])
            if new.width <= 1 or new.height <= 1:
                raise _error("required labels leave no matrix area")
            for ax in self.layout_axes:
                position = self.figure.transFigure.transform_bbox(ax.get_position(original=True))
                x0 = new.x0 + (position.x0 - old.x0) * new.width / old.width
                x1 = new.x0 + (position.x1 - old.x0) * new.width / old.width
                y0 = new.y0 + (position.y0 - old.y0) * new.height / old.height
                y1 = new.y0 + (position.y1 - old.y0) * new.height / old.height
                ax._set_position(self.figure.transFigure.inverted().transform_bbox(
                    Bbox.from_extents(x0, y0, x1, y1)))
        else:
            raise _error("measured allocation did not settle")
        for index, (name, box) in enumerate(boxes):
            for other, candidate in boxes[index + 1:]:
                intersection = Bbox.intersection(box, candidate)
                if intersection is not None and min(intersection.width, intersection.height) > _TOLERANCE:
                    raise _error(f"{name} overlaps {other}")
        for peer in self.figure.axes:
            if peer not in self.layout_axes and peer.get_visible():
                obstacles = [peer.bbox]
                for axis in (peer.xaxis, peer.yaxis):
                    if axis.get_visible():
                        box = axis.get_tightbbox(renderer)
                        if box is not None:
                            obstacles.append(box)
                for name, box in boxes:
                    if any(box.overlaps(other) for other in obstacles):
                        raise _error(f"{name} overlaps a neighbouring axes")
        self.stale = False
