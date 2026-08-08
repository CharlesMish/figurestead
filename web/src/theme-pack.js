import { cloneValue, FiguresteadConfigError } from "./schema.js";
import { colorContrast } from "./color-space.js";
import { auditPaperTheme, resolvePaperTheme, themeResolutionForProfile } from "./paper-profile.js";

export const THEME_PACK_VERSION = "figurestead.theme-pack/1";
export const PALETTE_PACK_VERSION = "figurestead.palette-pack/2";
const COLOR = /^#[0-9a-fA-F]{6}$/;
const THEME_KEY = /^[a-z][a-z0-9_]*$/;
const REQUIRED = ["field", "panel", "grid", "spine", "label", "secondary", "faint", "primary", "summaryCore", "warm"];
const OPTIONAL = ["primaryEdge", "summaryEdge", "seriesEdges"];
const THEME_FIELDS = new Set(["key", "name", ...REQUIRED, "series", ...OPTIONAL]);
const AUTHORING_THEME_FIELDS = new Set([
  ...THEME_FIELDS,
  "summary_core", "primary_edge", "summary_edge", "series_edges",
]);
const RUNTIME_THEME_FIELDS = new Set([...THEME_FIELDS, "mode"]);
const AUTHORING_ALIASES = [
  ["summary_core", "summaryCore"],
  ["primary_edge", "primaryEdge"],
  ["summary_edge", "summaryEdge"],
  ["series_edges", "seriesEdges"],
];
const RUNTIME_MODES = new Set(["paper", "atlas", "talk"]);

function hexChannels(value) { return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)); }
function mixHex(left, right, amount) {
  const a = hexChannels(left), b = hexChannels(right), t = Math.max(0, Math.min(1, amount));
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * t).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function object(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FiguresteadConfigError("must be an object", path);
}

function hasOwn(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }

function exactFields(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new FiguresteadConfigError("is not an allowed field", `${path}.${key}`);
  }
}

function nonEmptyString(value, path) {
  if (typeof value !== "string" || !value.trim()) throw new FiguresteadConfigError("must be a non-empty string", path);
  return value.trim();
}

function color(value, path) {
  if (typeof value !== "string" || !COLOR.test(value)) throw new FiguresteadConfigError("must be a #RRGGBB color", path);
  return value.toUpperCase();
}

function normalizedTheme(key, source, path, { requireKey = false, aliases = false, runtime = false } = {}) {
  object(source, path);
  exactFields(source, runtime ? RUNTIME_THEME_FIELDS : aliases ? AUTHORING_THEME_FIELDS : THEME_FIELDS, path);
  if (aliases) for (const [snake, camel] of AUTHORING_ALIASES) {
    if (hasOwn(source, snake) && hasOwn(source, camel)) throw new FiguresteadConfigError("must use exactly one alias spelling", `${path}.${camel}`);
  }
  if (requireKey && !hasOwn(source, "key")) throw new FiguresteadConfigError("is required", `${path}.key`);
  if (hasOwn(source, "key") && source.key !== key) throw new FiguresteadConfigError("must equal its theme map key", `${path}.key`);
  const name = nonEmptyString(source.name, `${path}.name`);
  const pick = (camel, snake) => aliases && hasOwn(source, snake) ? source[snake] : source[camel];
  const theme = { key, name };
  if (runtime && hasOwn(source, "mode")) {
    if (!RUNTIME_MODES.has(source.mode)) throw new FiguresteadConfigError("must be paper, atlas, or talk", `${path}.mode`);
    theme.mode = source.mode;
  }
  REQUIRED.forEach((token) => {
    const snake = token === "summaryCore" ? "summary_core" : token;
    theme[token] = color(pick(token, snake), `${path}.${aliases && hasOwn(source, snake) ? snake : token}`);
  });
  if (!Array.isArray(source.series) || !source.series.length) throw new FiguresteadConfigError("must be a non-empty color array", `${path}.series`);
  theme.series = source.series.map((item, index) => color(item, `${path}.series[${index}]`));
  for (const [camel, snake] of [["primaryEdge", "primary_edge"], ["summaryEdge", "summary_edge"]]) {
    const value = pick(camel, snake);
    if (value != null) theme[camel] = color(value, `${path}.${aliases && hasOwn(source, snake) ? snake : camel}`);
  }
  const seriesEdges = pick("seriesEdges", "series_edges");
  const seriesEdgesPath = `${path}.${aliases && hasOwn(source, "series_edges") ? "series_edges" : "seriesEdges"}`;
  if (seriesEdges != null) {
    if (!Array.isArray(seriesEdges) || seriesEdges.length !== theme.series.length) throw new FiguresteadConfigError(`must contain exactly ${theme.series.length} colors`, seriesEdgesPath);
    theme.seriesEdges = seriesEdges.map((item, index) => color(item, `${seriesEdgesPath}[${index}]`));
  }
  return theme;
}

