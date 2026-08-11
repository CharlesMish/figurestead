import { FiguresteadConfigError, requiredObject, requiredString, sameLength } from "../../schema.js";
import { extent, formatTick, formatTimeTick, linearScale, parseTime, ticks, timeScale, timeTicks } from "../../scales.js";
import { smooth } from "../../marks.js";

export const DAY = 24 * 60 * 60 * 1000;
export const PROVISIONAL_STATUS = "provisional_project_constant";
export const PROVISIONAL_LABEL = "Provisional project constant; not a regulatory threshold";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const FONT_STACK = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

export function normalizeDate(value, path) {
  if (typeof value !== "string" || !DATE_ONLY.test(value)) {
    throw new FiguresteadConfigError("must be a UTC date in YYYY-MM-DD form", path);
  }
  const milliseconds = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) {
    throw new FiguresteadConfigError("must be a valid calendar date", path);
  }
  return value;
}

export function normalizeDates(value, path) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new FiguresteadConfigError("must be a non-empty date array", path);
  }
  return value.map((item, index) => normalizeDate(item, `${path}[${index}]`));
}

export function normalizeSiteOrder(value, path) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new FiguresteadConfigError("must be a non-empty site-order array", path);
  }
  const sites = value.map((item, index) => {
    requiredString(item, `${path}[${index}]`);
    return item;
  });
  if (new Set(sites).size !== sites.length) throw new FiguresteadConfigError("must contain unique sites", path);
  return sites;
}

export function validateCoverageData(data, path = "config.data") {
  requiredObject(data, path);
  const dates = normalizeDates(data.dates, `${path}.dates`);
  sameLength(data.sites, dates.length, `${path}.sites`);
  const sites = data.sites.map((site, index) => {
    requiredString(site, `${path}.sites[${index}]`);
    return site;
  });
  const siteOrder = normalizeSiteOrder(data.siteOrder, `${path}.siteOrder`);
  sites.forEach((site, index) => {
    if (!siteOrder.includes(site)) throw new FiguresteadConfigError(`unknown site ${JSON.stringify(site)}`, `${path}.sites[${index}]`);
  });
  return { dates, sites, siteOrder };
}

export function validateObservationData(data, path = "config.data") {
  requiredObject(data, path);
  const dates = normalizeDates(data.dates, `${path}.dates`);
  if (!Array.isArray(data.values) || data.values.length !== dates.length) {
    throw new FiguresteadConfigError(`must contain exactly ${dates.length} items`, `${path}.values`);
  }
  const values = data.values.map((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new FiguresteadConfigError("must be a finite number", `${path}.values[${index}]`);
    return value;
  });
  requiredString(data.site, `${path}.site`);
  const referenceBands = normalizeReferenceBands(data.referenceBands ?? [], `${path}.referenceBands`);
  return { dates, values, site: data.site, referenceBands };
}

export function normalizeReferenceBands(annotations, path = "config.annotations") {
  if (!Array.isArray(annotations)) throw new FiguresteadConfigError("must be an array", path);
  const bands = annotations.map((annotation, index) => {
    const itemPath = `${path}[${index}]`;
    requiredObject(annotation, itemPath);
    if (annotation.type !== "reference_band") throw new FiguresteadConfigError("type must be reference_band", `${itemPath}.type`);
    for (const key of ["from", "to"]) {
      if (typeof annotation[key] !== "number" || !Number.isFinite(annotation[key])) throw new FiguresteadConfigError("must be a finite number", `${itemPath}.${key}`);
    }
    if (annotation.from >= annotation.to) throw new FiguresteadConfigError("from must be less than to", itemPath);
    requiredString(annotation.label, `${itemPath}.label`);
    if (annotation.status !== PROVISIONAL_STATUS) {
      throw new FiguresteadConfigError(`must be ${JSON.stringify(PROVISIONAL_STATUS)}`, `${itemPath}.status`);
    }
    return { type: "reference_band", from: annotation.from, to: annotation.to, label: annotation.label, status: PROVISIONAL_STATUS };
  });
  bands.forEach((band, index) => {
    if (index && band.from < bands[index - 1].to) throw new FiguresteadConfigError("reference bands must be ordered and non-overlapping", `${path}[${index}]`);
  });
  return bands;
}

