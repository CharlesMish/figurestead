"""Measured footer text, without axes allocation or figure method wrappers."""

from __future__ import annotations

import re

from matplotlib.text import Text


def _wrap_boundaries(value, parse_math):
    """Safe cuts preserve each original line's Matplotlib dollar semantics."""
    cuts = set(range(1, len(value) + 1))
    # An escaped dollar must not become an unescaped one on the next row.
    for escaped in re.finditer(r"\\\$", value):
        cuts.difference_update(range(escaped.start() + 1, escaped.end()))
    if parse_math:
        dollars = [match.start() for match in re.finditer(r"(?<!\\)\$", value)]
        if len(dollars) % 2 == 0:
            spans = zip(dollars[::2], dollars[1::2])
        else:
            # An odd dollar count makes the original line literal. Keep those
            # dollars together so a wrap cannot accidentally create a math row.
            spans = [(dollars[0], dollars[-1])] if len(dollars) > 1 else []
        for start, end in spans:
            cuts.difference_update(range(start + 1, end + 1))
    return cuts


class NoteText(Text):
    """Place a PlotSpec note below the actual x-axis decoration on every draw.

    Keeping the note an axes-owned Text means clearing or removing the axes
    retires it naturally. Layout engines see the same wrapped text as ordinary
    painting; no axes positions, data limits, or caller methods are replaced.
    """

    def __init__(self, ax, value, **kwargs):
        self.authored = value
        super().__init__(0.5, 0, value, transform=ax.transAxes,
                         ha="center", va="top", clip_on=False, **kwargs)
        ax.add_artist(self)

    def set_text(self, value):
        # Public edits replace the source, while internal wrapping always starts
        # from this source rather than the result of the previous renderer.
        super().set_text(value)
        self.authored = self.get_text()

    def _prepare(self, renderer):
        state = self.get_text(), self.get_position()
        try:
            return self._layout(renderer)
        except Exception:
            super().set_text(state[0])
            self.set_position(state[1])
            raise

    def _layout(self, renderer):
        ax = self.axes
        width = ax.bbox.width

        def measure(value):
            super(NoteText, self).set_text(value)
            return super(NoteText, self).get_window_extent(renderer)

        rows = []
        for paragraph in self.authored.split("\n"):
            remaining = paragraph
            while remaining and measure(remaining).width > width:
                # Prefer whitespace; split a long plain token only when needed.
                # Never measure or emit a prefix that bisects a math expression.
                boundaries = _wrap_boundaries(remaining, self.get_parse_math() or self.get_usetex())
                fit = 0
                for end in sorted(boundaries):
                    if measure(remaining[:end]).width > width:
                        break
                    fit = end
                if not fit:
                    raise ValueError("PlotSpec.note: footer is too narrow; enlarge the figure or shorten the note")
                breaks = [m.end() for m in re.finditer(r"\s+", remaining[:fit])
                          if m.end() in boundaries]
                cut = breaks[-1] if breaks else fit
                rows.append(remaining[:cut])
                remaining = remaining[cut:]
            rows.append(remaining)
        super().set_text("\n".join(rows))

        # Axis.get_tightbbox updates automatic tick/label/offset positions and
        # does not recurse into axes-owned text. Include a strip count band even
        # when a caller puts category ticks at the top or hides their labels.
        bottom = ax.bbox.y0
        if ax.axison and ax.xaxis.get_visible():
            box = ax.xaxis.get_tightbbox(renderer)
            if box is not None:
                bottom = min(bottom, box.y0)
        for text in ax.texts:
            if text.get_visible() and getattr(text, "_figurestead_strip_count", False):
                bottom = min(bottom, text.get_window_extent(renderer).y0)
        top = bottom - renderer.points_to_pixels(3)
        self.set_position(ax.transAxes.inverted().transform(
            ((ax.bbox.x0 + ax.bbox.x1) / 2, top)))
        return super().get_window_extent(renderer)

    def get_window_extent(self, renderer=None, dpi=None):
        if renderer is None:
            renderer = self._renderer or self.get_figure()._get_renderer()
        # Matplotlib may ask for extents at a different DPI. Match Text's
        # temporary-DPI behavior while doing the renderer-measured preparation.
        if dpi is not None:
            from matplotlib import cbook
            with cbook._setattr_cm(self.get_figure(), dpi=dpi):
                return self._prepare(renderer)
        return self._prepare(renderer)

    def draw(self, renderer):
        if not self.get_visible() or not self.authored:
            return
        state = self.get_text(), self.get_position()
        box = self._prepare(renderer)
        frame = self.get_figure().bbox
        # Crop transforms can introduce sub-pixel floating-point noise. This is
        # many orders smaller than any visible clipping, not a padding allowance.
        tolerance = 1e-7
        if (box.x0 < frame.x0 - tolerance or box.x1 > frame.x1 + tolerance
                or box.y0 < frame.y0 - tolerance or box.y1 > frame.y1 + tolerance):
            super().set_text(state[0])
            self.set_position(state[1])
            raise ValueError(
                "PlotSpec.note: insufficient footer space; enlarge the figure, "
                "shorten the note, or increase the bottom margin "
                "(for subplots, use fig.subplots_adjust(bottom=...))"
            )
        super().draw(renderer)
