import { extent, linearScale, ticks } from "../scales.js";
import { deriveSeed, mulberry32 } from "../random.js";

export function numericScales(points, data, layout, { categorical = false, domains = {} } = {}) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const xd = domains.x || data.xDomain || (categorical ? [0, Math.max(1, Math.max(...xs))] : extent(xs));
  const yd = domains.y || data.yDomain || extent(ys);
  return { x: linearScale(xd, [layout.plot.left, layout.plot.right]), y: linearScale(yd, [layout.plot.bottom, layout.plot.top]), xTicks: categorical ? xs : ticks(xd, 6), yTicks: ticks(yd, 6), xDomain: xd, yDomain: yd };
}

export function arrival(points, contract, order = "random") {
  const random = mulberry32(deriveSeed(contract.motion.seed, `${contract.renderer}:marks`));
  const [start, end] = contract.timeline.marksEnter; const span = end - start;
  const ranks = points.map((_, i) => i);
  if (order === "x") ranks.sort((a, b) => points[a].x - points[b].x || points[a].colorIndex - points[b].colorIndex || a - b);
  else for (let i = ranks.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [ranks[i], ranks[j]] = [ranks[j], ranks[i]]; }
  const rank = new Map(ranks.map((index, i) => [index, i]));
  return points.map((point, index) => ({ ...point, delay: start + (rank.get(index) / Math.max(1, points.length - 1)) * span * 0.62, duration: Math.max(0.08, span * 0.52), startOffset: 0.15 + random() * 0.85 }));
}

export const median = (values) => { const a = [...values].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
