import { arrival, numericScales } from "./shared.js";
import { compileProgress, drawAxes, drawScopePoint, drawText, pointMotionState } from "../marks.js";
import { styleForSeries } from "../series-style.js";

export function prepareScatter(contract) {
  const keys = [...new Set(contract.data.series)];
  const points = contract.data.x.map((x, i) => ({ x, y: contract.data.y[i], series: contract.data.series[i], colorIndex: keys.indexOf(contract.data.series[i]), index: i }));
  return { points: arrival(points, contract), legend: keys.map((key, colorIndex) => ({ label: contract.data.seriesLabels[key], colorIndex })) };
}

export function drawScatter(context, env) {
  const { contract, prepared, layout, progress, settled } = env, presentation = contract.presentation ?? {}; const scales = numericScales(prepared.points, contract.data, layout, { domains: env.domains });
  drawAxes(context, { config: contract, layout, scales, xTicks: scales.xTicks, yTicks: scales.yTicks });
  prepared.points.forEach((point) => { const style = styleForSeries(env, point.series, point.colorIndex), state = pointMotionState(point, progress, scales, layout.plot); if (contract.view?.motion === "semantic") { state.x = state.finalX; state.y = state.finalY; } drawScopePoint(context, state, { color: style.color, edge: style.edge, radius: Math.max(3.5, Math.sqrt(contract.profile.markerSize) * 0.64 * layout.scale) * (presentation.markerScale ?? 1), trailAlpha: contract.motion.trailAlpha, settled: settled || contract.view?.motion === "semantic", shape: style.glyph }); });
  if (contract.data.summary === "linear_fit") {
    const n = prepared.points.length, sx = prepared.points.reduce((a,p)=>a+p.x,0), sy = prepared.points.reduce((a,p)=>a+p.y,0), sxx = prepared.points.reduce((a,p)=>a+p.x*p.x,0), sxy = prepared.points.reduce((a,p)=>a+p.x*p.y,0);
    const slope = (n*sxy-sx*sy)/(n*sxx-sx*sx || 1), intercept=(sy-slope*sx)/n, cp=compileProgress(progress, contract.timeline), x0=scales.xDomain[0], x1=x0+(scales.xDomain[1]-x0)*cp;
    context.save();
    if (contract.theme.summaryEdge) { context.strokeStyle=contract.theme.summaryEdge; context.globalAlpha=.62*cp; context.lineWidth=Math.max(2,2.8*layout.scale); context.beginPath(); context.moveTo(scales.x(x0),scales.y(intercept+slope*x0)); context.lineTo(scales.x(x1),scales.y(intercept+slope*x1)); context.stroke(); }
    context.strokeStyle=contract.theme.summaryCore; context.globalAlpha=.72*cp; context.lineWidth=Math.max(1,1.5*layout.scale); context.beginPath(); context.moveTo(scales.x(x0),scales.y(intercept+slope*x0)); context.lineTo(scales.x(x1),scales.y(intercept+slope*x1)); context.stroke(); context.restore();
  }
  const keys = [...new Set(contract.data.series)], legend = prepared.legend.map((item, index) => ({ ...item, style: styleForSeries(env, keys[index], index) }));
  drawText(context, { config: contract, layout, legend, legendPosition: presentation.legend ?? "top-right", seriesMarkers: presentation.seriesMarkers ?? [] }); return scales;
}
