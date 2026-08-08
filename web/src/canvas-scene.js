import { partitionPanelMarks, withCanvasPlotClip } from "./render-layers.js";

const FONT_STACK = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

function markerPath(context, glyph, x, y, radius) {
  context.beginPath();
  if (glyph === "square") context.rect(x - radius, y - radius, radius * 2, radius * 2);
  else if (glyph === "triangle") { context.moveTo(x, y - radius); context.lineTo(x + radius, y + radius); context.lineTo(x - radius, y + radius); context.closePath(); }
  else if (glyph === "diamond") { context.moveTo(x, y - radius); context.lineTo(x + radius, y); context.lineTo(x, y + radius); context.lineTo(x - radius, y); context.closePath(); }
  else context.arc(x, y, radius, 0, Math.PI * 2);
}

function mixPoint(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
function partialCubic(g, progress) {
  const p0 = { x: g.x1, y: g.y1 }, c1 = { x: g.c1x, y: g.c1y }, c2 = { x: g.c2x, y: g.c2y }, p1 = { x: g.x2, y: g.y2 };
  const a = mixPoint(p0, c1, progress), b = mixPoint(c1, c2, progress), c = mixPoint(c2, p1, progress);
  const d = mixPoint(a, b, progress), e = mixPoint(b, c, progress);
  return { c1: a, c2: d, end: mixPoint(d, e, progress) };
}

function strokeSegment(context, geometry, progress = 1) {
  context.beginPath(); context.moveTo(geometry.x1, geometry.y1);
  if (geometry.c1x != null) {
    const value = progress < 1 ? partialCubic(geometry, progress) : { c1: { x: geometry.c1x, y: geometry.c1y }, c2: { x: geometry.c2x, y: geometry.c2y }, end: { x: geometry.x2, y: geometry.y2 } };
    context.bezierCurveTo(value.c1.x, value.c1.y, value.c2.x, value.c2.y, value.end.x, value.end.y);
  } else context.lineTo(geometry.x1 + (geometry.x2 - geometry.x1) * progress, geometry.y1 + (geometry.y2 - geometry.y1) * progress);
  context.stroke();
}

function tickPosition(axis, tick) {
  const value = axis(tick.value);
  return axis.bandwidth ? value + axis.bandwidth() / 2 : value;
}

function fitLabel(context, value, width) {
  if (context.measureText(value).width <= width) return value;
  let text = String(value);
  while (text.length > 2 && context.measureText(`${text}…`).width > width) text = text.slice(0, -1);
  return `${text}…`;
}

function drawGrid(context, panel, theme, profile) {
  const { layout, axes } = panel, plot = axes.plot ?? layout.plot;
  context.save(); context.strokeStyle = theme.grid; context.lineWidth = Math.max(0.6, 0.85 * layout.scale); context.globalAlpha = profile.gridAlpha * 0.5;
  if (axes.xType !== "band" && profile.gridX) axes.xTicks.forEach((tick) => {
    const x = tickPosition(axes.x, tick); context.beginPath(); context.moveTo(x, plot.top); context.lineTo(x, plot.bottom); context.stroke();
  });
  if (axes.yType !== "band" && profile.gridY) axes.yTicks.forEach((tick) => {
    const y = tickPosition(axes.y, tick); context.beginPath(); context.moveTo(plot.left, y); context.lineTo(plot.right, y); context.stroke();
  });
  context.restore();
}

function drawAxes(context, panel, theme) {
  const { layout, axes, spec } = panel, plot = axes.plot ?? layout.plot, { font } = layout;
  context.save(); context.font = `${font.axis}px ${FONT_STACK}`; context.fillStyle = theme.secondary; context.strokeStyle = theme.spine;
  context.lineWidth = Math.max(0.6, 0.85 * layout.scale);
  context.strokeStyle = theme.spine; context.beginPath(); context.moveTo(plot.left, plot.top); context.lineTo(plot.left, plot.bottom); context.lineTo(plot.right, plot.bottom); context.stroke();
  const xSlot = axes.x.step?.() ?? Math.max(40, (plot.right - plot.left) / Math.max(1, axes.xTicks.length));
  const rotateX = axes.xType === "band" && axes.xTicks.some((tick) => context.measureText(tick.label).width > xSlot * 0.92);
  context.textAlign = rotateX ? "right" : "center"; context.textBaseline = "top";
  axes.xTicks.forEach((tick) => {
    const x = tickPosition(axes.x, tick), label = fitLabel(context, tick.label, rotateX ? xSlot * 1.75 : xSlot * 0.92);
    if (rotateX) { context.save(); context.translate(x, plot.bottom + 7 * layout.scale); context.rotate(-Math.PI / 4); context.fillText(label, 0, 0); context.restore(); }
    else context.fillText(label, x, plot.bottom + 7 * layout.scale);
  });
  context.textAlign = "right"; context.textBaseline = "middle";
  axes.yTicks.forEach((tick) => context.fillText(fitLabel(context, tick.label, Math.max(26, plot.left - layout.rect.left - 12 * layout.scale)), plot.left - 7 * layout.scale, tickPosition(axes.y, tick)));
  if (spec.xLabel) { context.fillStyle = theme.label; context.textAlign = "center"; context.textBaseline = "bottom"; context.fillText(spec.xLabel, (plot.left + plot.right) / 2, layout.text?.xLabelY ?? layout.rect.bottom - 6 * layout.scale); }
  if (spec.yLabel) { context.save(); context.translate(layout.text?.yLabelX ?? layout.rect.left + 12 * layout.scale, (plot.top + plot.bottom) / 2); context.rotate(-Math.PI / 2); context.fillStyle = theme.label; context.textAlign = "center"; context.textBaseline = "top"; context.fillText(spec.yLabel, 0, 0); context.restore(); }
  context.restore();
}

function drawLegend(context, panel, theme) {
  if (panel.presentation?.legend === "none" || !panel.legend.length) return;
  const { layout } = panel, outside = layout.legend.outside;
  context.save(); context.font = `${layout.font.legend}px ${FONT_STACK}`; context.textBaseline = "middle";
  const insideTop = layout.plot.bottom - Math.max(14, 14 + (panel.legend.length - 1) * 20) * layout.scale;
  panel.legend.forEach((item, index) => {
    const style = item.style ?? {}, entry = layout.legend.entries?.[index];
    const x = entry?.markerX ?? (outside ? layout.legend.left : layout.plot.right - 24 * layout.scale);
    const textX = entry?.textX ?? (outside ? x + 12 * layout.scale : x - 10 * layout.scale);
    const y = entry?.y ?? (outside ? layout.legend.top + (14 + index * 20) * layout.scale : insideTop + index * 20 * layout.scale);
    context.strokeStyle = style.edge ?? style.color ?? theme.series[item.colorIndex % theme.series.length]; context.lineWidth = Math.max(1, 1.2 * layout.scale);
    markerPath(context, style.glyph ?? "ring", x, y, 4 * layout.scale); context.stroke();
    context.fillStyle = theme.label;
    context.textAlign = entry?.textAnchor ?? (outside ? "left" : "right"); context.fillText(entry?.displayLabel ?? item.label, textX, y);
  });
  context.restore();
}

function drawComposedAnnotations(context, panel, theme, progress) {
  if (!panel.composedAnnotations?.length || progress <= 0) return;
  panel.composedAnnotations.forEach((annotation) => {
    const g = annotation.geometry;
    if (!g) return;
    const reveal = Math.max(0, Math.min(1, progress));
    context.save();
    context.globalAlpha = reveal;
    context.strokeStyle = theme.primary;
    context.lineWidth = Math.max(3, g.radius * 0.62);
    context.globalAlpha = 0.13 * reveal;
    context.beginPath(); context.arc(g.anchorX, g.anchorY, g.radius * 1.45, 0, Math.PI * 2); context.stroke();
    context.globalAlpha = 0.92 * reveal;
    context.strokeStyle = theme.summaryCore;
    context.lineWidth = Math.max(1, 1.25 * panel.layout.scale);
    context.beginPath(); context.moveTo(g.anchorX + (g.labelX < g.anchorX ? -1 : 1) * g.radius * 0.7, g.anchorY + (g.labelY < g.anchorY ? -1 : 1) * g.radius * 0.55); context.lineTo(g.labelX + (g.textAnchor === "end" ? 8 : -8) * panel.layout.scale, g.labelY - 5 * panel.layout.scale); context.stroke();
    context.fillStyle = theme.summaryCore;
    context.strokeStyle = theme.seriesEdges?.[0] ?? theme.primaryEdge ?? theme.field;
    context.lineWidth = Math.max(1.4, 1.9 * panel.layout.scale);
    context.beginPath(); context.arc(g.anchorX, g.anchorY, g.radius, 0, Math.PI * 2); context.fill(); context.stroke();
    context.font = `600 ${Math.max(9, panel.layout.font.legend * 1.06)}px ${FONT_STACK}`;
    context.textAlign = g.textAnchor; context.textBaseline = "middle";
    const label = annotation.displayLabel ?? annotation.label;
    context.strokeStyle = theme.field; context.lineWidth = Math.max(1.6, 2.2 * panel.layout.scale); context.strokeText(label, g.labelX, g.labelY);
    context.fillStyle = theme.summaryCore; context.fillText(label, g.labelX, g.labelY);
    context.restore();
  });
}

function drawMatrixLegend(context, panel, theme) {
  if (panel.renderer !== "categorical_matrix" || !panel.valueScale || !panel.marks.length) return;
  const { layout, valueScale } = panel, width = Math.min(190 * layout.scale, (layout.plot.right - layout.plot.left) * 0.42);
  const left = layout.plot.right - width, top = layout.plot.top - 28 * layout.scale, height = Math.max(5, 7 * layout.scale), style = panel.marks[0].style;
  const gradient = context.createLinearGradient(left, 0, left + width, 0); gradient.addColorStop(0, style.low); gradient.addColorStop(0.68, style.color); gradient.addColorStop(1, style.high);
  context.save(); context.fillStyle = gradient; context.fillRect(left, top, width, height); context.strokeStyle = theme.spine; context.strokeRect(left, top, width, height);
  context.font = `${layout.font.legend}px ${FONT_STACK}`; context.fillStyle = theme.label; context.textAlign = "left"; context.textBaseline = "bottom"; context.fillText(valueScale.label, left, top - 3 * layout.scale);
  context.fillStyle = theme.secondary; context.textBaseline = "top"; context.fillText(String(valueScale.domain[0]), left, top + height + 2 * layout.scale); context.textAlign = "right"; context.fillText(String(valueScale.domain[1]), left + width, top + height + 2 * layout.scale); context.restore();
}

function drawPanelText(context, panel, theme) {
  const { layout, spec } = panel;
  context.save(); context.textAlign = "left"; context.textBaseline = "alphabetic";
  context.fillStyle = theme.mode === "paper" ? theme.label : theme.primary; context.font = `500 ${layout.font.title}px ${FONT_STACK}`;
  context.fillText(spec.title || panel.renderer, layout.plot.left, layout.text?.titleY ?? layout.rect.top + 20 * layout.scale);
  if (spec.subtitle) { context.fillStyle = theme.secondary; context.font = `italic ${layout.font.subtitle}px ${FONT_STACK}`; context.fillText(spec.subtitle, layout.plot.left, layout.text?.subtitleY ?? layout.rect.top + 39 * layout.scale); }
  if (theme.mode !== "paper" && spec.signature && (layout.panelIndex ?? 0) === 0) {
    const provenance = layout.provenance ?? { left: layout.plot.left, y: layout.rect.bottom - 8 * layout.scale };
    context.fillStyle = theme.faint; context.font = `${layout.font.signature}px ${FONT_STACK}`; context.textAlign = "left";
    context.fillText(spec.signature, provenance.left, provenance.y);
  }
  context.restore();
}

function drawBandKey(context, panel, theme) {
  const bands = panel.marks.filter((mark) => mark.kind === "reference-band");
  if (!bands.length) return;
  const plot = panel.axes.plot ?? panel.layout.plot;
  context.save(); context.font = `${Math.max(7, panel.layout.font.legend * 0.86)}px ${FONT_STACK}`; context.textAlign = "left"; context.textBaseline = "middle";
  let x = plot.left;
  bands.forEach((band) => {
    const label = `${band.from}–${band.to}`, swatch = Math.max(10, 13 * panel.layout.scale);
    context.globalAlpha = 0.48; context.fillStyle = band.style.color; context.fillRect(x, plot.top - 14 * panel.layout.scale, swatch, 5 * panel.layout.scale);
    context.globalAlpha = 0.88; context.fillStyle = theme.secondary; context.fillText(label, x + swatch + 4 * panel.layout.scale, plot.top - 11 * panel.layout.scale);
    x += swatch + context.measureText(label).width + 17 * panel.layout.scale;
  });
  context.fillStyle = theme.faint; context.fillText("Reference bands · provisional", x, plot.top - 11 * panel.layout.scale); context.restore();
}

function drawPoint(context, mark) {
  const motion = mark.motion, g = mark.geometry, x = g.cx + motion.translateX, y = g.cy + motion.translateY, radius = g.radius * Math.min(motion.scaleX, motion.scaleY);
  context.save(); context.globalAlpha = motion.opacity; context.strokeStyle = mark.style.edge ?? mark.style.color; context.lineWidth = Math.max(1.6, radius * 0.58);
  markerPath(context, mark.style.glyph, x, y, radius); context.stroke();
  context.strokeStyle = mark.style.color; context.lineWidth = Math.max(0.9, radius * 0.24); markerPath(context, mark.style.glyph, x, y, radius); context.stroke();
  if (motion.glow > 0) { context.globalAlpha = motion.glow; context.lineWidth = radius; markerPath(context, mark.style.glyph, x, y, radius * 1.45); context.stroke(); }
  context.restore();
}

function drawLine(context, mark, theme) {
  const motion = mark.motion;
  context.save(); context.globalAlpha = motion.opacity * (theme.mode === "paper" ? 1 : 0.78); context.strokeStyle = mark.style.edge ?? mark.style.color;
  context.lineWidth = Math.max(1, (mark.style.lineWidth ?? 1.6) + (mark.style.edge ? 1.3 : 0));
  context.setLineDash?.(mark.style.lineStyle === "dash" ? [7, 4] : mark.style.lineStyle === "dot" ? [2, 4] : mark.style.lineStyle === "dash-dot" ? [8, 3, 2, 3] : []);
  strokeSegment(context, mark.geometry, motion.clip);
  if (mark.style.edge) { context.strokeStyle = mark.style.color; context.lineWidth = Math.max(1, mark.style.lineWidth ?? 1.6); strokeSegment(context, mark.geometry, motion.clip); }
  context.restore();
}

function drawBar(context, mark, theme) {
  const m = mark.motion, g = mark.geometry;
  let { left, right, top, bottom } = g;
  if (mark.orientation === "horizontal") right = left + (right - left) * m.scaleX;
  else top = bottom - (bottom - top) * m.scaleY;
  context.save(); context.globalAlpha = m.opacity * (theme.mode === "paper" ? 1 : g.alpha);
  if (mark.missing) { context.fillStyle = theme.warm; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText("×", (left + right) / 2, (top + bottom) / 2); }
  else {
    context.fillStyle = mark.style.color; context.strokeStyle = mark.style.edge ?? mark.style.color; context.fillRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top)); context.strokeRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
    if (theme.mode === "paper" && mark.style.hatch && mark.style.hatch !== "none") drawBarHatch(context, { left, right, top, bottom }, mark.style.hatch, mark.style.edge ?? theme.label);
  }
  context.restore();
}

