/**
 * Public TypeScript surface for @figurestead/web.
 *
 * These declarations describe the current browser contract structurally.
 * Runtime validation remains authoritative for semantic constraints such as
 * finite numbers, ordered domains, canonical #RRGGBB colors, and data-array
 * cardinality.
 */

export type CanonicalColor = string;
export type FiguresteadSchemaVersion = "0.4";
export type RendererApiVersion = "1";
export type ApplicationProfileKey = "paper" | "atlas" | "talk";
export type MotionMode = "none" | "semantic" | "legacy";
export type AmbientMode = "none" | "matrix";
export type MotionStrategy = "auto" | "none" | "reveal" | "points_then_connect" | "bar_grow" | "matrix_illuminate";
export type MarkerGlyph = "ring" | "square" | "triangle" | "diamond";
export type LineStyle = "solid" | "dash" | "dot" | "dash-dot";
export type HatchStyle = "none" | "diag" | "cross" | "vertical";
export type LegendPosition = "auto" | "top-right" | "top-left" | "bottom-right" | "bottom-left" | "outside-right" | "none";
export type CurveType = "linear" | "monotone";
export type LifecycleState = "playing" | "paused" | "complete";
export type UnknownRecord = Record<string, unknown>;

export interface FiguresteadTheme {
  key: string;
  name: string;
  field: CanonicalColor;
  panel: CanonicalColor;
  grid: CanonicalColor;
  spine: CanonicalColor;
  label: CanonicalColor;
  secondary: CanonicalColor;
  faint: CanonicalColor;
  primary: CanonicalColor;
  summaryCore: CanonicalColor;
  warm: CanonicalColor;
  series: CanonicalColor[];
  primaryEdge?: CanonicalColor;
  summaryEdge?: CanonicalColor;
  seriesEdges?: CanonicalColor[];
  mode?: ApplicationProfileKey;
}

export interface ThemePack {
  schemaVersion: "figurestead.theme-pack/1";
  name: string;
  themes: Record<string, FiguresteadTheme>;
  drafts?: Record<string, unknown>;
}

export interface AuthoredFiguresteadTheme {
  key?: string;
  name: string;
  field: CanonicalColor;
  panel: CanonicalColor;
  grid: CanonicalColor;
  spine: CanonicalColor;
  label: CanonicalColor;
  secondary: CanonicalColor;
  faint: CanonicalColor;
  primary: CanonicalColor;
  summaryCore?: CanonicalColor;
  summary_core?: CanonicalColor;
  warm: CanonicalColor;
  series: CanonicalColor[];
  primaryEdge?: CanonicalColor;
  primary_edge?: CanonicalColor;
  summaryEdge?: CanonicalColor;
  summary_edge?: CanonicalColor;
  seriesEdges?: CanonicalColor[];
  series_edges?: CanonicalColor[];
}

export interface AuthoredThemePack {
  schemaVersion?: "figurestead.theme-pack/1";
  schema_version?: "figurestead.theme-pack/1";
  name: string;
  themes: Record<string, AuthoredFiguresteadTheme>;
  drafts?: Record<string, unknown>;
}

export interface FiguresteadProfile {
  key: string;
  name: string;
  marker: string;
  markerSize: number;
  markerAlpha: number;
  edgeWidth: number;
  coreFraction: number;
  gridAlpha: number;
  pointGlow: boolean;
  gridX: boolean;
  gridY: boolean;
  summaryGlow: boolean;
}

export type TimelineWindow = [number, number];

export interface FiguresteadTimeline {
  rainIn: TimelineWindow;
  marksEnter: TimelineWindow;
  summaryCompiles: TimelineWindow;
  rainOut: TimelineWindow;
  settle: TimelineWindow;
}

export interface FiguresteadMotion {
  durationMs: number;
  lightingPeak: number;
  trailAlpha: number;
  frames: number;
  fps: number;
  rainStreams: number;
  rainGlyphs: number;
  seed: number;
}

export interface FiguresteadSpec {
  title: string;
  subtitle?: string;
  xLabel?: string;
  yLabel?: string;
  note?: string;
  signature?: string;
  description?: string;
}

