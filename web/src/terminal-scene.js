import { validateContract } from "./schema.js";
import { CORE_REGISTRY } from "./core-renderers.js";
import { panelContract } from "./figure.js";
import { resolvePanelDomains } from "./figure.js";
import { resolveApplicationProfile } from "./application-profiles.js";
import { legendWithStyles, resolveSeriesStyles } from "./series-style.js";
import { compileMotionPlan, assertTerminalMotionIdentity } from "./motion-plan.js";
import { auditPaperTheme, themeResolutionForProfile } from "./paper-profile.js";
import { validateEvidenceCoverage } from "./evidence-coverage.js";

export const TERMINAL_SCENE_VERSION = "figurestead.scene/1";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const markId = (panel, kind, ...parts) => [panel.id, kind, ...parts].map((item) => String(item).replace(/[^a-zA-Z0-9_.-]+/g, "-")).join("/");

function lineMarks(panel, contract, prepared, styles) {
  const marks = [];
  contract.data.series.forEach((series) => {
    const style = styles[series.key], points = prepared.points.filter((point) => point.series === series.key).sort((a, b) => a.index - b.index);
    points.forEach((point) => marks.push({
      id: markId(panel, "point", series.key, point.index), kind: "point", series: series.key,
      x: point.x, y: point.y, style,
    }));
    for (let index = 1; index < points.length; index += 1) marks.push({
      id: markId(panel, "segment", series.key, index - 1, index), kind: "segment", series: series.key,
      interpolation: contract.encoding.interpolation,
      from: { x: points[index - 1].x, y: points[index - 1].y },
      to: { x: points[index].x, y: points[index].y }, style,
    });
  });
  return marks;
}

function scatterMarks(panel, contract, prepared, styles) {
  const marks = prepared.points.map((point) => ({
    id: markId(panel, "point", point.series, point.index), kind: "point", series: point.series,
    x: point.x, y: point.y, style: styles[point.series],
  }));
  if (contract.data.summary === "linear_fit") {
    const n = prepared.points.length, sx = prepared.points.reduce((a, p) => a + p.x, 0), sy = prepared.points.reduce((a, p) => a + p.y, 0);
    const sxx = prepared.points.reduce((a, p) => a + p.x * p.x, 0), sxy = prepared.points.reduce((a, p) => a + p.x * p.y, 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), intercept = (sy - slope * sx) / n;
    marks.push({ id: markId(panel, "summary", "linear-fit"), kind: "summary-line", role: "model", slope, intercept, style: { color: contract.theme.summaryCore, edge: contract.theme.summaryEdge ?? null, lineStyle: "solid" } });
  }
  return marks;
}

function barMarks(panel, contract, prepared, styles) {
  return prepared.entries.map((entry) => ({
    id: markId(panel, "bar", entry.series, entry.category), kind: "bar", series: entry.series,
    category: entry.category, value: entry.value, missing: entry.missing,
    orientation: contract.data.orientation, layer: entry.layer, seriesIndex: entry.seriesIndex,
    categoryIndex: entry.categoryIndex, style: styles[entry.series],
  }));
}

function matrixMarks(panel, contract, prepared) {
  const style = { color: contract.theme.primary, low: contract.theme.panel, high: contract.theme.summaryCore, edge: contract.theme.spine };
  return prepared.points.map((point) => ({
    id: markId(panel, "cell", point.yCategory, point.xCategory), kind: "cell",
    xCategory: point.xCategory, yCategory: point.yCategory, value: point.value,
    status: point.status, label: point.label, diagonalMode: contract.data.diagonalMode, style,
  }));
}

function fallbackMarks(panel, prepared, styles) {
  return (prepared.points ?? []).map((point, index) => {
    const series = String(point.series ?? "series");
    return { id: markId(panel, "mark", series, point.id ?? point.index ?? index), kind: "renderer-mark", series, evidence: { ...point }, style: styles[series] ?? null };
  });
}

function compileMarks(panel, child, prepared, styles, definition, context = {}) {
  if (typeof definition.compileScene === "function") {
    const compiled = definition.compileScene({ panel, contract: child, prepared, styles, markId, ...context });
    if (!compiled || !Array.isArray(compiled.marks)) throw new TypeError(`renderer ${panel.renderer}.compileScene must return { marks }`);
    return compiled;
  }
  if (panel.renderer === "line") return lineMarks(panel, child, prepared, styles);
  if (panel.renderer === "scatter") return scatterMarks(panel, child, prepared, styles);
  if (["categorical_bar", "categorical_layered_bar"].includes(panel.renderer)) return barMarks(panel, child, prepared, styles);
  if (panel.renderer === "categorical_matrix") return matrixMarks(panel, child, prepared);
  return { marks: fallbackMarks(panel, prepared, styles) };
}

function seriesKeys(child) {
  if (Array.isArray(child.data.series) && child.data.series.length && typeof child.data.series[0] === "object") return child.data.series.map((item) => item.key);
  if (Array.isArray(child.data.series)) return [...new Set(child.data.series.map(String))];
  return [];
}

function profilePresentation(profile) {
  return {
    panelSurface: profile.panelSurface,
    frame: profile.frame,
    legend: profile.legend === "outside" ? "outside-right" : profile.legend === "auto" ? "auto" : "bottom-right",
    lineWidth: profile.lineWidth,
    markerScale: profile.markerScale,
  };
}

