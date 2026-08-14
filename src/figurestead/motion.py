"""Semantic motion choreography for figurestead.

The final chart is always clean. Matrix rain and elevated lighting are transient
events that introduce evidence, then withdraw.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import matplotlib.colors as mcolors
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.lines import Line2D
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .core import GLYPHS, PlotSpec, ensure_axes, resolve, style_axes
from ._statistics import linear_fit


@dataclass(frozen=True)
class MotionTimeline:
    rain_in: tuple[float, float] = (0.06, 0.22)
    marks_enter: tuple[float, float] = (0.18, 0.72)
    summary_compiles: tuple[float, float] = (0.68, 0.84)
    rain_out: tuple[float, float] = (0.70, 0.92)
    settle: tuple[float, float] = (0.88, 1.00)


@dataclass(frozen=True)
class MotionStyle:
    frames: int = 72
    fps: int = 12
    rain_streams: int = 14
    rain_glyphs: int = 6
    lighting_peak: float = 0.105
    trail_alpha: float = 0.17
    seed: int = 73


def _window(progress, start, end):
    return np.clip((progress - start) / max(end - start, 1e-9), 0.0, 1.0)


def _smooth(value):
    value = np.clip(value, 0.0, 1.0)
    return value * value * (3.0 - 2.0 * value)


def _ease_out(value):
    value = np.clip(value, 0.0, 1.0)
    return 1.0 - (1.0 - value) ** 3


class RainLight:
    """Transient glyph field plus a soft instrument-light response."""

    def __init__(self, ax, theme, timeline, motion):
        self.ax = ax
        self.theme = theme
        self.timeline = timeline
        self.motion = motion
        rng = np.random.default_rng(motion.seed)
        self.streams = []

        for _ in range(motion.rain_streams):
            x = rng.uniform(0.015, 0.985)
            phase = rng.uniform(0.0, 1.45)
            speed = rng.uniform(0.48, 0.95)
            spacing = rng.uniform(0.045, 0.078)
            base_alpha = rng.uniform(0.065, 0.13)
            glyphs = rng.choice(GLYPHS, motion.rain_glyphs)
            artists = [
                ax.text(x, 0.0, str(glyph), transform=ax.transAxes,
                        ha="center", va="center", color=theme.primary,
                        alpha=0.0, fontsize=5.4, fontfamily="DejaVu Sans Mono",
                        zorder=-3, clip_on=True)
                for glyph in glyphs
            ]
            self.streams.append((x, phase, speed, spacing, base_alpha, artists))

        width = 360
        xgrid = np.linspace(0.0, 1.0, width)
        intensity = np.zeros(width)
        for x, *_ in self.streams:
            intensity += np.exp(-0.5 * ((xgrid - x) / 0.055) ** 2)
        intensity /= max(float(intensity.max()), 1e-9)
        vertical = np.linspace(0.40, 1.0, 160)[:, None]
        alpha = vertical * intensity[None, :]
        rgba = np.zeros((160, width, 4))
        rgba[..., :3] = mcolors.to_rgb(theme.primary)
        rgba[..., 3] = alpha
        self.wash = ax.imshow(rgba, extent=(0, 1, 0, 1), transform=ax.transAxes,
                              origin="lower", aspect="auto", interpolation="bilinear",
                              alpha=0.0, zorder=-7)

    def update(self, progress):
        rise = _smooth(_window(progress, *self.timeline.rain_in))
        fall = 1.0 - _smooth(_window(progress, *self.timeline.rain_out))
        envelope = float(rise * fall)
        mark_light = float(np.sin(np.pi * _window(progress, *self.timeline.marks_enter)) ** 2)
        self.wash.set_alpha(self.motion.lighting_peak * (0.72 * envelope + 0.28 * mark_light))

        for _, phase, speed, spacing, base_alpha, artists in self.streams:
            head = 1.18 - ((phase + progress * speed * 2.25) % 1.42)
            for index, artist in enumerate(artists):
                y = head + index * spacing
                visible = 0.0 <= y <= 1.0 and envelope > 0.001
                artist.set_visible(visible)
                if not visible:
                    continue
                fade = max(0.04, 1.0 - index / len(artists))
                artist.set_position((artist.get_position()[0], y))
                artist.set_color(self.theme.summary_core if index == 0 else self.theme.primary)
                artist.set_alpha(base_alpha * fade * envelope)


class PointTrickle:
    """Exact final positions with expressive, deterministic arrival paths."""

    def __init__(self, ax, final_x, final_y, starts, delays, duration, colors,
                 theme, profile, motion):
        self.final_x = np.asarray(final_x, dtype=float)
        self.final_y = np.asarray(final_y, dtype=float)
        self.starts = np.asarray(starts, dtype=float)
        self.delays = np.asarray(delays, dtype=float)
        self.duration = float(duration)
        self.colors = np.asarray([mcolors.to_rgba(color) for color in colors])
        self.profile = profile
        self.motion = motion

        offsets = np.column_stack([self.final_x, self.starts])
        transparent = self.colors.copy()
        transparent[:, 3] = 0.0
        self.glow = ax.scatter(self.final_x, self.starts,
                               s=profile.marker_size * 1.8, facecolors="none",
                               edgecolors=transparent, linewidths=1.8, zorder=3)
        self.rings = ax.scatter(self.final_x, self.starts,
                                s=profile.marker_size, facecolors="none",
                                edgecolors=transparent, linewidths=profile.edge_width,
                                zorder=4)
        self.cores = ax.scatter(self.final_x, self.starts,
                                s=profile.marker_size * max(profile.core_fraction, 0.10),
                                facecolors=transparent, edgecolors="none", zorder=5)
        self.trails = LineCollection([], linewidths=0.58, zorder=2)
        ax.add_collection(self.trails)
        self.rings.set_offsets(offsets)

    def update(self, progress):
        local = np.clip((progress - self.delays) / self.duration, 0.0, 1.0)
        eased = _ease_out(local)
        y = self.starts + (self.final_y - self.starts) * eased
        offsets = np.column_stack([self.final_x, y])
        visibility = _smooth(np.clip(local / 0.15, 0.0, 1.0))

        ring_colors = self.colors.copy()
        ring_colors[:, 3] = self.profile.marker_alpha * visibility
        core_colors = self.colors.copy()
        core_colors[:, 3] = self.profile.marker_alpha * 0.58 * visibility
        glow_colors = self.colors.copy()
        glow_colors[:, 3] = 0.065 * visibility * (0.4 + 0.6 * (1.0 - eased))

        self.rings.set_offsets(offsets)
        self.rings.set_edgecolors(ring_colors)
        self.cores.set_offsets(offsets)
        self.cores.set_facecolors(core_colors)
        self.glow.set_offsets(offsets)
        self.glow.set_edgecolors(glow_colors)

        trail_length = 0.05 + 0.34 * (1.0 - eased)
        segments = [((x, cy + 0.025), (x, cy + length))
                    for x, cy, length in zip(self.final_x, y, trail_length)]
        trail_colors = self.colors.copy()
        trail_colors[:, 3] = self.motion.trail_alpha * visibility * (1.0 - eased)
        self.trails.set_segments(segments)
        self.trails.set_color(trail_colors)


def _proxy_handles(labels, colors, theme, profile):
    handles = []
    for label, color in zip(labels, colors):
        handles.append(Line2D([], [], linestyle="none", marker="o", markersize=5.4,
                              markerfacecolor=theme.field, markeredgecolor=color,
                              markeredgewidth=profile.edge_width, label=str(label)))
    return handles


def _capture(fig):
    fig.canvas.draw()
    return Image.frombuffer("RGBA", fig.canvas.get_width_height(),
                            fig.canvas.buffer_rgba(), "raw", "RGBA", 0, 1).convert("RGB").copy()


def _save_animation(fig, update, output, motion, *, storyboard=False):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    images = []
    checkpoints = {}
    checkpoint_indices = {0, int((motion.frames - 1) * 0.30),
                          int((motion.frames - 1) * 0.62),
                          int((motion.frames - 1) * 0.82), motion.frames - 1}
    for index in range(motion.frames):
        progress = index / max(motion.frames - 1, 1)
        update(progress)
        image = _capture(fig)
        images.append(image)
        if index in checkpoint_indices:
            checkpoints[index] = image.copy()

    quantized = [image.quantize(colors=128, method=Image.Quantize.MEDIANCUT,
                                dither=Image.Dither.FLOYDSTEINBERG)
                 for image in images]
    duration = round(1000 / motion.fps)
    durations = [duration] * (len(quantized) - 1) + [duration * 8]
    quantized[0].save(output, save_all=True, append_images=quantized[1:],
                      duration=durations, loop=0, optimize=True)
    images[-1].save(output.with_suffix(".final.png"))
    if storyboard:
        _save_storyboard(checkpoints, output.with_name(output.stem + "_storyboard.png"))
    plt.close(fig)
    return output


def _save_storyboard(checkpoints, output):
    frames = [checkpoints[index] for index in sorted(checkpoints)]
    labels = ["DORMANT", "RAIN / LIGHT", "DATA TRICKLE", "COMPILE", "SETTLED"]
    tile_w = 360
    ratio = frames[0].height / frames[0].width
    tile_h = round(tile_w * ratio)
    header = 34
    canvas = Image.new("RGB", (tile_w * len(frames), tile_h + header), "#010604")
    draw = ImageDraw.Draw(canvas)
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
    font = ImageFont.truetype(font_path, 12) if Path(font_path).exists() else None
    for index, (frame, label) in enumerate(zip(frames, labels)):
        x = index * tile_w
        canvas.paste(frame.resize((tile_w, tile_h), Image.Resampling.LANCZOS), (x, header))
        draw.text((x + 10, 9), f"0{index + 1}  {label}", fill="#8fbfa7", font=font)
    canvas.save(output)


def animate_strip_summary(groups, values, *, series=None, order=None, labels=None,
                          spec=None, theme="slipware", profile="deep_scope",
                          timeline=None, motion=None, output="strip_trickle.gif"):
    groups = np.asarray(groups)
    values = np.asarray(values, dtype=float)
    if len(groups) != len(values):
        raise ValueError("groups and values must have the same length")
    series = np.zeros(len(values), dtype=int) if series is None else np.asarray(series)
    if len(series) != len(values):
        raise ValueError("series must match values")
    order = list(dict.fromkeys(groups.tolist())) if order is None else list(order)
    labels = list(np.unique(series)) if labels is None else list(labels)
    spec = spec or PlotSpec("Strip summary", "Evidence arrives; the statistic compiles afterward.")
    timeline = timeline or MotionTimeline()
    motion = motion or MotionStyle()
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(figsize=(9.2, 5.7))
    style_axes(ax, theme, profile, spec, atmosphere=False)

    positions = {name: index for index, name in enumerate(order)}
    rng = np.random.default_rng(motion.seed)
    final_x = np.array([positions[item] for item in groups], dtype=float)
    final_x += rng.uniform(-0.13, 0.13, len(final_x))
    y_min = min(0.0, float(values.min()) - 0.12 * np.ptp(values))
    y_max = float(values.max()) + max(0.45, 0.15 * np.ptp(values))
    ax.set_xlim(-0.55, len(order) - 0.45)
    ax.set_ylim(y_min, y_max)
    ax.set_xticks(range(len(order)), order)

    unique_series = list(np.unique(series))
    color_map = {value: theme.series[index % len(theme.series)]
                 for index, value in enumerate(unique_series)}
    colors = [color_map[value] for value in series]
    group_index = np.array([positions[item] for item in groups], dtype=float)
    group_norm = group_index / max(len(order) - 1, 1)
    delays = timeline.marks_enter[0] + 0.10 * group_norm + rng.uniform(0.0, 0.14, len(values))
    starts = np.full(len(values), y_max) + rng.uniform(0.15, 0.95, len(values))
    trickle = PointTrickle(ax, final_x, values, starts, delays, 0.31,
                           colors, theme, profile, motion)
    rain = RainLight(ax, theme, timeline, motion)

    handles = _proxy_handles(labels, [color_map[value] for value in unique_series], theme, profile)
    if len(handles) > 1:
        ax.legend(handles=handles, frameon=False, fontsize=7, labelcolor=theme.label,
                  loc="upper right")

    summary_artists = []
    count_artists = []
    for name, center in positions.items():
        selected = values[groups == name]
        median = float(np.median(selected))
        glow, = ax.plot([center, center], [median, median], color=theme.primary,
                        linewidth=5.0, alpha=0.0, solid_capstyle="butt", zorder=6)
        core, = ax.plot([center, center], [median, median], color=theme.summary_core,
                        linewidth=1.55, alpha=0.0, solid_capstyle="butt", zorder=7)
        summary_artists.append((center, median, glow, core))
        count_artists.append(ax.text(center, 0.965, f"n={len(selected)}",
                                     transform=ax.get_xaxis_transform(), ha="center", va="top",
                                     color=theme.secondary, fontsize=6.3,
                                     fontfamily="DejaVu Sans Mono", alpha=0.0))

    def update(progress):
        rain.update(progress)
        trickle.update(progress)
        compilation = float(_smooth(_window(progress, *timeline.summary_compiles)))
        for center, median, glow, core in summary_artists:
            half = 0.28 * compilation
            glow.set_data([center - half, center + half], [median, median])
            core.set_data([center - half, center + half], [median, median])
            glow.set_alpha(0.16 * compilation)
            core.set_alpha(0.96 * compilation)
        for artist in count_artists:
            artist.set_alpha(0.72 * compilation)

    return _save_animation(fig, update, output, motion, storyboard=True)


def animate_scatter(x, y, *, series=None, labels=None, spec=None,
                    theme="slipware", profile="deep_scope", timeline=None,
                    motion=None, compile_fit=True, output="scatter_trickle.gif"):
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    if len(x) != len(y):
        raise ValueError("x and y must have the same length")
    fit = linear_fit(x, y) if compile_fit else None
    series = np.zeros(len(x), dtype=int) if series is None else np.asarray(series)
    labels = list(np.unique(series)) if labels is None else list(labels)
    spec = spec or PlotSpec("Relationship", "Marks resolve first; the fitted relation compiles second.")
    timeline = timeline or MotionTimeline()
    motion = motion or MotionStyle()
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(figsize=(9.2, 5.7))
    style_axes(ax, theme, profile, spec, atmosphere=False)
    x_pad = max(0.2, 0.08 * np.ptp(x))
    y_pad = max(0.2, 0.12 * np.ptp(y))
    ax.set_xlim(float(x.min()) - x_pad, float(x.max()) + x_pad)
    ax.set_ylim(float(y.min()) - y_pad, float(y.max()) + y_pad)

    rng = np.random.default_rng(motion.seed + 1)
    unique_series = list(np.unique(series))
    color_map = {value: theme.series[index % len(theme.series)]
                 for index, value in enumerate(unique_series)}
    colors = [color_map[value] for value in series]
    delays = timeline.marks_enter[0] + rng.uniform(0.0, 0.25, len(y))
    starts = np.full(len(y), ax.get_ylim()[1]) + rng.uniform(0.12, 0.75, len(y))
    trickle = PointTrickle(ax, x, y, starts, delays, 0.30, colors, theme, profile, motion)
    rain = RainLight(ax, theme, timeline, motion)
    handles = _proxy_handles(labels, [color_map[value] for value in unique_series], theme, profile)
    if len(handles) > 1:
        ax.legend(handles=handles, frameon=False, fontsize=7, labelcolor=theme.label,
                  loc="upper left")

    fit_line, = ax.plot([], [], color=theme.summary_core, linewidth=1.35,
                        alpha=0.0, zorder=7)
    fit_glow, = ax.plot([], [], color=theme.primary, linewidth=5.0,
                        alpha=0.0, zorder=6)
    fit_x = np.linspace(float(x.min()), float(x.max()), 120)
    slope, intercept = fit if fit is not None else (0.0, 0.0)
    fit_y = slope * fit_x + intercept

    def update(progress):
        rain.update(progress)
        trickle.update(progress)
        compilation = float(_smooth(_window(progress, *timeline.summary_compiles))) if compile_fit else 0.0
        count = max(2, int(len(fit_x) * compilation))
        fit_glow.set_data(fit_x[:count], fit_y[:count])
        fit_line.set_data(fit_x[:count], fit_y[:count])
        fit_glow.set_alpha(0.13 * compilation)
        fit_line.set_alpha(0.88 * compilation)

    return _save_animation(fig, update, output, motion)


def animate_line(x, ys, *, labels=None, spec=None, theme="slipware",
                 profile="deep_scope", timeline=None, motion=None,
                 output="line_trickle.gif"):
    x = np.asarray(x, dtype=float)
    ys = np.atleast_2d(np.asarray(ys, dtype=float))
    if ys.shape[1] != len(x):
        raise ValueError("Each line must match x")
    labels = labels or [f"series {index + 1}" for index in range(len(ys))]
    spec = spec or PlotSpec("Time series", "Samples arrive; traces conduct through settled evidence.")
    timeline = timeline or MotionTimeline()
    motion = motion or MotionStyle()
    theme, profile = resolve(theme, profile)
    fig, ax = ensure_axes(figsize=(9.2, 5.7))
    style_axes(ax, theme, profile, spec, atmosphere=False)
    y_flat = ys.ravel()
    x_pad = max(0.1, 0.025 * np.ptp(x))
    y_pad = max(0.1, 0.12 * np.ptp(y_flat))
    ax.set_xlim(float(x.min()) - x_pad, float(x.max()) + x_pad)
    ax.set_ylim(float(y_flat.min()) - y_pad, float(y_flat.max()) + y_pad)

    rain = RainLight(ax, theme, timeline, motion)
    x_norm = (x - x.min()) / max(float(np.ptp(x)), 1e-9)
    rng = np.random.default_rng(motion.seed + 2)
    trickles = []
    lines = []
    line_glows = []
    for index, y in enumerate(ys):
        color = theme.series[index % len(theme.series)]
        delays = timeline.marks_enter[0] + 0.30 * x_norm + rng.uniform(0.0, 0.045, len(x))
        starts = np.full(len(x), ax.get_ylim()[1]) + rng.uniform(0.10, 0.55, len(x))
        trickles.append(PointTrickle(ax, x, y, starts, delays, 0.24,
                                     [color] * len(x), theme, profile, motion))
        glow, = ax.plot([], [], color=color, linewidth=4.6, alpha=0.0, zorder=6)
        core, = ax.plot([], [], color=color, linewidth=1.35, alpha=0.0,
                        label=labels[index], zorder=7)
        line_glows.append(glow)
        lines.append(core)
    ax.legend(frameon=False, fontsize=7, labelcolor=theme.label, loc="upper right")

    def update(progress):
        rain.update(progress)
        for trickle in trickles:
            trickle.update(progress)
        compilation = float(_smooth(_window(progress, *timeline.summary_compiles)))
        count = max(2, int(len(x) * compilation))
        for y, glow, core in zip(ys, line_glows, lines):
            glow.set_data(x[:count], y[:count])
            core.set_data(x[:count], y[:count])
            glow.set_alpha(0.09 * compilation)
            core.set_alpha(0.90 * compilation)

    return _save_animation(fig, update, output, motion)