export interface PanelSpec {
  title?: string;
  subtitle?: string;
  xLabel?: string;
  yLabel?: string;
  note?: string;
  signature?: string;
  description?: string;
}

export interface FiguresteadLayout {
  type: "grid";
  columns: number;
  gap: number;
  sharedX: boolean;
  sharedY: boolean;
}

export interface FiguresteadView {
  profile: ApplicationProfileKey;
  motion: MotionMode;
  ambient: AmbientMode;
  strategy: MotionStrategy;
}

export interface SeriesStyleOverride {
  colorIndex?: number;
  color?: CanonicalColor;
  edge?: CanonicalColor | null;
  glyph?: MarkerGlyph;
  lineStyle?: LineStyle;
  hatch?: HatchStyle;
  lineWidth?: number;
}

export interface FiguresteadStyle {
  glyphs: MarkerGlyph[];
  lineStyles: LineStyle[];
  series: Record<string, SeriesStyleOverride>;
}

export interface LinearScaleSpec {
  type: "linear";
  domain?: [number, number] | null;
  label?: string;
  nice?: boolean;
  padding?: number;
}

export interface TimeScaleSpec {
  type: "time";
  domain?: [number | string, number | string] | null;
  label?: string;
  nice?: boolean;
  padding?: number;
}

export interface BandScaleSpec {
  type: "band";
  domain?: string[] | null;
  label?: string;
  nice?: boolean;
  padding?: number;
}

export type ScaleSpec = LinearScaleSpec | TimeScaleSpec | BandScaleSpec;

export interface PanelPresentation {
  panelSurface?: boolean;
  frame?: boolean;
  curve?: CurveType;
  legend?: LegendPosition;
  lineWidth?: number;
  markerScale?: number;
  seriesMarkers?: MarkerGlyph[];
}

export interface PanelEncoding {
  interpolation?: CurveType;
}

export interface LineSeries {
  key: string;
  label?: string;
  y: number[];
}

export interface LineData {
  x: number[];
  series: LineSeries[];
  revealOrder?: "random" | "x";
  xDomain?: [number, number] | null;
  yDomain?: [number, number] | null;
}

export interface ScatterData {
  x: number[];
  y: number[];
  series?: Array<string | number>;
  seriesLabels?: Record<string, string>;
  summary?: "linear_fit" | null;
  xDomain?: [number, number] | null;
  yDomain?: [number, number] | null;
}

export interface StripSummaryData {
  groups: Array<string | number>;
  values: number[];
  group: Array<string | number>;
  series?: Array<string | number>;
  seriesLabels?: Record<string, string>;
  summary?: "median" | null;
  yDomain?: [number, number] | null;
}

export interface FiguresteadPanelBase<R extends string, D> {
  id?: string;
  renderer: R;
  spec?: PanelSpec;
  xScale?: ScaleSpec;
  yScale?: ScaleSpec;
  annotations?: unknown[];
  presentation?: PanelPresentation;
  encoding?: PanelEncoding;
  data: D;
}

export type LinePanel = FiguresteadPanelBase<"line", LineData>;
export type ScatterPanel = FiguresteadPanelBase<"scatter", ScatterData>;
export type StripSummaryPanel = FiguresteadPanelBase<"strip_summary", StripSummaryData>;
export type CoreFiguresteadPanel = LinePanel | ScatterPanel | StripSummaryPanel;
export type FiguresteadPanel<R extends string = string, D = unknown> = FiguresteadPanelBase<R, D>;

export interface FiguresteadContract<P extends FiguresteadPanel = CoreFiguresteadPanel> {
  schemaVersion: FiguresteadSchemaVersion;
  rendererApiVersion: RendererApiVersion;
  theme: FiguresteadTheme;
  profile: FiguresteadProfile;
  timeline: FiguresteadTimeline;
  motion: FiguresteadMotion;
  style: FiguresteadStyle;
  spec: FiguresteadSpec;
  layout: FiguresteadLayout;
  view: FiguresteadView;
  panels: P[];
}

export interface LegacyFiguresteadContract {
  schemaVersion: "0.3";
  renderer: "line" | "scatter" | "strip_summary";
  data: LineData | ScatterData | StripSummaryData;
  theme: FiguresteadTheme;
  profile: FiguresteadProfile;
  timeline: FiguresteadTimeline;
  motion: FiguresteadMotion;
  spec: FiguresteadSpec;
  view?: Partial<FiguresteadView>;
  style?: Partial<FiguresteadStyle>;
}