export function compileFigureModel(input, options = {}) {
  const registry = options.registry ?? CORE_REGISTRY;
  const contract = validateContract(input, registry);
  const applicationProfile = resolveApplicationProfile(contract.view.profile);
  contract.applicationProfile = applicationProfile;
  const themeResolution = themeResolutionForProfile(contract.theme, applicationProfile);
  contract.theme = themeResolution.theme;
  if (input.view?.profile && input.view.motion == null) contract.view.motion = applicationProfile.motion;
  if (input.view?.profile && input.view.ambient == null) contract.view.ambient = applicationProfile.ambient;
  if (input.view?.profile && input.view.strategy == null) contract.view.strategy = contract.view.motion === "semantic" ? "auto" : "none";
  contract.panels = contract.panels.map((panel) => ({
    ...panel,
    presentation: { ...profilePresentation(applicationProfile), ...(panel.presentation ?? {}) },
  }));
  const styles = resolveSeriesStyles(contract);
  contract.seriesStyles = styles;
  contract.appearanceReport = applicationProfile.key === "paper" ? {
    resolution: themeResolution.report,
    audit: auditPaperTheme(contract.theme, styles),
  } : null;
  const preparedPanels = contract.panels.map((panel) => {
    const definition = registry.get(panel.renderer), child = panelContract(contract, panel);
    return { panel, definition, contract: child, prepared: definition.prepare(child) };
  });
  const domains = resolvePanelDomains(contract, preparedPanels);
  const panels = preparedPanels.map(({ panel, definition, contract: child, prepared }, panelIndex) => {
    const keys = seriesKeys(child), legend = prepared.legend ?? keys.map((key, colorIndex) => ({ key, label: key, colorIndex }));
    const compiled = compileMarks(panel, child, prepared, styles, definition, { panelIndex, figure: contract });
    const defaultMarks = Array.isArray(compiled) ? compiled : compiled.marks;
    const defaultCategories = {
      x: child.data.xCategories ?? (child.data.orientation === "vertical" ? child.data.categories : null),
      y: child.data.yCategories ?? (child.data.orientation === "horizontal" ? child.data.categories : null),
    };
    return {
      id: panel.id, renderer: panel.renderer, family: definition.family,
      spec: child.spec, scales: compiled.scales ?? { x: child.xScale, y: child.yScale }, encoding: child.encoding,
      domain: domains[panelIndex], presentation: child.presentation,
      categories: compiled.categories ?? defaultCategories,
      categoryLabels: compiled.categoryLabels ?? null,
      orientation: compiled.orientation ?? child.data.orientation ?? null,
      valueScale: child.data.valueScale ?? null,
      denominator: child.data.denominator ?? child.data.n ?? null,
      annotations: child.annotations ?? [],
      notes: [child.spec.note, ...(child.annotations ?? []).filter((item) => item?.type === "scientific_note").map((item) => item.text)].filter(Boolean),
      legend: compiled.legend ?? legendWithStyles(legend, keys, styles),
      meta: compiled.meta ?? null,
      marks: defaultMarks,
    };
  });
  const scene = {
    schemaVersion: TERMINAL_SCENE_VERSION,
    contractSchemaVersion: contract.schemaVersion,
    rendererApiVersion: contract.rendererApiVersion,
    spec: contract.spec,
    applicationProfile,
    view: contract.view, layout: contract.layout, profile: contract.profile,
    timeline: contract.timeline, motion: contract.motion, style: contract.style,
    theme: contract.theme,
    appearanceReport: contract.appearanceReport,
    seriesStyles: styles,
    panels,
  };
  scene.evidenceCoverage = validateEvidenceCoverage(panels);
  scene.motionPlan = compileMotionPlan(scene, contract.view);
  assertTerminalMotionIdentity(scene.motionPlan, scene);
  deepFreeze(scene);
  return Object.freeze({ contract, scene, preparedPanels, domains });
}

export function compileTerminalScene(input, options = {}) {
  return compileFigureModel(input, options).scene;
}

export function terminalEvidence(scene) {
  return scene.panels.map((panel) => ({ panelId: panel.id, marks: panel.marks.map((mark) => ({ ...mark })) }));
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
}

export function canonicalTerminalEvidence(scene) {
  return sorted({
    schemaVersion: scene.schemaVersion,
    contractSchemaVersion: scene.contractSchemaVersion,
    spec: { title: scene.spec.title, description: scene.spec.description, note: scene.spec.note },
    seriesIdentity: Object.fromEntries(Object.entries(scene.seriesStyles).map(([key, style]) => [key, {
      key, glyph: style.glyph, lineStyle: style.lineStyle,
    }])),
    panels: scene.panels.map((panel) => ({
      id: panel.id, renderer: panel.renderer, encoding: panel.encoding, domain: panel.domain,
      categories: panel.categories, denominator: panel.denominator, notes: panel.notes,
      ...(panel.categoryLabels ? { categoryLabels: panel.categoryLabels } : {}),
      marks: panel.marks.map(({ style: _style, ...mark }) => mark),
    })),
  });
}

export function evidenceFingerprint(scene) {
  const text = JSON.stringify(canonicalTerminalEvidence(scene));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
