"""Renderer-measured subtitle wrapping, planned before axes/title painting."""
import re
from types import MethodType
from numbers import Real
import matplotlib as mpl
from matplotlib.transforms import Bbox
from matplotlib.artist import Artist
from matplotlib.layout_engine import ConstrainedLayoutEngine


# Compare actual display geometry, not normalized positions or a rounded cache.
# One ten-millionth of a renderer pixel ignores floating-point noise, not ink.
# Twelve allocation-only passes bound work even for a nonconvergent engine.
_LAYOUT_PASSES = 12
_LAYOUT_TOLERANCE = 1e-7


class _LayoutFailure(Exception):
    """Carry errors past Figure.draw's catch-and-ignore of engine ValueError."""


def _geometry(figure, headers, renderer):
    values = [v for ax in figure.axes for v in ax.bbox.bounds]
    texts = []
    for header in headers:
        state = header._state()
        try:
            boxes = header._prepare(renderer)
            values.extend(v for box in boxes for v in box.bounds)
            texts.append(header.text.get_text())
        finally:
            header._restore(state)
    return values, texts


def _settled_draw(figure, renderer, original_draw):
    headers = [a for a in figure.artists if isinstance(a, SubtitleLayout)]
    engine = figure.get_layout_engine()
    if not headers or engine is None:
        return original_draw(renderer)
    # Restore the whole allocation transaction if preparation or painting fails.
    states = [(h, h._state()) for h in headers]
    positions = [(a, a.get_position().frozen(), a.get_position(original=True).frozen(),
                  a.get_in_layout()) for a in figure.axes]
    subplot = {k: getattr(figure.subplotpars, k)
               for k in ('left', 'right', 'bottom', 'top', 'wspace', 'hspace')}
    execute = engine.execute
    had_override = 'execute' in vars(engine)
    override = vars(engine).get('execute')

    def settle(target):
        previous = None
        try:
            for _ in range(_LAYOUT_PASSES):
                result = execute(target)
                current = _geometry(target, headers, renderer)
                if (previous is not None and current[1] == previous[1]
                        and len(current[0]) == len(previous[0])):
                    if all(abs(a-b) <= _LAYOUT_TOLERANCE
                           for a, b in zip(current[0], previous[0])):
                        return result
                previous = current
            raise RuntimeError('PlotSpec.subtitle: layout did not converge within 12 allocation passes')
        except Exception as error:
            raise _LayoutFailure(error) from error

    engine.execute = settle
    try:
        return original_draw(renderer)
    except Exception as error:
        figure.subplotpars.update(**subplot)
        for ax, active, original, in_layout in positions:
            ax._set_position(original, which='original')
            ax._set_position(active, which='active')
            ax.set_in_layout(in_layout)
        for header, state in states:
            header._restore(state)
        if isinstance(error, _LayoutFailure):
            raise error.args[0]
        raise
    finally:
        if had_override:
            engine.execute = override
        else:
            del engine.execute