function drawBarHatch(context, rect, hatch, color) {
  const spacing = 6, height = rect.bottom - rect.top;
  context.save(); context.beginPath(); context.rect(rect.left, rect.top, rect.right - rect.left, height); context.clip();
  context.globalAlpha = 0.34; context.strokeStyle = color; context.lineWidth = 0.75;
  if (["diag", "cross"].includes(hatch)) for (let x = rect.left - height; x <= rect.right; x += spacing) {
    context.beginPath(); context.moveTo(x, rect.bottom); context.lineTo(x + height, rect.top); context.stroke();
  }
  if (hatch === "cross") for (let x = rect.left; x <= rect.right + height; x += spacing) {
    context.beginPath(); context.moveTo(x, rect.bottom); context.lineTo(x - height, rect.top); context.stroke();
  }
  if (hatch === "vertical") for (let x = rect.left + spacing / 2; x < rect.right; x += spacing) {
    context.beginPath(); context.moveTo(x, rect.top); context.lineTo(x, rect.bottom); context.stroke();
  }
  context.restore();
}

function drawCell(context, mark, theme, font) {
  const m = mark.motion, g = mark.geometry;
  context.save(); context.globalAlpha = m.opacity; context.fillStyle = g.fill; context.strokeStyle = mark.style.edge; context.fillRect(g.left, g.top, g.right - g.left, g.bottom - g.top); context.strokeRect(g.left, g.top, g.right - g.left, g.bottom - g.top);
  if (mark.status === "insufficient") { context.strokeStyle = theme.warm; context.beginPath(); context.moveTo(g.left, g.bottom); context.lineTo(g.right, g.top); context.stroke(); }
  if (mark.label && g.right - g.left > 24 && g.bottom - g.top > 14) { context.fillStyle = g.labelColor ?? theme.label; context.font = `${font}px ${FONT_STACK}`; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(mark.label, (g.left + g.right) / 2, (g.top + g.bottom) / 2); }
  context.restore();
}

