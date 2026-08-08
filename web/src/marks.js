import { formatTick } from "./scales.js";
import { windowProgress } from "./schema.js";

export const clamp01 = (value) => Math.max(0, Math.min(1, value));
export const smooth = (value) => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};
export const easeOut = (value) => 1 - (1 - clamp01(value)) ** 3;

const FONT_STACK = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

export function compileProgress(progress, timeline) {
  return smooth(windowProgress(progress, timeline.summaryCompiles));
}

export function pointMotionState(point, progress, scales, plot) {
  const local = clamp01((progress - point.delay) / point.duration);
  if (local >= 1) {
    const finalX = scales.x(point.x), finalY = scales.y(point.y);
    return { x: finalX, y: finalY, finalX, finalY, local: 1, eased: 1, visibility: 1 };
  }
  const eased = easeOut(local);
  const finalX = scales.x(point.x);
  const finalY = scales.y(point.y);
  const startY = plot.top - point.startOffset * (plot.bottom - plot.top) * 0.35;
  return {
    x: finalX,
    y: startY + (finalY - startY) * eased,
    finalX,
    finalY,
    local,
    eased,
    visibility: smooth(clamp01(local / 0.15)),
  };
}

function markerPath(context, x, y, radius, shape) {
  context.beginPath();
  if (shape === "square") context.rect(x - radius * 0.72, y - radius * 0.72, radius * 1.44, radius * 1.44);
  else if (shape === "triangle") { context.moveTo(x, y - radius); context.lineTo(x + radius * 0.9, y + radius * 0.72); context.lineTo(x - radius * 0.9, y + radius * 0.72); context.closePath(); }
  else if (shape === "diamond") { context.moveTo(x, y - radius); context.lineTo(x + radius, y); context.lineTo(x, y + radius); context.lineTo(x - radius, y); context.closePath(); }
  else context.arc(x, y, radius, 0, Math.PI * 2);
}

export function drawScopePoint(context, state, { color, edge = null, radius, trailAlpha, settled, shape = "ring" }) {
  if (state.visibility <= 0) return;
  if (!settled) {
    const trailLength = (0.05 + 0.34 * (1 - state.eased)) * radius * 12;
    context.globalAlpha = trailAlpha * state.visibility * (1 - state.eased);
    context.strokeStyle = color;
    context.lineWidth = Math.max(0.6, radius * 0.13);
    context.beginPath();
    context.moveTo(state.x, state.y - 2);
    context.lineTo(state.x, state.y - 2 - trailLength);
    context.stroke();
  }
  context.globalAlpha = 0.065 * state.visibility * (0.4 + 0.6 * (1 - state.eased));
  context.strokeStyle = color;
  context.lineWidth = Math.max(1.5, radius * 0.3);
  markerPath(context, state.x, state.y, radius * 1.7, shape);
  context.stroke();
  context.globalAlpha = 0.8 * state.visibility;
  if (edge) {
    context.strokeStyle = edge;
    context.lineWidth = Math.max(1.5, radius * 0.34);
    markerPath(context, state.x, state.y, radius, shape);
    context.stroke();
  }
  context.strokeStyle = color;
  context.lineWidth = Math.max(0.8, radius * 0.16);
  markerPath(context, state.x, state.y, radius, shape);
  context.stroke();
  context.globalAlpha = 0.46 * state.visibility;
  context.fillStyle = color;
  markerPath(context, state.x, state.y, radius * 0.28, shape);
  context.fill();
  context.globalAlpha = 1;
}

