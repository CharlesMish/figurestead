import { arrival, numericScales } from "./shared.js";
import { clamp01, drawAxes, drawScopePoint, drawText, pointMotionState, smooth } from "../marks.js";
import { styleForSeries } from "../series-style.js";

export function prepareLine(contract) {
  const points = contract.data.series.flatMap((series, colorIndex) => contract.data.x.map((x, index) => ({ x, y: series.y[index], colorIndex, series: series.key, index })));
  return { points: arrival(points, contract, contract.data.revealOrder), legend: contract.data.series.map((s, colorIndex) => ({ label: s.label, colorIndex })) };
}

export function lineSegmentState(left, right, progress, scales, compileDuration = 0.055) {
  const availableAt = Math.max(left.delay + left.duration, right.delay + right.duration);
  const compile = smooth(clamp01((progress - availableAt) / compileDuration));
  const x1 = scales.x(left.x), y1 = scales.y(left.y);
  const finalX2 = scales.x(right.x), finalY2 = scales.y(right.y);
  return {
    visible: compile > 0,
    compile,
    x1,
    y1,
    x2: x1 + (finalX2 - x1) * compile,
    y2: y1 + (finalY2 - y1) * compile,
    finalX2,
    finalY2,
    availableAt,
  };
}

export function monotoneSegmentControls(points) {
  if (points.length < 2) return [];
  const delta = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const width = points[index + 1].x - points[index].x;
    if (!(width > 0)) return null;
    delta.push((points[index + 1].y - points[index].y) / width);
  }
  const tangent = points.map((_, index) => {
    if (index === 0) return delta[0];
    if (index === points.length - 1) return delta[delta.length - 1];
    return (delta[index - 1] + delta[index]) / 2;
  });
  delta.forEach((slope, index) => {
    if (slope === 0) {
      tangent[index] = 0;
      tangent[index + 1] = 0;
      return;
    }
    const left = tangent[index] / slope, right = tangent[index + 1] / slope;
    const length = left * left + right * right;
    if (length > 9) {
      const scale = 3 / Math.sqrt(length);
      tangent[index] = scale * left * slope;
      tangent[index + 1] = scale * right * slope;
    }
  });
  return delta.map((_, index) => {
    const left = points[index], right = points[index + 1], width = right.x - left.x;
    return {
      c1: { x: left.x + width / 3, y: left.y + tangent[index] * width / 3 },
      c2: { x: right.x - width / 3, y: right.y - tangent[index + 1] * width / 3 },
    };
  });
}

function splitCubic(p0, c1, c2, p1, progress) {
  const mix = (left, right) => ({ x: left.x + (right.x - left.x) * progress, y: left.y + (right.y - left.y) * progress });
  const a = mix(p0, c1), b = mix(c1, c2), c = mix(c2, p1);
  const d = mix(a, b), e = mix(b, c);
  return { c1: a, c2: d, end: mix(d, e) };
}

function segmentPath(context, segment, controls, scales) {
  context.beginPath();
  context.moveTo(segment.x1, segment.y1);
  if (!controls) {
    context.lineTo(segment.x2, segment.y2);
    return;
  }
  const p0 = { x: segment.x1, y: segment.y1 };
  const c1 = { x: scales.x(controls.c1.x), y: scales.y(controls.c1.y) };
  const c2 = { x: scales.x(controls.c2.x), y: scales.y(controls.c2.y) };
  const p1 = { x: segment.finalX2, y: segment.finalY2 };
  const partial = segment.compile < 1 ? splitCubic(p0, c1, c2, p1, segment.compile) : { c1, c2, end: p1 };
  context.bezierCurveTo(partial.c1.x, partial.c1.y, partial.c2.x, partial.c2.y, partial.end.x, partial.end.y);
}

export function drawLine(context, env) {
  const { contract, prepared, layout, progress, settled } = env;
  const presentation = contract.presentation ?? {};
  const scales = numericScales(prepared.points, contract.data, layout, { domains: env.domains });
  drawAxes(context, { config: contract, layout, scales, xTicks: scales.xTicks, yTicks: scales.yTicks });
  contract.data.series.forEach((series, colorIndex) => {
    const points = prepared.points.filter((p) => p.colorIndex === colorIndex);
    const controls = contract.encoding?.interpolation === "monotone" ? monotoneSegmentControls(points) : null;
    const style = styleForSeries(env, series.key, colorIndex), color = style.color, edge = style.edge;
    for (let index = 1; index < points.length; index += 1) {
      const segment = lineSegmentState(points[index - 1], points[index], progress, scales);
      if (!segment.visible) continue;
      context.save();
      if (segment.compile < 1) {
        context.strokeStyle = contract.theme.summaryCore;
        context.lineWidth = Math.max(2.2, ((presentation.lineWidth ?? 1) + 3.2) * layout.scale);
        context.globalAlpha = 0.13 * Math.sin(Math.PI * segment.compile);
        segmentPath(context, segment, controls?.[index - 1], scales); context.stroke();
      }
      if (edge) {
        context.strokeStyle = edge;
        context.lineWidth = Math.max(2, ((presentation.lineWidth ?? 1.35) + 1.45) * layout.scale);
        context.globalAlpha = 0.62 * Math.min(1, segment.compile * 1.6);
        segmentPath(context, segment, controls?.[index - 1], scales); context.stroke();
      }
      context.strokeStyle = color;
      context.lineWidth = Math.max(1, (style.lineWidth ?? presentation.lineWidth ?? 1.35) * layout.scale);
      context.setLineDash?.(style.lineStyle === "dash" ? [7, 4] : style.lineStyle === "dot" ? [2, 4] : style.lineStyle === "dash-dot" ? [8, 3, 2, 3] : []);
      context.globalAlpha = 0.72 * Math.min(1, segment.compile * 1.6);
      segmentPath(context, segment, controls?.[index - 1], scales); context.stroke();
      context.restore();
    }
  });
  prepared.points.forEach((point) => {
    const style = styleForSeries(env, point.series, point.colorIndex), state = pointMotionState(point, progress, scales, layout.plot);
    if (contract.view?.motion === "semantic") { state.y = state.finalY; state.x = state.finalX; }
    drawScopePoint(context, state, {
    color: style.color,
    edge: style.edge,
    radius: Math.max(3.4, Math.sqrt(contract.profile.markerSize) * 0.62 * layout.scale) * (presentation.markerScale ?? 1),
    trailAlpha: contract.motion.trailAlpha,
    settled: settled || contract.view?.motion === "semantic",
    shape: style.glyph,
  }); });
  const legend = prepared.legend.map((item, index) => ({ ...item, style: styleForSeries(env, contract.data.series[index].key, index) }));
  drawText(context, { config: contract, layout, legend, legendPosition: presentation.legend ?? "top-right", legendStyle: "line", seriesMarkers: presentation.seriesMarkers ?? [] });
  return scales;
}
