import { CORE_REGISTRY } from "./core-renderers.js";
import { compileTerminalScene, evidenceFingerprint } from "./terminal-scene.js";
import { resolveTerminalScene } from "./resolved-scene.js";
import { composeResolvedScene } from "./composition.js";
import { partitionPanelMarks, plotClipRect } from "./render-layers.js";
import { resolveExportSize } from "./physical-export.js";
import { validateThemeColors } from "./schema.js";

const xmlValue = (value) => String(value).replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "\uFFFD");
const esc = (value) => xmlValue(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]));
const attrs = (value) => Object.entries(value).filter(([, item]) => item != null).map(([key, item]) => `${key}="${esc(item)}"`).join(" ");
const FONT = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

function hashText(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function safeId(value) { return String(value).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "figurestead"; }

function svgNamespace(composed, scene, options) {
  if (options.idPrefix != null && !String(options.idPrefix).trim()) throw new TypeError("idPrefix must be a non-empty string");
  if (options.idPrefix != null) return safeId(options.idPrefix);
  const evidence = scene ? evidenceFingerprint(scene) : `fnv1a32-${hashText(JSON.stringify({ title: composed.spec.title, panels: composed.panels.map((panel) => panel.id) }))}`;
  return safeId(`figurestead-${evidence}-${composed.width}x${composed.height}`);
}

function dash(style) { return style === "dash" ? "7 4" : style === "dot" ? "2 4" : style === "dash-dot" ? "8 3 2 3" : null; }
function marker(mark) {
  const { cx, cy, radius } = mark.geometry, common = { "data-mark-id": mark.id, fill: "none", stroke: mark.style.color, "stroke-width": 1.5 };
  if (mark.style.glyph === "square") return `<rect ${attrs({ ...common, x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2 })}/>`;
  if (mark.style.glyph === "triangle") return `<path ${attrs({ ...common, d: `M ${cx} ${cy - radius} L ${cx + radius} ${cy + radius} L ${cx - radius} ${cy + radius} Z` })}/>`;
  if (mark.style.glyph === "diamond") return `<path ${attrs({ ...common, d: `M ${cx} ${cy - radius} L ${cx + radius} ${cy} L ${cx} ${cy + radius} L ${cx - radius} ${cy} Z` })}/>`;
  return `<circle ${attrs({ ...common, cx, cy, r: radius })}/>`;
}

function segment(mark) {
  const g = mark.geometry, d = g.c1x == null ? `M ${g.x1} ${g.y1} L ${g.x2} ${g.y2}` : `M ${g.x1} ${g.y1} C ${g.c1x} ${g.c1y} ${g.c2x} ${g.c2y} ${g.x2} ${g.y2}`;
  return `<path ${attrs({ "data-mark-id": mark.id, d, fill: "none", stroke: mark.style.color, "stroke-width": mark.style.lineWidth ?? 1.6, "stroke-dasharray": dash(mark.style.lineStyle), "stroke-linecap": "round" })}/>`;
}

function bar(mark, theme) {
  const g = mark.geometry;
  if (mark.missing) return `<text ${attrs({ "data-mark-id": mark.id, x: (g.left + g.right) / 2, y: (g.top + g.bottom) / 2, fill: theme.warm, "text-anchor": "middle" })}>×</text>`;
  const fillOpacity = theme.mode === "paper" ? 1 : g.alpha;
  return `<g data-mark-id="${esc(mark.id)}"><rect ${attrs({ x: g.left, y: g.top, width: g.right - g.left, height: g.bottom - g.top, fill: mark.style.color, "fill-opacity": fillOpacity, stroke: mark.style.edge ?? mark.style.color })}/>${theme.mode === "paper" ? barHatch(g, mark.style.hatch, mark.style.edge ?? theme.label) : ""}</g>`;
}

function barHatch(g, hatch, color) {
  if (!hatch || hatch === "none") return "";
  const spacing = 6, height = g.bottom - g.top, pieces = [];
  const line = (x1, y1, x2, y2) => pieces.push(`M ${x1} ${y1} L ${x2} ${y2}`);
  if (["diag", "cross"].includes(hatch)) for (let x = g.left - height; x <= g.right; x += spacing) {
    const fromX = Math.max(g.left, x), toX = Math.min(g.right, x + height);
    if (toX >= fromX) line(fromX, g.bottom - (fromX - x), toX, g.bottom - (toX - x));
  }
  if (hatch === "cross") for (let x = g.left; x <= g.right + height; x += spacing) {
    const fromX = Math.min(g.right, x), toX = Math.max(g.left, x - height);
    if (fromX >= toX) line(fromX, g.bottom - (x - fromX), toX, g.bottom - (x - toX));
  }
  if (hatch === "vertical") for (let x = g.left + spacing / 2; x < g.right; x += spacing) line(x, g.top, x, g.bottom);
  return pieces.length ? `<path ${attrs({ d: pieces.join(" "), fill: "none", stroke: color, "stroke-width": 0.75, "stroke-opacity": 0.34 })}/>` : "";
}

function cell(mark, theme, fontSize) {
  const g = mark.geometry, label = mark.label ? `<text ${attrs({ x: (g.left + g.right) / 2, y: (g.top + g.bottom) / 2, fill: g.labelColor ?? theme.label, "font-size": fontSize, "text-anchor": "middle", "dominant-baseline": "middle" })}>${esc(mark.label)}</text>` : "";
  const status = mark.status === "insufficient" ? `<path ${attrs({ d: `M ${g.left} ${g.bottom} L ${g.right} ${g.top}`, stroke: theme.warm })}/>` : "";
  return `<g data-mark-id="${esc(mark.id)}"><rect ${attrs({ x: g.left, y: g.top, width: g.right - g.left, height: g.bottom - g.top, fill: g.fill, stroke: mark.style.edge, "data-status": mark.status })}/>${status}${label}</g>`;
}

function interval(mark, theme) {
  const g = mark.geometry;
  return `<g ${attrs({ "data-mark-id": mark.id, stroke: mark.style.color, "stroke-width": mark.style.lineWidth ?? 1.6, "stroke-dasharray": dash(mark.style.lineStyle), "stroke-opacity": theme.mode === "paper" ? 1 : (mark.role === "context" ? 0.62 : 0.9), fill: "none" })}><path d="M ${g.x1} ${g.y} L ${g.x2} ${g.y}"/><path d="M ${g.x1} ${g.y - g.cap} L ${g.x1} ${g.y + g.cap} M ${g.x2} ${g.y - g.cap} L ${g.x2} ${g.y + g.cap}"/></g>`;
}

function connector(mark, theme) {
  const g = mark.geometry;
  return `<path ${attrs({ "data-mark-id": mark.id, d: `M ${g.x1} ${g.y} L ${g.x2} ${g.y}`, fill: "none", stroke: mark.style.color, "stroke-width": mark.style.lineWidth ?? 1.35, "stroke-opacity": theme.mode === "paper" ? 1 : 0.72 })}/>`;
}

function connectorLabel(mark, panel, theme) {
  const g = mark.geometry, leftFirst = g.x1 <= g.x2, pad = 6 * panel.layout.scale;
  const delta = `${mark.delta >= 0 ? "+" : ""}${Number(mark.delta.toPrecision(4))}`;
  return `<g data-label-for="${esc(mark.id)}"><text ${attrs({ x: g.x1 + (leftFirst ? -pad : pad), y: g.y - 7 * panel.layout.scale, fill: theme.series[0], "font-size": panel.layout.font.legend, "text-anchor": leftFirst ? "end" : "start" })}>${esc(mark.endpointALabel)}</text><text ${attrs({ x: g.x2 + (leftFirst ? pad : -pad), y: g.y + 7 * panel.layout.scale, fill: theme.series[1 % theme.series.length], "font-size": panel.layout.font.legend, "text-anchor": leftFirst ? "start" : "end" })}>${esc(mark.endpointBLabel)}</text><text ${attrs({ x: (g.x1 + g.x2) / 2, y: g.y - 18 * panel.layout.scale, fill: theme.label, "font-size": panel.layout.font.legend, "text-anchor": "middle" })}>${esc(delta)}</text></g>`;
}

function referenceBand(mark) {
  const g = mark.geometry;
  return `<g data-mark-id="${esc(mark.id)}"><rect ${attrs({ x: g.left, y: g.top, width: g.right - g.left, height: g.bottom - g.top, fill: mark.style.color, "fill-opacity": 0.1, "data-status": mark.status, "data-label": mark.label })}/><path ${attrs({ d: `M ${g.left} ${g.bottom} L ${g.right} ${g.bottom}`, stroke: mark.style.color, "stroke-opacity": 0.45 })}/></g>`;
}

function baseline(mark, panel) {
  const g = mark.geometry;
  return `<path ${attrs({ "data-mark-id": mark.id, d: `M ${g.x} ${g.top} L ${g.x} ${g.bottom}`, stroke: mark.style.color, "stroke-width": mark.style.lineWidth ?? 1.2, "stroke-dasharray": dash(mark.style.lineStyle) })}/>`;
}

function baselineLabel(mark, panel) {
  const g = mark.geometry;
  return `<text ${attrs({ "data-label-for": mark.id, x: g.x, y: g.top - 5 * panel.layout.scale, fill: mark.style.color, "font-size": panel.layout.font.legend, "text-anchor": "middle" })}>${esc(mark.label)}</text>`;
}

function rowBand(mark) {
  const g = mark.geometry;
  return `<rect ${attrs({ "data-mark-id": mark.id, x: g.left, y: g.top, width: g.right - g.left, height: g.bottom - g.top, fill: mark.style.color, "fill-opacity": 0.28 })}/>`;
}

function rug(mark) {
  const g = mark.geometry;
  return `<path ${attrs({ "data-mark-id": mark.id, d: `M ${g.x} ${g.y - g.halfHeight} L ${g.x} ${g.y + g.halfHeight}`, stroke: mark.style.color, "stroke-width": mark.style.lineWidth ?? 1.35 })}/>`;
}

function temporalBar(mark, panel, theme) {
  const g = mark.geometry;
  return `<rect ${attrs({ "data-mark-id": mark.id, x: g.left, y: g.top, width: Math.max(0, g.right - g.left), height: g.bottom - g.top, fill: mark.style.color, "fill-opacity": theme.mode === "paper" ? 1 : 0.24, stroke: mark.style.edge ?? mark.style.color })}/>`;
}

function temporalBarLabel(mark, panel, theme) {
  const g = mark.geometry;
  return `<text ${attrs({ "data-label-for": mark.id, x: g.labelX, y: g.labelY, fill: theme.secondary, "font-size": Math.max(7, panel.layout.font.axis * 0.75), "text-anchor": "middle" })}>${esc(mark.value)}</text>`;
}

function tickPosition(axis, tick) { const value = axis(tick.value); return axis.bandwidth ? value + axis.bandwidth() / 2 : value; }
function grid(panel, theme, profile) {
  const plot = panel.axes.plot ?? panel.layout.plot, pieces = [];
  if (panel.axes.xType !== "band" && profile.gridX) panel.axes.xTicks.forEach((tick) => {
    const x = tickPosition(panel.axes.x, tick); pieces.push(`<path ${attrs({ d: `M ${x} ${plot.top} L ${x} ${plot.bottom}`, stroke: theme.grid, "stroke-width": Math.max(0.6, 0.85 * panel.layout.scale), "stroke-opacity": profile.gridAlpha * 0.5 })}/>`);
  });
  if (panel.axes.yType !== "band" && profile.gridY) panel.axes.yTicks.forEach((tick) => {
    const y = tickPosition(panel.axes.y, tick); pieces.push(`<path ${attrs({ d: `M ${plot.left} ${y} L ${plot.right} ${y}`, stroke: theme.grid, "stroke-width": Math.max(0.6, 0.85 * panel.layout.scale), "stroke-opacity": profile.gridAlpha * 0.5 })}/>`);
  });
  return pieces.join("");
}

function panelSurface(panel, theme) {
  if (!panel.presentation?.panelSurface) return "";
  const plot = panel.layout.plot;
  return `<rect ${attrs({
    x: plot.left, y: plot.top, width: plot.right - plot.left, height: plot.bottom - plot.top,
    fill: theme.panel,
    stroke: panel.presentation.frame ? theme.spine : null,
    "stroke-opacity": panel.presentation.frame ? 0.48 : null,
    "stroke-width": panel.presentation.frame ? Math.max(0.6, 0.75 * panel.layout.scale) : null,
  })}/>`;
}

function axes(panel, theme) {
  const plot = panel.axes.plot ?? panel.layout.plot, { font } = panel.layout, pieces = [`<path ${attrs({ d: `M ${plot.left} ${plot.top} L ${plot.left} ${plot.bottom} L ${plot.right} ${plot.bottom}`, fill: "none", stroke: theme.spine })}/>`];
  const slot = panel.axes.x.step?.() ?? Math.max(40, (plot.right - plot.left) / Math.max(1, panel.axes.xTicks.length));
  const rotate = panel.layout.text?.rotateX ?? (panel.axes.xType === "band" && panel.axes.xTicks.some((tick) => String(tick.label).length * font.axis * 0.62 > slot * 0.92));
  panel.axes.xTicks.forEach((tick) => { const x = tickPosition(panel.axes.x, tick), y = panel.layout.text?.xTickBaselineY ?? plot.bottom + 16 * panel.layout.scale; pieces.push(`<text ${attrs({ x, y, fill: theme.secondary, "font-size": font.axis, "text-anchor": rotate ? "end" : "middle", transform: rotate ? `rotate(-45 ${x} ${y})` : null })}>${esc(tick.label)}</text>`); });
  panel.axes.yTicks.forEach((tick) => pieces.push(`<text ${attrs({ x: plot.left - 7 * panel.layout.scale, y: tickPosition(panel.axes.y, tick), fill: theme.secondary, "font-size": font.axis, "text-anchor": "end", "dominant-baseline": "middle" })}>${esc(tick.label)}</text>`));
  if (panel.spec.xLabel) pieces.push(`<text ${attrs({ x: (plot.left + plot.right) / 2, y: panel.layout.text?.xLabelBaselineY ?? panel.layout.rect.bottom - 6 * panel.layout.scale, fill: theme.label, "font-size": font.axis, "text-anchor": "middle" })}>${esc(panel.spec.xLabel)}</text>`);
  if (panel.spec.yLabel) { const x = panel.layout.text?.yLabelX ?? panel.layout.rect.left + 12 * panel.layout.scale; pieces.push(`<text ${attrs({ x, y: (plot.top + plot.bottom) / 2, fill: theme.label, "font-size": font.axis, transform: `rotate(-90 ${x} ${(plot.top + plot.bottom) / 2})`, "text-anchor": "middle", "dominant-baseline": "hanging" })}>${esc(panel.spec.yLabel)}</text>`); }
  return pieces.join("");
}

function legend(panel, theme) {
  if (panel.presentation?.legend === "none") return "";
  const insideTop = panel.layout.plot.bottom - Math.max(14, 14 + (panel.legend.length - 1) * 20) * panel.layout.scale;
  return panel.legend.map((item, index) => {
    const entry = panel.layout.legend.entries?.[index];
    const x = entry?.markerX ?? (panel.layout.legend.outside ? panel.layout.legend.left : panel.layout.plot.right - 24 * panel.layout.scale);
    const textX = entry?.textX ?? (panel.layout.legend.outside ? x + 12 * panel.layout.scale : x - 10 * panel.layout.scale);
    const y = entry?.y ?? (panel.layout.legend.outside ? panel.layout.legend.top + (14 + index * 20) * panel.layout.scale : insideTop + index * 20 * panel.layout.scale), style = item.style ?? {};
    const point = `<circle ${attrs({ cx: x, cy: y, r: 4 * panel.layout.scale, fill: "none", stroke: style.color ?? theme.series[item.colorIndex % theme.series.length] })}/>`;
    const label = entry?.displayLabel ?? item.label;
    return `${point}<text ${attrs({ x: textX, y, fill: theme.label, "font-size": panel.layout.font.legend, "text-anchor": entry?.textAnchor ?? (panel.layout.legend.outside ? "start" : "end"), "dominant-baseline": "middle", "data-full-label": item.label })}><title>${esc(item.label)}</title>${esc(label)}</text>`;
  }).join("");
}

function annotations(panel, theme) {
  return (panel.composedAnnotations ?? []).filter((annotation) => annotation.geometry).map((annotation) => {
    const g = annotation.geometry, direction = g.labelX < g.anchorX ? -1 : 1;
    const leader = `M ${g.anchorX + direction * g.radius * 0.7} ${g.anchorY} L ${g.labelX + (g.textAnchor === "end" ? 8 : -8) * panel.layout.scale} ${g.labelY - 5 * panel.layout.scale}`;
    const label = annotation.displayLabel ?? annotation.label;
    return `<g ${attrs({ "data-focus-id": annotation.id, "data-focus-status": annotation.status, "data-anchor-mark-id": annotation.boundMarkId, "data-full-label": annotation.label })}><title>${esc(annotation.label)}</title><circle ${attrs({ cx: g.anchorX, cy: g.anchorY, r: g.radius * 1.45, fill: "none", stroke: theme.primary, "stroke-width": Math.max(3, g.radius * 0.62), "stroke-opacity": 0.13 })}/><path ${attrs({ d: leader, fill: "none", stroke: theme.summaryCore, "stroke-width": Math.max(1, 1.25 * panel.layout.scale) })}/><circle ${attrs({ cx: g.anchorX, cy: g.anchorY, r: g.radius, fill: theme.summaryCore, stroke: theme.seriesEdges?.[0] ?? theme.primaryEdge ?? theme.field, "stroke-width": Math.max(1.4, 1.9 * panel.layout.scale) })}/><text ${attrs({ x: g.labelX, y: g.labelY, fill: theme.summaryCore, stroke: theme.field, "stroke-width": Math.max(1.6, 2.2 * panel.layout.scale), "paint-order": "stroke", "font-size": Math.max(9, panel.layout.font.legend * 1.06), "font-weight": 600, "text-anchor": g.textAnchor, "dominant-baseline": "middle" })}>${esc(label)}</text></g>`;
  }).join("");
}

function matrixLegend(panel, theme, namespace) {
  if (panel.renderer !== "categorical_matrix" || !panel.valueScale || !panel.marks.length) return "";
  const width = Math.min(190 * panel.layout.scale, (panel.layout.plot.right - panel.layout.plot.left) * 0.42), left = panel.layout.plot.right - width;
  const top = panel.layout.plot.top - 28 * panel.layout.scale, height = Math.max(5, 7 * panel.layout.scale), style = panel.marks[0].style, id = `${namespace}-${safeId(panel.id)}-matrix-gradient`;
  return `<defs><linearGradient id="${esc(id)}"><stop offset="0%" stop-color="${esc(style.low)}"/><stop offset="68%" stop-color="${esc(style.color)}"/><stop offset="100%" stop-color="${esc(style.high)}"/></linearGradient></defs><text ${attrs({ x: left, y: top - 3 * panel.layout.scale, fill: theme.label, "font-size": panel.layout.font.legend })}>${esc(panel.valueScale.label)}</text><rect ${attrs({ x: left, y: top, width, height, fill: `url(#${id})`, stroke: theme.spine })}/><text ${attrs({ x: left, y: top + height + 12 * panel.layout.scale, fill: theme.secondary, "font-size": panel.layout.font.legend })}>${esc(panel.valueScale.domain[0])}</text><text ${attrs({ x: left + width, y: top + height + 12 * panel.layout.scale, fill: theme.secondary, "font-size": panel.layout.font.legend, "text-anchor": "end" })}>${esc(panel.valueScale.domain[1])}</text>`;
}

function panelSvg(panel, theme, profile, namespace) {
  if (!panel.resolved) throw new TypeError(`SVG export requires a scene-aware renderer; ${panel.renderer} remains on the compatibility path`);
  const render = (mark) => mark.kind === "point" ? marker(mark)
    : ["segment", "summary-line"].includes(mark.kind) ? segment(mark)
      : mark.kind === "median-rule" ? segment(mark)
      : mark.kind === "bar" ? bar(mark, theme)
        : mark.kind === "cell" ? cell(mark, theme, panel.layout.font.axis)
          : mark.kind === "interval" ? interval(mark, theme)
            : mark.kind === "connector" ? connector(mark, theme)
              : mark.kind === "reference-band" ? referenceBand(mark)
                : mark.kind === "baseline-rule" ? baseline(mark, panel)
                  : mark.kind === "row-band" ? rowBand(mark)
                    : mark.kind === "rug" ? rug(mark)
                      : mark.kind === "temporal-bar" ? temporalBar(mark, panel, theme) : "";
  const layers = partitionPanelMarks(panel.marks), plot = plotClipRect(panel), clipId = `${namespace}-${safeId(panel.id)}-evidence-clip`;
  const renderLayer = (name, marks) => `<g data-layer="${name}" clip-path="url(#${clipId})">${marks.map(render).join("")}</g>`;
  const dataMarks = [...layers.data.filter((mark) => mark.kind !== "point"), ...layers.data.filter((mark) => mark.kind === "point")];
  const dataLabels = panel.marks.map((mark) => mark.kind === "connector" ? connectorLabel(mark, panel, theme)
    : mark.kind === "baseline-rule" ? baselineLabel(mark, panel)
      : mark.kind === "temporal-bar" ? temporalBarLabel(mark, panel, theme) : "").join("");
  const denominator = panel.meta?.denominator ? `<text ${attrs({ x: panel.layout.plot.right, y: panel.layout.plot.top - 5 * panel.layout.scale, fill: theme.warm, "font-size": panel.layout.font.signature, "text-anchor": "end" })}>${esc(`${panel.meta.denominator.label}: ${panel.meta.denominator.value}`)}</text>` : "";
  const title = `<text ${attrs({ x: panel.layout.plot.left, y: panel.layout.text?.titleY ?? panel.layout.rect.top + 20, fill: theme.mode === "paper" ? theme.label : theme.primary, "font-size": panel.layout.font.title })}>${esc(panel.spec.title || panel.renderer)}</text>`;
  const provenance = theme.mode !== "paper" && panel.spec.signature && (panel.layout.panelIndex ?? 0) === 0
    ? `<text ${attrs({ x: panel.layout.provenance?.left ?? panel.layout.plot.left, y: panel.layout.provenance?.y ?? panel.layout.rect.bottom - 8 * panel.layout.scale, fill: theme.faint, "font-size": panel.layout.font.signature, "text-anchor": "start", "data-layer": "provenance" })}>${esc(panel.spec.signature)}</text>` : "";
  return `<g ${attrs({ "data-panel-id": panel.id, "data-renderer": panel.renderer, "data-denominator": panel.denominator == null ? null : JSON.stringify(panel.denominator), "data-x-category-order": panel.categories.x?.join("|"), "data-y-category-order": panel.categories.y?.join("|") })}><defs><clipPath id="${esc(clipId)}" clipPathUnits="userSpaceOnUse"><rect ${attrs({ x: plot.left, y: plot.top, width: plot.right - plot.left, height: plot.bottom - plot.top })}/></clipPath></defs><g data-layer="surface">${panelSurface(panel, theme)}</g><g data-layer="grid">${grid(panel, theme, profile)}</g>${renderLayer("reference", layers.reference)}${renderLayer("data", dataMarks)}${renderLayer("summary", layers.summary)}<g data-layer="axes">${title}${axes(panel, theme)}${provenance}</g><g data-layer="annotations">${dataLabels}${annotations(panel, theme)}</g><g data-layer="legend">${legend(panel, theme)}${matrixLegend(panel, theme, namespace)}${denominator}</g></g>`;
}

export function resolvedSceneToSvg(resolved, options = {}) {
  const composed = resolved.schemaVersion === "figurestead.composed-scene/1" ? resolved : composeResolvedScene(resolved);
  validateThemeColors(composed.theme, "scene.theme");
  const scene = options.sourceScene, namespace = svgNamespace(composed, scene, options);
  const exportSize = options.exportSize ?? resolveExportSize({ ...options, width: composed.width, height: composed.height });
  const title = composed.spec.title, description = [composed.spec.description || composed.spec.subtitle || "Scientific figure", composed.spec.note, ...composed.panels.flatMap((panel) => panel.notes ?? [])].filter(Boolean).join(" ");
  const titleId = `${namespace}-title`, descId = `${namespace}-desc`;
  const header = composed.layout.header ? `<text ${attrs({ x: composed.layout.header.left, y: composed.layout.header.titleY, fill: composed.theme.mode === "paper" ? composed.theme.label : composed.theme.primary, "font-size": composed.layout.font.title })}>${esc(title)}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" ${attrs({ width: exportSize.widthAttribute, height: exportSize.heightAttribute, viewBox: `0 0 ${composed.width} ${composed.height}`, role: "img", "aria-labelledby": `${titleId} ${descId}`, "data-scene-version": composed.sourceSceneVersion, "data-resolved-scene-version": composed.resolvedSceneVersion, "data-composed-scene-version": composed.schemaVersion, "data-evidence-fingerprint": scene ? evidenceFingerprint(scene) : null, "data-physical-width-mm": exportSize.physical?.widthMm })}><title id="${titleId}">${esc(title)}</title><desc id="${descId}">${esc(description)}</desc><rect ${attrs({ width: "100%", height: "100%", fill: composed.theme.field })}/>${header}${composed.panels.map((panel) => panelSvg(panel, composed.theme, composed.profile, namespace)).join("")}</svg>`;
}

export function sceneToSvg(scene, options = {}) {
  const exportSize = resolveExportSize(options);
  const resolved = resolveTerminalScene(scene, { width: exportSize.width, height: exportSize.height });
  return resolvedSceneToSvg(composeResolvedScene(resolved), { ...options, exportSize, sourceScene: scene });
}

export function exportFigureSvg(input, options = {}) {
  const scene = input?.schemaVersion === "figurestead.scene/1" ? input : compileTerminalScene(input, { registry: options.registry ?? CORE_REGISTRY });
  return sceneToSvg(scene, options);
}
