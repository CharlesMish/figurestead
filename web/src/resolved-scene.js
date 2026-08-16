import { deriveFigureLayout } from "./figure-layout.js";
import { refineScientificLayout } from "./scientific-layout.js";
import { markMotionState } from "./motion-plan.js";
import { monotoneSegmentControls } from "./renderers/line.js";
import { bandScale, formatTick, formatTimeTick, linearScale, timeScale, ticks, timeTicks } from "./scales.js";

export const RESOLVED_SCENE_VERSION = "figurestead.resolved-scene/1";
export const RESOLVED_RENDERERS = Object.freeze([
  "line", "scatter", "categorical_bar", "categorical_layered_bar", "categorical_matrix",
  "interval_comparison", "strip_summary", "temporal_coverage", "temporal_observations",
  "paired_points", "reference_improvement",
]);

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const cloneRect = (value) => ({ ...value });
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value); }

function parseHex(color) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (match) return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16));
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(color);
  return rgb ? rgb.slice(1).map(Number) : [47, 185, 143];
}

function mix(left, right, amount) {
  const a = parseHex(left), b = parseHex(right), t = clamp01(amount);
  return `rgb(${a.map((value, index) => Math.round(value + (b[index] - value) * t)).join(",")})`;
}

function luminance(color) {
  const values = parseHex(color).map((value) => { const item = value / 255; return item <= 0.04045 ? item / 12.92 : ((item + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}
function contrast(left, right) { const values = [luminance(left), luminance(right)].sort((a, b) => b - a); return (values[0] + 0.05) / (values[1] + 0.05); }

function panelLayout(source, panel) {
  const layout = {
    ...source,
    rect: source.rect ? cloneRect(source.rect) : { left: 0, top: 0, right: source.width, bottom: source.height },
    plot: cloneRect(source.plot), text: source.text ? { ...source.text } : null, font: { ...source.font },
  };
  if (panel.presentation?.legend === "outside-right" && panel.legend.length) {
    const width = Math.min(190 * layout.scale, Math.max(110, (layout.rect.right - layout.rect.left) * 0.28));
    layout.plot.right = Math.max(layout.plot.left + 80, layout.plot.right - width);
    layout.legend = {
      left: layout.plot.right + 18 * layout.scale,
      right: layout.rect.right - 8 * layout.scale,
      top: layout.plot.top,
      bottom: layout.plot.bottom,
      outside: true,
    };
  } else {
    layout.legend = { left: layout.plot.left, right: layout.plot.right, top: layout.plot.top, bottom: layout.plot.bottom, outside: false };
  }
  return layout;
}

function preparedPanelLayout(source) {
  return {
    ...source,
    rect: source.rect ? cloneRect(source.rect) : { left: 0, top: 0, right: source.width, bottom: source.height },
    plot: cloneRect(source.plot),
    text: source.text ? { ...source.text } : null,
    font: { ...source.font },
    provenance: source.provenance ? { ...source.provenance } : null,
    legend: source.legend ? { ...source.legend } : null,
  };
}

function numericScale(type, domain, range) {
  return type === "time" ? timeScale(domain, range) : linearScale(domain, range);
}

function numericTicks(type, domain) {
  const values = type === "time" ? timeTicks(domain, 5) : ticks(domain, 5);
  return values.map((value) => ({ value, label: type === "time" ? formatTimeTick(value, domain) : formatTick(value) }));
}

function resolveAxes(panel, layout, plotOverride = null) {
  const plot = plotOverride ?? layout.plot, xType = panel.scales.x.type, yType = panel.scales.y.type;
  const xCategories = panel.categories.x, yCategories = panel.categories.y;
  const x = xType === "band" ? bandScale(xCategories ?? [], [plot.left, plot.right], { padding: panel.scales.x.padding }) : numericScale(xType, panel.domain.x, [plot.left, plot.right]);
  const y = yType === "band" ? bandScale(yCategories ?? [], [plot.top, plot.bottom], { padding: panel.scales.y.padding }) : numericScale(yType, panel.domain.y, [plot.bottom, plot.top]);
  const xTicks = xType === "band" ? (xCategories ?? []).map((value) => ({ value, label: panel.categoryLabels?.x?.[value] ?? value })) : numericTicks(xType, panel.domain.x);
  const yTicks = yType === "band" ? (yCategories ?? []).map((value) => ({ value, label: panel.categoryLabels?.y?.[value] ?? value })) : numericTicks(yType, panel.domain.y);
  return { x, y, xTicks, yTicks, xType, yType, plot };
}

function pointGeometry(mark, axes, radius) {
  let cx;
  if (mark.group != null && axes.x.bandwidth) cx = axes.x(mark.group) + axes.x.bandwidth() / 2 + (mark.xOffset ?? 0) * (axes.x.step?.() ?? axes.x.bandwidth());
  else cx = axes.x(mark.x);
  const cy = mark.yCategory != null && axes.y.bandwidth ? axes.y(mark.yCategory) + axes.y.bandwidth() / 2 : axes.y(mark.y);
  return { cx, cy, radius };
}

function lineGeometry(panel, axes, radius) {
  const controls = new Map();
  const series = [...new Set(panel.marks.filter((mark) => mark.kind === "point").map((mark) => mark.series))];
  series.forEach((key) => {
    const points = panel.marks.filter((mark) => mark.kind === "point" && mark.series === key);
    const values = panel.encoding.interpolation === "monotone" ? monotoneSegmentControls(points) : null;
    values?.forEach((value, index) => controls.set(`${key}\u0000${index}`, value));
  });
  const segmentIndex = new Map();
  return panel.marks.map((mark) => {
    if (mark.kind === "point") return { ...mark, geometry: pointGeometry(mark, axes, radius) };
    if (mark.kind !== "segment") return { ...mark };
    const index = segmentIndex.get(mark.series) ?? 0; segmentIndex.set(mark.series, index + 1);
    const control = controls.get(`${mark.series}\u0000${index}`);
    return { ...mark, geometry: {
      x1: axes.x(mark.from.x), y1: axes.y(mark.from.y), x2: axes.x(mark.to.x), y2: axes.y(mark.to.y),
      ...(control ? { c1x: axes.x(control.c1.x), c1y: axes.y(control.c1.y), c2x: axes.x(control.c2.x), c2y: axes.y(control.c2.y) } : {}),
    } };
  });
}

function scatterGeometry(panel, axes, radius) {
  return panel.marks.map((mark) => {
    if (mark.kind === "point") return { ...mark, geometry: pointGeometry(mark, axes, radius) };
    if (mark.kind === "summary-line") {
      const [x0, x1] = panel.domain.x;
      return { ...mark, geometry: { x1: axes.x(x0), y1: axes.y(mark.intercept + mark.slope * x0), x2: axes.x(x1), y2: axes.y(mark.intercept + mark.slope * x1) } };
    }
    return { ...mark };
  });
}

function barGeometry(panel, axes, layout) {
  const horizontal = panel.orientation === "horizontal", categories = horizontal ? panel.categories.y : panel.categories.x;
  const category = horizontal ? axes.y : axes.x, value = horizontal ? axes.x : axes.y;
  const series = [...new Set(panel.marks.map((mark) => mark.series))], layered = panel.renderer === "categorical_layered_bar";
  return panel.marks.map((mark) => {
    const start = category(mark.category), bandwidth = category.bandwidth();
    let left, right, top, bottom;
    if (layered) {
      const ratio = Math.max(0.36, 1 - mark.seriesIndex * 0.24), inset = bandwidth * (1 - ratio) / 2;
      if (horizontal) { left = value(0); right = value(mark.value ?? 0); top = start + inset; bottom = start + bandwidth - inset; }
      else { left = start + inset; right = start + bandwidth - inset; top = value(mark.value ?? 0); bottom = value(0); }
    } else {
      const slot = bandwidth / Math.max(1, series.length), inset = slot * 0.12, seriesIndex = series.indexOf(mark.series);
      if (horizontal) { left = value(0); right = value(mark.value ?? 0); top = start + slot * seriesIndex + inset; bottom = start + slot * (seriesIndex + 1) - inset; }
      else { left = start + slot * seriesIndex + inset; right = start + slot * (seriesIndex + 1) - inset; top = value(mark.value ?? 0); bottom = value(0); }
    }
    return { ...mark, geometry: {
      left: Math.min(left, right), right: Math.max(left, right), top: Math.min(top, bottom), bottom: Math.max(top, bottom),
      baselineX: horizontal ? value(0) : null, baselineY: horizontal ? null : value(0),
      alpha: layered && mark.layer === 0 ? 0.3 : 0.68,
    } };
  });
}

function matrixGeometry(panel, layout, theme) {
  const { plot } = layout, xs = panel.categories.x, ys = panel.categories.y;
  const x = bandScale(xs, [plot.left, plot.right], { padding: 0.06 }), y = bandScale(ys, [plot.top, plot.bottom], { padding: 0.06 });
  const domain = panel.valueScale?.domain ?? [0, 1];
  const marks = panel.marks.map((mark) => {
    const t = Number.isFinite(mark.value) ? clamp01((mark.value - domain[0]) / (domain[1] - domain[0])) : 0;
    const diagonal = mark.diagonalMode === "context" && mark.xCategory === mark.yCategory;
    const fill = mark.status !== "observed" ? mark.style.low : diagonal ? mix(mark.style.low, mark.style.color, 0.12)
      : t < 0.68 ? mix(mark.style.low, mark.style.color, t / 0.68) : mix(mark.style.color, mark.style.high, (t - 0.68) / 0.32);
    const labelColor = contrast(theme.label, fill) >= contrast(theme.field, fill) ? theme.label : theme.field;
    return { ...mark, geometry: { left: x(mark.xCategory), top: y(mark.yCategory), right: x(mark.xCategory) + x.bandwidth(), bottom: y(mark.yCategory) + y.bandwidth(), fill, labelColor } };
  });
  return { marks, axes: {
    x, y, xType: "band", yType: "band",
    xTicks: xs.map((value) => ({ value, label: value })), yTicks: ys.map((value) => ({ value, label: value })),
  } };
}

function categoryCenter(scale, value) { return scale(value) + scale.bandwidth() / 2; }

function extensionGeometry(panel, axes, layout, radius) {
  const { plot } = axes;
  return panel.marks.map((mark) => {
    if (mark.kind === "point") return { ...mark, geometry: pointGeometry(mark, axes, radius) };
    if (mark.kind === "interval") return { ...mark, geometry: {
      x1: axes.x(mark.low), x2: axes.x(mark.high),
      y: categoryCenter(axes.y, mark.category), cap: Math.max(2.5, radius * 0.72),
    } };
    if (mark.kind === "median-rule") {
      const center = categoryCenter(axes.x, mark.group), step = axes.x.step?.() ?? axes.x.bandwidth();
      return { ...mark, geometry: { x1: center + mark.xOffset1 * step, x2: center + mark.xOffset2 * step, y1: axes.y(mark.y), y2: axes.y(mark.y) } };
    }
    if (mark.kind === "connector") return { ...mark, geometry: {
      x1: axes.x(mark.x1), x2: axes.x(mark.x2), y: categoryCenter(axes.y, mark.yCategory),
    } };
    if (mark.kind === "reference-band") return { ...mark, geometry: {
      left: plot.left, right: plot.right,
      top: Math.min(axes.y(mark.to), axes.y(mark.from)), bottom: Math.max(axes.y(mark.to), axes.y(mark.from)),
    } };
    if (mark.kind === "baseline-rule") return { ...mark, geometry: { x: axes.x(mark.x), top: plot.top, bottom: plot.bottom } };
    if (mark.kind === "row-band") {
      const first = axes.y(mark.categoryFrom), last = axes.y(mark.categoryTo), bandwidth = axes.y.bandwidth();
      return { ...mark, geometry: { left: plot.left, right: plot.right, top: Math.min(first, last), bottom: Math.max(first, last) + bandwidth } };
    }
    if (mark.kind === "rug") return { ...mark, geometry: {
      x: axes.x(mark.x), y: categoryCenter(axes.y, mark.yCategory), halfHeight: Math.max(4, 5 * layout.scale),
    } };
    return { ...mark, geometry: null };
  });
}

function coverageGeometry(panel, layout, radius) {
  const height = layout.plot.bottom - layout.plot.top;
  const countPlot = { ...layout.plot, bottom: layout.plot.top + Math.min(48 * layout.scale, height * 0.22) };
  const rugPlot = { ...layout.plot, top: countPlot.bottom + Math.max(8, 10 * layout.scale) };
  const axes = resolveAxes(panel, layout, rugPlot);
  const marks = panel.marks.map((mark) => {
    if (mark.kind === "rug") return { ...mark, geometry: {
      x: axes.x(mark.x), y: categoryCenter(axes.y, mark.yCategory), halfHeight: Math.max(4, 5 * layout.scale),
    } };
    if (mark.kind === "temporal-bar") {
      const left = Math.max(countPlot.left, axes.x(mark.xFrom) + 1), right = Math.min(countPlot.right, axes.x(mark.xTo) - 1);
      const usable = Math.max(0, countPlot.bottom - countPlot.top - 12 * layout.scale), barHeight = usable * mark.value / Math.max(1, mark.maximum);
      return { ...mark, geometry: { left, right: Math.max(left, right), top: countPlot.bottom - barHeight, bottom: countPlot.bottom, labelX: (left + Math.max(left, right)) / 2, labelY: countPlot.bottom - barHeight - 2 * layout.scale } };
    }
    return { ...mark, geometry: null };
  });
  return { axes, marks, plots: { count: countPlot, rug: rugPlot } };
}

export function isResolvedRenderer(renderer) { return RESOLVED_RENDERERS.includes(renderer); }

export function resolveTerminalScene(scene, options = {}) {
  const width = options.width ?? 960, height = options.height ?? 600;
  const layout = options.layout ?? deriveFigureLayout(width, height, { panels: scene.panels, layout: scene.layout, theme: scene.theme, spec: scene.spec });
  const panels = scene.panels.map((panel, index) => {
    let resolvedLayout = options.refineLayout === false ? preparedPanelLayout(layout.panels[index]) : panelLayout(layout.panels[index], panel);
    let axes = resolveAxes(panel, resolvedLayout), marks, plots = null;
    for (let pass = 0; options.refineLayout !== false && pass < 2; pass += 1) {
      resolvedLayout = refineScientificLayout(resolvedLayout, panel, axes, { measureText: options.measureText, themeMode: scene.theme.mode });
      axes = resolveAxes(panel, resolvedLayout);
    }
    const radius = Math.max(3.2, Math.sqrt(scene.profile.markerSize) * 0.62 * resolvedLayout.scale) * (panel.presentation?.markerScale ?? 1);
    if (panel.renderer === "line") marks = lineGeometry(panel, axes, radius);
    else if (panel.renderer === "scatter") marks = scatterGeometry(panel, axes, radius);
    else if (["categorical_bar", "categorical_layered_bar"].includes(panel.renderer)) marks = barGeometry(panel, axes, resolvedLayout);
    else if (panel.renderer === "categorical_matrix") { const matrix = matrixGeometry(panel, resolvedLayout, scene.theme); marks = matrix.marks; axes = matrix.axes; }
    else if (panel.renderer === "temporal_coverage") { const coverage = coverageGeometry(panel, resolvedLayout, radius); marks = coverage.marks; axes = coverage.axes; plots = coverage.plots; }
    else if (["interval_comparison", "strip_summary", "temporal_observations", "paired_points", "reference_improvement"].includes(panel.renderer)) marks = extensionGeometry(panel, axes, resolvedLayout, radius);
    else marks = panel.marks.map((mark) => ({ ...mark, geometry: null }));
    const evidenceFrame = cloneRect(plots ? resolvedLayout.plot : (axes.plot ?? resolvedLayout.plot));
    return { ...panel, layout: resolvedLayout, axes, plots, evidenceFrame, marks, resolved: isResolvedRenderer(panel.renderer) };
  });
  return deepFreeze({ schemaVersion: RESOLVED_SCENE_VERSION, sourceSceneVersion: scene.schemaVersion, width, height, theme: scene.theme, spec: scene.spec, profile: scene.profile, applicationProfile: scene.applicationProfile, view: scene.view, layout, panels, motionPlan: scene.motionPlan });
}

export function resolveSceneFrame(resolvedScene, progress = 1) {
  const p = clamp01(progress);
  return {
    ...resolvedScene,
    progress: p,
    panels: resolvedScene.panels.map((panel) => {
      const plan = resolvedScene.motionPlan.panels.find((item) => item.panelId === panel.id);
      return { ...panel, marks: panel.marks.map((mark, index) => ({
        ...mark,
        motion: markMotionState(mark, index, panel.marks.length, p, plan?.strategy ?? "none"),
      })) };
    }),
  };
}

export function resolvedTerminalGeometry(resolvedScene) {
  return resolvedScene.panels.map((panel) => ({ panelId: panel.id, marks: panel.marks.map((mark) => ({ id: mark.id, geometry: mark.geometry })) }));
}
