export const SCHEMA_VERSION = "0.4";
export const LEGACY_SCHEMA_VERSION = "0.3";
export const RENDERER_API_VERSION = "1";
export const RENDERERS = Object.freeze(["line", "scatter", "strip_summary"]);

export class FiguresteadConfigError extends Error {
  constructor(message, path = "config") {
    super(`${path}: ${message}`);
    this.name = "FiguresteadConfigError";
    this.path = path;
  }
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

export function cloneValue(value) {
  if (globalThis.structuredClone) return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function requiredObject(value, path) {
  if (!isObject(value)) throw new FiguresteadConfigError("must be an object", path);
}

export function requiredString(value, path) {
  if (typeof value !== "string" || !value.trim()) {
    throw new FiguresteadConfigError("must be a non-empty string", path);
  }
}

const CANONICAL_COLOR = /^#[0-9a-fA-F]{6}$/;

export function requiredColor(value, path) {
  if (typeof value !== "string" || !CANONICAL_COLOR.test(value)) {
    throw new FiguresteadConfigError("must be a canonical #RRGGBB color", path);
  }
}

export function numberArray(value, path, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new FiguresteadConfigError("must be a non-empty numeric array", path);
  }
  value.forEach((item, index) => {
    if (!isFiniteNumber(item)) throw new FiguresteadConfigError("must be a finite number", `${path}[${index}]`);
  });
  return value;
}

export function sameLength(value, length, path) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new FiguresteadConfigError(`must contain exactly ${length} items`, path);
  }
}

export function domain(value, path) {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length !== 2 || !value.every(isFiniteNumber) || value[0] >= value[1]) {
    throw new FiguresteadConfigError("must be two strictly increasing finite numbers", path);
  }
  return value;
}

function timelineWindow(value, path) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(isFiniteNumber)) {
    throw new FiguresteadConfigError("must contain two numbers", path);
  }
  if (value[0] < 0 || value[1] > 1 || value[0] > value[1]) {
    throw new FiguresteadConfigError("must satisfy 0 <= start <= end <= 1", path);
  }
}

export function validateThemeColors(theme, path = "config.theme") {
  requiredObject(theme, path);
  ["field", "panel", "grid", "spine", "label", "secondary", "faint", "primary", "summaryCore", "warm"]
    .forEach((key) => requiredColor(theme[key], `${path}.${key}`));
  if (!Array.isArray(theme.series) || !theme.series.length) {
    throw new FiguresteadConfigError("must be a non-empty color array", `${path}.series`);
  }
  theme.series.forEach((color, index) => requiredColor(color, `${path}.series[${index}]`));
  for (const key of ["primaryEdge", "summaryEdge"]) if (theme[key] != null) requiredColor(theme[key], `${path}.${key}`);
  if (theme.seriesEdges != null) {
    if (!Array.isArray(theme.seriesEdges) || theme.seriesEdges.length !== theme.series.length) throw new FiguresteadConfigError(`must contain exactly ${theme.series.length} colors`, `${path}.seriesEdges`);
    theme.seriesEdges.forEach((color, index) => requiredColor(color, `${path}.seriesEdges[${index}]`));
  }
}

function validateTheme(theme) {
  requiredObject(theme, "config.theme");
  ["key", "name"].forEach((key) => requiredString(theme[key], `config.theme.${key}`));
  validateThemeColors(theme);
}

function validateProfile(profile) {
  requiredObject(profile, "config.profile");
  ["key", "name", "marker"].forEach((key) => requiredString(profile[key], `config.profile.${key}`));
  ["markerSize", "markerAlpha", "edgeWidth", "coreFraction", "gridAlpha"].forEach((key) => {
    if (!isFiniteNumber(profile[key])) throw new FiguresteadConfigError("must be a finite number", `config.profile.${key}`);
  });
  ["pointGlow", "gridX", "gridY", "summaryGlow"].forEach((key) => {
    if (typeof profile[key] !== "boolean") throw new FiguresteadConfigError("must be boolean", `config.profile.${key}`);
  });
}

function validateTimeline(timeline) {
  requiredObject(timeline, "config.timeline");
  ["rainIn", "marksEnter", "summaryCompiles", "rainOut", "settle"]
    .forEach((key) => timelineWindow(timeline[key], `config.timeline.${key}`));
}