export interface AccessibilityOptions {
  visible?: boolean;
  table?: boolean;
}

export interface FiguresteadRuntimeErrorContext {
  phase: "draw";
  progress: number;
}

export interface RendererDescription {
  summary: string;
  headers: unknown[];
  rows: unknown[][];
}

export interface RendererEnvironment {
  contract: UnknownRecord;
  prepared: unknown;
  layout: UnknownRecord;
  domains: UnknownRecord;
  progress: number;
  settled: boolean;
  panel: FiguresteadPanel;
  figure: FiguresteadContract<FiguresteadPanel>;
  [key: string]: unknown;
}

export interface RendererDefinition<D = unknown, Prepared = unknown> {
  key: string;
  family?: string;
  apiVersion: RendererApiVersion;
  validateData(data: unknown, path?: string): D;
  prepare(contract: UnknownRecord): Prepared;
  draw(context: CanvasRenderingContext2D, environment: RendererEnvironment): unknown;
  describe(contract: UnknownRecord, prepared?: Prepared): RendererDescription;
  domains?(contract: UnknownRecord, prepared: Prepared): UnknownRecord;
  compileScene?(context: UnknownRecord): UnknownRecord;
}

export interface RendererRegistry {
  readonly apiVersion: RendererApiVersion;
  get(key: string): RendererDefinition | null;
  has(key: string): boolean;
  keys(): readonly string[];
  definitions(): readonly RendererDefinition[];
  with(...definitions: Array<RendererDefinition | RendererDefinition[]>): RendererRegistry;
}

export interface CreateFiguresteadOptions {
  registry?: RendererRegistry;
  reducedMotion?: boolean | null;
  accessibility?: AccessibilityOptions;
  autoplay?: boolean;
  dprCap?: number;
  onProgress?: (progress: number) => void;
  onState?: (state: LifecycleState) => void;
  onError?: (error: unknown, context: FiguresteadRuntimeErrorContext) => void;
}

export interface FiguresteadState {
  progress: number;
  playing: boolean;
  reducedMotion: boolean;
  runtimeFailed: boolean;
  renderers: string[];
  sceneVersion: string;
  resolvedSceneVersion: string;
  composedSceneVersion: string;
  profile: ApplicationProfileKey;
  destroyed: boolean;
}

export interface FiguresteadPointCoordinate {
  x: number | undefined;
  y: number | undefined;
  dataX: unknown;
  dataY: unknown;
}

export interface FiguresteadPanelCoordinates {
  panelId: string;
  points: FiguresteadPointCoordinate[];
}

export interface TerminalScene extends UnknownRecord {
  schemaVersion: "figurestead.scene/1";
  contractSchemaVersion: string;
  rendererApiVersion: string;
  panels: readonly UnknownRecord[];
}

export interface ResolvedScene extends UnknownRecord {
  schemaVersion: "figurestead.resolved-scene/1";
  panels: readonly UnknownRecord[];
}

export interface ComposedScene extends UnknownRecord {
  schemaVersion: "figurestead.composed-scene/1";
  panels: readonly UnknownRecord[];
}

export interface FiguresteadController<P extends FiguresteadPanel = CoreFiguresteadPanel> {
  play(): void;
  pause(): void;
  replay(): void;
  setData(data: unknown): void;
  setConfig(next: FiguresteadContract<P>): void;
  setReducedMotion(value: boolean | null): void;
  resize(): void;
  destroy(): void;
  getState(): FiguresteadState;
  getScene(): TerminalScene;
  getResolvedScene(): ResolvedScene;
  getComposedScene(): ComposedScene;
  getFinalCoordinates(): FiguresteadPanelCoordinates[];
}

export class FiguresteadConfigError extends Error {
  constructor(message: string, path?: string);
  path: string;
}

