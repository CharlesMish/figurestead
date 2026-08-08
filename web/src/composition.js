export const COMPOSED_SCENE_VERSION = "figurestead.composed-scene/1";

const BACKGROUND_KINDS = new Set(["reference-band", "row-band"]);
const CORNERS = Object.freeze(["top-right", "top-left", "bottom-right", "bottom-left"]);

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value) => typeof value === "number" && Number.isFinite(value);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function rect(left, top, right, bottom) {
  return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

function overlap(left, right) {
  if (!left || !right) return 0;
  return Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
    * Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
}

function markBounds(mark) {
  const g = mark.geometry;
  if (!g) return null;
  if (finite(g.cx) && finite(g.cy)) return rect(g.cx - (g.radius ?? 3), g.cy - (g.radius ?? 3), g.cx + (g.radius ?? 3), g.cy + (g.radius ?? 3));
  if ([g.left, g.top, g.right, g.bottom].every(finite)) return rect(g.left, g.top, g.right, g.bottom);
  if ([g.x1, g.y1, g.x2, g.y2].every(finite)) return rect(Math.min(g.x1, g.x2) - 2, Math.min(g.y1, g.y2) - 2, Math.max(g.x1, g.x2) + 2, Math.max(g.y1, g.y2) + 2);
  if ([g.x1, g.x2, g.y].every(finite)) return rect(Math.min(g.x1, g.x2) - 2, g.y - (g.cap ?? 3), Math.max(g.x1, g.x2) + 2, g.y + (g.cap ?? 3));
  if (finite(g.x) && finite(g.y)) return rect(g.x - 3, g.y - (g.halfHeight ?? 3), g.x + 3, g.y + (g.halfHeight ?? 3));
  if (finite(g.x) && finite(g.top) && finite(g.bottom)) return rect(g.x - 2, g.top, g.x + 2, g.bottom);
  return null;
}

function markAnchor(mark) {
  const g = mark?.geometry;
  if (!g) return null;
  if (finite(g.cx) && finite(g.cy)) return { x: g.cx, y: g.cy };
  if ([g.left, g.top, g.right, g.bottom].every(finite)) return { x: (g.left + g.right) / 2, y: (g.top + g.bottom) / 2 };
  if ([g.x1, g.y1, g.x2, g.y2].every(finite)) return { x: g.x2, y: g.y2 };
  if ([g.x1, g.x2, g.y].every(finite)) return { x: (g.x1 + g.x2) / 2, y: g.y };
  if (finite(g.x) && finite(g.y)) return { x: g.x, y: g.y };
  if (finite(g.x) && finite(g.top) && finite(g.bottom)) return { x: g.x, y: (g.top + g.bottom) / 2 };
  return null;
}

function fitText(value, maxWidth, fontSize) {
  const text = String(value);
  const averageGlyph = Math.max(1, fontSize * 0.62);
  const maxChars = Math.max(2, Math.floor(maxWidth / averageGlyph));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
}

function legendDimensions(panel) {
  const scale = panel.layout.scale;
  const font = panel.layout.font.legend;
  const plot = panel.axes.plot ?? panel.layout.plot;
  const labelWidth = panel.legend.reduce((width, item) => Math.max(width, String(item.label).length * font * 0.62), 0);
  return {
    width: Math.min(Math.max(72 * scale, labelWidth + 34 * scale), Math.max(24, plot.right - plot.left - 24 * scale)),
    height: Math.min(Math.max(18 * scale, (12 + Math.max(0, panel.legend.length - 1) * 20) * scale), Math.max(18, plot.bottom - plot.top - 24 * scale)),
  };
}

function legendCandidate(panel, position, dimensions) {
  const plot = panel.layout.plot, pad = 12 * panel.layout.scale;
  const left = position.endsWith("right") ? plot.right - pad - dimensions.width : plot.left + pad;
  const top = position.startsWith("bottom") ? plot.bottom - pad - dimensions.height : plot.top + pad;
  return rect(left, top, left + dimensions.width, top + dimensions.height);
}

function legendScore(panel, box) {
  const area = Math.max(1, box.width * box.height);
  return panel.marks.reduce((score, mark) => {
    if (BACKGROUND_KINDS.has(mark.kind)) return score;
    return score + overlap(box, markBounds(mark)) / area;
  }, 0);
}

function legendEntries(panel, box, position, outside) {
  const scale = panel.layout.scale, right = position.endsWith("right"), markerInset = 8 * scale;
  const count = panel.legend.length;
  const topInset = Math.min(12 * scale, box.height / 2);
  const bottomInset = Math.min(8 * scale, box.height / 2);
  const step = count > 1 ? Math.min(20 * scale, Math.max(1, (box.height - topInset - bottomInset) / (count - 1))) : 0;
  return panel.legend.map((item, index) => {
    const y = clamp(box.top + topInset + index * step, box.top, box.bottom);
    const textAnchor = outside || !right ? "start" : "end";
    const markerX = textAnchor === "start" ? box.left + markerInset : box.right - markerInset;
    const textX = textAnchor === "start" ? box.left + 20 * scale : box.right - 20 * scale;
    const maxTextWidth = Math.max(8, textAnchor === "start" ? box.right - textX : textX - box.left);
    return { markerX, textX, y, textAnchor, displayLabel: fitText(item.label, maxTextWidth, panel.layout.font.legend) };
  });
}

function composeLegend(panel) {
  if (panel.presentation?.legend === "none" || !panel.legend.length) return { ...panel.layout.legend, position: "none", box: null, entries: [] };
  if (panel.layout.legend.outside || panel.presentation?.legend === "outside-right") {
    const source = panel.layout.legend;
    const box = rect(source.left, source.top, source.right, source.bottom);
    return { ...source, position: "outside-right", box, entries: legendEntries(panel, box, "top-left", true) };
  }
  const dimensions = legendDimensions(panel);
  const requested = panel.presentation?.legend ?? "auto";
  const candidates = (requested === "auto" ? CORNERS : [requested]).map((position, order) => {
    const box = legendCandidate(panel, position, dimensions);
    return { position, box, score: legendScore(panel, box), order };
  }).sort((left, right) => left.score - right.score || left.order - right.order);
  const winner = candidates[0];
  return { ...panel.layout.legend, outside: false, position: winner.position, box: winner.box, score: winner.score, entries: legendEntries(panel, winner.box, winner.position, false) };
}

function coordinateAnchor(panel, annotation) {
  const plot = panel.axes.plot ?? panel.layout.plot;
  if (annotation.space === "plot" && finite(annotation.x) && finite(annotation.y)) {
    return { x: plot.left + clamp(annotation.x, 0, 1) * (plot.right - plot.left), y: plot.bottom - clamp(annotation.y, 0, 1) * (plot.bottom - plot.top) };
  }
  if (typeof panel.axes?.x !== "function" || typeof panel.axes?.y !== "function") return null;
  const x = panel.axes.x(annotation.x), y = panel.axes.y(annotation.y);
  return finite(x) && finite(y) ? { x, y } : null;
}

function labelCandidates(panel, annotation, anchor, legendBox, occupied = []) {
  const plot = panel.axes.plot ?? panel.layout.plot, scale = panel.layout.scale;
  const font = Math.max(9, panel.layout.font.legend * 1.06);
  const pad = Math.max(4, 8 * scale);
  const maxWidth = Math.max(12, plot.right - plot.left - pad * 2);
  const width = Math.min(maxWidth, Math.max(42 * scale, String(annotation.label).length * font * 0.62 + 10 * scale));
  const displayLabel = fitText(annotation.label, width - 4 * scale, font), height = Math.min(20 * scale, Math.max(12, plot.bottom - plot.top));
  const dx = finite(annotation.dx) ? annotation.dx * scale : 68 * scale;
  const dy = finite(annotation.dy) ? annotation.dy * scale : 28 * scale;
  const offsets = [[dx, dy], [-dx, dy], [dx, -dy], [-dx, -dy]];
  const dataBounds = panel.marks.filter((mark) => !BACKGROUND_KINDS.has(mark.kind)).map(markBounds).filter(Boolean);
  return offsets.map(([offsetX, offsetY], order) => {
    const rightAligned = offsetX < 0;
    const labelX = rightAligned
      ? clamp(anchor.x + offsetX, plot.left + width + pad, plot.right - pad)
      : clamp(anchor.x + offsetX, plot.left + pad, plot.right - width - pad);
    const labelY = clamp(anchor.y + offsetY, plot.top + height / 2, plot.bottom - height / 2);
    const box = rightAligned
      ? rect(labelX - width, labelY - height / 2, labelX, labelY + height / 2)
      : rect(labelX, labelY - height / 2, labelX + width, labelY + height / 2);
    const leaderLength = Math.hypot(labelX - anchor.x, labelY - anchor.y);
    const score = overlap(box, legendBox) * 12
      + occupied.reduce((sum, item) => sum + overlap(box, item) * 16, 0)
      + dataBounds.reduce((sum, item) => sum + overlap(box, item), 0)
      + leaderLength * 0.002;
    return { labelX, labelY, box, displayLabel, textAnchor: rightAligned ? "end" : "start", score, order };
  }).sort((left, right) => left.score - right.score || left.order - right.order);
}

function composeAnnotations(panel, legendBox) {
  const occupied = [];
  return (panel.annotations ?? []).filter((item) => item?.type === "focus" && typeof item.label === "string" && item.label.trim()).map((annotation, index) => {
    const boundMark = annotation.anchorId ? panel.marks.find((mark) => mark.id === annotation.anchorId) : null;
    const anchor = boundMark ? markAnchor(boundMark) : annotation.anchorId ? null : coordinateAnchor(panel, annotation);
    const status = boundMark && anchor ? "evidence-bound" : annotation.anchorId ? "missing-anchor" : anchor ? "authored-coordinate" : "unresolved";
    if (!anchor) return { id: `${panel.id}/focus/${index}`, type: "focus", label: annotation.label, status, boundMarkId: null, geometry: null };
    const label = labelCandidates(panel, annotation, anchor, legendBox, occupied)[0];
    occupied.push(label.box);
    return {
      id: `${panel.id}/focus/${index}`, type: "focus", label: annotation.label, displayLabel: label.displayLabel, status,
      boundMarkId: boundMark?.id ?? null,
      geometry: { anchorX: anchor.x, anchorY: anchor.y, labelX: label.labelX, labelY: label.labelY, labelBox: label.box, textAnchor: label.textAnchor, radius: Math.max(6.5, 8.4 * panel.layout.scale) },
    };
  });
}

export function auditComposition(scene) {
  const annotations = scene.panels.flatMap((panel) => panel.composedAnnotations ?? []);
  const count = (status) => annotations.filter((item) => item.status === status).length;
  return Object.freeze({
    annotations: annotations.length,
    evidenceBound: count("evidence-bound"),
    authoredCoordinates: count("authored-coordinate"),
    missingAnchors: count("missing-anchor"),
    unresolved: count("unresolved"),
    clean: count("missing-anchor") + count("unresolved") === 0,
  });
}

export function composeResolvedScene(resolvedScene) {
  if (!resolvedScene || resolvedScene.schemaVersion !== "figurestead.resolved-scene/1") throw new TypeError("composeResolvedScene requires a resolved Figurestead scene");
  const panels = resolvedScene.panels.map((panel) => {
    const legend = composeLegend(panel);
    const layout = { ...panel.layout, legend };
    const composedPanel = { ...panel, layout };
    return { ...composedPanel, composedAnnotations: composeAnnotations(composedPanel, legend.box) };
  });
  const result = {
    ...resolvedScene,
    schemaVersion: COMPOSED_SCENE_VERSION,
    resolvedSceneVersion: resolvedScene.schemaVersion,
    panels,
  };
  result.compositionAudit = auditComposition(result);
  return deepFreeze(result);
}