function lineDash(style, scale = 1) { return style === "dash" ? [7 * scale, 4 * scale] : style === "dot" ? [2 * scale, 4 * scale] : style === "dash-dot" ? [8 * scale, 3 * scale, 2 * scale, 3 * scale] : []; }

function drawIntervalMark(context, mark, scale, theme) {
  const m = mark.motion, g = mark.geometry, center = (g.x1 + g.x2) / 2, half = (g.x2 - g.x1) * m.clip / 2;
  const x1 = center - half, x2 = center + half, cap = g.cap * Math.max(0.2, m.clip);
  context.save(); context.globalAlpha = m.opacity * (theme.mode === "paper" ? 1 : (mark.role === "context" ? 0.62 : 0.9)); context.strokeStyle = mark.style.color;
  context.lineWidth = Math.max(0.8, (mark.style.lineWidth ?? 1.6) * scale); context.setLineDash?.(lineDash(mark.style.lineStyle, scale));
  context.beginPath(); context.moveTo(x1, g.y); context.lineTo(x2, g.y); context.moveTo(x1, g.y - cap); context.lineTo(x1, g.y + cap); context.moveTo(x2, g.y - cap); context.lineTo(x2, g.y + cap); context.stroke(); context.restore();
}

function drawConnector(context, mark, panel, theme) {
  const m = mark.motion, g = mark.geometry, end = g.x1 + (g.x2 - g.x1) * m.clip;
  context.save(); context.globalAlpha = m.opacity * (theme.mode === "paper" ? 1 : 0.72); context.strokeStyle = mark.style.color; context.lineWidth = Math.max(1, (mark.style.lineWidth ?? 1.35) * panel.layout.scale);
  context.beginPath(); context.moveTo(g.x1, g.y); context.lineTo(end, g.y); context.stroke();
  context.restore();
}