export function createFigurestead<P extends FiguresteadPanel = CoreFiguresteadPanel>(canvas: HTMLCanvasElement, input: FiguresteadContract<P>, options?: CreateFiguresteadOptions): FiguresteadController<P>;
export function validateContract<P extends FiguresteadPanel = CoreFiguresteadPanel>(input: FiguresteadContract<P> | LegacyFiguresteadContract, registry?: RendererRegistry | null): FiguresteadContract<P>;

export const SCHEMA_VERSION: "0.4";
export const LEGACY_SCHEMA_VERSION: "0.3";
export const RENDERER_API_VERSION: "1";
export const CORE_REGISTRY: RendererRegistry;
export const CORE_RENDERERS: readonly RendererDefinition[];
export function defineRenderer<D = unknown, Prepared = unknown>(definition: RendererDefinition<D, Prepared>): Readonly<RendererDefinition<D, Prepared>>;
export function createRendererRegistry(definitions?: RendererDefinition[]): RendererRegistry;

export interface FiguresteadRect { left: number; top: number; right: number; bottom: number }
export interface FiguresteadLayoutResult extends UnknownRecord { width: number; height: number; panels: readonly UnknownRecord[] }
export function deriveFigureLayout(width: number, height: number, contract: FiguresteadContract<FiguresteadPanel>): FiguresteadLayoutResult;

export interface ContinuousScale { (value: number): number }
export interface BandScale { (value: string | number): number | undefined; bandwidth(): number; step(): number; domain(): string[] }
export function linearScale(domain: readonly number[], range: readonly number[]): ContinuousScale;
export function timeScale(domain: readonly (number | string | Date)[], range: readonly number[]): ContinuousScale;
export function bandScale(domain: readonly string[], range: readonly number[], options?: { padding?: number }): BandScale;
export function parseTime(value: number | string | Date, path?: string): number;
export function timeTicks(domain: readonly (number | string | Date)[], count?: number): number[];
export function formatTimeTick(value: number | string | Date, domain?: readonly (number | string | Date)[] | null): string;

export interface RulePrimitive { x1: number; y1: number; x2: number; y2: number; color: string; alpha?: number; width?: number; dash?: number[] }
export interface RectPrimitive { left: number; top: number; right: number; bottom: number; color: string; alpha?: number }
export function drawRule(context: CanvasRenderingContext2D, options: RulePrimitive): void;
export function drawBand(context: CanvasRenderingContext2D, options: RectPrimitive): void;
export function drawBar(context: CanvasRenderingContext2D, options: RectPrimitive & { stroke?: string | null; lineWidth?: number }): void;
export function drawInterval(context: CanvasRenderingContext2D, options: { x1: number; x2: number; y: number; color: string; alpha?: number; width?: number; cap?: number }): void;
export function drawCell(context: CanvasRenderingContext2D, options: RectPrimitive & { stroke?: string | null }): void;

export interface RendererConformanceResult { readonly ok: boolean; readonly errors: readonly string[] }
export function rendererConformance(definition: RendererDefinition, contract: UnknownRecord): RendererConformanceResult;
export function assertRendererConformance(definition: RendererDefinition, contract: UnknownRecord): RendererConformanceResult;

export interface PreparedPoint { x: number; y: number; series?: string; index?: number; [key: string]: unknown }
export interface PreparedRendererData extends UnknownRecord { points: PreparedPoint[] }
export function prepareLine(contract: UnknownRecord): PreparedRendererData;
export function lineSegmentState(left: PreparedPoint, right: PreparedPoint, progress: number, interpolation?: CurveType): UnknownRecord;
export function prepareScatter(contract: UnknownRecord): PreparedRendererData;
export function prepareStrip(contract: UnknownRecord): PreparedRendererData;

export const SCIENTIFIC_POSE: Readonly<PanelPresentation>;
export interface ScientificPoseFocus { panelId: string; label: string; anchorId?: string; x?: number; y?: number; space?: "plot" | "data"; dx?: number; dy?: number }
export interface ScientificPoseOptions extends PanelPresentation { focus?: ScientificPoseFocus[] }
export function applyScientificPose<C extends FiguresteadContract<FiguresteadPanel>>(input: C, options?: ScientificPoseOptions): C;
export function applyEvidencePose<C extends FiguresteadContract<FiguresteadPanel>>(input: C, options?: ScientificPoseOptions): C;

