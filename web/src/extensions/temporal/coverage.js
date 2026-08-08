import { arrival } from "../../renderers/shared.js";
import { drawText, pointMotionState } from "../../marks.js";
import { drawBar } from "../../primitives.js";
import { linearScale } from "../../scales.js";
import { drawTemporalAxes, makeTemporalScales, postMarksProgress, temporalXDomain, yearStart } from "./shared.js";

export function prepareCoverage(contract) {
  const points = contract.data.dates.map((date, index) => ({
    date, x: Date.parse(`${date}T00:00:00Z`), y: contract.data.siteOrder.indexOf(contract.data.sites[index]),
    site: contract.data.sites[index], colorIndex: contract.data.siteOrder.indexOf(contract.data.sites[index]), index,
  }));
  const arrived = arrival(points, contract, "x");
  const years = new Map();
  points.forEach((point) => {
    const year = Number(point.date.slice(0, 4));
    if (!years.has(year)) years.set(year, { year, sites: new Set(), observations: 0 });
    years.get(year).sites.add(point.site); years.get(year).observations += 1;
  });
  const annual = [...years.values()].sort((a, b) => a.year - b.year).map((item) => ({ year: item.year, siteCount: item.sites.size, observationCount: item.observations }));
  return { points: arrived, annual, settledAt: Math.max(...arrived.map((point) => point.delay + point.duration)) };
}

export function compileCoverageScene({ panel, contract, prepared, markId }) {
  const marks = prepared.annual.map((item) => ({
    id: markId(panel, "annual-count", item.year), kind: "temporal-bar", role: "summary",
    year: item.year, xFrom: yearStart(item.year), xTo: yearStart(item.year + 1),
    value: item.siteCount, observationCount: item.observationCount,
    maximum: contract.data.siteOrder.length,
    style: { color: contract.theme.secondary, edge: contract.theme.spine, lineStyle: "solid", lineWidth: 1 },
  }));
  prepared.points.forEach((point) => marks.push({
    id: markId(panel, "rug", point.date, point.site, point.index), kind: "rug", series: point.site,
    x: point.x, yCategory: point.site, date: point.date,
    style: {
      key: point.site, colorIndex: point.colorIndex,
      color: contract.theme.series[point.colorIndex % contract.theme.series.length],
      edge: contract.theme.seriesEdges?.[point.colorIndex % (contract.theme.seriesEdges?.length || 1)] ?? null,
      glyph: "ring", lineStyle: "solid", lineWidth: 1.35,
    },
  }));
  return {
    marks,
    categories: { x: null, y: [...contract.data.siteOrder] },
    scales: { x: contract.xScale, y: { ...contract.yScale, type: "band" } },
    legend: [],
    meta: { coverage: true, maximumSites: contract.data.siteOrder.length },
  };
}

function drawRugMark(context, state, { color, scale, settled, trailAlpha }) {
  if (state.visibility <= 0) return;
  context.save(); context.strokeStyle = color;
  if (!settled) {
    context.globalAlpha = trailAlpha * state.visibility * (1 - state.eased); context.lineWidth = Math.max(0.6, 0.8 * scale);
    context.beginPath(); context.moveTo(state.x, state.y - 3 * scale); context.lineTo(state.x, state.y - (8 + 20 * (1 - state.eased)) * scale); context.stroke();
  }
  context.globalAlpha = 0.82 * state.visibility; context.lineWidth = Math.max(1, 1.35 * scale);
  context.beginPath(); context.moveTo(state.x, state.y - 5 * scale); context.lineTo(state.x, state.y + 5 * scale); context.stroke(); context.restore();
}

export function coverageDomains(contract, prepared) {
  const evidenceExtent = [
    ...prepared.points.map((point) => point.x),
    ...prepared.annual.flatMap((item) => [yearStart(item.year), yearStart(item.year + 1)]),
  ];
  return { x: temporalXDomain(contract, evidenceExtent), y: [-0.5, contract.data.siteOrder.length - 0.5] };
}

export function drawCoverage(context, env) {
  const { contract, prepared, layout, progress, settled } = env;
  const height = layout.plot.bottom - layout.plot.top;
  const countPlot = { ...layout.plot, bottom: layout.plot.top + Math.min(48 * layout.scale, height * 0.22) };
  const rugPlot = { ...layout.plot, top: countPlot.bottom + Math.max(8, 10 * layout.scale) };
  const xDomain = env.domains.x, yDomain = [-0.5, contract.data.siteOrder.length - 0.5];
  const scales = makeTemporalScales(xDomain, yDomain, rugPlot);
  scales.y = linearScale(yDomain, [rugPlot.top, rugPlot.bottom]);
  drawTemporalAxes(context, { contract, layout, scales, plot: rugPlot, yLabels: contract.data.siteOrder });
  const cp = postMarksProgress(progress, prepared, contract.timeline);
  if (cp > 0 && prepared.annual.length) {
    const maximum = Math.max(1, contract.data.siteOrder.length);
    prepared.annual.forEach((item) => {
      const left = Math.max(countPlot.left, scales.x(yearStart(item.year)) + 1);
      const right = Math.min(countPlot.right, scales.x(yearStart(item.year + 1)) - 1);
      if (right <= left) return;
      const barHeight = (countPlot.bottom - countPlot.top - 12 * layout.scale) * item.siteCount / maximum * cp;
      drawBar(context, { left, right, top: countPlot.bottom - barHeight, bottom: countPlot.bottom, color: contract.theme.secondary, alpha: 0.24 * cp });
      context.save(); context.globalAlpha = cp; context.fillStyle = contract.theme.secondary; context.font = `${Math.max(7, layout.font.axis * 0.75)}px ui-monospace, monospace`;
      context.textAlign = "center"; context.textBaseline = "bottom"; context.fillText(String(item.siteCount), (left + right) / 2, countPlot.bottom - barHeight - 2); context.restore();
    });
  }
  prepared.points.forEach((point) => drawRugMark(context, pointMotionState(point, progress, scales, rugPlot), {
    color: contract.theme.series[point.colorIndex % contract.theme.series.length], scale: layout.scale, settled, trailAlpha: contract.motion.trailAlpha,
  }));
  drawText(context, { config: contract, layout, legend: [] });
  return scales;
}