function validatePack(input, { authoring }) {
  const path = authoring ? "themeAuthoring" : "themePack";
  object(input, path);
  exactFields(input, new Set(authoring
    ? ["schema_version", "schemaVersion", "name", "themes", "drafts"]
    : ["schemaVersion", "name", "themes", "drafts"]), path);
  if (authoring && hasOwn(input, "schema_version") && hasOwn(input, "schemaVersion")) {
    throw new FiguresteadConfigError("must use exactly one version spelling", `${path}.schemaVersion`);
  }
  const versionKey = authoring && hasOwn(input, "schema_version") ? "schema_version" : "schemaVersion";
  if (!hasOwn(input, versionKey) || input[versionKey] !== THEME_PACK_VERSION) {
    throw new FiguresteadConfigError(`expected ${THEME_PACK_VERSION}`, `${path}.${versionKey}`);
  }
  const name = nonEmptyString(input.name, `${path}.name`);
  object(input.themes, `${path}.themes`);
  const keys = Object.keys(input.themes);
  if (!keys.length) throw new FiguresteadConfigError("must contain at least one active theme", `${path}.themes`);
  for (const key of keys) if (!THEME_KEY.test(key)) throw new FiguresteadConfigError("must match ^[a-z][a-z0-9_]*$", `${path}.themes.${key}`);
  const themes = Object.fromEntries(keys.sort().map((key) => [key, normalizedTheme(
    key, input.themes[key], `${path}.themes.${key}`,
    { requireKey: !authoring, aliases: authoring },
  )]));
  const drafts = input.drafts ?? {}; object(drafts, `${path}.drafts`);
  return { schemaVersion: THEME_PACK_VERSION, name, themes, drafts: cloneValue(drafts) };
}

export function validateAuthoredThemePack(input) {
  return validatePack(input, { authoring: true });
}

export function validateThemePack(input) {
  return validatePack(input, { authoring: false });
}

/** Legacy mapping-only compatibility normalization; not an official file loader. */
export function normalizeThemePackLenient(input) {
  object(input, "themePackLenient");
  const version = input.schemaVersion ?? input.schema_version;
  if (version !== THEME_PACK_VERSION) throw new FiguresteadConfigError(`expected ${THEME_PACK_VERSION}`, "themePackLenient.schemaVersion");
  object(input.themes, "themePackLenient.themes");
  const keys = Object.keys(input.themes);
  if (!keys.length) throw new FiguresteadConfigError("must contain at least one active theme", "themePackLenient.themes");
  const themes = Object.fromEntries(keys.sort().map((key) => {
    const source = input.themes[key];
    object(source, `themePackLenient.themes.${key}`);
    const value = { ...source, key, name: source.name ?? key };
    for (const [snake, camel] of AUTHORING_ALIASES) if (!hasOwn(value, camel) && hasOwn(value, snake)) value[camel] = value[snake];
    return [key, normalizedTheme(key, Object.fromEntries(Object.entries(value).filter(([field]) => RUNTIME_THEME_FIELDS.has(field))), `themePackLenient.themes.${key}`, { runtime: true })];
  }));
  const drafts = input.drafts ?? {}; object(drafts, "themePackLenient.drafts");
  return { schemaVersion: THEME_PACK_VERSION, name: String(input.name || "Figurestead theme pack"), themes, drafts: cloneValue(drafts) };
}

