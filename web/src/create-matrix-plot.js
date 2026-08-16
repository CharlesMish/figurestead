import { cloneValue } from "./schema.js";
import { resizeCanvas } from "./layout.js";
import { deriveFigureLayout } from "./figure-layout.js";
import { prepareAtmosphere, drawAtmosphere } from "./atmosphere.js";
import { drawBackground, drawFigureHeader } from "./marks.js";
import { CORE_REGISTRY } from "./core-renderers.js";
import { AnimationClock } from "./clock.js";
import { createAccessibilityCompanion, prepareAccessibilityCompanion } from "./accessibility.js";
import { drawPanelSurface, drawPresentationAnnotations } from "./presentation.js";
import { compileFigureModel } from "./terminal-scene.js";
import { isResolvedRenderer, resolveSceneFrame } from "./resolved-scene.js";
import { drawResolvedPanel } from "./canvas-scene.js";
import { composeResolvedScene } from "./composition.js";
import { resolveResponsiveCanvasScene } from "./responsive-header.js";
import { createHeightNegotiator, validateHeightNegotiation } from "./height-negotiation.js";

export function createFigurestead(canvas, input, options = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError("createFigurestead requires an HTMLCanvasElement");
  const registry = options.registry ?? CORE_REGISTRY;
  if (registry.apiVersion !== "1") throw new TypeError("Figurestead requires renderer registry API 1");
  const heightNegotiation = validateHeightNegotiation(options.heightNegotiation);
  let contract = input, scene = null, preparedPanels = [], domains = [], atmosphere, surface, resolvedScene = null, composedScene = null, clock = null, destroyed = false;
  let reducedOverride = options.reducedMotion ?? null, companion = null, contractRevision = 0;
  const heightNegotiator = createHeightNegotiator(canvas, heightNegotiation, options.onError);
  const media = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  const isReduced = () => reducedOverride == null ? Boolean(media?.matches) : Boolean(reducedOverride);

  const prepareModel = (candidate) => {
    const model = compileFigureModel(candidate, { registry });
    return { ...model, atmosphere: model.contract.view.ambient === "matrix" ? prepareAtmosphere(model.contract.motion) : [] };
  };
  const applyModel = (model) => {
    contract = model.contract; scene = model.scene; preparedPanels = model.preparedPanels; domains = model.domains; atmosphere = model.atmosphere;
  };
  const layoutFactory = (width, height, candidate = contract) => deriveFigureLayout(width, height, candidate);
  const measuredText = (text, fontSize, style = "normal") => {
    surface.context.save();
    const prefix = style === "italic" ? "italic " : style === "500" ? "500 " : "";
    surface.context.font = `${prefix}${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace`;
    const value = surface.context.measureText(String(text));
    surface.context.restore();
    return { width: value.width, ascent: value.actualBoundingBoxAscent, descent: value.actualBoundingBoxDescent };
  };
  const observedBox = () => {
    const rect = canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height, visible: rect.width > 0 && rect.height > 0 && canvas.getClientRects().length > 0 };
  };
  const prepareResolution = (candidateScene, width, height, baselineResult) => {
    const responsive = resolveResponsiveCanvasScene(candidateScene, {
      width, height, baselineHeight: baselineResult.value, measureText: measuredText,
    });
    return { ...responsive, composed: composeResolvedScene(responsive.resolved), baselineError: baselineResult.error };
  };
  const commitNegotiation = (prepared, box) => heightNegotiator.commit({
    contractRevision,
    width: box.visible ? box.width : 0,
    baselineHeight: prepared.baselineHeight,
    preferredHeight: prepared.preferredHeight,
    baselineError: prepared.baselineError,
  });
  const resize = () => {
    if (destroyed) return;
    const box = observedBox();
    surface = resizeCanvas(canvas, { dprCap: options.dprCap ?? 2, layoutFactory });
    const baseline = box.visible ? heightNegotiator.baseline(box.width, box.height) : { value: null, error: null };
    const prepared = prepareResolution(scene, surface.layout.width, surface.layout.height, baseline);
    resolvedScene = prepared.resolved;
    composedScene = prepared.composed;
    surface = { ...surface, layout: resolvedScene.layout };
    if (clock) clock.render(clock.progress);
    commitNegotiation(prepared, box);
  };
  const draw = (progress) => {
    if (!surface || destroyed) return;
    const p = isReduced() ? 1 : progress, settled = p >= 1;
    drawBackground(surface.context, surface.layout, contract.theme);
    drawAtmosphere(surface.context, { config: contract, layout: surface.layout, streams: atmosphere, progress: p, reducedMotion: isReduced() || settled });
    drawFigureHeader(surface.context, { config: contract, layout: surface.layout });
    const frame = resolveSceneFrame(composedScene, p);
    preparedPanels.forEach((state, index) => {
      const resolved = isResolvedRenderer(state.panel.renderer);
      const env = { contract: state.contract, prepared: state.prepared, layout: resolved ? composedScene.panels[index].layout : surface.layout.panels[index], domains: domains[index], progress: p, settled, panel: state.panel, figure: contract, scenePanel: scene.panels[index], motionPlan: scene.motionPlan.panels[index], reducedMotion: isReduced() };
      drawPanelSurface(surface.context, env);
      const scales = resolved ? drawResolvedPanel(surface.context, frame, index) : state.definition.draw(surface.context, env);
      if (!resolved) drawPresentationAnnotations(surface.context, { ...env, scales });
    });
    options.onProgress?.(p);
  };

  applyModel(prepareModel(input)); surface = resizeCanvas(canvas, { dprCap: options.dprCap ?? 2, layoutFactory });
  const initialBox = observedBox();
  const initialBaseline = initialBox.visible ? heightNegotiator.baseline(initialBox.width, initialBox.height) : { value: null, error: null };
  const initialResolution = prepareResolution(scene, surface.layout.width, surface.layout.height, initialBaseline);
  resolvedScene = initialResolution.resolved;
  composedScene = initialResolution.composed;
  surface = { ...surface, layout: resolvedScene.layout };
  clock = new AnimationClock({ durationMs: contract.motion.durationMs, draw, onState: options.onState, onError: options.onError });
  companion = createAccessibilityCompanion(canvas, contract, registry, options.accessibility);
  clock.render(isReduced() ? 1 : 0);
  commitNegotiation(initialResolution, initialBox);

  let autoplayUsed = false, wasPlayingBeforeHidden = false;
  const resizeObserver = globalThis.ResizeObserver ? new ResizeObserver(resize) : null; resizeObserver?.observe(canvas);
  const intersectionObserver = globalThis.IntersectionObserver ? new IntersectionObserver((entries) => {
    if (!document.hidden && !autoplayUsed && entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= .35)) { autoplayUsed = true; intersectionObserver.disconnect(); isReduced() ? clock.settle() : clock.play(); }
  }, { threshold: [.35] }) : null;
  if (options.autoplay !== false) { if (intersectionObserver) intersectionObserver.observe(canvas); else { autoplayUsed = true; isReduced() ? clock.settle() : clock.play(); } }
  const visibility = () => { if (document.hidden) { wasPlayingBeforeHidden = clock.playing; clock.pause(); } else if (wasPlayingBeforeHidden) { wasPlayingBeforeHidden = false; clock.play(); } };
  const mediaChange = () => { if (reducedOverride == null) isReduced() ? clock.settle() : clock.render(clock.progress); };
  document.addEventListener("visibilitychange", visibility); media?.addEventListener?.("change", mediaChange);

  const replace = (next) => {
    const nextModel = prepareModel(next);
    const box = observedBox();
    const baseline = box.visible ? heightNegotiator.baseline(box.width, box.height) : { value: null, error: null };
    const nextResolution = prepareResolution(nextModel.scene, surface.layout.width, surface.layout.height, baseline);
    const nextCompanion = prepareAccessibilityCompanion(canvas, nextModel.contract, registry, options.accessibility);
    const nextSurface = resizeCanvas(canvas, { dprCap: options.dprCap ?? 2, layoutFactory: (width, height) => layoutFactory(width, height, nextModel.contract) });
    clock.pause();
    applyModel(nextModel);
    contractRevision += 1;
    resolvedScene = nextResolution.resolved; composedScene = nextResolution.composed;
    surface = { ...nextSurface, layout: resolvedScene.layout };
    clock.durationMs = contract.motion.durationMs; clock.resetFailure();
    nextCompanion.attach(); companion.destroy(); companion = nextCompanion; clock.settle();
    commitNegotiation(nextResolution, box);
  };
  return Object.freeze({
    play() { if (isReduced()) clock.settle(); else clock.play(); }, pause() { clock.pause(); }, replay() { if (isReduced()) clock.settle(); else clock.replay(); },
    setData(data) { if (contract.panels.length !== 1) throw new TypeError("setData is available only for single-panel figures; use setConfig for multi-panel figures"); const next = cloneValue(contract); next.panels[0].data = cloneValue(data); replace(next); },
    setConfig(next) { replace(next); },
    setReducedMotion(value) { if (value !== null && typeof value !== "boolean") throw new TypeError("reduced motion must be true, false, or null"); reducedOverride = value; isReduced() ? clock.settle() : clock.render(clock.progress); },
    resize,
    destroy() { if (destroyed) return; destroyed = true; heightNegotiator.destroy(); clock.destroy(); resizeObserver?.disconnect(); intersectionObserver?.disconnect(); document.removeEventListener("visibilitychange", visibility); media?.removeEventListener?.("change", mediaChange); companion.destroy(); },
    getState() { return { progress: clock.progress, playing: clock.playing, reducedMotion: isReduced(), runtimeFailed: clock.failed, renderers: contract.panels.map((panel) => panel.renderer), sceneVersion: scene.schemaVersion, resolvedSceneVersion: resolvedScene.schemaVersion, composedSceneVersion: composedScene.schemaVersion, profile: contract.view.profile, destroyed }; },
    getScene() { return scene; },
    getResolvedScene() { return resolvedScene; },
    getComposedScene() { return composedScene; },
    getFinalCoordinates() {
      return preparedPanels.map((state, index) => {
        if (isResolvedRenderer(state.panel.renderer)) return { panelId: state.panel.id, points: resolvedScene.panels[index].marks.filter((mark) => mark.kind === "point").map((mark) => ({ x: mark.geometry.cx, y: mark.geometry.cy, dataX: mark.x ?? mark.group, dataY: mark.y ?? mark.yCategory })) };
        const scales = state.definition.draw(surface.context, { contract: state.contract, prepared: state.prepared, layout: surface.layout.panels[index], domains: domains[index], progress: 1, settled: true, panel: state.panel, figure: contract });
        return { panelId: state.panel.id, points: (state.prepared.points ?? []).map((point) => ({ x: scales?.x?.(point.x), y: scales?.y?.(point.y), dataX: point.x, dataY: point.y })) };
      });
    },
  });
}