function drawConnectorLabel(context, mark, theme, panel) {
  if (mark.motion.clip < 0.999) return;
  const g = mark.geometry, leftFirst = g.x1 <= g.x2, pad = 6 * panel.layout.scale;
  context.save(); context.globalAlpha = mark.motion.opacity; context.font = `${panel.layout.font.legend}px ${FONT_STACK}`; context.textBaseline = "middle";
  context.fillStyle = theme.series[0]; context.textAlign = leftFirst ? "right" : "left"; context.fillText(fitLabel(context, mark.endpointALabel, 110 * panel.layout.scale), g.x1 + (leftFirst ? -pad : pad), g.y - 7 * panel.layout.scale);
  context.fillStyle = theme.series[1 % theme.series.length]; context.textAlign = leftFirst ? "left" : "right"; context.fillText(fitLabel(context, mark.endpointBLabel, 110 * panel.layout.scale), g.x2 + (leftFirst ? pad : -pad), g.y + 7 * panel.layout.scale);
  const delta = `${mark.delta >= 0 ? "+" : ""}${Number(mark.delta.toPrecision(4))}`; context.fillStyle = theme.label; context.textAlign = "center"; context.fillText(delta, (g.x1 + g.x2) / 2, g.y - 18 * panel.layout.scale); context.restore();
}

