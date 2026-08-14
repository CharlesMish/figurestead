import {
  CORE_REGISTRY,
  applyMotionRecipe,
  compileTerminalScene,
  createFigurestead,
  evidenceFingerprint,
  loadThemePack,
  resolveSeriesStyles,
  resolveTheme,
} from "../web/src/index.js";
import { TEMPORAL_RENDERERS } from "../web/src/extensions/temporal/index.js";
import { MACHADO_SEVERITY_1, renderCvdSimulation } from "./cvd-simulation.js";

const profile = Object.freeze({
  key: "deep_scope", name: "Deep Scope", marker: "ring_core", markerSize: 42,
  markerAlpha: 0.84, edgeWidth: 1.05, coreFraction: 0.12, pointGlow: false,
  gridX: true, gridY: true, gridAlpha: 0.42, rainDensity: 0,
  rainAlpha: 0, summaryGlow: false,
});
const timeline = Object.freeze({
  rainIn: [0.04, 0.14], marksEnter: [0.08, 0.70],
  summaryCompiles: [0.68, 0.86], rainOut: [0.72, 0.90], settle: [0.90, 1],
});
const motion = Object.freeze({
  frames: 72, fps: 24, rainStreams: 0, rainGlyphs: 0,
  lightingPeak: 0.035, trailAlpha: 0.12, seed: 2409, durationMs: 2200,
});
const style = Object.freeze({
  glyphs: ["ring", "square", "triangle", "diamond"],
  lineStyles: ["solid", "dash", "dot", "dash-dot"],
  series: {},
});
const base = (theme, spec, panel) => ({
  schemaVersion: "0.4", rendererApiVersion: "1", theme, profile, timeline, motion, style,
  spec: { subtitle: "", xLabel: "", yLabel: "", note: "", signature: "figurestead · synthetic", description: "", ...spec },
  layout: { type: "grid", columns: 1, gap: 18, sharedX: false, sharedY: false },
  view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
  panels: [{
    id: "panel-1",
    spec: {
      title: spec.title ?? "",
      subtitle: spec.subtitle ?? "",
      xLabel: spec.xLabel ?? "",
      yLabel: spec.yLabel ?? "",
      description: spec.description ?? "",
    },
    annotations: [],
    encoding: { interpolation: "linear" },
    presentation: { panelSurface: true, frame: true, legend: "auto", lineWidth: 1.8, markerScale: 0.92 },
    ...panel,
  }],
});

const siteKeys = ["headwater", "forest", "agricultural", "urban", "estuary"];
const siteLabels = Object.freeze({
  headwater: "Headwater",
  forest: "Forest tributary",
  agricultural: "Agricultural fork",
  urban: "Urban reach",
  estuary: "Estuary",
});
const siteCodes = Object.freeze({
  headwater: "HW",
  forest: "FT",
  agricultural: "AF",
  urban: "UR",
  estuary: "ES",
});
const responseX = Array.from({ length: 18 }, (_, index) => index);
const responseSeries = Object.freeze([
  { key: "headwater", label: siteLabels.headwater, y: [0.12,0.17,0.25,0.42,0.66,0.88,1.04,1.12,1.06,0.91,0.74,0.59,0.47,0.39,0.33,0.29,0.25,0.22] },
  { key: "forest", label: siteLabels.forest, y: [0.18,0.22,0.30,0.49,0.72,0.95,1.15,1.25,1.18,1.01,0.83,0.66,0.52,0.43,0.36,0.31,0.27,0.24] },
  { key: "agricultural", label: siteLabels.agricultural, y: [0.28,0.39,0.61,0.91,1.22,1.49,1.68,1.72,1.61,1.42,1.18,0.96,0.78,0.65,0.54,0.46,0.40,0.36] },
  { key: "urban", label: siteLabels.urban, y: [0.34,0.58,0.92,1.31,1.63,1.82,1.89,1.77,1.55,1.32,1.11,0.94,0.80,0.69,0.60,0.53,0.47,0.43] },
  { key: "estuary", label: siteLabels.estuary, y: [0.20,0.24,0.31,0.45,0.62,0.80,0.99,1.18,1.33,1.41,1.38,1.29,1.16,1.03,0.90,0.78,0.68,0.59] },
]);

