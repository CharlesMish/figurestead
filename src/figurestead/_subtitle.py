"""Renderer-measured subtitle wrapping, planned before axes/title painting."""
import re
from matplotlib.artist import Artist


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

    def draw(self, renderer):
        ax, text, title = self.ax, self.text, self.title
        # Always remeasure the original string and title position, never the last
        # wrapped result. This also runs for vector export and export DPI changes.
        text.set_text(self.authored)
        title.set_position(self.title_position)
        ax._autotitlepos = self.auto_title
        pad = renderer.points_to_pixels(2)
        width = min(ax.bbox.x1, ax.figure.bbox.x1 - pad) - ax.bbox.x0
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
        frame = ax.figure.bbox
        if (box.x0 < frame.x0 or box.x1 > frame.x1 or box.y0 < frame.y0
                or max(box.y1, title_box.y1) > frame.y1 - pad):
            raise ValueError('PlotSpec.subtitle: insufficient header height; enlarge the figure or shorten the subtitle')
        self.stale = False