export function drawAxes(context, { config, layout, scales, xTicks, yTicks, xCategories = null }) {
  const { theme, profile, spec } = config;
  const { plot, font } = layout;
  context.save();
  context.lineWidth = Math.max(0.5, 0.6 * layout.scale);
  if (profile.gridY) {
    context.strokeStyle = theme.grid;
    context.globalAlpha = profile.gridAlpha;
    yTicks.forEach((value) => {
      const y = scales.y(value);
      context.beginPath(); context.moveTo(plot.left, y); context.lineTo(plot.right, y); context.stroke();
    });
  }
  if (profile.gridX) {
    context.strokeStyle = theme.grid;
    context.globalAlpha = profile.gridAlpha * 0.55;
    xTicks.forEach((value) => {
      const x = scales.x(value);
      context.beginPath(); context.moveTo(x, plot.top); context.lineTo(x, plot.bottom); context.stroke();
    });
  }
  context.globalAlpha = 1;
  context.strokeStyle = theme.spine;
  context.lineWidth = Math.max(0.7, 0.9 * layout.scale);
  context.beginPath();
  context.moveTo(plot.left, plot.top);
  context.lineTo(plot.left, plot.bottom);
  context.lineTo(plot.right, plot.bottom);
  context.stroke();

  context.fillStyle = theme.secondary;
  context.font = `${font.axis}px ${FONT_STACK}`;
  context.textAlign = "right";
  context.textBaseline = "middle";
  yTicks.forEach((value) => context.fillText(formatTick(value), plot.left - 9 * layout.scale, scales.y(value)));
  context.textAlign = "center";
  context.textBaseline = "top";
  if (xCategories) {
    xCategories.forEach((label, index) => context.fillText(label, scales.x(index), plot.bottom + 10 * layout.scale));
  } else {
    xTicks.forEach((value) => context.fillText(formatTick(value), scales.x(value), plot.bottom + 10 * layout.scale));
  }

  if (spec.xLabel) {
    context.fillStyle = theme.label;
    context.textBaseline = "bottom";
    context.fillText(spec.xLabel, (plot.left + plot.right) / 2, layout.text?.xLabelY ?? layout.height - 9 * layout.scale);
  }
  if (spec.yLabel) {
    context.save();
    context.translate(layout.text?.yLabelX ?? 18 * layout.scale, (plot.top + plot.bottom) / 2);
    context.rotate(-Math.PI / 2);
    context.fillStyle = theme.label;
    context.textBaseline = "middle";
    context.fillText(spec.yLabel, 0, 0);
    context.restore();
  }
  context.restore();
}