export interface ApplicationProfile {
  key: ApplicationProfileKey | string;
  name: string;
  surface: string;
  density: string;
  typography: string;
  legend: string;
  ambient: string;
  motion: string;
  lineWidth: number;
  markerScale: number;
  panelSurface: boolean;
  frame: boolean;
}
export const APPLICATION_PROFILE_VERSION: "figurestead.application-profile/1";
export const APPLICATION_PROFILES: Readonly<Record<ApplicationProfileKey, Readonly<ApplicationProfile>>>;
export function resolveApplicationProfile(value?: ApplicationProfileKey | ApplicationProfile): Readonly<ApplicationProfile>;
export function applyApplicationProfile<C extends FiguresteadContract<FiguresteadPanel>>(input: C, profile?: ApplicationProfileKey | ApplicationProfile, options?: UnknownRecord): C;

export const APPEARANCE_VERSION: "figurestead.appearance/1";
export interface ComposeAppearanceOptions extends UnknownRecord { profile?: ApplicationProfileKey | ApplicationProfile; palettePack?: PalettePack; paletteKey?: string; mode?: ApplicationProfileKey; themePack?: ThemePack; themeKey?: string; theme?: FiguresteadTheme }
export function composeAppearance<C extends FiguresteadContract<FiguresteadPanel>>(input: C, options?: ComposeAppearanceOptions): C;

export interface ResolvedSeriesStyle extends SeriesStyleOverride { key: string; colorIndex: number; color: CanonicalColor; edge: CanonicalColor | null; glyph: MarkerGlyph; lineStyle: LineStyle; hatch: HatchStyle; lineWidth: number }
export const SERIES_STYLE_VERSION: "figurestead.series-style/1";
export const GLYPH_CYCLE: readonly MarkerGlyph[];
export const LINE_STYLE_CYCLE: readonly LineStyle[];
export const HATCH_CYCLE: readonly HatchStyle[];
export function collectSeriesKeys(contract: FiguresteadContract<FiguresteadPanel>): string[];
export function resolveSeriesStyles(contract: FiguresteadContract<FiguresteadPanel>): Readonly<Record<string, Readonly<ResolvedSeriesStyle>>>;
export function styleForSeries(environment: UnknownRecord, key: string, fallbackIndex?: number): ResolvedSeriesStyle;

export const TERMINAL_SCENE_VERSION: "figurestead.scene/1";
export function compileFigureModel(input: FiguresteadContract<FiguresteadPanel>, options?: { registry?: RendererRegistry }): Readonly<{ contract: FiguresteadContract<FiguresteadPanel>; scene: TerminalScene; preparedPanels: readonly UnknownRecord[]; domains: readonly UnknownRecord[] }>;
export function compileTerminalScene(input: FiguresteadContract<FiguresteadPanel>, options?: { registry?: RendererRegistry }): TerminalScene;
export function terminalEvidence(scene: TerminalScene): UnknownRecord[];
export function canonicalTerminalEvidence(scene: TerminalScene): UnknownRecord;
export function evidenceFingerprint(scene: TerminalScene): string;

export const RESOLVED_SCENE_VERSION: "figurestead.resolved-scene/1";
export const RESOLVED_RENDERERS: readonly string[];
export function isResolvedRenderer(renderer: string): boolean;
export function resolveTerminalScene(scene: TerminalScene, options?: { width?: number; height?: number; measureText?: (text: string, fontSize: number) => { width: number; ascent?: number; descent?: number } }): ResolvedScene;
export function resolveSceneFrame(scene: ResolvedScene, progress?: number): ResolvedScene;
export function resolveSceneFrame(scene: ComposedScene, progress?: number): ComposedScene;
export function resolvedTerminalGeometry(scene: ResolvedScene | ComposedScene): UnknownRecord[];

export const COMPOSED_SCENE_VERSION: "figurestead.composed-scene/1";
export function auditComposition(scene: ResolvedScene): Readonly<UnknownRecord>;
export function composeResolvedScene(scene: ResolvedScene): ComposedScene;