function validateMotion(motion) {
  requiredObject(motion, "config.motion");
  ["durationMs", "lightingPeak", "trailAlpha"].forEach((key) => {
    if (!isFiniteNumber(motion[key]) || motion[key] < 0) {
      throw new FiguresteadConfigError("must be a non-negative finite number", `config.motion.${key}`);
    }
  });
  ["frames", "fps", "rainStreams", "rainGlyphs", "seed"].forEach((key) => {
    if (!Number.isInteger(motion[key]) || (key !== "seed" && motion[key] < 0)) {
      throw new FiguresteadConfigError("must be an integer", `config.motion.${key}`);
    }
  });
  if (motion.durationMs <= 0) throw new FiguresteadConfigError("must be greater than zero", "config.motion.durationMs");
}

function normalizeSpec(spec) {
  requiredObject(spec, "config.spec");
  requiredString(spec.title, "config.spec.title");
  return {
    title: spec.title,
    subtitle: spec.subtitle ?? "",
    xLabel: spec.xLabel ?? "",
    yLabel: spec.yLabel ?? "",
    note: spec.note ?? "",
    signature: spec.signature ?? "figurestead",
    description: spec.description ?? "",
  };
}

function normalizeSeriesLabels(keys, supplied) {
  if (supplied != null && !isObject(supplied)) {
    throw new FiguresteadConfigError("must be an object", "config.data.seriesLabels");
  }
  const labels = {};
  keys.forEach((key) => { labels[String(key)] = supplied?.[String(key)] ?? String(key); });
  return labels;
}

export function normalizeLineData(data, basePath = "config.data") {
  requiredObject(data, basePath);
  const x = numberArray(data.x, `${basePath}.x`);
  if (!Array.isArray(data.series) || !data.series.length) {
    throw new FiguresteadConfigError("must be a non-empty series array", `${basePath}.series`);
  }
  const seen = new Set();
  const series = data.series.map((item, index) => {
    requiredObject(item, `${basePath}.series[${index}]`);
    requiredString(item.key, `${basePath}.series[${index}].key`);
    if (seen.has(item.key)) throw new FiguresteadConfigError("must be unique", `${basePath}.series[${index}].key`);
    seen.add(item.key);
    const y = numberArray(item.y, `${basePath}.series[${index}].y`);
    sameLength(y, x.length, `${basePath}.series[${index}].y`);
    return { key: item.key, label: item.label || item.key, y };
  });
  const revealOrder = data.revealOrder ?? "random";
  if (!new Set(["random", "x"]).has(revealOrder)) {
    throw new FiguresteadConfigError("must be 'random' or 'x'", `${basePath}.revealOrder`);
  }
  if (revealOrder === "x" && x.some((value, index) => index && value < x[index - 1])) {
    throw new FiguresteadConfigError("requires nondecreasing x values", `${basePath}.revealOrder`);
  }
  return { x, series, revealOrder, xDomain: domain(data.xDomain, `${basePath}.xDomain`), yDomain: domain(data.yDomain, `${basePath}.yDomain`) };
}

export function normalizeScatterData(data, basePath = "config.data") {
  requiredObject(data, basePath);
  const x = numberArray(data.x, `${basePath}.x`);
  const y = numberArray(data.y, `${basePath}.y`);
  sameLength(y, x.length, `${basePath}.y`);
  const series = data.series == null ? Array(x.length).fill("series") : data.series;
  sameLength(series, x.length, `${basePath}.series`);
  const keys = [...new Set(series.map(String))];
  const summary = data.summary ?? null;
  if (summary !== null && summary !== "linear_fit") {
    throw new FiguresteadConfigError("must be null or 'linear_fit'", `${basePath}.summary`);
  }
  return {
    x, y, series: series.map(String), seriesLabels: normalizeSeriesLabels(keys, data.seriesLabels), summary,
    xDomain: domain(data.xDomain, `${basePath}.xDomain`), yDomain: domain(data.yDomain, `${basePath}.yDomain`),
  };
}

