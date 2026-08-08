import { defineRenderer, RENDERER_API_VERSION } from "../../registry.js";
import { prepareCoverage, coverageDomains, drawCoverage, compileCoverageScene } from "./coverage.js";
import { prepareObservations, observationDomains, drawObservations, compileObservationsScene } from "./observations.js";
import { normalizeReferenceBands, PROVISIONAL_LABEL, validateCoverageData, validateObservationData } from "./shared.js";

export const TEMPORAL_COVERAGE_RENDERER = defineRenderer({
  key: "temporal_coverage", family: "temporal", apiVersion: RENDERER_API_VERSION,
  validateData: validateCoverageData, prepare: prepareCoverage, compileScene: compileCoverageScene, domains: coverageDomains, draw: drawCoverage,
  describe(contract) {
    const annual = new Map();
    contract.data.dates.forEach((date, index) => {
      const year = date.slice(0, 4); if (!annual.has(year)) annual.set(year, new Set()); annual.get(year).add(contract.data.sites[index]);
    });
    return {
      summary: `${contract.data.dates.length} exact, sparse dated observations across ${contract.data.siteOrder.length} ordered sites. Annual counts are distinct sampled sites, not continuous coverage.`,
      headers: ["date", "site", "distinct sites sampled that year"],
      rows: contract.data.dates.map((date, index) => [date, contract.data.sites[index], annual.get(date.slice(0, 4)).size]),
    };
  },
});

export const TEMPORAL_OBSERVATIONS_RENDERER = defineRenderer({
  key: "temporal_observations", family: "temporal", apiVersion: RENDERER_API_VERSION,
  validateData: validateObservationData, prepare: prepareObservations, compileScene: compileObservationsScene, domains: observationDomains, draw: drawObservations,
  describe(contract) {
    const bands = normalizeReferenceBands(contract.data.referenceBands ?? [], "config.data.referenceBands");
    const bandFor = (value) => bands.find((band, index) => value >= band.from && (value < band.to || (index === bands.length - 1 && value <= band.to)));
    return {
      summary: `${contract.data.values.length} sparse, unconnected observations for ${contract.data.site}.${bands.length ? ` Reference bands are ${PROVISIONAL_LABEL.toLowerCase()}.` : ""}`,
      headers: ["date", "site", contract.spec.yLabel || "value", "project reference band"],
      rows: contract.data.dates.map((date, index) => {
        const band = bandFor(contract.data.values[index]);
        return [date, contract.data.site, contract.data.values[index], band ? `${band.label} — ${PROVISIONAL_LABEL}` : "None"];
      }),
    };
  },
});

export const TEMPORAL_RENDERERS = Object.freeze([TEMPORAL_COVERAGE_RENDERER, TEMPORAL_OBSERVATIONS_RENDERER]);

export { PROVISIONAL_LABEL, PROVISIONAL_STATUS, validateCoverageData, validateObservationData } from "./shared.js";
export { compileCoverageScene } from "./coverage.js";
export { compileObservationsScene } from "./observations.js";