function drawReferenceBand(context, mark) {
  const m = mark.motion, g = mark.geometry;
  context.save(); context.globalAlpha = m.opacity * 0.1; context.fillStyle = mark.style.color; context.fillRect(g.left, g.top, g.right - g.left, g.bottom - g.top);
  context.globalAlpha = m.opacity * 0.45; context.strokeStyle = mark.style.color; context.beginPath(); context.moveTo(g.left, g.bottom); context.lineTo(g.right, g.bottom); context.stroke(); context.restore();
}

function drawBaseline(context, mark, panel, theme) {
  const m = mark.motion, g = mark.geometry;
  context.save(); context.globalAlpha = m.opacity * (theme.mode === "paper" ? 1 : 0.92); context.strokeStyle = mark.style.color; context.lineWidth = Math.max(1, (mark.style.lineWidth ?? 1.2) * panel.layout.scale); context.setLineDash?.(lineDash(mark.style.lineStyle, panel.layout.scale));
  context.beginPath(); context.moveTo(g.x, g.top); context.lineTo(g.x, g.bottom); context.stroke(); context.setLineDash?.([]); context.restore();
}

function drawBaselineLabel(context, mark, panel) {
  if (mark.motion.clip < 0.999) return;
  const g = mark.geometry; context.save(); context.globalAlpha = mark.motion.opacity; context.fillStyle = mark.style.color; context.font = `${Math.max(7, panel.layout.font.legend * 0.9)}px ${FONT_STACK}`; context.textAlign = "center"; context.textBaseline = "bottom"; context.fillText(fitLabel(context, mark.label, Math.max(50, panel.layout.plot.right - panel.layout.plot.left)), g.x, g.top - 5 * panel.layout.scale); context.restore();
}

