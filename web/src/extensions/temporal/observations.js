import { arrival } from "../../renderers/shared.js";
import { drawScopePoint, drawText, pointMotionState } from "../../marks.js";
import { drawBand, drawRule } from "../../primitives.js";
import { contractReferenceBands, drawTemporalAxes, makeTemporalScales, postMarksProgress, temporalXDomain, temporalYDomain } from "./shared.js";

export function prepareObservations(contract) {
  const bands = contractReferenceBands(contract);
  const points = contract.data.dates.map((date, index) => ({
    date, x: Date.parse(`${date}T00:00:00Z`), y: contract.data.values[index], site: contract.data.site, colorIndex: 0, index,
  }));
  const arrived = arrival(points, contract, "x");
  return { points: arrived, bands, settledAt: Math.max(...arrived.map((point) => point.delay + point.duration)) };
}

export function compileObservationsScene({ panel, contract, prepared, styles, markId, panelIndex, figure }) {
  const marks = prepared.bands.map((band, index) => ({
    id: markId(panel, "reference-band", index), kind: "reference-band", role: "context",
    from: band.from, to: band.to, label: band.label, status: band.status,
    style: {
      colorIndex: (index + 1) % contract.theme.series.length,
      color: contract.theme.series[(index + 1) % contract.theme.series.length],
      edge: contract.theme.seriesEdges?.[(index + 1) % (contract.theme.seriesEdges?.length || 1)] ?? null,
      lineStyle: "solid", lineWidth: 1,
    },
  }));
  const pointStyle = styles.series ?? {
    key: "series", colorIndex: 0, color: contract.theme.series[0],
    edge: contract.theme.seriesEdges?.[0] ?? null, glyph: "ring", lineStyle: "solid", lineWidth: 1.6,
  };
  prepared.points.forEach((point) => marks.push({
    id: markId(panel, "point", point.date, point.index), kind: "point", series: contract.data.site,
    x: point.x, y: point.y, date: point.date, style: pointStyle,
  }));
  return {
    marks,
    categories: { x: null, y: null },
    legend: [],
    meta: {
      showBandKey: !figure.layout.sharedY || panelIndex === 0,
      provisionalReferenceBands: prepared.bands.length > 0,
    },
  };
}

export function observationDomains(contract, prepared) {
  return {
    x: temporalXDomain(contract, prepared.points.map((point) => point.x)),
    y: temporalYDomain(contract, prepared.points.map((point) => point.y), prepared.bands),
  };
}

export function drawObservations(context, env) {
  const { contract, prepared, layout, progress, settled } = env;
  const scales = makeTemporalScales(env.domains.x, env.domains.y, layout.plot);
  const cp = postMarksProgress(progress, prepared, contract.timeline);
  const panelIndex = env.figure && env.panel ? env.figure.panels.findIndex((panel) => panel.id === env.panel.id) : 0;
  const columns = Math.max(1, env.figure?.layout.columns ?? 1);
  const bottomRowStart = env.figure ? Math.floor((env.figure.panels.length - 1) / columns) * columns : 0;
  const showX = !env.figure?.layout.sharedX || panelIndex >= bottomRowStart;
  const showBandLabels = !env.figure?.layout.sharedY || panelIndex === 0;
  prepared.bands.forEach((band, index) => {
    if (cp <= 0) return;
    const top = scales.y(band.to), bottom = scales.y(band.from);
    const color = contract.theme.series[(index + 1) % contract.theme.series.length];
    drawBand(context, { left: layout.plot.left, right: layout.plot.right, top, bottom, color, alpha: (0.045 + index * 0.04) * cp });
    if (index > 0) drawRule(context, { x1: layout.plot.left, y1: bottom, x2: layout.plot.right, y2: bottom, color, alpha: 0.48 * cp, width: Math.max(0.7, layout.scale) });
  });
  if (showBandLabels && prepared.bands.length && cp > 0) {
    const available = layout.plot.right - layout.plot.left;
    context.save(); context.globalAlpha = 0.86 * cp; context.font = `${Math.max(7, layout.font.legend * 0.86)}px ui-monospace, monospace`;
    context.textAlign = "left"; context.textBaseline = "middle"; let x = layout.plot.left;
    prepared.bands.forEach((band, index) => {
      const color = contract.theme.series[(index + 1) % contract.theme.series.length], label = `${band.from}–${band.to}`, swatch = Math.max(10, 13 * layout.scale);
      context.fillStyle = color; context.globalAlpha = (0.32 + index * 0.15) * cp; context.fillRect(x, layout.plot.top - 14 * layout.scale, swatch, 5 * layout.scale);
      context.globalAlpha = 0.86 * cp; context.fillStyle = contract.theme.secondary; context.fillText(label, x + swatch + 4 * layout.scale, layout.plot.top - 11 * layout.scale);
      x += swatch + context.measureText(label).width + 17 * layout.scale;
    });
    if (x + 115 * layout.scale < layout.plot.left + available) { context.fillStyle = contract.theme.faint; context.fillText("Reference bands · provisional", x, layout.plot.top - 11 * layout.scale); }
    context.restore();
  }
  drawTemporalAxes(context, { contract, layout, scales, showX });
  prepared.points.forEach((point) => drawScopePoint(context, pointMotionState(point, progress, scales, layout.plot), {
    color: contract.theme.series[0], radius: Math.max(3.2, Math.sqrt(contract.profile.markerSize) * 0.58 * layout.scale), trailAlpha: contract.motion.trailAlpha, settled,
  }));
  drawText(context, { config: contract, layout, legend: [] });
  return scales;
}