export function contractReferenceBands(contract) {
  const dataBands = normalizeReferenceBands(contract.data.referenceBands ?? [], "config.data.referenceBands");
  if (!Array.isArray(contract.annotations) || contract.annotations.length === 0) return dataBands;
  const annotationBands = normalizeReferenceBands(contract.annotations, "config.annotations");
  if (JSON.stringify(annotationBands) !== JSON.stringify(dataBands)) {
    throw new FiguresteadConfigError("must exactly match config.data.referenceBands so drawing and accessibility agree", "config.annotations");
  }
  return dataBands;
}

export function temporalXDomain(contract, milliseconds) {
  if (contract.xScale?.domain) return contract.xScale.domain.map((value, index) => parseTime(value, `config.xScale.domain[${index}]`));
  const low = Math.min(...milliseconds), high = Math.max(...milliseconds);
  if (low === high) return [low - DAY, high + DAY];
  const padding = Math.max(DAY, (high - low) * 0.025);
  return [low - padding, high + padding];
}

export function temporalYDomain(contract, values, bands = []) {
  if (contract.yScale?.domain) return [...contract.yScale.domain];
  return extent([...values, ...bands.flatMap((band) => [band.from, band.to])]);
}

export function makeTemporalScales(xDomain, yDomain, plot) {
  return {
    x: timeScale(xDomain, [plot.left, plot.right]),
    y: linearScale(yDomain, [plot.bottom, plot.top]),
    xDomain,
    yDomain,
    xTicks: timeTicks(xDomain, 6),
    yTicks: ticks(yDomain, 5),
  };
}

export function postMarksProgress(progress, prepared, timeline) {
  const settledAt = prepared.settledAt ?? 0;
  if (progress <= settledAt) return 0;
  const end = Math.max(settledAt + 1e-6, timeline.summaryCompiles[1]);
  return smooth((progress - settledAt) / (end - settledAt));
}

export function drawTemporalAxes(context, { contract, layout, scales, plot = layout.plot, yLabels = null, showX = true, showY = true }) {
  context.save();
  context.lineWidth = Math.max(0.5, 0.6 * layout.scale);
  context.strokeStyle = contract.theme.grid;
  if (contract.profile.gridY) {
    context.globalAlpha = contract.profile.gridAlpha;
    (yLabels ? yLabels.map((_, index) => index) : scales.yTicks).forEach((value) => {
      const y = scales.y(value); context.beginPath(); context.moveTo(plot.left, y); context.lineTo(plot.right, y); context.stroke();
    });
  }
  if (contract.profile.gridX) {
    context.globalAlpha = contract.profile.gridAlpha * 0.55;
    scales.xTicks.forEach((value) => { const x = scales.x(value); context.beginPath(); context.moveTo(x, plot.top); context.lineTo(x, plot.bottom); context.stroke(); });
  }
  context.globalAlpha = 1; context.strokeStyle = contract.theme.spine; context.lineWidth = Math.max(0.7, 0.9 * layout.scale);
  context.beginPath(); context.moveTo(plot.left, plot.top); context.lineTo(plot.left, plot.bottom); context.lineTo(plot.right, plot.bottom); context.stroke();
  context.fillStyle = contract.theme.secondary; context.font = `${layout.font.axis}px ${FONT_STACK}`;
  if (showX) {
    context.textAlign = "center"; context.textBaseline = "top";
    scales.xTicks.forEach((value) => context.fillText(formatTimeTick(value, scales.xDomain), scales.x(value), layout.text?.xTickY ?? plot.bottom + 9 * layout.scale));
  }
  if (showY) {
    context.textAlign = "right"; context.textBaseline = "middle";
    if (yLabels) yLabels.forEach((label, index) => context.fillText(label, plot.left - 9 * layout.scale, scales.y(index), Math.max(30, plot.left - 14 * layout.scale)));
    else scales.yTicks.forEach((value) => context.fillText(formatTick(value), plot.left - 9 * layout.scale, scales.y(value)));
  }
  if (showX && contract.spec.xLabel) {
    context.textAlign = "center"; context.textBaseline = "bottom"; context.fillStyle = contract.theme.label;
    context.fillText(contract.spec.xLabel, (plot.left + plot.right) / 2, layout.text?.xLabelY ?? layout.height - 9 * layout.scale);
  }
  if (contract.spec.yLabel) {
    context.save(); context.translate(layout.text?.yLabelX ?? 18 * layout.scale, (plot.top + plot.bottom) / 2); context.rotate(-Math.PI / 2);
    context.textAlign = "center"; context.textBaseline = "middle"; context.fillStyle = contract.theme.label; context.fillText(contract.spec.yLabel, 0, 0); context.restore();
  }
  context.restore();
}

export function yearStart(year) { return Date.parse(`${year}-01-01T00:00:00Z`); }
