import { FiguresteadConfigError } from "./schema.js";

const ROOT_TWO = Math.sqrt(2);

function capacity(panelId) {
  throw new FiguresteadConfigError("insufficient category tick space; enlarge the figure or shorten category labels", `panels.${panelId}.layout`);
}

// Metrics use the same left-aligned alphabetic convention as the live resolver.
// Standalone export uses the deterministic scientific-layout metric fallback.
function rotatedInk(metric) {
  // Include both glyph ink and the font box: SVG text boxes can exceed Canvas
  // ink bounds even when both paint the same alphabetic-baseline glyphs.
  const left = -metric.width - Math.max(0, metric.left ?? 0);
  const right = Math.max(0, (metric.right ?? metric.width) - metric.width);
  const ascent = Math.max(metric.ascent, metric.fontAscent ?? metric.ascent);
  const descent = Math.max(metric.descent, metric.fontDescent ?? metric.descent);
  const corners = [[left, -ascent], [right, -ascent], [left, descent], [right, descent]];
  const xs = corners.map(([x, y]) => (x + y) / ROOT_TWO);
  const ys = corners.map(([x, y]) => (y - x) / ROOT_TWO);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

function fitLabel(label, measure, fits, panelId) {
  const original = String(label), metric = measure(original);
  if (fits(metric)) return { label: original, displayLabel: original, metric };
  // Preserve Unicode code points while abbreviating; original text stays on the tick.
  const characters = Array.from(original);
  while (characters.length) {
    characters.pop();
    const displayLabel = `${characters.join("")}…`, candidate = measure(displayLabel);
    if (fits(candidate)) return { label: original, displayLabel, metric: candidate };
  }
  return capacity(panelId);
}

/** Internal x-band plan. It owns abbreviation before either painter sees a tick. */
export function planCategoryTicks(axes, plot, rect, options) {
  const { measure, outer, maximumDepth, panelId } = options;
  const sourcePlot = axes.plot, span = plot.right - plot.left;
  if (!(span > 0 && maximumDepth > 0)) return capacity(panelId);
  const ratio = span / (sourcePlot.right - sourcePlot.left);
  const slot = (axes.x.step?.() ?? span / Math.max(1, axes.xTicks.length)) * ratio;
  const metrics = axes.xTicks.map(tick => measure(tick.label));
  const rotate = metrics.some(metric => metric.width > slot * 0.92);
  const ticks = axes.xTicks.map((tick) => {
    const sourceX = axes.x(tick.value) + axes.x.bandwidth() / 2;
    const x = plot.left + (sourceX - sourcePlot.left) * ratio;
    const fits = metric => {
      if (rotate) {
        const ink = rotatedInk(metric);
        return metric.width <= slot * 1.75 && x + ink.left >= rect.left + outer
          && x + ink.right <= rect.right - outer && ink.bottom - ink.top <= maximumDepth;
      }
      return metric.width <= slot * 0.92 && x - metric.width / 2 - (metric.left ?? 0) >= rect.left + outer
        && x - metric.width / 2 + (metric.right ?? metric.width) <= rect.right - outer
        && metric.height <= maximumDepth;
    };
    return { value: tick.value, ...fitLabel(tick.label, measure, fits, panelId) };
  });
  const depth = ticks.length ? Math.max(...ticks.map(({ metric }) => {
    if (!rotate) return metric.height;
    const ink = rotatedInk(metric);
    return ink.bottom - ink.top;
  })) : 0;
  return { ticks, rotate, depth, metrics: ticks.map(tick => tick.metric) };
}

/** Resolve anchors only after final axis/layout allocation, including header shifts. */
export function resolveCategoryTickDisplays(axes, layout, panelId) {
  const plan = layout.categoryTicks;
  if (axes.xType !== "band" || !plan) return axes;
  if (!(axes.plot.right > axes.plot.left && axes.plot.bottom > axes.plot.top)) return capacity(panelId);
  const xTicks = axes.xTicks.map((tick, index) => {
    const prepared = plan.ticks[index], metric = prepared.metric;
    const x = axes.x(tick.value) + axes.x.bandwidth() / 2, top = layout.text.xTickY;
    if (plan.rotate) {
      const ink = rotatedInk(metric), y = top - ink.top;
      return { ...tick, displayLabel: prepared.displayLabel, display: {
        x, y, svgY: y, rotation: -45, textAnchor: "end", baseline: "alphabetic",
        bounds: { left: x + ink.left, right: x + ink.right, top, bottom: y + ink.bottom },
      } };
    }
    // Keep the established fitting/unrotated Canvas-top and SVG-alphabetic poses.
    return { ...tick, displayLabel: prepared.displayLabel, display: {
      x, y: top, svgY: layout.text.xTickBaselineY, rotation: 0, textAnchor: "middle", baseline: "top",
      bounds: { left: x - metric.width / 2 - (metric.left ?? 0), right: x - metric.width / 2 + (metric.right ?? metric.width), top, bottom: top + metric.height },
    } };
  });
  return { ...axes, xTicks };
}
