import {
  CORE_REGISTRY,
  applyMotionRecipe,
  createFigurestead,
  evidenceFingerprint,
  compileTerminalScene,
  loadThemePack,
  resolveTheme,
  validateContract,
} from "../web/src/index.js";
import { TEMPORAL_RENDERERS } from "../web/src/extensions/temporal/index.js";

const SHOWCASE_ORDER = Object.freeze([
  "watershed_storm_response",
  "circadian_phase_shift",
  "instrument_calibration",
  "dose_response_plate",
  "treatment_replicates",
  "paired_seasonal_distributions",
  "field_sampling_coverage",
  "reservoir_oxygen_thresholds",
]);
const CANDIDATE_ORDER = Object.freeze(["habitat_class_response"]);
const STRESS_ORDER = Object.freeze([
  "gene_expression_recovery",
  "particle_size_relationship",
  "lab_precision",
  "migration_monitoring_coverage",
]);
const THEME_KEYS = Object.freeze([
  "slipware",
  "deep_observatory_sage_core",
  "registration_ink",
  "lavender_fog_notebook",
  "ultraviolet_laboratory",
  "midnight_transit_signal_slate",
]);
const RENDERER_LABELS = Object.freeze({
  line: "line",
  scatter: "scatter",
  strip_summary: "distribution",
  temporal_coverage: "temporal coverage",
  temporal_observations: "temporal observations",
});
const profile = Object.freeze({
  key: "deep_scope", name: "Deep Scope", marker: "ring_core", markerSize: 42,
  markerAlpha: 0.84, edgeWidth: 1.05, coreFraction: 0.12, pointGlow: false,
  gridX: true, gridY: true, gridAlpha: 0.42, rainDensity: 0,
  rainAlpha: 0, summaryGlow: false,
});
const timeline = Object.freeze({
  rainIn: [0.04, 0.14], marksEnter: [0.08, 0.70], summaryCompiles: [0.68, 0.86],
  rainOut: [0.72, 0.90], settle: [0.90, 1],
});
const defaultMotion = Object.freeze({
  frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0,
  trailAlpha: 0, seed: 2409, durationMs: 1,
});
const style = Object.freeze({
  glyphs: ["ring", "square", "triangle", "diamond"],
  lineStyles: ["solid", "dash", "dot", "dash-dot"], series: {},
});
const registry = CORE_REGISTRY.with(...TEMPORAL_RENDERERS);

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return response.json();
};

const themes = Object.fromEntries(await Promise.all(THEME_KEYS.map(async (key) => {
  const pack = await loadThemePack(`../src/figurestead/themes/${key}.json`);
  return [key, resolveTheme(pack, key)];
})));
const corpusRoot = "corpus-v0.2";
const manifest = await fetchJson(`${corpusRoot}/manifest.json`);
const sceneEntries = Object.fromEntries(manifest.scenes.map((entry) => [entry.sceneId, entry]));
const scenes = Object.fromEntries(await Promise.all(manifest.scenes.map(async (entry) => [entry.sceneId, await fetchJson(`${corpusRoot}/${entry.json}`)])));

function contractFor(scene) {
  const panel = {
    id: scene.sceneId,
    renderer: scene.renderer,
    spec: {
      title: scene.title,
      subtitle: scene.subtitle,
      xLabel: scene.suggestedSpec.xLabel,
      yLabel: scene.suggestedSpec.yLabel,
      note: scene.suggestedSpec.note,
      description: scene.communicationQuestion,
    },
    ...scene.suggestedScales,
    annotations: [],
    encoding: { interpolation: "linear" },
    presentation: {
      panelSurface: true, frame: true, legend: "auto", lineWidth: 1.65, markerScale: 0.86,
    },
    data: scene.data,
  };
  if (scene.renderer === "temporal_observations") panel.annotations = scene.data.referenceBands;
  const authored = {
    schemaVersion: "0.4", rendererApiVersion: "1",
    theme: themes[scene.suggestedTheme.key], profile, timeline,
    motion: { ...defaultMotion, seed: scene.seed }, style,
    spec: {
      title: scene.title,
      subtitle: scene.subtitle,
      xLabel: scene.suggestedSpec.xLabel,
      yLabel: scene.suggestedSpec.yLabel,
      note: scene.suggestedSpec.note,
      signature: "figurestead · deterministic synthetic fixture",
      description: scene.communicationQuestion,
    },
    layout: { type: "grid", columns: 1, gap: 18, sharedX: false, sharedY: false },
    view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
    panels: [panel],
  };
  return applyMotionRecipe(validateContract(authored, registry), "static");
}