export function normalizeStripData(data, basePath = "config.data") {
  requiredObject(data, basePath);
  if (!Array.isArray(data.groups) || !data.groups.length) {
    throw new FiguresteadConfigError("must be a non-empty category-order array", `${basePath}.groups`);
  }
  const groups = data.groups.map(String);
  if (new Set(groups).size !== groups.length) throw new FiguresteadConfigError("categories must be unique", `${basePath}.groups`);
  const values = numberArray(data.values, `${basePath}.values`);
  sameLength(data.group, values.length, `${basePath}.group`);
  const assignment = data.group.map(String);
  assignment.forEach((group, index) => {
    if (!groups.includes(group)) throw new FiguresteadConfigError(`unknown category ${group}`, `${basePath}.group[${index}]`);
  });
  const series = data.series == null ? Array(values.length).fill("series") : data.series;
  sameLength(series, values.length, `${basePath}.series`);
  const keys = [...new Set(series.map(String))];
  const summary = data.summary ?? null;
  if (summary !== null && summary !== "median") {
    throw new FiguresteadConfigError("must be null or 'median'", `${basePath}.summary`);
  }
  return {
    groups, values, group: assignment, series: series.map(String),
    seriesLabels: normalizeSeriesLabels(keys, data.seriesLabels), summary,
    yDomain: domain(data.yDomain, `${basePath}.yDomain`),
  };
}

const FALLBACK_VALIDATORS = {
  line: normalizeLineData,
  scatter: normalizeScatterData,
  strip_summary: normalizeStripData,
};

function normalizeScale(value, path, fallbackType) {
  if (value == null) return { type: fallbackType, domain: null, label: "" };
  requiredObject(value, path);
  const type = value.type ?? fallbackType;
  if (!["linear", "time", "band"].includes(type)) throw new FiguresteadConfigError("type must be linear, time, or band", `${path}.type`);
  let normalizedDomain = value.domain ?? null;
  if (normalizedDomain != null) {
    if (!Array.isArray(normalizedDomain) || (type === "band" ? !normalizedDomain.length : normalizedDomain.length !== 2)) {
      throw new FiguresteadConfigError(type === "band" ? "domain must be a non-empty category array" : "domain must contain two values", `${path}.domain`);
    }
    if (type === "linear") normalizedDomain = domain(normalizedDomain, `${path}.domain`);
    if (type === "time" && normalizedDomain.some((item) => !Number.isFinite(typeof item === "number" ? item : Date.parse(item)))) {
      throw new FiguresteadConfigError("time domain values must be ISO dates or epoch milliseconds", `${path}.domain`);
    }
  }
  return { type, domain: normalizedDomain, label: value.label ?? "", nice: value.nice !== false, padding: value.padding ?? 0.12 };
}

function normalizeLayout(value, panelCount) {
  const layout = value ?? {};
  requiredObject(layout, "config.layout");
  const columns = layout.columns ?? 1, gap = layout.gap ?? 22;
  if (!Number.isInteger(columns) || columns < 1) throw new FiguresteadConfigError("must be a positive integer", "config.layout.columns");
  if (!isFiniteNumber(gap) || gap < 0) throw new FiguresteadConfigError("must be a non-negative number", "config.layout.gap");
  ["sharedX", "sharedY"].forEach((key) => { if (layout[key] != null && typeof layout[key] !== "boolean") throw new FiguresteadConfigError("must be boolean", `config.layout.${key}`); });
  return { type: "grid", columns: Math.min(columns, panelCount), gap, sharedX: Boolean(layout.sharedX), sharedY: Boolean(layout.sharedY) };
}

const LEGEND_POSITIONS = new Set(["auto", "top-right", "top-left", "bottom-right", "bottom-left", "outside-right", "none"]);
const CURVE_TYPES = new Set(["linear", "monotone"]);
const MARKER_TYPES = new Set(["ring", "square", "triangle", "diamond"]);

