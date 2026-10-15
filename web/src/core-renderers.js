import { createRendererRegistry, RENDERER_API_VERSION } from "./registry.js";
import { normalizeLineData, normalizeScatterData, normalizeStripData } from "./schema.js";
import { extent } from "./scales.js";
import { prepareLine, drawLine } from "./renderers/line.js";
import { prepareScatter, drawScatter } from "./renderers/scatter.js";
import { prepareStrip, drawStrip, compileStripScene } from "./renderers/strip-summary.js";
import { formatFactualValues, observedRanges } from "./factual-description.js";

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
  describe(contract, prepared = prepareLine(contract)) {
    return { summary: `${contract.data.series.length} ${contract.data.x.length > 1 ? "connected series" : "point-only series"}; ${contract.data.x.length} ${contract.data.x.length === 1 ? "observation" : "observations"} per series (${prepared.points.length} total). ${observedRanges(prepared.points)}`, headers: [contract.spec.xLabel || "x", ...contract.data.series.map((series) => series.label)], rows: contract.data.x.map((x, index) => [x, ...contract.data.series.map((series) => series.y[index])]) };
  },
};

export const SCATTER_RENDERER = {
  key: "scatter", family: "relationship", apiVersion: RENDERER_API_VERSION,
  validateData: normalizeScatterData, prepare: prepareScatter, draw: drawScatter, domains: pointDomains,
  describe(contract, prepared = prepareScatter(contract)) {
    let summary = `${prepared.points.length} unconnected observations. ${observedRanges(prepared.points)}`;
    if (prepared.fit) {
      const [slope, intercept] = formatFactualValues([prepared.fit.slope, prepared.fit.intercept]);
      summary += ` Linear fit across all ${prepared.points.length} observations: slope ${slope}; intercept ${intercept}.`;
    }
    return { summary, headers: [contract.spec.xLabel || "x", contract.spec.yLabel || "y", "series"], rows: contract.data.x.map((x, index) => [x, contract.data.y[index], contract.data.seriesLabels[contract.data.series[index]]]) };
  },
};

export const STRIP_RENDERER = {
  key: "strip_summary", family: "distribution", apiVersion: RENDERER_API_VERSION,
  validateData: normalizeStripData, prepare: prepareStrip, compileScene: compileStripScene, draw: drawStrip,
  domains(contract, prepared) { return { x: [-0.5, contract.data.groups.length - 0.5], y: resolveNumericDomain(contract, "y", extent(prepared.points.map((point) => point.y))) }; },
  describe(contract, prepared = prepareStrip(contract)) {
    const medians = formatFactualValues(prepared.groups.filter((group) => group.n).map((group) => group.median));
    let medianIndex = 0;
    const groups = prepared.groups.map((group) => {
      const median = group.n ? medians[medianIndex++] : null;
      return `${group.group}: n=${group.n}${!group.n ? "; no median" : contract.data.summary === "median" ? `; median ${median}` : ""}.`;
    });
    return { summary: `${prepared.points.length} observations across ${prepared.groups.length} ordered groups. ${groups.join(" ")}`, headers: ["group", contract.spec.yLabel || "value", "series"], rows: contract.data.values.map((value, index) => [contract.data.group[index], value, contract.data.seriesLabels[contract.data.series[index]]]) };
  },
};

export const CORE_RENDERERS = Object.freeze([LINE_RENDERER, SCATTER_RENDERER, STRIP_RENDERER]);
export const CORE_REGISTRY = createRendererRegistry(CORE_RENDERERS);