function specimen(scene, index, mode) {
  const entry = sceneEntries[scene.sceneId];
  const figure = document.createElement("figure");
  figure.className = "specimen";
  figure.dataset.sceneId = scene.sceneId;
  figure.dataset.renderer = scene.renderer;
  figure.dataset.theme = scene.suggestedTheme.key;
  figure.dataset.tier = scene.tier;
  const header = document.createElement("header");
  header.className = "specimen-header";
  const meta = document.createElement("p");
  meta.className = "scene-meta";
  meta.textContent = `${String(index + 1).padStart(2, "0")} · ${RENDERER_LABELS[scene.renderer]}`;
  const classification = document.createElement("p");
  classification.className = "scene-classification";
  classification.textContent = mode === "montage" ? scene.suggestedTheme.name : `${scene.tier} · ${scene.suggestedTheme.name}`;
  header.append(meta, classification);
  const canvas = document.createElement("canvas");
  canvas.width = mode === "montage" ? 640 : 1160;
  canvas.height = mode === "montage" ? 416 : 700;
  canvas.dataset.sceneCanvas = scene.sceneId;
  canvas.setAttribute("aria-label", `${scene.title}, deterministic synthetic ${RENDERER_LABELS[scene.renderer]} figure`);
  figure.append(header, canvas);
  if (mode !== "montage") {
    const details = document.createElement("details");
    details.className = "scene-disclosure";
    const summary = document.createElement("summary");
    summary.textContent = "Scene brief and source";
    const list = document.createElement("dl");
    const facts = [
      ["Question", scene.communicationQuestion],
      ["Stressors", scene.stressors.join(" · ")],
      ["Theme", scene.suggestedTheme.name],
      ["Seed", String(scene.seed)],
    ];
    facts.forEach(([term, value]) => {
      const dt = document.createElement("dt"); dt.textContent = term;
      const dd = document.createElement("dd"); dd.textContent = value;
      list.append(dt, dd);
    });
    const links = document.createElement("p");
    const json = document.createElement("a"); json.href = `${corpusRoot}/${entry.json}`; json.textContent = "Scene JSON";
    const csv = document.createElement("a"); csv.href = `${corpusRoot}/${entry.csv}`; csv.textContent = "Flat CSV";
    links.append(json, " · ", csv);
    const fixture = document.createElement("p");
    fixture.className = "fixture-note";
    fixture.textContent = scene.provenance.statement;
    details.append(summary, list, links, fixture);
    figure.append(details);
  }
  return { figure, canvas };
}

const rendered = [];
function renderInto(grid, order, mode) {
  order.forEach((id, index) => {
    const scene = scenes[id];
    const { figure, canvas } = specimen(scene, index, mode);
    grid.append(figure);
    const contract = contractFor(scene);
    const instance = createFigurestead(canvas, contract, { autoplay: false, registry });
    instance.setConfig(contract);
    instance.resize();
    const terminalScene = compileTerminalScene(contract, { registry });
    figure.dataset.evidenceFingerprint = evidenceFingerprint(terminalScene);
    rendered.push({ id, scene, contract, terminalScene, instance, canvas });
  });
}

const mode = document.body.dataset.mode;
if (mode === "montage") {
  renderInto(document.querySelector("#montage-grid"), SHOWCASE_ORDER, "montage");
} else {
  renderInto(document.querySelector("#showcase-grid"), SHOWCASE_ORDER, "lab");
  renderInto(document.querySelector("#candidate-grid"), CANDIDATE_ORDER, "lab");
  renderInto(document.querySelector("#stress-grid"), STRESS_ORDER, "lab");
}

window.__FIGURESTEAD_SPECIMEN_STUDY__ = Object.freeze({
  corpusVersion: manifest.schemaVersion,
  mode,
  expectedOrder: mode === "montage" ? SHOWCASE_ORDER : [...SHOWCASE_ORDER, ...CANDIDATE_ORDER, ...STRESS_ORDER],
  rendered,
  registry,
});
document.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.closest(".figurestead-sr-only")) return;
  const rect = target.getBoundingClientRect();
  if (rect.top < 12 || rect.bottom > window.innerHeight - 12) {
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  }
});
document.documentElement.dataset.specimenReady = "true";
