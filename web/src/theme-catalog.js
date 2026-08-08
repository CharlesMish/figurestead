import { contrastAudit, validateThemePack } from "./theme-pack.js";
import { cloneValue } from "./schema.js";

export const THEME_CATALOG_VERSION = "figurestead.theme-catalog/1";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function mergeThemePacks(packs, options = {}) {
  if (!Array.isArray(packs) || !packs.length) throw new TypeError("mergeThemePacks requires one or more theme packs");
  const themes = {}, sources = {};
  packs.forEach((source, index) => {
    const pack = validateThemePack(source);
    Object.entries(pack.themes).forEach(([key, theme]) => {
      if (themes[key]) throw new TypeError(`duplicate theme key ${key} in ${pack.name} and ${sources[key]}`);
      themes[key] = theme; sources[key] = pack.name || `pack-${index + 1}`;
    });
  });
  return deepFreeze({ schemaVersion: THEME_CATALOG_VERSION, name: options.name ?? "Figurestead theme catalog", themes, sources });
}

export function auditThemeCatalog(catalog) {
  if (!catalog || catalog.schemaVersion !== THEME_CATALOG_VERSION) throw new TypeError("auditThemeCatalog requires a Figurestead theme catalog");
  const themes = Object.entries(catalog.themes).map(([key, theme]) => ({ key, source: catalog.sources[key], findings: contrastAudit(theme) }));
  return deepFreeze({ themes, total: themes.length, warnings: themes.reduce((count, item) => count + item.findings.length, 0), clean: themes.every((item) => item.findings.length === 0) });
}

export function catalogThemePack(catalog) {
  if (!catalog || catalog.schemaVersion !== THEME_CATALOG_VERSION) throw new TypeError("catalogThemePack requires a Figurestead theme catalog");
  return { schemaVersion: "figurestead.theme-pack/1", name: catalog.name, themes: cloneValue(catalog.themes), drafts: {} };
}