export interface MotionState { opacity: number; translateX: number; translateY: number; scaleX: number; scaleY: number; clip: number; glow: number }
export type MotionChannel = "opacity" | "translate" | "scale" | "clip" | "glow";
export const MOTION_PLAN_VERSION: "figurestead.motion-plan/1";
export const ALLOWED_MOTION_CHANNELS: readonly MotionChannel[];
export const TERMINAL_MOTION_STATE: Readonly<MotionState>;
export function strategyForRenderer(renderer: string, requested?: MotionStrategy): MotionStrategy;
export function compileMotionPlan(scene: TerminalScene, view?: Partial<FiguresteadView>): Readonly<UnknownRecord>;
export function markMotionState(mark: UnknownRecord, index: number, count: number, progress: number, strategy?: MotionStrategy): MotionState;
export function assertTerminalMotionIdentity(plan: UnknownRecord, scene: TerminalScene): true;

export interface ExportSizeOptions {
  width?: number;
  height?: number;
  paperSize?: "paper-single" | "paper-double";
  physicalWidthMm?: number;
  minLabelPt?: number;
}
export interface SvgExportOptions extends ExportSizeOptions { registry?: RendererRegistry; idPrefix?: string; sourceScene?: TerminalScene; exportSize?: ExportSize }
export function exportFigureSvg(input: FiguresteadContract<FiguresteadPanel> | TerminalScene, options?: SvgExportOptions): string;
export function sceneToSvg(scene: TerminalScene, options?: SvgExportOptions): string;
export function resolvedSceneToSvg(scene: ResolvedScene | ComposedScene, options?: SvgExportOptions): string;

export const EXPORT_MANIFEST_VERSION: "figurestead.export-manifest/1";
export const FIGURESTEAD_PACKAGE_VERSION: string;
export interface FigureArtifacts { readonly scene: TerminalScene; readonly resolved: ResolvedScene; readonly composed: ComposedScene; readonly svg: string; readonly sceneJson: string; readonly geometryJson: string; readonly manifest: Readonly<UnknownRecord>; readonly manifestJson: string }
export function exportFigureArtifacts(input: FiguresteadContract<FiguresteadPanel> | TerminalScene, options?: SvgExportOptions): FigureArtifacts;
export function canvasToPngBlob(canvas: HTMLCanvasElement, options?: { quality?: number }): Promise<Blob>;
export function stableStringify(value: unknown, space?: number): string;

export interface MotionRecipe { key: string; name: string; motion: MotionMode; ambient: AmbientMode; strategy: MotionStrategy; durationMs: number; lightingPeak: number }
export const MOTION_RECIPE_VERSION: "figurestead.motion-recipe/1";
export const MOTION_RECIPES: Readonly<Record<"static" | "restrained" | "expressive" | "matrix_origin", Readonly<MotionRecipe>>>;
export function resolveMotionRecipe(value?: keyof typeof MOTION_RECIPES | MotionRecipe): Readonly<MotionRecipe>;
export function applyMotionRecipe<C extends FiguresteadContract<FiguresteadPanel>>(input: C, recipe?: keyof typeof MOTION_RECIPES | MotionRecipe): C;

export interface ThemeCatalog { readonly schemaVersion: "figurestead.theme-catalog/1"; readonly name: string; readonly themes: Readonly<Record<string, FiguresteadTheme>>; readonly sources: Readonly<Record<string, string>> }
export const THEME_CATALOG_VERSION: "figurestead.theme-catalog/1";
export function mergeThemePacks(packs: ThemePack[], options?: { name?: string }): ThemeCatalog;
export function auditThemeCatalog(catalog: ThemeCatalog): Readonly<{ themes: readonly UnknownRecord[]; total: number; warnings: number; clean: boolean }>;
export function catalogThemePack(catalog: ThemeCatalog): ThemePack;

export class AnimationClock {
  constructor(options: { durationMs: number; draw: (progress: number) => void; onState?: (state: LifecycleState) => void; onError?: (error: unknown, context: FiguresteadRuntimeErrorContext) => void; raf?: (callback: FrameRequestCallback) => number; cancel?: (handle: number) => void });
  durationMs: number;
  progress: number;
  playing: boolean;
  destroyed: boolean;
  failed: boolean;
  render(progress?: number): boolean;
  play(): void;
  pause(): void;
  replay(): void;
  settle(): void;
  resetFailure(): void;
  destroy(): void;
}

