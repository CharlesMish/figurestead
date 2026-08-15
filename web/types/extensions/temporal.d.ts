import type {
  FiguresteadContract,
  FiguresteadPanelBase,
  RendererDefinition,
  UnknownRecord,
} from "@figurestead/web";

export type FiguresteadDate = string;

export interface TemporalCoverageData {
  dates: FiguresteadDate[];
  sites: string[];
  siteOrder: string[];
}

export interface TemporalReferenceBand {
  type: "reference_band";
  from: number;
  to: number;
  label: string;
  status: "provisional_project_constant";
}

export interface TemporalObservationData {
  dates: FiguresteadDate[];
  values: number[];
  site: string;
  referenceBands?: TemporalReferenceBand[];
}

export type TemporalCoveragePanel = FiguresteadPanelBase<"temporal_coverage", TemporalCoverageData>;
export type TemporalObservationsPanel = FiguresteadPanelBase<"temporal_observations", TemporalObservationData>;
export type TemporalPanel = TemporalCoveragePanel | TemporalObservationsPanel;
export type TemporalFiguresteadContract = FiguresteadContract<TemporalPanel>;

export const TEMPORAL_COVERAGE_RENDERER: Readonly<RendererDefinition<TemporalCoverageData>>;
export const TEMPORAL_OBSERVATIONS_RENDERER: Readonly<RendererDefinition<TemporalObservationData>>;
export const TEMPORAL_RENDERERS: readonly [typeof TEMPORAL_COVERAGE_RENDERER, typeof TEMPORAL_OBSERVATIONS_RENDERER];
export const PROVISIONAL_LABEL: "Provisional project constant; not a regulatory threshold";
export const PROVISIONAL_STATUS: "provisional_project_constant";

export function validateCoverageData(data: unknown, path?: string): TemporalCoverageData;
export function validateObservationData(data: unknown, path?: string): TemporalObservationData;
export function compileCoverageScene(context: UnknownRecord): UnknownRecord;
export function compileObservationsScene(context: UnknownRecord): UnknownRecord;
