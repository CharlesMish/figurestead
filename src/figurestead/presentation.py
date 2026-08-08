"""Opt-in presentation poses that compose existing scientific geometry."""

from __future__ import annotations

from dataclasses import dataclass
from copy import deepcopy
from typing import Mapping, Any

import matplotlib.patheffects as pe
import numpy as np

from .themes import Theme


@dataclass(frozen=True)
class ScientificPose:
    panel_surface: bool = True
    frame: bool = True
    curve: str = "monotone"
    line_width: float = 2.35
    marker_scale: float = 1.22
    series_markers: tuple[str, ...] = ("o", "s")
    legend_location: str = "lower right"


@dataclass(frozen=True)
class FocusAnnotation:
    x: float
    y: float
    label: str
    offset: tuple[float, float] = (42.0, -22.0)


@dataclass(frozen=True)
class EvidenceFocusAnnotation:
    mark_id: str
    label: str
    offset: tuple[float, float] = (42.0, -22.0)


SCIENTIFIC_POSE = ScientificPose()


def apply_scientific_pose(contract: Mapping[str, Any], *, focus: Mapping[str, FocusAnnotation | EvidenceFocusAnnotation] | None = None) -> dict[str, Any]:
    """Clone a portable figure and add the same opt-in pose used by the web renderer."""
    result = deepcopy(dict(contract))
    panels = result.get("panels")
    if not isinstance(panels, list) or not panels:
        raise ValueError("contract.panels must be a non-empty list")
    focus = focus or {}
    known = {str(panel.get("id")) for panel in panels}
    unknown = sorted(set(focus) - known)
    if unknown:
        raise ValueError(f"unknown focus panels: {', '.join(unknown)}")
    for panel in panels:
        presentation = {
            "panelSurface": True, "frame": True, "legend": "auto", "markerScale": 1.22,
            **({"curve": "monotone", "lineWidth": 2.35, "seriesMarkers": ["ring", "square"]} if panel.get("renderer") == "line" else {}),
            **dict(panel.get("presentation", {})),
        }
        panel["presentation"] = presentation
        if panel.get("renderer") == "line":
            panel["encoding"] = {**dict(panel.get("encoding", {})), "interpolation": "monotone"}
        item = focus.get(str(panel.get("id")))
        if item is not None:
            annotation = {"type": "focus", "label": item.label, "dx": item.offset[0], "dy": -item.offset[1]}
            if isinstance(item, EvidenceFocusAnnotation):
                if not item.mark_id.strip():
                    raise ValueError("EvidenceFocusAnnotation.mark_id must be non-empty")
                annotation["anchorId"] = item.mark_id
            else:
                annotation.update({"x": item.x, "y": item.y})
            panel["annotations"] = [*panel.get("annotations", []), annotation]
    return result


def apply_evidence_pose(contract: Mapping[str, Any], *, focus: Mapping[str, EvidenceFocusAnnotation]) -> dict[str, Any]:
    """Apply a pose whose callouts can only target compiled evidence mark IDs."""
    if any(not isinstance(item, EvidenceFocusAnnotation) for item in focus.values()):
        raise TypeError("apply_evidence_pose focus values must be EvidenceFocusAnnotation instances")
    return apply_scientific_pose(contract, focus=focus)


def resolve_pose(pose: ScientificPose | str | None) -> ScientificPose | None:
    if pose is None:
        return None
    if pose == "scientific":
        return SCIENTIFIC_POSE
    if isinstance(pose, ScientificPose):
        return pose
    raise ValueError("pose must be None, 'scientific', or ScientificPose")


def monotone_curve(x, y, *, samples_per_segment: int = 18):
    """Densify strictly increasing samples with shape-preserving cubic Hermite curves."""
    x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
    if len(x) < 2 or len(x) != len(y) or np.any(np.diff(x) <= 0):
        return x, y
    width = np.diff(x)
    delta = np.diff(y) / width
    tangent = np.empty_like(x)
    tangent[0], tangent[-1] = delta[0], delta[-1]
    if len(x) > 2:
        tangent[1:-1] = (delta[:-1] + delta[1:]) / 2
    for index, slope in enumerate(delta):
        if slope == 0:
            tangent[index:index + 2] = 0
            continue
        left, right = tangent[index] / slope, tangent[index + 1] / slope
        length = left * left + right * right
        if length > 9:
            scale = 3 / np.sqrt(length)
            tangent[index], tangent[index + 1] = scale * left * slope, scale * right * slope
    curve_x, curve_y = [], []
    for index in range(len(x) - 1):
        t = np.linspace(0, 1, samples_per_segment, endpoint=False)
        h00, h10 = 2 * t**3 - 3 * t**2 + 1, t**3 - 2 * t**2 + t
        h01, h11 = -2 * t**3 + 3 * t**2, t**3 - t**2
        curve_x.extend(x[index] + width[index] * t)
        curve_y.extend(h00 * y[index] + h10 * width[index] * tangent[index] + h01 * y[index + 1] + h11 * width[index] * tangent[index + 1])
    curve_x.append(x[-1]); curve_y.append(y[-1])
    return np.asarray(curve_x), np.asarray(curve_y)


def draw_focus_annotation(ax, focus: FocusAnnotation, theme: Theme):
    fill = theme.summary_core
    edge = theme.series_edges[0] if theme.series_edges else (theme.primary_edge or theme.field)
    ax.scatter([focus.x], [focus.y], s=210, facecolors="none", edgecolors=theme.primary,
               linewidths=5.0, alpha=0.13, zorder=7)
    ax.scatter([focus.x], [focus.y], s=115, facecolors=fill, edgecolors=edge,
               linewidths=2.0, zorder=8)
    annotation = ax.annotate(
        focus.label, xy=(focus.x, focus.y), xytext=focus.offset, textcoords="offset points",
        color=fill, fontsize=8.3, fontfamily="DejaVu Sans Mono", fontweight="bold",
        arrowprops={"arrowstyle": "-", "color": fill, "linewidth": 1.25},
        ha="left" if focus.offset[0] >= 0 else "right", va="center", zorder=9,
    )
    annotation.set_path_effects([pe.Stroke(linewidth=2.4, foreground=theme.field), pe.Normal()])
    return annotation