function normalizePresentation(value, path) {
  if (value == null) return null;
  requiredObject(value, path);
  const result = {};
  for (const key of ["panelSurface", "frame"]) {
    if (value[key] != null && typeof value[key] !== "boolean") throw new FiguresteadConfigError("must be boolean", `${path}.${key}`);
    if (value[key] != null) result[key] = value[key];
  }
  if (value.curve != null && !CURVE_TYPES.has(value.curve)) throw new FiguresteadConfigError("must be linear or monotone", `${path}.curve`);
  if (value.curve != null) result.curve = value.curve;
  if (value.legend != null && !LEGEND_POSITIONS.has(value.legend)) throw new FiguresteadConfigError("must be auto, top-right, top-left, bottom-right, bottom-left, outside-right, or none", `${path}.legend`);
  if (value.legend != null) result.legend = value.legend;
  for (const [key, minimum, maximum] of [["lineWidth", 0.5, 6], ["markerScale", 0.5, 2.5]]) {
    if (value[key] != null && (!isFiniteNumber(value[key]) || value[key] < minimum || value[key] > maximum)) throw new FiguresteadConfigError(`must be between ${minimum} and ${maximum}`, `${path}.${key}`);
    if (value[key] != null) result[key] = value[key];
  }
  if (value.seriesMarkers != null) {
    if (!Array.isArray(value.seriesMarkers) || !value.seriesMarkers.length) throw new FiguresteadConfigError("must be a non-empty marker array", `${path}.seriesMarkers`);
    value.seriesMarkers.forEach((marker, index) => { if (!MARKER_TYPES.has(marker)) throw new FiguresteadConfigError("must be ring, square, triangle, or diamond", `${path}.seriesMarkers[${index}]`); });
    result.seriesMarkers = [...value.seriesMarkers];
  }
  return result;
}

function normalizeEncoding(value, path, presentation) {
  const encoding = value ?? {};
  requiredObject(encoding, path);
  const interpolation = encoding.interpolation ?? presentation?.curve ?? "linear";
  if (!CURVE_TYPES.has(interpolation)) throw new FiguresteadConfigError("must be linear or monotone", `${path}.interpolation`);
  return { interpolation };
}

function normalizeView(value) {
  const view = value ?? {};
  requiredObject(view, "config.view");
  const profile = view.profile ?? "atlas", motion = view.motion ?? "legacy", ambient = view.ambient ?? "none", strategy = view.strategy ?? "auto";
  if (!["paper", "atlas", "talk"].includes(profile)) throw new FiguresteadConfigError("must be paper, atlas, or talk", "config.view.profile");
  if (!["none", "semantic", "legacy"].includes(motion)) throw new FiguresteadConfigError("must be none, semantic, or legacy", "config.view.motion");
  if (!["none", "matrix"].includes(ambient)) throw new FiguresteadConfigError("must be none or matrix", "config.view.ambient");
  if (!["auto", "none", "reveal", "points_then_connect", "bar_grow", "matrix_illuminate"].includes(strategy)) throw new FiguresteadConfigError("is not a supported motion strategy", "config.view.strategy");
  return { profile, motion, ambient, strategy };
}

function normalizeStyle(value) {
  const style = value ?? {};
  requiredObject(style, "config.style");
  const glyphs = style.glyphs ?? ["ring", "square", "triangle", "diamond"];
  if (!Array.isArray(glyphs) || !glyphs.length) throw new FiguresteadConfigError("must be a non-empty array", "config.style.glyphs");
  glyphs.forEach((glyph, index) => { if (!MARKER_TYPES.has(glyph)) throw new FiguresteadConfigError("is not a supported glyph", `config.style.glyphs[${index}]`); });
  const lineStyles = style.lineStyles ?? ["solid", "dash", "dot", "dash-dot"];
  if (!Array.isArray(lineStyles) || !lineStyles.length || lineStyles.some((item) => !["solid", "dash", "dot", "dash-dot"].includes(item))) throw new FiguresteadConfigError("must contain supported line styles", "config.style.lineStyles");
  const series = style.series ?? {};
  requiredObject(series, "config.style.series");
  return { glyphs: [...glyphs], lineStyles: [...lineStyles], series: cloneValue(series) };
}

