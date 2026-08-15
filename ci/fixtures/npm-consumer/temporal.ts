import { createFigurestead, createRendererRegistry, type FiguresteadContract } from "@figurestead/web";
import {
  PROVISIONAL_STATUS,
  TEMPORAL_RENDERERS,
  validateCoverageData,
  validateObservationData,
  type TemporalPanel,
} from "@figurestead/web/extensions/temporal";
import { lineContract } from "./shared.js";

// @valid-case temporal extension contract and registry
const registry = createRendererRegistry([...TEMPORAL_RENDERERS]);
const temporal = {
  ...lineContract,
  panels: [{
    renderer: "temporal_observations",
    data: {
      dates: ["2026-01-01", "2026-02-01"],
      values: [2, 4],
      site: "site-a",
      referenceBands: [{ type: "reference_band", from: 0, to: 3, label: "Reference", status: PROVISIONAL_STATUS }],
    },
  }],
} satisfies FiguresteadContract<TemporalPanel>;
validateObservationData(temporal.panels[0].data);
validateCoverageData({ dates: ["2026-01-01"], sites: ["site-a"], siteOrder: ["site-a"] });
declare const canvas: HTMLCanvasElement;
createFigurestead(canvas, temporal, { registry, autoplay: false });