function normalizeRuntimeTheme(key, source, path) {
  return normalizedTheme(key, source, path, { runtime: true });
}

function canonicalMap(value, path) {
  if (Array.isArray(value)) {
    if (value.length < 5) throw new FiguresteadConfigError("must contain at least five canonical colors", path);
    return Object.fromEntries(value.map((item, index) => [String(index), color(item, `${path}[${index}]`)]));
  }
  object(value, path);
  const entries = Object.entries(value);
  if (entries.length < 5) throw new FiguresteadConfigError("must contain at least five canonical colors", path);
  return Object.fromEntries(entries.map(([key, item]) => [key, color(item, `${path}.${key}`)]));
}

function paletteColor(value, canonical, path) {
  if (typeof value !== "string") throw new FiguresteadConfigError("must be a color or canonical reference", path);
  if (COLOR.test(value)) return color(value, path);
  const key = value.replace(/^\$?canonical\./, "");
  if (!canonical[key]) throw new FiguresteadConfigError("references an unknown canonical color", path);
  return canonical[key];
}

function deriveRole(roles, key, value, derived) {
  if (roles[key]) return roles[key];
  derived.push({ token: key, method: value.method, sources: value.sources });
  return value.color;
}

function compilePalette(key, source, path, mode = "atlas") {
  object(source, path);
  const canonical = canonicalMap(source.canonical, `${path}.canonical`), modeSource = source.modes?.[mode] ?? {};
  object(source.roles ?? {}, `${path}.roles`); object(modeSource, `${path}.modes.${mode}`);
  const raw = { ...(source.roles ?? {}), ...modeSource };
  const roles = Object.fromEntries(Object.entries(raw).map(([role, value]) => [role, paletteColor(value, canonical, `${path}.roles.${role}`)]));
  const modeRoles = Object.fromEntries(Object.entries(modeSource).map(([role, value]) => [role, paletteColor(value, canonical, `${path}.modes.${mode}.${role}`)]));
  const values = Object.values(canonical), field = mode === "paper" ? (modeRoles.field ?? "#FFFFFF") : (roles.field ?? values[0]);
  const panel = mode === "paper" ? (modeRoles.panel ?? "#F7F7F5") : (roles.panel ?? values[1]);
  const primary = roles.primary ?? values[2], label = mode === "paper" ? (modeRoles.label ?? "#1C2422") : (roles.label ?? values[3]);
  const summaryCore = roles.summaryCore ?? values[4], derived = [];
  const theme = {
    key, name: String(source.name ?? key), field, panel, primary, label, summaryCore,
    grid: deriveRole(roles, "grid", { color: mixHex(panel, label, mode === "paper" ? 0.17 : 0.2), method: "mix", sources: ["panel", "label"] }, derived),
    spine: deriveRole(roles, "spine", { color: mixHex(panel, label, 0.34), method: "mix", sources: ["panel", "label"] }, derived),
    secondary: deriveRole(roles, "secondary", { color: mixHex(label, panel, 0.3), method: "mix", sources: ["label", "panel"] }, derived),
    faint: deriveRole(roles, "faint", { color: mixHex(label, field, 0.58), method: "mix", sources: ["label", "field"] }, derived),
    warm: deriveRole(roles, "warm", { color: summaryCore, method: "alias", sources: ["summaryCore"] }, derived),
  };
  const qualitative = source.qualitative ?? values.slice(2);
  if (!Array.isArray(qualitative) || !qualitative.length) throw new FiguresteadConfigError("must be a non-empty array", `${path}.qualitative`);
  theme.series = qualitative.map((item, index) => paletteColor(item, canonical, `${path}.qualitative[${index}]`));
  if (source.edges != null) {
    if (!Array.isArray(source.edges) || source.edges.length !== theme.series.length) throw new FiguresteadConfigError(`must contain exactly ${theme.series.length} colors`, `${path}.edges`);
    theme.seriesEdges = source.edges.map((item, index) => paletteColor(item, canonical, `${path}.edges[${index}]`));
  }
  const normalizedTheme = { ...normalizeRuntimeTheme(key, theme, path), mode };
  const paperResolution = mode === "paper" ? resolvePaperTheme(normalizedTheme) : null;
  return { theme: paperResolution?.theme ?? normalizedTheme, canonical, scales: {
    qualitative: [...theme.series],
    sequential: (source.sequential ?? [panel, primary, summaryCore]).map((item, index) => paletteColor(item, canonical, `${path}.sequential[${index}]`)),
    diverging: (source.diverging ?? [primary, panel, summaryCore]).map((item, index) => paletteColor(item, canonical, `${path}.diverging[${index}]`)),
  }, derived, ...(paperResolution ? { paperReport: paperResolution.report } : {}) };
}