function normalizePanel(panel, index, figureSpec, registry) {
  const path = `config.panels[${index}]`; requiredObject(panel, path); requiredString(panel.renderer, `${path}.renderer`);
  const definition = registry?.get(panel.renderer);
  const validator = definition?.validateData ?? FALLBACK_VALIDATORS[panel.renderer];
  if (!validator) throw new FiguresteadConfigError(`unknown renderer ${JSON.stringify(panel.renderer)}${registry ? `; expected ${registry.keys().join(", ")}` : ""}`, `${path}.renderer`);
  const panelSpec = panel.spec == null ? {} : panel.spec; requiredObject(panelSpec, `${path}.spec`);
  const spec = { title: panelSpec.title ?? "", subtitle: panelSpec.subtitle ?? "", xLabel: panelSpec.xLabel ?? "", yLabel: panelSpec.yLabel ?? "", description: panelSpec.description ?? "", note: panelSpec.note ?? "", signature: panelSpec.signature ?? figureSpec.signature };
  const presentation = panel.presentation == null ? null : normalizePresentation(panel.presentation, `${path}.presentation`);
  return {
    id: panel.id ?? `panel-${index + 1}`, renderer: panel.renderer, spec,
    xScale: normalizeScale(panel.xScale, `${path}.xScale`, panel.renderer === "strip_summary" ? "band" : "linear"),
    yScale: normalizeScale(panel.yScale, `${path}.yScale`, "linear"),
    annotations: Array.isArray(panel.annotations) ? cloneValue(panel.annotations) : [],
    ...(presentation == null ? {} : { presentation }),
    encoding: normalizeEncoding(panel.encoding, `${path}.encoding`, presentation),
    data: validator(panel.data, `${path}.data`),
  };
}

function validateSharedScaleCompatibility(contract) {
  for (const axis of ["X", "Y"]) {
    if (!contract.layout[`shared${axis}`]) continue;
    const key = `${axis.toLowerCase()}Scale`;
    const types = [...new Set(contract.panels.map((panel) => panel[key].type))];
    if (types.length !== 1) throw new FiguresteadConfigError(`shared${axis} requires one scale type; found ${types.join(", ")}`, `config.layout.shared${axis}`);
    if (types[0] === "band") throw new FiguresteadConfigError(`shared${axis} categorical domains are not supported in renderer API 1`, `config.layout.shared${axis}`);
  }
}

export function validateContract(input, registry = null) {
  requiredObject(input, "config");
  if (![SCHEMA_VERSION, LEGACY_SCHEMA_VERSION].includes(input.schemaVersion)) throw new FiguresteadConfigError(`unsupported schema version ${JSON.stringify(input.schemaVersion)}; expected ${SCHEMA_VERSION} or legacy ${LEGACY_SCHEMA_VERSION}`, "config.schemaVersion");
  validateTheme(input.theme);
  validateProfile(input.profile);
  validateTimeline(input.timeline);
  validateMotion(input.motion);
  const spec = normalizeSpec(input.spec), legacy = input.schemaVersion === LEGACY_SCHEMA_VERSION;
  const sourcePanels = legacy ? [{ id: "panel-1", renderer: input.renderer, spec: {}, data: input.data }] : input.panels;
  if (!Array.isArray(sourcePanels) || !sourcePanels.length) throw new FiguresteadConfigError("must be a non-empty array", "config.panels");
  if (!legacy && input.rendererApiVersion !== RENDERER_API_VERSION) throw new FiguresteadConfigError(`expected renderer API ${RENDERER_API_VERSION}`, "config.rendererApiVersion");
  const contract = cloneValue(input);
  delete contract.renderer; delete contract.data;
  contract.schemaVersion = SCHEMA_VERSION; contract.rendererApiVersion = RENDERER_API_VERSION; contract.spec = spec;
  contract.panels = sourcePanels.map((panel, index) => normalizePanel(panel, index, spec, registry));
  contract.layout = normalizeLayout(legacy ? { columns: 1 } : input.layout, contract.panels.length);
  contract.view = normalizeView(input.view);
  contract.style = normalizeStyle(input.style);
  validateSharedScaleCompatibility(contract);
  contract.sourceSchemaVersion = input.schemaVersion;
  return contract;
}

export function windowProgress(progress, window) {
  const [start, end] = window;
  if (end === start) return progress >= end ? 1 : 0;
  return Math.max(0, Math.min(1, (progress - start) / (end - start)));
}
