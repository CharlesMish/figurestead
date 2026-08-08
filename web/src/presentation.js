import { cloneValue, windowProgress } from "./schema.js";
import { clamp01, smooth } from "./marks.js";

export const SCIENTIFIC_POSE = Object.freeze({
  panelSurface: true,
  frame: true,
  curve: "monotone",
  legend: "auto",
  lineWidth: 2.35,
  markerScale: 1.22,
  seriesMarkers: Object.freeze(["ring", "square"]),
});

export function applyScientificPose(input, options = {}) {
  const result = cloneValue(input);
  if (!Array.isArray(result?.panels) || !result.panels.length) throw new TypeError("applyScientificPose requires a v0.4 contract with one or more panels");
  const panelIds = new Set(result.panels.map((panel) => panel.id));
  result.panels = result.panels.map((panel) => {
    const presentation = {
      panelSurface: true,
      frame: true,
      legend: options.legend ?? "auto",
      markerScale: options.markerScale ?? SCIENTIFIC_POSE.markerScale,
      ...(panel.renderer === "line" ? {
        curve: options.curve ?? "monotone",
        lineWidth: options.lineWidth ?? SCIENTIFIC_POSE.lineWidth,
        seriesMarkers: options.seriesMarkers ?? ["ring", "square"],
      } : {}),
      ...(panel.presentation ?? {}),
    };
    return {
      ...panel,
      presentation,
      ...(panel.renderer === "line" ? { encoding: { ...(panel.encoding ?? {}), interpolation: options.curve ?? panel.presentation?.curve ?? "monotone" } } : {}),
    };
  });
  for (const focus of options.focus ?? []) {
    if (!panelIds.has(focus.panelId)) throw new TypeError(`unknown focus panel ${focus.panelId}`);
    const panel = result.panels.find((item) => item.id === focus.panelId);
    panel.annotations = [...(panel.annotations ?? []), {
      type: "focus", ...(focus.anchorId ? { anchorId: focus.anchorId } : { x: focus.x, y: focus.y, space: focus.space }), label: focus.label,
      dx: focus.dx ?? 68, dy: focus.dy ?? 28,
    }];
  }
  return result;
}

export function applyEvidencePose(input, options = {}) {
  const focus = options.focus ?? [];
  if (!Array.isArray(focus)) throw new TypeError("options.focus must be an array");
  focus.forEach((item, index) => {
    if (typeof item?.panelId !== "string" || !item.panelId.trim()) throw new TypeError(`focus[${index}].panelId must identify a panel`);
    if (typeof item.anchorId !== "string" || !item.anchorId.trim()) throw new TypeError(`focus[${index}].anchorId must identify a compiled evidence mark`);
    if (typeof item.label !== "string" || !item.label.trim()) throw new TypeError(`focus[${index}].label must be a non-empty string`);
  });
  return applyScientificPose(input, { ...options, focus });
}

export function drawPanelSurface(context, { contract, layout }) {
  if (!contract.presentation?.panelSurface) return;
  const { plot } = layout;
  context.save();
  context.fillStyle = contract.theme.panel;
  context.fillRect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
  if (contract.presentation.frame) {
    context.strokeStyle = contract.theme.spine;
    context.globalAlpha = 0.48;
    context.lineWidth = Math.max(0.6, 0.75 * layout.scale);
    context.strokeRect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
  }
  context.restore();
}

function position(annotation, scales, plot) {
  if (annotation.space === "plot") {
    return {
      x: plot.left + clamp01(annotation.x) * (plot.right - plot.left),
      y: plot.bottom - clamp01(annotation.y) * (plot.bottom - plot.top),
    };
  }
  if (typeof scales?.x !== "function" || typeof scales?.y !== "function") return null;
  const x = scales.x(annotation.x), y = scales.y(annotation.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function drawPresentationAnnotations(context, { contract, layout, scales, progress }) {
  const focus = contract.annotations.filter((item) => item?.type === "focus");
  if (!focus.length) return;
  const reveal = smooth(windowProgress(progress, contract.timeline.summaryCompiles));
  if (reveal <= 0) return;
  const { plot } = layout, theme = contract.theme;
  focus.forEach((annotation) => {
    const point = position(annotation, scales, plot);
    if (!point || typeof annotation.label !== "string" || !annotation.label.trim()) return;
    const dx = Number.isFinite(annotation.dx) ? annotation.dx * layout.scale : 68 * layout.scale;
    const dy = Number.isFinite(annotation.dy) ? annotation.dy * layout.scale : 28 * layout.scale;
    const rawX = point.x + dx, rawY = point.y + dy;
    const labelX = Math.max(plot.left + 26 * layout.scale, Math.min(plot.right - 26 * layout.scale, rawX));
    const labelY = Math.max(plot.top + 22 * layout.scale, Math.min(plot.bottom - 20 * layout.scale, rawY));
    const radius = Math.max(6.5, 8.4 * layout.scale) * reveal;
    const fill = theme.summaryCore;
    const edge = theme.seriesEdges?.[0] ?? theme.primaryEdge ?? theme.field;
    context.save();
    context.globalAlpha = reveal;
    context.strokeStyle = theme.primary;
    context.lineWidth = Math.max(3, radius * 0.62);
    context.globalAlpha = 0.13 * reveal;
    context.beginPath(); context.arc(point.x, point.y, radius * 1.45, 0, Math.PI * 2); context.stroke();
    context.globalAlpha = 0.92 * reveal;
    context.strokeStyle = fill;
    context.lineWidth = Math.max(1, 1.25 * layout.scale);
    context.beginPath(); context.moveTo(point.x + radius * 0.7, point.y + radius * 0.55); context.lineTo(labelX - 8 * layout.scale, labelY - 5 * layout.scale); context.stroke();
    context.fillStyle = fill;
    context.strokeStyle = edge;
    context.lineWidth = Math.max(1.4, 1.9 * layout.scale);
    context.beginPath(); context.arc(point.x, point.y, radius, 0, Math.PI * 2); context.fill(); context.stroke();
    context.font = `600 ${Math.max(9, layout.font.legend * 1.06)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    context.textAlign = dx < 0 ? "right" : "left";
    context.textBaseline = "middle";
    context.strokeStyle = theme.field;
    context.lineWidth = Math.max(1.6, 2.2 * layout.scale);
    context.strokeText(annotation.label, labelX, labelY);
    context.fillStyle = fill;
    context.fillText(annotation.label, labelX, labelY);
    context.restore();
  });
}