export function validatePalettePack(input) {
  object(input, "palettePack");
  if (input.schemaVersion !== PALETTE_PACK_VERSION) throw new FiguresteadConfigError(`expected ${PALETTE_PACK_VERSION}`, "palettePack.schemaVersion");
  object(input.palettes, "palettePack.palettes");
  const keys = Object.keys(input.palettes).sort();
  if (!keys.length) throw new FiguresteadConfigError("must contain at least one palette", "palettePack.palettes");
  const palettes = Object.fromEntries(keys.map((key) => [key, {
    atlas: compilePalette(key, input.palettes[key], `palettePack.palettes.${key}`, "atlas"),
    paper: compilePalette(key, input.palettes[key], `palettePack.palettes.${key}`, "paper"),
    talk: compilePalette(key, input.palettes[key], `palettePack.palettes.${key}`, "talk"),
  }]));
  return { schemaVersion: PALETTE_PACK_VERSION, name: String(input.name || "Figurestead palette pack"), palettes };
}

export function resolvePalette(pack, key, options = {}) {
  const normalized = validatePalettePack(pack), mode = options.mode ?? "atlas";
  if (!normalized.palettes[key]) throw new FiguresteadConfigError(`unknown palette; choose ${Object.keys(normalized.palettes).join(", ")}`, `palettePack.palettes.${key}`);
  if (!normalized.palettes[key][mode]) throw new FiguresteadConfigError("mode must be paper, atlas, or talk", "palettePack.mode");
  return cloneValue(normalized.palettes[key][mode]);
}

export function resolveTheme(pack, key) {
  const normalized = validateThemePack(pack);
  if (normalized.drafts[key] && !normalized.themes[key]) throw new FiguresteadConfigError("is a disabled draft and cannot be resolved", `themePack.drafts.${key}`);
  if (!normalized.themes[key]) throw new FiguresteadConfigError(`unknown active theme; choose ${Object.keys(normalized.themes).join(", ")}`, `themePack.themes.${key}`);
  return cloneValue(normalized.themes[key]);
}

export function applyTheme(contract, theme) {
  const result = cloneValue(contract);
  result.theme = normalizeRuntimeTheme(theme.key, theme, "theme");
  return result;
}

/** Resolve authored evidence onto the selected application surface. */
export function themeForProfile(theme, profile = "atlas") {
  const source = normalizeRuntimeTheme(theme.key, theme, "theme");
  return cloneValue(themeResolutionForProfile(source, profile).theme);
}

export async function loadThemePack(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new FiguresteadConfigError(`request returned ${response.status}`, "themePack.url");
  return validateThemePack(await response.json());
}

export function contrastRatio(left, right) {
  return colorContrast(left, right);
}

export function contrastAudit(theme) {
  if (theme.mode === "paper") return auditPaperTheme(theme).findings;
  const findings = [];
  for (const [surfaceName, surface] of [["field", theme.field], ["panel", theme.panel]]) {
    for (const [token, minimum] of [["label", 4.5], ["secondary", 4.5], ["primary", 3], ["summaryCore", 3]]) {
      const ratio = contrastRatio(theme[token], surface);
      if (ratio < minimum) findings.push({ level: "warning", token, surface: surfaceName, ratio: Number(ratio.toFixed(2)), minimum });
    }
  }
  theme.series.forEach((item, index) => {
    const ratio = contrastRatio(item, theme.panel);
    if (ratio < 3 && !theme.seriesEdges?.[index]) findings.push({ level: "warning", token: `series[${index}]`, surface: "panel", ratio: Number(ratio.toFixed(2)), minimum: 3 });
  });
  return findings;
}
