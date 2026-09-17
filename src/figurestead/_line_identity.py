"""Open observation identities for the default line route (not scatter/poses)."""

import numpy as np
import matplotlib as mpl
from matplotlib.lines import Line2D
from matplotlib.markers import MarkerStyle
from matplotlib.legend_handler import HandlerBase
from matplotlib.transforms import IdentityTransform


# Point sizes, independently balanced rather than equal bounding boxes.
LINE_IDENTITIES = (("o", 6.0), ("s", 5.4), ("^", 7.0), ("D", 5.4))


def visible_intervals(a, b, centers, marker, size, padding=0.):
    """Subtract the union of convex marker interiors from one display segment."""
    delta = b - a
    blocked = []
    for center in centers:
        p = (a - center) / size
        d = delta / size
        if marker == "o":
            aa, bb, cc = d @ d, 2 * (p @ d), p @ p - (.5 + padding / size) ** 2
            disc = bb * bb - 4 * aa * cc
            if aa == 0 or disc <= 0:
                continue
            lo, hi = (-bb - np.sqrt(disc)) / (2 * aa), (-bb + np.sqrt(disc)) / (2 * aa)
        else:
            shape = MarkerStyle(marker)
            vertices = shape.get_path().transformed(shape.get_transform()).vertices[:-1].tolist()
            lo, hi = 0., 1.
            for v, w in zip(vertices, vertices[1:] + vertices[:1]):
                edge = np.subtract(w, v)
                cross = lambda q: edge[0] * q[1] - edge[1] * q[0]
                value, rate = cross(p - v) + padding / size * np.linalg.norm(edge), cross(d)
                if rate == 0:
                    if value < 0:
                        hi = -1
                        break
                elif rate > 0:
                    lo = max(lo, -value / rate)
                else:
                    hi = min(hi, -value / rate)
        if max(0., lo) < min(1., hi):
            blocked.append((max(0., lo), min(1., hi)))
    cursor = 0.
    for lo, hi in sorted(blocked):
        if lo > cursor:
            yield cursor, lo
        cursor = max(cursor, hi)
    if cursor < 1:
        yield cursor, 1.


class IdentityLine(Line2D):
    """Retain scientific data; remove only this stroke below its own markers.

    Recompute in display coordinates on every draw, including resize/export.
    No background is painted; overlapping holes are unioned, not XORed.
    """

    def draw(self, renderer):
        points = getattr(self, "identity_points", None)
        if points is None or not points.get_visible() or points.get_alpha() == 0:
            return super().draw(renderer)
        centers = points.get_offset_transform().transform(points.get_offsets())
        size = renderer.points_to_pixels(np.sqrt(points.get_sizes()[0]))
        vertices = self.get_transform().transform(self.get_xydata())
        proxy = Line2D([], [])
        proxy.update_from(self)
        proxy.set_figure(self.get_figure())
        proxy.set_transform(IdentityTransform())
        # Clip endpoints meet marker outlines; projecting caps must not refill holes.
        proxy.set_solid_capstyle("butt")
        proxy.set_dash_capstyle("butt")
        travelled = 0.
        offset, dashes = self._unscaled_dash_pattern
        dash_scale = self.get_linewidth() if mpl.rcParams["lines.scale_dashes"] else 1.
        for a, b in zip(vertices, vertices[1:]):
            length = np.linalg.norm(b - a)
            # Conservative stroke clearance also excludes oblique/self-crossing strokes,
            # not just the mathematical centerline. Existing edge strokes count too.
            clearance = renderer.points_to_pixels(self.get_linewidth() + getattr(self, "identity_edge_width", 0.)) / 2
            for lo, hi in visible_intervals(a, b, centers, self.identity_marker, size, clearance):
                ends = np.array([a + lo * (b - a), a + hi * (b - a)])
                proxy.set_data(ends[:, 0], ends[:, 1])
                if dashes is not None and dash_scale:
                    phase = (travelled + lo * length) / renderer.points_to_pixels(1) / dash_scale
                    proxy.set_linestyle((offset + phase, dashes))
                proxy.draw(renderer)
            travelled += length
        self.stale = False


class IdentityLegend(HandlerBase):
    """Use the body's current rhythm, color, edge treatment and marker size."""

    def create_artists(self, legend, orig, xd, yd, width, height, fontsize, trans):
        from matplotlib.collections import PathCollection
        points = orig.identity_points
        y, x = (height - yd) / 2, width / 2 - xd
        sample = IdentityLine([-xd, width - xd], [y, y])
        sample.update_from(orig)
        sample.set_transform(trans)
        sample.set_clip_on(False)
        marker = PathCollection(points.get_paths(), sizes=points.get_sizes(),
                                offsets=[(x, y)], offset_transform=trans,
                                facecolors="none", edgecolors=points.get_edgecolors(),
                                linewidths=points.get_linewidths(), alpha=1)
        marker.set_transform(IdentityTransform())
        marker.set_path_effects(points.get_path_effects())
        sample.identity_points = marker
        sample.identity_marker = orig.identity_marker
        sample.identity_edge_width = getattr(orig, "identity_edge_width", 0.)
        return [sample, marker]
