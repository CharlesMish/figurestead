import { createRendererRegistry, RENDERER_API_VERSION } from "./registry.js";
import { normalizeLineData, normalizeScatterData, normalizeStripData } from "./schema.js";
import { extent } from "./scales.js";
import { prepareLine, drawLine } from "./renderers/line.js";
import { prepareScatter, drawScatter } from "./renderers/scatter.js";
import { prepareStrip, drawStrip, compileStripScene } from "./renderers/strip-summary.js";

// Core numeric axes have one precedence rule: the authored scale constraint,
// then the retained renderer-data override, then the finite data extent.
export const resolveNumericDomain = (contract, axis, automaticDomain) => (
  contract[`${axis}Scale`]?.domain ?? contract.data[`${axis}Domain`] ?? automaticDomain
);

const pointDomains = (contract, prepared) => ({
  x: resolveNumericDomain(contract, "x", extent(prepared.points.map((point) => point.x))),
  y: resolveNumericDomain(contract, "y", extent(prepared.points.map((point) => point.y))),
});

export const LINE_RENDERER = {
  key: "line", family: "trend", apiVersion: RENDERER_API_VERSION,
  validateData: normalizeLineData, prepare: prepareLine, draw: drawLine, domains: pointDomains,
  describe(contract) { return { summary: `${contract.data.series.length} connected series.`, headers: [contract.spec.xLabel || "x", ...contract.data.series.map((series) => series.label)], rows: contract.data.x.map((x, index) => [x, ...contract.data.series.map((series) => series.y[index])]) }; },
};

export const SCATTER_RENDERER = {
  key: "scatter", family: "relationship", apiVersion: RENDERER_API_VERSION,
  validateData: normalizeScatterData, prepare: prepareScatter, draw: drawScatter, domains: pointDomains,
  describe(contract) { return { summary: `${contract.data.x.length} unconnected observations.`, headers: [contract.spec.xLabel || "x", contract.spec.yLabel || "y", "series"], rows: contract.data.x.map((x, index) => [x, contract.data.y[index], contract.data.seriesLabels[contract.data.series[index]]]) }; },
};

export const STRIP_RENDERER = {
  key: "strip_summary", family: "distribution", apiVersion: RENDERER_API_VERSION,
  validateData: normalizeStripData, prepare: prepareStrip, compileScene: compileStripScene, draw: drawStrip,
  domains(contract, prepared) { return { x: [-0.5, contract.data.groups.length - 0.5], y: resolveNumericDomain(contract, "y", extent(prepared.points.map((point) => point.y))) }; },
  describe(contract) { return { summary: `${contract.data.values.length} observations across ${contract.data.groups.length} ordered groups.`, headers: ["group", contract.spec.yLabel || "value", "series"], rows: contract.data.values.map((value, index) => [contract.data.group[index], value, contract.data.seriesLabels[contract.data.series[index]]]) }; },
};

export const CORE_RENDERERS = Object.freeze([LINE_RENDERER, SCATTER_RENDERER, STRIP_RENDERER]);
export const CORE_REGISTRY = createRendererRegistry(CORE_RENDERERS);