const themePack = await loadThemePack("../src/figurestead/themes/slipware.json");
const theme = resolveTheme(themePack, "slipware");
const temporalRegistry = CORE_REGISTRY.with(...TEMPORAL_RENDERERS);

const denseLineBase = base(theme, {
  title: "Synthetic storm response across five watershed sites",
  subtitle: "Deterministic modeled turbidity response after one rainfall pulse",
  xLabel: "hours after rainfall onset", yLabel: "standardized turbidity response",
  note: "Synthetic values; site identities use hue + marker + dash redundancy.",
  description: "Five deterministic synthetic monitoring-site series across eighteen intervals.",
}, {
  renderer: "line", xScale: { type: "linear" }, yScale: { type: "linear", domain: [0, 2.05] },
  data: { x: responseX, revealOrder: "x", series: responseSeries },
  presentation: { panelSurface: true, frame: true, legend: "outside-right", lineWidth: 1.9, markerScale: 0.88 },
});
const resolvedReportStyles = resolveSeriesStyles(denseLineBase);
const reportKeyItems = document.querySelector("#report-key-items");
const lineDash = Object.freeze({ solid: "", dash: "7 4", dot: "2 4", "dash-dot": "8 3 2 3" });
const markerNode = (glyph, color) => {
  const namespace = "http://www.w3.org/2000/svg";
  const node = document.createElementNS(namespace, glyph === "ring" ? "circle" : glyph === "square" ? "rect" : "path");
  if (glyph === "ring") { node.setAttribute("cx", "17"); node.setAttribute("cy", "8"); node.setAttribute("r", "4"); }
  else if (glyph === "square") { node.setAttribute("x", "13"); node.setAttribute("y", "4"); node.setAttribute("width", "8"); node.setAttribute("height", "8"); }
  else if (glyph === "triangle") node.setAttribute("d", "M17 3.5 21.5 12 12.5 12Z");
  else node.setAttribute("d", "M17 3 22 8 17 13 12 8Z");
  node.setAttribute("fill", "#f1eee5"); node.setAttribute("stroke", color); node.setAttribute("stroke-width", "1.8");
  node.dataset.glyph = glyph;
  return node;
};
siteKeys.forEach((key) => {
  const resolved = resolvedReportStyles[key];
  const item = document.createElement("span"); item.className = "report-key-item"; item.setAttribute("role", "listitem");
  item.dataset.series = key; item.dataset.color = resolved.color; item.dataset.glyph = resolved.glyph; item.dataset.lineStyle = resolved.lineStyle;
  const sample = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  sample.classList.add("report-key-sample"); sample.setAttribute("viewBox", "0 0 34 16"); sample.setAttribute("aria-hidden", "true");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", "1"); line.setAttribute("x2", "33"); line.setAttribute("y1", "8"); line.setAttribute("y2", "8");
  line.setAttribute("stroke", resolved.color); line.setAttribute("stroke-width", String(resolved.lineWidth));
  line.setAttribute("stroke-dasharray", lineDash[resolved.lineStyle]); line.dataset.lineStyle = resolved.lineStyle;
  sample.append(line, markerNode(resolved.glyph, resolved.color));
  const label = document.createElement("span"); label.textContent = `${siteCodes[key]} · ${siteLabels[key]}`;
  item.append(sample, label); reportKeyItems.append(item);
});

