import { cloneValue } from "./schema.js";

export const SERIES_STYLE_VERSION = "figurestead.series-style/1";
export const GLYPH_CYCLE = Object.freeze(["ring", "square", "triangle", "diamond"]);
export const LINE_STYLE_CYCLE = Object.freeze(["solid", "dash", "dot", "dash-dot"]);
export const HATCH_CYCLE = Object.freeze(["none", "diag", "cross", "vertical"]);

function seriesKeys(panel) {
  const data = panel.data ?? {};
  if (Array.isArray(data.series)) {
    if (data.series.length && typeof data.series[0] === "object") return data.series.map((item) => String(item.key));
    return [...new Set(data.series.map(String))];
  }
  if (Array.isArray(data.entries)) return [...new Set(data.entries.map((item) => String(item.series ?? "series")))];
  if (panel.renderer === "categorical_matrix") return ["value"];
  return ["series"];
}

export function collectSeriesKeys(contract) {
  const keys = [];
  contract.panels.forEach((panel) => seriesKeys(panel).forEach((key) => { if (!keys.includes(key)) keys.push(key); }));
  return keys;
}

export function resolveSeriesStyles(contract) {
  const markers = contract.style?.glyphs ?? GLYPH_CYCLE;
  const lineStyles = contract.style?.lineStyles ?? LINE_STYLE_CYCLE;
  const overrides = contract.style?.series ?? {};
  return Object.freeze(Object.fromEntries(collectSeriesKeys(contract).map((key, index) => {
    const colorIndex = index % contract.theme.series.length;
    const base = {
      key,
      colorIndex,
      color: contract.theme.series[colorIndex],
      edge: contract.theme.seriesEdges?.[colorIndex] ?? null,
      glyph: markers[index % markers.length],
      lineStyle: lineStyles[Math.floor(index / Math.max(1, markers.length)) % lineStyles.length],
      hatch: HATCH_CYCLE[index % HATCH_CYCLE.length],
      lineWidth: contract.applicationProfile?.lineWidth ?? contract.panels[0]?.presentation?.lineWidth ?? 1.35,
    };
    return [key, Object.freeze({ ...base, ...(overrides[key] ?? {}) })];
  })));
}

export function styleForSeries(env, key, fallbackIndex = 0) {
  const resolved = env.figure?.seriesStyles?.[String(key)] ?? env.seriesStyles?.[String(key)];
  if (resolved) return resolved;
  const theme = env.contract.theme, colorIndex = fallbackIndex % theme.series.length;
  return {
    key: String(key), colorIndex, color: theme.series[colorIndex],
    edge: theme.seriesEdges?.[colorIndex] ?? null,
    glyph: env.contract.presentation?.seriesMarkers?.[fallbackIndex % Math.max(1, env.contract.presentation.seriesMarkers.length)] ?? GLYPH_CYCLE[fallbackIndex % GLYPH_CYCLE.length],
    lineStyle: "solid", hatch: HATCH_CYCLE[fallbackIndex % HATCH_CYCLE.length], lineWidth: env.contract.presentation?.lineWidth ?? 1.35,
  };
}

export function legendWithStyles(legend, keys, styles) {
  return legend.map((item, index) => ({ ...cloneValue(item), key: keys[index] ?? item.key ?? String(index), style: styles[keys[index] ?? item.key ?? String(index)] ?? null }));
}