function drawRowBand(context, mark) {
  const g = mark.geometry; context.save(); context.globalAlpha = mark.motion.opacity * 0.28; context.fillStyle = mark.style.color; context.fillRect(g.left, g.top, g.right - g.left, g.bottom - g.top); context.restore();
}

function drawRug(context, mark, scale, theme) {
  const m = mark.motion, g = mark.geometry;
  context.save(); context.globalAlpha = m.opacity * (theme.mode === "paper" ? 1 : 0.84); context.strokeStyle = mark.style.color; context.lineWidth = Math.max(1, 1.35 * scale); context.beginPath(); context.moveTo(g.x, g.y - g.halfHeight); context.lineTo(g.x, g.y + g.halfHeight); context.stroke(); context.restore();
}

function drawTemporalBar(context, mark, theme, panel) {
  const m = mark.motion, g = mark.geometry, top = g.bottom - (g.bottom - g.top) * m.clip;
  context.save(); context.globalAlpha = m.opacity * (theme.mode === "paper" ? 1 : 0.24); context.fillStyle = mark.style.color; context.strokeStyle = mark.style.edge ?? mark.style.color; context.fillRect(g.left, top, Math.max(0, g.right - g.left), g.bottom - top); context.strokeRect(g.left, top, Math.max(0, g.right - g.left), g.bottom - top); context.restore();
}