const scatterBase = base(theme, {
  title: "Rainfall–response relationship",
  subtitle: "Six synthetic events per monitoring site",
  xLabel: "event rainfall (mm)", yLabel: "peak turbidity index",
  note: "Synthetic grouped observations with one shared linear fit.",
}, {
  renderer: "scatter", xScale: { type: "linear", domain: [12, 76] }, yScale: { type: "linear", domain: [0.2, 2.5] },
  data: {
    x: [18,27,39,48,60,72, 16,25,37,46,58,69, 14,24,35,45,57,68, 15,23,34,44,56,66, 20,30,41,51,62,74],
    y: [0.38,0.57,0.82,1.04,1.28,1.45, 0.44,0.66,0.91,1.17,1.42,1.61, 0.63,0.88,1.21,1.52,1.83,2.08, 0.75,1.02,1.39,1.72,2.08,2.31, 0.52,0.74,1.03,1.30,1.55,1.78],
    series: siteKeys.flatMap((key) => Array(6).fill(key)), seriesLabels: siteLabels, summary: "linear_fit",
  },
  presentation: { panelSurface: true, frame: true, legend: "none", markerScale: 0.94 },
});

const stripValues = Object.freeze({
  headwater: [0.18,0.22,0.24,0.29,0.31,0.35],
  forest: [0.26,0.30,0.34,0.37,0.41,0.45],
  agricultural: [0.62,0.70,0.76,0.82,0.91,1.02],
  urban: [0.48,0.55,0.61,0.68,0.72,0.80],
  estuary: [0.39,0.44,0.50,0.56,0.63,0.69],
});
const stripBase = base(theme, {
  title: "Nitrate distribution by site",
  subtitle: "Six deterministic synthetic replicate samples per site",
  xLabel: "monitoring site", yLabel: "nitrate (mg/L as N)",
  note: "Synthetic values; horizontal rules show site medians.",
}, {
  renderer: "strip_summary", xScale: { type: "band" }, yScale: { type: "linear", domain: [0.1, 1.1] },
  data: {
    groups: siteKeys,
    values: siteKeys.flatMap((key) => stripValues[key]),
    group: siteKeys.flatMap((key) => Array(stripValues[key].length).fill(key)),
    series: siteKeys.flatMap((key) => Array(stripValues[key].length).fill(key)),
    seriesLabels: siteLabels, summary: "median",
  },
  presentation: { panelSurface: true, frame: true, legend: "none", markerScale: 0.82 },
});

const coverageDates = [
  "2021-02-08","2021-02-08","2021-04-19","2021-06-11","2021-06-11","2021-09-23","2021-11-04",
  "2022-01-17","2022-03-29","2022-03-29","2022-05-16","2022-07-08","2022-07-08","2022-10-21","2022-12-02",
  "2023-02-13","2023-04-07","2023-04-07","2023-06-26","2023-08-14","2023-08-14","2023-10-30",
  "2024-01-22","2024-03-18","2024-03-18","2024-05-09","2024-07-15","2024-09-06","2024-09-06","2024-11-18",
];
const coverageSites = [
  "headwater","forest","agricultural","urban","estuary","headwater","urban",
  "forest","headwater","agricultural","urban","forest","estuary","agricultural","urban",
  "headwater","forest","estuary","agricultural","urban","estuary","forest",
  "headwater","agricultural","urban","forest","estuary","headwater","urban","agricultural",
];
const coverageSiteCodes = coverageSites.map((key) => siteCodes[key]);
const coverageBase = base(theme, {
  title: "Sampling coverage, 2021–2024",
  subtitle: "Exact visits and annual distinct-site summaries",
  xLabel: "sample date", yLabel: "monitoring site",
  note: "Synthetic sampling schedule; gaps are intentional evidence.",
}, {
  renderer: "temporal_coverage", xScale: { type: "time" }, yScale: { type: "band" },
  data: { dates: coverageDates, sites: coverageSiteCodes, siteOrder: siteKeys.map((key) => siteCodes[key]) },
  presentation: { panelSurface: true, frame: true, legend: "none", markerScale: 0.82 },
});

