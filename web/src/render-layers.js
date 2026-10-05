import { assertMarkKind } from "./scene-marks.js";

export const RENDER_LAYER_ORDER = Object.freeze([
  "surface", "grid", "reference", "data", "summary", "axes", "annotations", "legend",
]);

export function renderLayerForMark(mark) {
  assertMarkKind(mark);
  switch (mark.kind) {
    case "reference-band": case "row-band": case "baseline-rule": return "reference";
    case "summary-line": case "median-rule": return "summary";
    case "point": case "segment": case "bar": case "cell": case "interval":
    case "connector": case "rug": case "temporal-bar": case "renderer-mark":
      return mark.role === "summary" ? "summary" : "data";
    default: throw new TypeError(`scene mark kind ${mark.kind} has no render-layer policy`);
  }
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