export interface PalettePack extends UnknownRecord { schemaVersion: "figurestead.palette-pack/2"; name?: string; palettes: Record<string, UnknownRecord> }
export const THEME_PACK_VERSION: "figurestead.theme-pack/1";
export const PALETTE_PACK_VERSION: "figurestead.palette-pack/2";
export function validateThemePack(input: ThemePack): ThemePack;
export function validateAuthoredThemePack(input: AuthoredThemePack): ThemePack;
export function normalizeThemePackLenient(input: UnknownRecord): ThemePack;
export function loadThemePack(url: RequestInfo | URL, options?: RequestInit): Promise<ThemePack>;
export function resolveTheme(pack: ThemePack, key: string): FiguresteadTheme;
export function applyTheme<C extends FiguresteadContract<FiguresteadPanel>>(contract: C, theme: FiguresteadTheme): C;
export function themeForProfile(theme: FiguresteadTheme, profile?: ApplicationProfileKey | ApplicationProfile): FiguresteadTheme;
export function validatePalettePack(input: PalettePack): UnknownRecord;
export function resolvePalette(pack: PalettePack, key: string, options?: { mode?: ApplicationProfileKey }): UnknownRecord & { theme: FiguresteadTheme };
export function contrastRatio(left: CanonicalColor, right: CanonicalColor): number;
export function contrastAudit(theme: FiguresteadTheme): UnknownRecord[];

export const RENDER_LAYER_ORDER: readonly string[];
export function renderLayerForMark(mark: UnknownRecord): string;
export function partitionPanelMarks(marks?: UnknownRecord[]): Record<string, UnknownRecord[]>;
export function plotClipRect(panel: UnknownRecord): FiguresteadRect;
export function withCanvasPlotClip<T>(context: CanvasRenderingContext2D, panel: UnknownRecord, draw: (plot: FiguresteadRect) => T): T;
export function validateEvidenceCoverage(panels: UnknownRecord[]): Readonly<UnknownRecord>;

export interface OklabColor { L: number; a: number; b: number }
export interface OklchColor { L: number; C: number; h: number }
export function colorContrast(left: CanonicalColor, right: CanonicalColor): number;
export function hexToOklab(value: CanonicalColor): OklabColor;
export function hexToOklch(value: CanonicalColor): OklchColor;
export function oklabDistance(left: OklabColor, right: OklabColor): number;
export function oklchToHex(value: OklchColor): { hex: CanonicalColor; oklch: OklchColor };
export function resolveContrastColor(source: CanonicalColor, surface: CanonicalColor, minimum: number, options?: { chromaCap?: number }): Readonly<UnknownRecord & { color: CanonicalColor; contrast: number }>;

export const PAPER_FLOORS: Readonly<{ text: number; evidence: number; thinEvidenceTarget: number; pairwiseLightness: number; identityWarning: number }>;
export const PAPER_PROFILE_VERSION: "figurestead.paper-profile/1";
export const PAPER_SURFACE: Readonly<Record<string, CanonicalColor>>;
export function auditPaperTheme(theme: FiguresteadTheme, seriesStyles?: Record<string, ResolvedSeriesStyle> | null): Readonly<UnknownRecord & { clean: boolean }>;
export function resolvePaperTheme(theme: FiguresteadTheme): Readonly<{ theme: FiguresteadTheme; report: Readonly<UnknownRecord> }>;
export function themeResolutionForProfile(theme: FiguresteadTheme, profile?: ApplicationProfileKey | ApplicationProfile): Readonly<{ theme: FiguresteadTheme; report: Readonly<UnknownRecord> | null }>;

export interface PhysicalExport { preset: string; widthMm: number; heightMm: number; minLabelPt: number }
export interface ExportSize { width: number; height: number; widthAttribute: number | string; heightAttribute: number | string; physical: Readonly<PhysicalExport> | null }
export const PAPER_SIZE_PRESETS: Readonly<{ "paper-single": 89; "paper-double": 183 }>;
export function resolveExportSize(options?: ExportSizeOptions): Readonly<ExportSize>;
export function auditPhysicalTypography(composed: ComposedScene, physical: PhysicalExport | null): Readonly<UnknownRecord> | null;
