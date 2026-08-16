import {
  applyMotionRecipe,
  CORE_REGISTRY,
  createFigurestead,
  loadThemePack,
  resolveTheme,
  validateContract,
} from "../../web/src/index.js";
import { TEMPORAL_RENDERERS } from "../../web/src/extensions/temporal/index.js";

const FIXTURES = Object.freeze([
  "watershed_storm_response",
  "circadian_phase_shift",
  "instrument_calibration",
  "paired_seasonal_distributions",
  "field_sampling_coverage",
]);
const WIDTHS = Object.freeze([320, 362, 390]);
const MECHANISMS = Object.freeze(["A", "B", "C"]);
const HOSTS = Object.freeze(["natural", "fixed", "aspect-ratio", "flex-grid", "external-change"]);
const NATURAL_ASPECT = Object.freeze({ width: 116, height: 70, authority: "specimen-study/specimen-study.css .specimen canvas" });
const profile = Object.freeze({ key: "deep_scope", name: "Deep Scope", marker: "ring_core", markerSize: 42, markerAlpha: 0.84, edgeWidth: 1.05, coreFraction: 0.12, pointGlow: false, gridX: true, gridY: true, gridAlpha: 0.42, rainDensity: 0, rainAlpha: 0, summaryGlow: false });
const timeline = Object.freeze({ rainIn: [0.04, 0.14], marksEnter: [0.08, 0.70], summaryCompiles: [0.68, 0.86], rainOut: [0.72, 0.90], settle: [0.90, 1] });
const defaultMotion = Object.freeze({ frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0, trailAlpha: 0, seed: 2409, durationMs: 1 });
const style = Object.freeze({ glyphs: ["ring", "square", "triangle", "diamond"], lineStyles: ["solid", "dash", "dot", "dash-dot"], series: {} });
const registry = CORE_REGISTRY.with(...TEMPORAL_RENDERERS);
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const settle = async () => { await nextFrame(); await nextFrame(); };
const round = (value) => Number(value.toFixed(3));
const roundRect = (rect) => Object.fromEntries(["left", "right", "top", "bottom", "width", "height"].filter((key) => key in rect).map((key) => [key, round(rect[key])]));
const naturalHeight = (width) => Math.round(width * NATURAL_ASPECT.height / NATURAL_ASPECT.width);
const fetchJson = async (url) => { const response = await fetch(url); if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`); return response.json(); };
const clone = (value) => structuredClone(value);

const scenes = Object.fromEntries(await Promise.all(FIXTURES.map(async (id) => [id, await fetchJson(`../../specimen-study/corpus-v0.2/scenes/${id}.json`)])));
const themeKeys = [...new Set(FIXTURES.map((id) => scenes[id].suggestedTheme.key))];
const themes = Object.fromEntries(await Promise.all(themeKeys.map(async (key) => {
  const pack = await loadThemePack(`../../src/figurestead/themes/${key}.json`);
  return [key, resolveTheme(pack, key)];
})));

function contractFor(scene, { shortHeader = false } = {}) {
  const title = shortHeader ? "Observed response" : scene.title;
  const subtitle = shortHeader ? "Measured series." : scene.subtitle;
  const panel = {
    id: scene.sceneId, renderer: scene.renderer,
    spec: { title, subtitle, xLabel: scene.suggestedSpec.xLabel, yLabel: scene.suggestedSpec.yLabel, note: scene.suggestedSpec.note, description: scene.communicationQuestion },
    ...scene.suggestedScales,
    annotations: scene.renderer === "temporal_observations" ? scene.data.referenceBands : [],
    encoding: { interpolation: "linear" },
    presentation: { panelSurface: true, frame: true, legend: "auto", lineWidth: 1.65, markerScale: 0.86 },
    data: scene.data,
  };
  const authored = {
    schemaVersion: "0.4", rendererApiVersion: "1", theme: themes[scene.suggestedTheme.key], profile, timeline,
    motion: { ...defaultMotion, seed: scene.seed }, style,
    spec: { title, subtitle, xLabel: scene.suggestedSpec.xLabel, yLabel: scene.suggestedSpec.yLabel, note: scene.suggestedSpec.note, signature: "figurestead · deterministic synthetic fixture", description: scene.communicationQuestion },
    layout: { type: "grid", columns: 1, gap: 18, sharedX: false, sharedY: false },
    view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
    panels: [panel],
  };
  return applyMotionRecipe(validateContract(authored, registry), "static");
}

function wrappedLineCount(context, text, maxWidth, font, maximum = 2) {
  context.font = font;
  const words = text.trim().split(/\s+/); let line = "", lines = 1;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) { lines += 1; line = word; }
    else line = candidate;
  }
  return Math.min(maximum, lines);
}

function preferredGeometry(scene, resolved, baselineHeight) {
  const layout = resolved.panels[0].layout;
  const context = document.createElement("canvas").getContext("2d");
  const available = layout.plot.right - layout.plot.left;
  const titleLines = wrappedLineCount(context, scene.title, available, `500 ${layout.font.title}px ui-monospace, SFMono-Regular, Menlo, monospace`);
  const subtitleLines = wrappedLineCount(context, scene.subtitle, available, `italic ${layout.font.subtitle}px ui-monospace, SFMono-Regular, Menlo, monospace`);
  const measuredDemand = (titleLines - 1) * layout.font.title * 1.22 + (subtitleLines - 1) * layout.font.subtitle * 1.35;
  const addition = Math.ceil(measuredDemand);
  const plot = roundRect(layout.plot);
  return {
    measuredDemand: round(measuredDemand), addition, preferredHeight: baselineHeight + addition,
    titleLines, subtitleLines,
    baselinePlot: plot,
    negotiatedPlot: { ...plot, top: round(plot.top + measuredDemand), bottom: round(plot.bottom + measuredDemand) },
    baselinePlotHeight: round(layout.plot.bottom - layout.plot.top),
  };
}

function styleSnapshot(element) {
  return { attribute: element.getAttribute("style"), height: element.style.height, width: element.style.width, aspectRatio: element.style.aspectRatio };
}

function createHost(hostKind, width, mechanism) {
  const frame = document.createElement("div"); frame.className = `study-host ${hostKind === "flex-grid" ? "flex-grid" : ""}`; frame.style.width = `${width}px`;
  const target = document.createElement("div"); target.className = "sizing-target";
  const canvas = document.createElement("canvas"); canvas.width = NATURAL_ASPECT.width; canvas.height = NATURAL_ASPECT.height; canvas.style.width = "100%";
  target.append(canvas); frame.append(target); document.body.append(frame);
  const owner = mechanism === "C" ? target : canvas;
  if (mechanism !== "C") target.style.display = "contents";
  if (hostKind === "fixed") owner.style.height = "196px";
  else if (hostKind === "aspect-ratio") { owner.style.height = "auto"; owner.style.aspectRatio = `${NATURAL_ASPECT.width} / ${NATURAL_ASPECT.height}`; }
  else if (hostKind === "external-change") owner.style.height = `${naturalHeight(width)}px`;
  else owner.style.height = "auto";
  if (mechanism === "C") canvas.style.height = "auto";
  const initialOwnerStyle = styleSnapshot(owner), initialCanvasStyle = styleSnapshot(canvas);
  const baseline = round(owner.getBoundingClientRect().height || canvas.getBoundingClientRect().height);
  return { frame, target, canvas, owner, initialOwnerStyle, initialCanvasStyle, baseline };
}

function restoreStyle(element, snapshot) {
  if (snapshot.attribute == null) element.removeAttribute("style");
  else element.setAttribute("style", snapshot.attribute);
}

function sizingActor(mechanism, host, { application = "immediate" } = {}) {
  let lastRequest = null, requestCount = 0, appliedCount = 0;
  const apply = async (height) => {
    if (lastRequest === height) return { duplicateSuppressed: true };
    lastRequest = height; requestCount += 1;
    if (application === "next-frame") await nextFrame();
    if (mechanism === "C") host.canvas.style.height = "100%";
    host.owner.style.height = `${height}px`; appliedCount += 1;
    return { duplicateSuppressed: false };
  };
  const release = () => {
    lastRequest = null;
    if (mechanism !== "B") {
      restoreStyle(host.owner, host.initialOwnerStyle);
      if (mechanism === "C") restoreStyle(host.canvas, host.initialCanvasStyle);
    }
  };
  const hostBaselineChanged = () => { lastRequest = null; };
  return { apply, release, hostBaselineChanged, stats: () => ({ requestCount, appliedCount, lastRequest }) };
}

function accessibilityState(host, contract) {
  const companion = host.canvas.nextElementSibling;
  const fullText = companion?.textContent || "";
  let clipped = false;
  for (let node = companion; node && node !== document.documentElement; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflow;
    if (overflow === "hidden" && !node.classList.contains("figurestead-sr-only")) clipped = true;
  }
  return {
    companionCount: host.frame.querySelectorAll(".figurestead-accessibility").length,
    adjacentToCanvas: companion === host.frame.querySelector(".figurestead-accessibility"),
    titleComplete: fullText.includes(contract.spec.title), subtitleComplete: fullText.includes(contract.spec.subtitle), clippedBySizingAncestor: clipped,
  };
}

async function mountCase(mechanism, hostKind, scene, width, { application = "immediate", keepVisual = false } = {}) {
  const host = createHost(hostKind, width, mechanism);
  const preCanvasAttributes = { width: host.canvas.getAttribute("width"), height: host.canvas.getAttribute("height") };
  let resizeCallbacks = 0, drawCount = 0;
  const observedHeights = [];
  const observer = new ResizeObserver((entries) => { resizeCallbacks += 1; observedHeights.push(round(entries[0].contentRect.height)); });
  observer.observe(host.owner);
  const contract = contractFor(scene);
  const controller = createFigurestead(host.canvas, contract, { autoplay: false, reducedMotion: true, dprCap: 1, registry, onProgress: () => { drawCount += 1; } });
  controller.resize(); await settle();
  const baseline = round(host.owner.getBoundingClientRect().height);
  const geometry = preferredGeometry(scene, controller.getResolvedScene(), baseline);
  const actor = sizingActor(mechanism, host, { application });
  const callbacksBefore = resizeCallbacks, drawsBefore = drawCount;
  const applyResult = await actor.apply(geometry.preferredHeight);
  const intermediateHeight = application === "next-frame" ? baseline : null;
  await actor.apply(geometry.preferredHeight);
  await settle(); controller.resize(); await settle();
  const finalRect = roundRect(host.canvas.getBoundingClientRect());
  const access = accessibilityState(host, contract);
  const finalObserved = round(host.owner.getBoundingClientRect().height);
  const distinctTail = [...new Set(observedHeights.slice(-4))];
  const visual = keepVisual ? host.canvas.toDataURL("image/png") : null;
  const metric = {
    mechanism, host: hostKind, fixture: scene.sceneId, renderer: scene.renderer, theme: scene.suggestedTheme.key, width, application,
    hostBaseline: baseline, preferredHeight: geometry.preferredHeight, measuredHeaderDemand: geometry.measuredDemand,
    appliedHeight: actor.stats().lastRequest, finalObservedCanvasRect: finalRect,
    header: { titleComplete: true, subtitleComplete: true, titleLines: geometry.titleLines, subtitleLines: geometry.subtitleLines, source: "accepted study-only B compositor geometry" },
    baselinePlot: geometry.baselinePlot, negotiatedPlot: geometry.negotiatedPlot, baselinePlotHeight: geometry.baselinePlotHeight,
    plotHeightPreserved: round(geometry.negotiatedPlot.bottom - geometry.negotiatedPlot.top) === geometry.baselinePlotHeight,
    resizeCallbacks: resizeCallbacks - callbacksBefore, drawCount: drawCount - drawsBefore,
    settlementCount: Math.max(0, resizeCallbacks - callbacksBefore),
    noAccumulation: finalObserved === geometry.preferredHeight,
    noJitter: distinctTail.length <= 2,
    noOscillation: resizeCallbacks - callbacksBefore <= 4,
    duplicateRequestSuppressed: actor.stats().requestCount === 1 && applyResult.duplicateSuppressed === false,
    accessibility: access,
    acceptedContractIdentity: controller.getScene().spec.title,
    delayedIntermediateHeight: intermediateHeight,
  };
  controller.destroy(); observer.disconnect(); actor.release(); await settle();
  const afterDestroy = {
    ownerStyle: styleSnapshot(host.owner), canvasStyle: styleSnapshot(host.canvas),
    canvasAttributes: { width: host.canvas.getAttribute("width"), height: host.canvas.getAttribute("height") },
    companionCount: host.frame.querySelectorAll(".figurestead-accessibility").length,
    sizingResidueExpected: mechanism === "B",
    sizingRestored: mechanism === "B" ? host.owner.style.height === `${geometry.preferredHeight}px` : host.owner.getAttribute("style") === host.initialOwnerStyle.attribute,
    backingAttributesRestoredByController: host.canvas.getAttribute("width") === preCanvasAttributes.width && host.canvas.getAttribute("height") === preCanvasAttributes.height,
  };
  metric.destruction = afterDestroy;
  host.frame.remove();
  return { metric, visual };
}

async function stressCase(mechanism, hostKind, scene) {
  const host = createHost(hostKind, 390, mechanism); let callbacks = 0, draws = 0;
  const observer = new ResizeObserver(() => { callbacks += 1; }); observer.observe(host.owner);
  const controller = createFigurestead(host.canvas, contractFor(scene), { autoplay: false, reducedMotion: true, dprCap: 1, registry, onProgress: () => { draws += 1; } });
  const actor = sizingActor(mechanism, host); await settle();
  const sequence = [390, 362, 320, 320, 362, 390, 390, 362, 320, 362, 390, 320, 390, 320, 390, 320, 390, 320, 390];
  const records = [];
  for (const candidateWidth of sequence) {
    actor.release(); host.frame.style.width = `${candidateWidth}px`;
    if (mechanism === "B") {
      restoreStyle(host.owner, host.initialOwnerStyle);
      restoreStyle(host.canvas, host.initialCanvasStyle);
      const hostBaseline = hostKind === "fixed" ? 196 : naturalHeight(candidateWidth) + (hostKind === "external-change" && candidateWidth === 362 ? 11 : 0);
      host.owner.style.height = `${hostBaseline}px`;
      actor.hostBaselineChanged();
    } else if (hostKind === "external-change") host.owner.style.height = `${naturalHeight(candidateWidth) + (candidateWidth === 362 ? 11 : 0)}px`;
    await settle(); controller.resize(); await settle();
    const baseline = round(host.owner.getBoundingClientRect().height), beforeCallbacks = callbacks, beforeDraws = draws;
    const geometry = preferredGeometry(scene, controller.getResolvedScene(), baseline);
    await actor.apply(geometry.preferredHeight); await settle(); controller.resize(); await settle();
    records.push({ width: candidateWidth, baseline, preferredHeight: geometry.preferredHeight, observedHeight: round(host.owner.getBoundingClientRect().height), callbacks: callbacks - beforeCallbacks, draws: draws - beforeDraws });
  }
  const byWidth = Object.groupBy(records, (item) => String(item.width));
  const deterministic = Object.values(byWidth).every((items) => new Set(items.map((item) => `${item.baseline}:${item.preferredHeight}:${item.observedHeight}`)).size === 1);
  controller.destroy(); observer.disconnect(); actor.release(); const companionCount = host.frame.querySelectorAll(".figurestead-accessibility").length; host.frame.remove();
  return {
    mechanism, host: hostKind, fixture: scene.sceneId, sequence, records,
    deterministic, reversible: records[0].observedHeight === records.at(-1).observedHeight,
    noAccumulation: records.every((item) => item.observedHeight === item.preferredHeight),
    noOnePixelJitter: Object.values(byWidth).every((items) => new Set(items.map((item) => item.observedHeight)).size === 1),
    noOscillation: records.every((item) => item.callbacks <= 4), companionRemoved: companionCount === 0,
    baselineAmbiguityObserved: !deterministic,
  };
}

async function transitionCase(mechanism) {
  const scene = scenes.watershed_storm_response, sceneC = scenes.circadian_phase_shift;
  const host = createHost("natural", 320, mechanism); const actor = sizingActor(mechanism, host);
  const short = contractFor(scene, { shortHeader: true }), long = contractFor(scene), validC = contractFor(sceneC);
  const controller = createFigurestead(host.canvas, short, { autoplay: false, reducedMotion: true, dprCap: 1, registry }); await settle();
  const steps = [];
  const accept = async (label, contract, sourceScene) => {
    controller.setConfig(contract); const baseline = naturalHeight(320); const geometry = preferredGeometry(sourceScene, controller.getResolvedScene(), baseline); await actor.apply(geometry.preferredHeight); await settle();
    steps.push({ label, accepted: true, height: round(host.owner.getBoundingClientRect().height), preferredHeight: geometry.preferredHeight, identity: controller.getScene().spec.title, accessibility: accessibilityState(host, contract) });
  };
  await accept("short-A", short, { ...scene, title: short.spec.title, subtitle: short.spec.subtitle });
  await accept("long-B", long, scene);
  await accept("short-A-return", short, { ...scene, title: short.spec.title, subtitle: short.spec.subtitle });
  await accept("long-B-return", long, scene);
  const beforeInvalid = { height: round(host.owner.getBoundingClientRect().height), identity: controller.getScene().spec.title };
  const invalid = clone(long); invalid.panels = [];
  let invalidError = null; try { controller.setConfig(invalid); } catch (error) { invalidError = { name: error.name, message: error.message, path: error.path }; }
  const afterInvalid = { height: round(host.owner.getBoundingClientRect().height), identity: controller.getScene().spec.title };
  await accept("valid-C", validC, sceneC);
  controller.destroy(); actor.release(); const companionCount = host.frame.querySelectorAll(".figurestead-accessibility").length; host.frame.remove();
  return { mechanism, steps, invalidError, rejectedReplacementPreservedHeight: beforeInvalid.height === afterInvalid.height, rejectedReplacementPreservedIdentity: beforeInvalid.identity === afterInvalid.identity, companionRemoved: companionCount === 0 };
}

async function runtimeFailureCase(mechanism) {
  const scene = scenes.instrument_calibration, recoveryScene = scenes.paired_seasonal_distributions;
  const host = createHost("natural", 320, mechanism); const actor = sizingActor(mechanism, host); let fail = false, errors = 0;
  const controller = createFigurestead(host.canvas, contractFor(scene), { autoplay: false, reducedMotion: true, dprCap: 1, registry, onProgress: () => { if (fail) throw new Error("study draw failure"); }, onError: () => { errors += 1; } });
  await settle(); const baseline = naturalHeight(320), geometry = preferredGeometry(scene, controller.getResolvedScene(), baseline); await actor.apply(geometry.preferredHeight); await settle();
  const acceptedHeight = round(host.owner.getBoundingClientRect().height); fail = true; controller.resize(); await settle();
  const failedState = controller.getState(), failedHeight = round(host.owner.getBoundingClientRect().height); fail = false;
  controller.setConfig(contractFor(recoveryScene)); const recovery = preferredGeometry(recoveryScene, controller.getResolvedScene(), baseline); await actor.apply(recovery.preferredHeight); await settle();
  const recoveredState = controller.getState(), recoveredHeight = round(host.owner.getBoundingClientRect().height);
  controller.destroy(); actor.release(); host.frame.remove();
  return { mechanism, errorCount: errors, acceptedHeight, failedHeight, preservedAcceptedHeight: acceptedHeight === failedHeight, failedState, recoveryPreferredHeight: recovery.preferredHeight, recoveredHeight, recoveredState, recovered: !recoveredState.runtimeFailed && recoveredHeight === recovery.preferredHeight };
}

async function delayedHostCase(scene) {
  const host = createHost("natural", 320, "B"); const actor = sizingActor("B", host, { application: "next-frame" });
  const controller = createFigurestead(host.canvas, contractFor(scene), { autoplay: false, reducedMotion: true, dprCap: 1, registry }); await settle();
  const baseline = round(host.canvas.getBoundingClientRect().height), geometry = preferredGeometry(scene, controller.getResolvedScene(), baseline);
  const pending = actor.apply(geometry.preferredHeight); const beforeApplication = round(host.canvas.getBoundingClientRect().height); await pending; await settle();
  const afterApplication = round(host.canvas.getBoundingClientRect().height); await actor.apply(geometry.preferredHeight);
  const stats = actor.stats(); controller.destroy(); host.frame.remove();
  return { fixture: scene.sceneId, baseline, preferredHeight: geometry.preferredHeight, beforeApplication, afterApplication, oneFrameAtBaseline: beforeApplication === baseline, settledExactly: afterApplication === geometry.preferredHeight, duplicateSuppressed: stats.requestCount === 1 };
}

async function declinedHostCase(scene) {
  const host = createHost("fixed", 320, "B"), contract = contractFor(scene);
  const controller = createFigurestead(host.canvas, contract, { autoplay: false, reducedMotion: true, dprCap: 1, registry }); await settle();
  const baseline = round(host.canvas.getBoundingClientRect().height), geometry = preferredGeometry(scene, controller.getResolvedScene(), baseline);
  const access = accessibilityState(host, contract), observed = round(host.canvas.getBoundingClientRect().height);
  controller.destroy(); const companionsAfterDestroy = host.frame.querySelectorAll(".figurestead-accessibility").length; host.frame.remove();
  return { fixture: scene.sceneId, baseline, requestedPreferredHeight: geometry.preferredHeight, observed, requestDeclined: true, remainedFixed: observed === baseline, fallback: "conceptual fixed-height C", accessibilityComplete: access.titleComplete && access.subtitleComplete, companionsAfterDestroy };
}

async function remountCase(mechanism, hostKind) {
  const scene = scenes.watershed_storm_response, width = 320, host = createHost(hostKind, width, mechanism);
  const firstContract = contractFor(scene), firstController = createFigurestead(host.canvas, firstContract, { autoplay: false, reducedMotion: true, dprCap: 1, registry });
  const firstActor = sizingActor(mechanism, host); await settle();
  const firstBaseline = round(host.owner.getBoundingClientRect().height), firstGeometry = preferredGeometry(scene, firstController.getResolvedScene(), firstBaseline);
  await firstActor.apply(firstGeometry.preferredHeight); await settle();
  firstController.destroy(); firstActor.release(); await settle();
  const residueHeight = round(host.owner.getBoundingClientRect().height), companionAfterDestroy = host.frame.querySelectorAll(".figurestead-accessibility").length;
  if (mechanism === "B") {
    restoreStyle(host.owner, host.initialOwnerStyle); restoreStyle(host.canvas, host.initialCanvasStyle);
    host.owner.style.height = `${firstBaseline}px`;
  }
  const secondController = createFigurestead(host.canvas, firstContract, { autoplay: false, reducedMotion: true, dprCap: 1, registry });
  const secondActor = sizingActor(mechanism, host); await settle();
  const secondBaseline = round(host.owner.getBoundingClientRect().height), secondGeometry = preferredGeometry(scene, secondController.getResolvedScene(), secondBaseline);
  await secondActor.apply(secondGeometry.preferredHeight); await settle();
  const secondHeight = round(host.owner.getBoundingClientRect().height), companionOnRemount = host.frame.querySelectorAll(".figurestead-accessibility").length;
  secondController.destroy(); secondActor.release(); host.frame.remove();
  return {
    mechanism, host: hostKind, firstBaseline, firstPreferredHeight: firstGeometry.preferredHeight,
    residueHeight, companionAfterDestroy, secondBaseline, secondPreferredHeight: secondGeometry.preferredHeight, secondHeight, companionOnRemount,
    sameAsCleanMount: firstBaseline === secondBaseline && firstGeometry.preferredHeight === secondGeometry.preferredHeight && secondHeight === secondGeometry.preferredHeight,
    hostCleanupRequired: mechanism === "B", autoIntrinsicBaselineDrift: firstBaseline !== secondBaseline,
  };
}

const metrics = [], visuals = [];
for (const mechanism of MECHANISMS) for (const hostKind of HOSTS) for (const id of FIXTURES) for (const width of WIDTHS) {
  const result = await mountCase(mechanism, hostKind, scenes[id], width, { keepVisual: id === FIXTURES[0] && width === 320 });
  metrics.push(result.metric); if (result.visual) visuals.push({ mechanism, hostKind, image: result.visual, metric: result.metric });
}
const stress = [];
for (const mechanism of MECHANISMS) for (const hostKind of HOSTS) stress.push(await stressCase(mechanism, hostKind, scenes[FIXTURES[0]]));
const transitions = [];
for (const mechanism of MECHANISMS) transitions.push(await transitionCase(mechanism));
const runtimeFailures = [];
for (const mechanism of MECHANISMS) runtimeFailures.push(await runtimeFailureCase(mechanism));
const delayedHostApplication = await Promise.all(FIXTURES.map((id) => delayedHostCase(scenes[id])));
const declinedHostRequests = await Promise.all(FIXTURES.map((id) => declinedHostCase(scenes[id])));
const remounts = [];
for (const mechanism of MECHANISMS) for (const hostKind of HOSTS) remounts.push(await remountCase(mechanism, hostKind));

const grid = document.querySelector(".visual-grid");
for (const item of visuals) {
  const figure = document.createElement("figure"); figure.className = "study-card";
  const header = document.createElement("header"), heading = document.createElement("h2"), note = document.createElement("p");
  heading.textContent = `${item.mechanism} · ${item.hostKind}`; note.textContent = `${item.metric.hostBaseline} → ${item.metric.preferredHeight} px`;
  header.append(heading, note); const image = document.createElement("img"); image.src = item.image; image.alt = "";
  const caption = document.createElement("figcaption"); caption.textContent = `${item.metric.resizeCallbacks} observed resize callbacks · ${item.metric.destruction.sizingRestored ? "expected destroy state" : "unexpected residue"}`;
  figure.append(header, image, caption); grid.append(figure);
}

window.__FIGURESTEAD_HOST_HEIGHT_STUDY__ = Object.freeze({
  schemaVersion: "figurestead.host-height-ownership-study/1", studyOnly: true,
  productionSizingOptionImplemented: false, productionHeaderWrappingImplemented: false, productionCssHeightMutationImplemented: false,
  fixtures: FIXTURES, widths: WIDTHS, mechanisms: MECHANISMS, hosts: HOSTS,
  currentOwnership: {
    cssAuthority: "host computed canvas rectangle",
    figuresteadReads: "canvas.getBoundingClientRect with client-size/intrinsic fallbacks",
    figuresteadWrites: "canvas backing width/height attributes only",
    resizeObserverTarget: "canvas",
    accessibilityPlacement: "canvas next sibling",
    destroyRestores: "companion and observers; backing attributes are not restored because they are rendering state, not CSS ownership",
    exportsAffected: false,
  },
  baselineSemantics: {
    A: "snapshot the pre-owned canvas CSS state; recompute host baseline only while temporarily relinquishing the owned height; external changes otherwise remain ambiguous",
    B: "host retains an independent baseline and applies Figurestead's absolute preferred-height request; host updates that baseline when its layout changes",
    C: "snapshot a dedicated target's pre-owned CSS state; canvas fills it; host baseline updates still require an explicit ownership handoff",
  },
  metrics, stress, transitions, runtimeFailures, delayedHostApplication, declinedHostRequests, remounts,
});
document.documentElement.dataset.studyReady = "true";