class SubtitleLayout(Artist):
    def __init__(self, ax, text, title):
        super().__init__()
        self.ax, self.text, self.title = ax, text, title
        self.authored = text.get_text()
        self.title_position = title.get_position()
        self.auto_title = ax._autotitlepos
        self.set_zorder(-99)
        self.set_in_layout(False)
        ax.figure.add_artist(self)
        if not hasattr(ax.figure, '_figurestead_subtitle_draw'):
            original_draw = ax.figure.draw
            def draw(figure, renderer):
                return _settled_draw(figure, renderer, original_draw)
            adapter = MethodType(draw, ax.figure)
            ax.figure._figurestead_subtitle_draw = original_draw, adapter
            ax.figure.draw = adapter
        # Layout engines ask the axes for its tight bounds before painting.
        # Supply the measured header there, transactionally: allocation must see
        # wrapping on the first pass, without using a failed draw as preparation.
        self.original_tightbbox = ax.get_tightbbox
        def header_tightbbox(axes, renderer=None, *args, **kwargs):
            renderer = renderer or axes.figure._get_renderer()
            state = self._state()
            try:
                box, title_box = self._prepare(renderer)
                result = self.original_tightbbox(renderer, *args, **kwargs)
                if self.tight_export and self.export_prepared and result is not None:
                    header = Bbox.union([box, title_box]) if self.title.get_text() else box
                    self.tight_header_included = (result.x0 <= header.x0 and result.x1 >= header.x1
                                                  and result.y0 <= header.y0 and result.y1 >= header.y1)
                return result
            finally:
                self._restore(state)
        self.tightbbox = MethodType(header_tightbbox, ax)
        ax.get_tightbbox = self.tightbbox
        self.tight_export = False
        self.export_prepared = False
        self.tight_header_included = False
        self.original_savefig = ax.figure.savefig
        def savefig(figure, *args, **kwargs):
            previous = self.tight_export, self.export_prepared, self.tight_header_included
            crop = kwargs.get('bbox_inches')
            if crop is None:
                crop = mpl.rcParams['savefig.bbox']
            padding = kwargs.get('pad_inches')
            if padding is None:
                padding = mpl.rcParams['savefig.pad_inches']
            if padding == 'layout':
                engine = figure.get_layout_engine()
                pads = ([engine.get()['h_pad'], engine.get()['w_pad']]
                        if isinstance(engine, ConstrainedLayoutEngine)
                        else [mpl.rcParams['savefig.pad_inches']])
            else:
                pads = [padding]
            # Only nonnegative padding preserves the proven tight bounds.
            self.tight_export = (isinstance(crop, str) and crop == 'tight'
                                 and all(isinstance(p, Real) and p >= 0 for p in pads))
            self.export_prepared = False
            self.tight_header_included = False
            try:
                return self.original_savefig(*args, **kwargs)
            finally:
                self.tight_export, self.export_prepared, self.tight_header_included = previous
        self.savefig = MethodType(savefig, ax.figure)
        ax.figure.savefig = self.savefig

    def remove(self):
        if self.ax.get_tightbbox == self.tightbbox:
            self.ax.get_tightbbox = self.original_tightbbox
        if self.ax.figure.savefig == self.savefig:
            self.ax.figure.savefig = self.original_savefig
        figure = self.ax.figure
        super().remove()
        if not any(isinstance(a, SubtitleLayout) for a in figure.artists):
            original, adapter = figure._figurestead_subtitle_draw
            if figure.draw == adapter:
                figure.draw = original
            del figure._figurestead_subtitle_draw

    def _state(self):
        return self.text.get_text(), self.title.get_position(), self.ax._autotitlepos

    def _restore(self, state):
        text, position, auto = state
        self.text.set_text(text)
        self.title.set_position(position)
        self.ax._autotitlepos = auto

    def _prepare(self, renderer):
        ax, text, title = self.ax, self.text, self.title
        # Always remeasure the original string and title position, never the last
        # wrapped result. This also runs for vector export and export DPI changes.
        text.set_text(self.authored)
        title.set_position(self.title_position)
        ax._autotitlepos = self.auto_title
        pad = renderer.points_to_pixels(2)
        width = ax.bbox.width
        def measure(value):
            text.set_text(value)
            return text.get_window_extent(renderer)
        if measure(self.authored).width > width:
            lines = []
            for paragraph in self.authored.split('\n'):
                remaining = paragraph
                while remaining and measure(remaining).width > width:
                    # Prefer whitespace; split a long token only when necessary.
                    fit = 0
                    for end in range(1, len(remaining) + 1):
                        if measure(remaining[:end]).width > width: break
                        fit = end
                    if not fit:
                        raise ValueError('PlotSpec.subtitle: header is too narrow; enlarge the figure or shorten the subtitle')
                    breaks = [m.end() for m in re.finditer(r'\s+', remaining[:fit])]
                    cut = breaks[-1] if breaks else fit
                    lines.append(remaining[:cut]); remaining = remaining[cut:]
                lines.append(remaining)
            text.set_text('\n'.join(lines))
        else:
            text.set_text(self.authored)
        box = text.get_window_extent(renderer)
        title_box = title.get_window_extent(renderer)
        if title.get_text() and box.y1 + pad > title_box.y0:
            title.set_y(self.title_position[1] + (box.y1 + pad - title_box.y0) / ax.bbox.height)
            ax._autotitlepos = False
            title_box = title.get_window_extent(renderer)
        return box, title_box

    def draw(self, renderer):
        state = self._state()
        try:
            box, title_box = self._prepare(renderer)
            fig = self.ax.figure
            frame = fig.bbox
            cropped = tuple(fig.transFigure.transform_bbox(Bbox.unit()).bounds) != tuple(frame.bounds)
            # savefig("tight") first draws/validates the untrimmed figure, then
            # crops to get_tightbbox, which includes the axes and this title.
            # The subtitle is within the axes width and below the title. Thus
            # that automatic crop already contains the header. Do not re-test
            # its translated boundary: SVG's inch/point round trip can put an
            # identical edge a few ULPs beyond itself. No tolerance is applied
            # to ordinary output or caller-specified crop rectangles.
            automatic_crop = self.tight_export and self.export_prepared and self.tight_header_included and cropped
            # Separation is internal header geometry. Exterior whitespace is
            # not a containment requirement (notably for zero-pad tight crops).
            if not automatic_crop and (box.x0 < frame.x0 or box.x1 > frame.x1 or box.y0 < frame.y0
                    or max(box.y1, title_box.y1) > frame.y1):
                raise ValueError('PlotSpec.subtitle: insufficient header height; enlarge the figure or shorten the subtitle')
            if self.tight_export and not cropped:
                self.export_prepared = True
        except Exception:
            self._restore(state)
            raise
        self.stale = False
