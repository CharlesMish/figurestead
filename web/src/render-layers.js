export const RENDER_LAYER_ORDER = Object.freeze([
  "surface", "grid", "reference", "data", "summary", "axes", "annotations", "legend",
]);

const REFERENCE_MARKS = new Set(["reference-band", "row-band", "baseline-rule"]);
const SUMMARY_MARKS = new Set(["summary-line", "median-rule"]);

export function renderLayerForMark(mark) {
  if (REFERENCE_MARKS.has(mark?.kind)) return "reference";
  if (SUMMARY_MARKS.has(mark?.kind) || mark?.role === "summary") return "summary";
  return "data";
}

export function partitionPanelMarks(marks = []) {
  const layers = { reference: [], data: [], summary: [] };
  marks.forEach((mark) => layers[renderLayerForMark(mark)].push(mark));
  return layers;
}

export function plotClipRect(panel) {
  const plot = panel?.evidenceFrame ?? panel?.axes?.plot ?? panel?.layout?.plot;
  if (!plot || ![plot.left, plot.top, plot.right, plot.bottom].every(Number.isFinite)) {
    throw new TypeError("resolved panel must expose a finite evidence-frame rectangle");
  }
  return Object.freeze({ left: plot.left, top: plot.top, right: plot.right, bottom: plot.bottom });
}

export function withCanvasPlotClip(context, panel, draw) {
  const plot = plotClipRect(panel);
  context.save();
  context.beginPath();
  context.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
  context.clip();
  try { return draw(plot); } finally { context.restore(); }
}