const recipeNames = Object.freeze({ static: "static", restrained: "restrained", expressive: "expressive" });
const recipeContract = (key) => applyMotionRecipe(denseLineBase, recipeNames[key]);
const canvasPixelFingerprint = (canvas) => {
  const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  let hash = 0x811c9dc5;
  for (const value of pixels) { hash ^= value; hash = Math.imul(hash, 0x01000193); }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}@${canvas.width}x${canvas.height}`;
};
const stabilizeFigure = (figure, contract, canvas) => {
  figure.resize(); figure.resize();
  let previous = null;
  for (let index = 0; index < 5; index += 1) {
    figure.setConfig(contract);
    const current = canvasPixelFingerprint(canvas);
    if (current === previous) return current;
    previous = current;
  }
  return previous;
};

const status = document.querySelector("#motion-status");
const action = document.querySelector("#motion-action");
const terminalProof = document.querySelector("#terminal-proof");
const motionCanvas = document.querySelector("#motion-canvas");
let selectedRecipe = "restrained";
let selectedHasPlayed = false;
const updateMotionAction = () => {
  if (selectedRecipe === "static") {
    action.textContent = "Static terminal state"; action.disabled = true;
  } else {
    action.disabled = false;
    action.textContent = `${selectedHasPlayed ? "Replay" : "Play"} ${selectedRecipe} motion`;
  }
};
const motionFigure = createFigurestead(motionCanvas, recipeContract(selectedRecipe), {
  autoplay: false,
  onState: (state) => {
    const label = selectedRecipe[0].toUpperCase() + selectedRecipe.slice(1);
    status.textContent = state === "playing" ? `${label} motion playing.` : state === "complete" && selectedHasPlayed ? `${label} motion complete.` : `${label} terminal figure ready.`;
    if (state === "complete" && selectedHasPlayed) updateMotionAction();
  },
});

stabilizeFigure(motionFigure, recipeContract("static"), motionCanvas);
const terminalFingerprints = Object.fromEntries(Object.keys(recipeNames).map((key) => [key, evidenceFingerprint(compileTerminalScene(recipeContract(key)))]));
const terminalPixelFingerprints = {};
for (const key of Object.keys(recipeNames)) {
  motionFigure.setConfig(recipeContract(key));
  terminalPixelFingerprints[key] = canvasPixelFingerprint(motionCanvas);
}
const fingerprintMatch = new Set(Object.values(terminalFingerprints)).size === 1;
const pixelMatch = new Set(Object.values(terminalPixelFingerprints)).size === 1;
motionFigure.setConfig(recipeContract(selectedRecipe));
terminalProof.dataset.fingerprintMatch = String(fingerprintMatch);
terminalProof.dataset.pixelMatch = String(pixelMatch);
terminalProof.dataset.pixelFingerprints = JSON.stringify(terminalPixelFingerprints);
terminalProof.textContent = fingerprintMatch && pixelMatch ? `Terminal evidence invariant · ${terminalFingerprints.static}` : "Terminal evidence mismatch";
updateMotionAction();

document.querySelectorAll('input[name="motion-recipe"]').forEach((control) => {
  control.addEventListener("change", () => {
    selectedRecipe = control.value; selectedHasPlayed = false;
    motionFigure.setConfig(recipeContract(selectedRecipe));
    status.textContent = `${selectedRecipe[0].toUpperCase()}${selectedRecipe.slice(1)} terminal figure ready.`;
    updateMotionAction();
  });
});
action.addEventListener("click", () => {
  if (selectedRecipe === "static") return;
  selectedHasPlayed = true; updateMotionAction(); motionFigure.replay();
});

const reportLineCanvas = document.querySelector("#report-line-canvas");
const reportScatterCanvas = document.querySelector("#report-scatter-canvas");
const reportStripCanvas = document.querySelector("#report-strip-canvas");
const reportCoverageCanvas = document.querySelector("#report-coverage-canvas");
const reportLineStatic = applyMotionRecipe(denseLineBase, "static");
const reportLineMotion = applyMotionRecipe(denseLineBase, { key: "report-line", motion: "semantic", ambient: "none", strategy: "points_then_connect", durationMs: 2000, lightingPeak: 0.025 });
const coverageStatic = applyMotionRecipe(coverageBase, "static");
const coverageMotion = applyMotionRecipe(coverageBase, { key: "report-coverage", motion: "semantic", ambient: "none", strategy: "reveal", durationMs: 2100, lightingPeak: 0.02 });
const reportLineFigure = createFigurestead(reportLineCanvas, reportLineStatic, { autoplay: false });
const reportScatterFigure = createFigurestead(reportScatterCanvas, applyMotionRecipe(scatterBase, "static"), { autoplay: false });
const reportStripFigure = createFigurestead(reportStripCanvas, applyMotionRecipe(stripBase, "static"), { autoplay: false });
const reportCoverageFigure = createFigurestead(reportCoverageCanvas, coverageStatic, { autoplay: false, registry: temporalRegistry });
[reportLineFigure, reportScatterFigure, reportStripFigure, reportCoverageFigure].forEach((figure) => figure.resize());

const bindLocalMotion = (button, figure, motionContract, label) => {
  let played = false;
  button.addEventListener("click", () => {
    figure.setConfig(motionContract); figure.replay(); played = true;
    button.textContent = `Replay ${label}`;
  });
  return () => played;
};
const reportLinePlayed = bindLocalMotion(document.querySelector("#report-line-action"), reportLineFigure, reportLineMotion, "point-to-line motion");
const reportCoveragePlayed = bindLocalMotion(document.querySelector("#report-coverage-action"), reportCoverageFigure, coverageMotion, "coverage reveal");

const cvdOriginalCanvas = document.querySelector("#cvd-original");
const cvdOriginalFigure = createFigurestead(cvdOriginalCanvas, applyMotionRecipe(denseLineBase, "static"), { autoplay: false });
stabilizeFigure(cvdOriginalFigure, applyMotionRecipe(denseLineBase, "static"), cvdOriginalCanvas);
const cvdTargets = Object.freeze({
  protanomaly: document.querySelector("#cvd-protanomaly"),
  deuteranomaly: document.querySelector("#cvd-deuteranomaly"),
  tritanomalyApproximation: document.querySelector("#cvd-tritanomaly-approximation"),
});
const renderCvdPlate = () => {
  cvdOriginalFigure.resize();
  Object.entries(cvdTargets).forEach(([key, canvas]) => renderCvdSimulation(cvdOriginalCanvas, canvas, MACHADO_SEVERITY_1[key]));
  Object.entries(cvdTargets).forEach(([key, canvas]) => { canvas.dataset.pixelFingerprint = canvasPixelFingerprint(canvas); canvas.dataset.simulation = key; });
};
renderCvdPlate();
let resizeFrame = null;
window.addEventListener("resize", () => {
  if (resizeFrame != null) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => { renderCvdPlate(); resizeFrame = null; });
});

window.__technicalShowcaseAudit = Object.freeze({
  autoplay: false,
  selectedDefault: selectedRecipe,
  fingerprintMatch,
  pixelMatch,
  terminalFingerprints,
  terminalPixelFingerprints,
  resolvedReportStyles,
  siteCodes,
  denseLineBase,
  scatterBase,
  stripBase,
  coverageBase,
  motionFigure,
  reportLineFigure,
  reportScatterFigure,
  reportStripFigure,
  reportCoverageFigure,
  cvdOriginalFigure,
  reportLinePlayed,
  reportCoveragePlayed,
  cvdMethod: Object.freeze({
    model: "Machado, Oliveira & Fernandes 2009 severity model",
    severity: 1,
    colorSpace: "linear-light sRGB with standard sRGB transfer functions",
    conditions: Object.freeze({
      protanomaly: "Machado severity-1 protanomaly simulation",
      deuteranomaly: "Machado severity-1 deuteranomaly simulation",
      tritanomalyApproximation: "Machado severity-1 tritanomaly approximation",
    }),
    matrices: MACHADO_SEVERITY_1,
  }),
  renderCvdPlate,
  canvasPixelFingerprint,
  createFigurestead,
});
document.documentElement.dataset.showcaseReady = "true";