export function drawText(context, { config, layout, legend, legendPosition = "top-right", legendStyle = "point", seriesMarkers = [] }) {
  const { theme, spec } = config;
  const { plot, font } = layout;
  context.save();
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = theme.primary;
  context.font = `500 ${font.title}px ${FONT_STACK}`;
  if (theme.primaryEdge) {
    context.strokeStyle = theme.primaryEdge;
    context.lineWidth = Math.max(1, 1.5 * layout.scale);
    context.strokeText(spec.title, plot.left, layout.text?.titleY ?? Math.max(font.title + 8, plot.top * 0.52));
  }
  context.fillText(spec.title, plot.left, layout.text?.titleY ?? Math.max(font.title + 8, plot.top * 0.52));
  if (spec.subtitle) {
    context.fillStyle = theme.secondary;
    context.font = `italic ${font.subtitle}px ${FONT_STACK}`;
    context.fillText(spec.subtitle, plot.left, layout.text?.subtitleY ?? Math.max(font.title + font.subtitle + 14, plot.top * 0.73));
  }
  context.fillStyle = theme.faint;
  context.font = `${font.signature}px ${FONT_STACK}`;
  const signatureLeft = legendPosition === "bottom-right";
  context.textAlign = signatureLeft ? "left" : "right";
  context.fillText(spec.signature, signatureLeft ? plot.left + 5 : plot.right - 5, plot.bottom - 8 * layout.scale);

  context.font = `${font.legend}px ${FONT_STACK}`;
  context.textBaseline = "middle";
  if (legendPosition === "none") { context.restore(); return; }
  legend.forEach((item, index) => {
    const bottom = legendPosition.startsWith("bottom");
    const left = legendPosition.endsWith("left");
    const y = bottom
      ? plot.bottom - (legend.length - index) * 20 * layout.scale
      : plot.top + 14 * layout.scale + index * 20 * layout.scale;
    const color = item.style?.color ?? theme.series[item.colorIndex % theme.series.length];
    const edge = item.style?.edge ?? theme.seriesEdges?.[item.colorIndex % theme.series.length] ?? null;
    const shape = item.style?.glyph ?? seriesMarkers[item.colorIndex % Math.max(1, seriesMarkers.length)] ?? "ring";
    if (left) {
      const x = plot.left + 14 * layout.scale;
      if (legendStyle === "line") {
        if (edge) { context.strokeStyle = edge; context.lineWidth = Math.max(2, 2.8 * layout.scale); context.beginPath(); context.moveTo(x - 3 * layout.scale, y); context.lineTo(x + 27 * layout.scale, y); context.stroke(); }
        context.strokeStyle = color; context.lineWidth = Math.max(1.2, 1.65 * layout.scale); context.beginPath(); context.moveTo(x - 3 * layout.scale, y); context.lineTo(x + 27 * layout.scale, y); context.stroke();
        markerPath(context, x + 12 * layout.scale, y, 4 * layout.scale, shape); context.stroke();
      } else { context.strokeStyle = color; context.lineWidth = Math.max(0.8, 1.15 * layout.scale); markerPath(context, x, y, 5 * layout.scale, shape); context.stroke(); }
      context.textAlign = "left"; context.fillStyle = theme.label;
      context.fillText(item.label, x + (legendStyle === "line" ? 38 : 14) * layout.scale, y);
    } else {
      const tx = plot.right - 14 * layout.scale;
      context.textAlign = "right"; context.fillStyle = theme.label;
      context.fillText(item.label, tx, y);
      const width = context.measureText(item.label).width;
      const x = tx - width - 15 * layout.scale;
      if (legendStyle === "line") {
        if (edge) { context.strokeStyle = edge; context.lineWidth = Math.max(2, 2.8 * layout.scale); context.beginPath(); context.moveTo(x - 27 * layout.scale, y); context.lineTo(x + 3 * layout.scale, y); context.stroke(); }
        context.strokeStyle = color; context.lineWidth = Math.max(1.2, 1.65 * layout.scale); context.beginPath(); context.moveTo(x - 27 * layout.scale, y); context.lineTo(x + 3 * layout.scale, y); context.stroke();
        markerPath(context, x - 12 * layout.scale, y, 4 * layout.scale, shape); context.stroke();
      } else { context.strokeStyle = color; context.lineWidth = Math.max(0.8, 1.15 * layout.scale); markerPath(context, x, y, 5 * layout.scale, shape); context.stroke(); }
    }
  });
  context.restore();
}

export function drawFigureHeader(context, { config, layout }) {
  if (!layout.header) return;
  const fontStack = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";
  context.save(); context.textAlign = "left"; context.textBaseline = "alphabetic";
  context.fillStyle = config.theme.primary; context.font = `500 ${layout.font.title}px ${fontStack}`;
  if (config.theme.primaryEdge) { context.strokeStyle = config.theme.primaryEdge; context.lineWidth = Math.max(1, 1.5 * layout.scale); context.strokeText(config.spec.title, layout.header.left, layout.header.titleY); }
  context.fillText(config.spec.title, layout.header.left, layout.header.titleY);
  if (config.spec.subtitle) { context.fillStyle = config.theme.secondary; context.font = `italic ${layout.font.subtitle}px ${fontStack}`; context.fillText(config.spec.subtitle, layout.header.left, layout.header.subtitleY); }
  context.restore();
}

export function drawBackground(context, layout, theme) {
  context.clearRect(0, 0, layout.width, layout.height);
  context.fillStyle = theme.field;
  context.fillRect(0, 0, layout.width, layout.height);
}
