import { arrival, median, numericScales } from "./shared.js";
import { deriveSeed, mulberry32 } from "../random.js";
import { compileProgress, drawAxes, drawScopePoint, drawText, pointMotionState } from "../marks.js";

export function prepareStrip(contract) {
  const keys=[...new Set(contract.data.series)], random=mulberry32(deriveSeed(contract.motion.seed,"strip:jitter"));
  const points=contract.data.values.map((y,i)=>({ x:contract.data.groups.indexOf(contract.data.group[i])+(random()-.5)*.28, y, group:contract.data.group[i], series:contract.data.series[i], colorIndex:keys.indexOf(contract.data.series[i]), index:i }));
  return { points:arrival(points,contract), legend:keys.map((key,colorIndex)=>({label:contract.data.seriesLabels[key],colorIndex})), medians:contract.data.groups.map((group,index)=>({x:index,y:median(contract.data.values.filter((_,i)=>contract.data.group[i]===group))})) };
}

export function compileStripScene({ panel, contract, prepared, styles, markId }) {
  const keys = [...new Set(contract.data.series)];
  const marks = prepared.points.map((point) => {
    const groupIndex = contract.data.groups.indexOf(point.group);
    return {
      id: markId(panel, "point", point.index), kind: "point", series: point.series,
      group: point.group, xOffset: point.x - groupIndex, y: point.y,
      style: styles[point.series],
    };
  });
  if (contract.data.summary === "median") prepared.medians.forEach((median, index) => marks.push({
    id: markId(panel, "median", contract.data.groups[index]), kind: "median-rule", role: "summary",
    group: contract.data.groups[index], y: median.y, xOffset1: -0.22, xOffset2: 0.22,
    style: { color: contract.theme.summaryCore, edge: contract.theme.summaryEdge ?? null, lineStyle: "solid", lineWidth: 2 },
  }));
  return {
    marks,
    categories: { x: [...contract.data.groups], y: null },
    scales: { x: { ...contract.xScale, type: "band" }, y: contract.yScale },
    legend: keys.map((key, colorIndex) => ({ key, label: contract.data.seriesLabels[key], colorIndex, style: styles[key] })),
  };
}

export function drawStrip(context, env) {
  const {contract,prepared,layout,progress,settled}=env, presentation=contract.presentation??{}, scales=numericScales(prepared.points,{...contract.data,xDomain:[-.5,contract.data.groups.length-.5]},layout,{categorical:true,domains:env.domains});
  drawAxes(context,{config:contract,layout,scales,xTicks:contract.data.groups.map((_,i)=>i),yTicks:scales.yTicks,xCategories:contract.data.groups});
  prepared.points.forEach((point)=>drawScopePoint(context,pointMotionState(point,progress,scales,layout.plot),{color:contract.theme.series[point.colorIndex%contract.theme.series.length],edge:contract.theme.seriesEdges?.[point.colorIndex%contract.theme.series.length],radius:Math.max(3.4,Math.sqrt(contract.profile.markerSize)*.62*layout.scale)*(presentation.markerScale??1),trailAlpha:contract.motion.trailAlpha,settled,shape:presentation.seriesMarkers?.[point.colorIndex%presentation.seriesMarkers.length]??"ring"}));
  if(contract.data.summary==="median") { const cp=compileProgress(progress,contract.timeline); context.save(); context.strokeStyle=contract.theme.summaryCore; context.lineWidth=Math.max(1.2,2*layout.scale); context.globalAlpha=.84*cp; prepared.medians.forEach((m)=>{context.beginPath();context.moveTo(scales.x(m.x-.22*cp),scales.y(m.y));context.lineTo(scales.x(m.x+.22*cp),scales.y(m.y));context.stroke();});context.restore(); }
  drawText(context,{config:contract,layout,legend:prepared.legend,legendPosition:presentation.legend??"top-right",seriesMarkers:presentation.seriesMarkers??[]}); return scales;
}