function drawTemporalBarLabel(context, mark, theme, panel) {
  if (mark.motion.clip < 0.999) return;
  const g = mark.geometry; context.save(); context.globalAlpha = mark.motion.opacity; context.fillStyle = theme.secondary; context.font = `${Math.max(7, panel.layout.font.axis * 0.75)}px ${FONT_STACK}`; context.textAlign = "center"; context.textBaseline = "bottom"; context.fillText(String(mark.value), g.labelX, g.labelY); context.restore();
}

function drawDenominatorLabels(context, panel, theme) {
  const denominator = panel.meta?.denominator;
  if (!denominator) return;
  context.save(); context.fillStyle = theme.warm; context.font = `${panel.layout.font.signature}px ${FONT_STACK}`; context.textAlign = "right"; context.textBaseline = "bottom";
  context.fillText(`${denominator.label}: ${denominator.value}`, panel.layout.plot.right, panel.layout.plot.top - 5 * panel.layout.scale);
  context.restore();
}

export function drawResolvedPanel(context, frame, panelIndex) {
  const panel = frame.panels[panelIndex], theme = frame.theme;
  const layers = partitionPanelMarks(panel.marks);
  drawGrid(context, panel, theme, frame.profile);
  const drawMark = (mark) => {
    if (!mark.geometry || mark.motion.opacity <= 0) return;
    if (mark.kind === "point") drawPoint(context, mark);
    else if (["segment", "summary-line"].includes(mark.kind)) drawLine(context, mark, theme);
    else if (mark.kind === "median-rule") drawLine(context, mark, theme);
    else if (mark.kind === "bar") drawBar(context, mark, theme);
    else if (mark.kind === "cell") drawCell(context, mark, theme, panel.layout.font.axis);
    else if (mark.kind === "interval") drawIntervalMark(context, mark, panel.layout.scale, theme);
    else if (mark.kind === "connector") drawConnector(context, mark, panel, theme);
    else if (mark.kind === "baseline-rule") drawBaseline(context, mark, panel, theme);
    else if (mark.kind === "rug") drawRug(context, mark, panel.layout.scale, theme);
    else if (mark.kind === "temporal-bar") drawTemporalBar(context, mark, theme, panel);
  };
  for (const key of ["reference", "data", "summary"]) withCanvasPlotClip(context, panel, () => {
    const marks = key === "data"
      ? [...layers.data.filter((mark) => mark.kind !== "point"), ...layers.data.filter((mark) => mark.kind === "point")]
      : layers[key];
    marks.forEach(drawMark);
  });
  drawPanelText(context, panel, theme);
  drawAxes(context, panel, theme);
  panel.marks.forEach((mark) => {
    if (!mark.geometry || mark.motion.opacity <= 0) return;
    if (mark.kind === "connector") drawConnectorLabel(context, mark, theme, panel);
    else if (mark.kind === "baseline-rule") drawBaselineLabel(context, mark, panel);
    else if (mark.kind === "temporal-bar") drawTemporalBarLabel(context, mark, theme, panel);
  });
  drawComposedAnnotations(context, panel, theme, frame.progress ?? 1);
  drawLegend(context, panel, theme); drawMatrixLegend(context, panel, theme);
  if (panel.meta?.showBandKey) drawBandKey(context, panel, theme);
  drawDenominatorLabels(context, panel, theme);
  return { x: panel.axes.x, y: panel.axes.y, xDomain: panel.domain.x, yDomain: panel.domain.y };
}
