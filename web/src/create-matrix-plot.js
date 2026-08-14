import { cloneValue } from "./schema.js";
import { resizeCanvas } from "./layout.js";
import { deriveFigureLayout } from "./figure-layout.js";
import { prepareAtmosphere, drawAtmosphere } from "./atmosphere.js";
import { drawBackground, drawFigureHeader } from "./marks.js";
import { CORE_REGISTRY } from "./core-renderers.js";
import { AnimationClock } from "./clock.js";
import { createAccessibilityCompanion } from "./accessibility.js";
import { drawPanelSurface, drawPresentationAnnotations } from "./presentation.js";
import { compileFigureModel } from "./terminal-scene.js";
import { isResolvedRenderer, resolveSceneFrame, resolveTerminalScene } from "./resolved-scene.js";
import { drawResolvedPanel } from "./canvas-scene.js";
import { composeResolvedScene } from "./composition.js";

export function createFigurestead(canvas, input, options = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError("createFigurestead requires an HTMLCanvasElement");
  const registry = options.registry ?? CORE_REGISTRY;
  if (registry.apiVersion !== "1") throw new TypeError("Figurestead requires renderer registry API 1");
  let contract = input, scene = null, preparedPanels = [], domains = [], atmosphere, surface, resolvedScene = null, composedScene = null, clock = null, destroyed = false;
  let reducedOverride = options.reducedMotion ?? null, companion = null;
  const media = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  const isReduced = () => reducedOverride == null ? Boolean(media?.matches) : Boolean(reducedOverride);

  const prepare = () => {
    const model = compileFigureModel(contract, { registry });
    contract = model.contract; scene = model.scene; preparedPanels = model.preparedPanels; domains = model.domains;
    atmosphere = contract.view.ambient === "matrix" ? prepareAtmosphere(contract.motion) : [];
  };
  const layoutFactory = (width, height) => deriveFigureLayout(width, height, contract);
  const measuredText = (text, fontSize) => {
    surface.context.save();
    surface.context.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace`;
    const value = surface.context.measureText(String(text));
    surface.context.restore();
    return { width: value.width, ascent: value.actualBoundingBoxAscent, descent: value.actualBoundingBoxDescent };
  };
  const resolve = () => resolveTerminalScene(scene, { width: surface.layout.width, height: surface.layout.height, measureText: measuredText });
  const resize = () => {
    if (destroyed) return;
    surface = resizeCanvas(canvas, { dprCap: options.dprCap ?? 2, layoutFactory });
    resolvedScene = resolve();
    composedScene = composeResolvedScene(resolvedScene);
    if (clock) draw(clock.progress);
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

  prepare(); surface = resizeCanvas(canvas, { dprCap: options.dprCap ?? 2, layoutFactory });
  resolvedScene = resolve();
  composedScene = composeResolvedScene(resolvedScene);
  clock = new AnimationClock({ durationMs: contract.motion.durationMs, draw, onState: options.onState });
  companion = createAccessibilityCompanion(canvas, contract, registry, options.accessibility);
  clock.render(isReduced() ? 1 : 0);

  let autoplayUsed = false, wasPlayingBeforeHidden = false;
  const resizeObserver = globalThis.ResizeObserver ? new ResizeObserver(resize) : null; resizeObserver?.observe(canvas);
  const intersectionObserver = globalThis.IntersectionObserver ? new IntersectionObserver((entries) => {
    if (!document.hidden && !autoplayUsed && entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= .35)) { autoplayUsed = true; intersectionObserver.disconnect(); isReduced() ? clock.settle() : clock.play(); }
  }, { threshold: [.35] }) : null;
  if (options.autoplay !== false) { if (intersectionObserver) intersectionObserver.observe(canvas); else { autoplayUsed = true; isReduced() ? clock.settle() : clock.play(); } }
  const visibility = () => { if (document.hidden) { wasPlayingBeforeHidden = clock.playing; clock.pause(); } else if (wasPlayingBeforeHidden) { wasPlayingBeforeHidden = false; clock.play(); } };
  const mediaChange = () => { if (reducedOverride == null) isReduced() ? clock.settle() : draw(clock.progress); };
  document.addEventListener("visibilitychange", visibility); media?.addEventListener?.("change", mediaChange);

  const replace = (next) => {
    clock.pause(); contract = next; prepare(); clock.durationMs = contract.motion.durationMs;
    surface = resizeCanvas(canvas, { dprCap: options.dprCap ?? 2, layoutFactory });
    resolvedScene = resolve();
    composedScene = composeResolvedScene(resolvedScene);
    companion.destroy(); companion = createAccessibilityCompanion(canvas, contract, registry, options.accessibility); clock.settle();
  };
  return Object.freeze({
    play() { if (isReduced()) clock.settle(); else clock.play(); }, pause() { clock.pause(); }, replay() { if (isReduced()) clock.settle(); else clock.replay(); },
    setData(data) { if (contract.panels.length !== 1) throw new TypeError("setData is available only for single-panel figures; use setConfig for multi-panel figures"); const next = cloneValue(contract); next.panels[0].data = cloneValue(data); replace(next); },
    setConfig(next) { replace(next); },
    setReducedMotion(value) { if (value !== null && typeof value !== "boolean") throw new TypeError("reduced motion must be true, false, or null"); reducedOverride = value; isReduced() ? clock.settle() : draw(clock.progress); },
    resize,
    destroy() { if (destroyed) return; destroyed = true; clock.destroy(); resizeObserver?.disconnect(); intersectionObserver?.disconnect(); document.removeEventListener("visibilitychange", visibility); media?.removeEventListener?.("change", mediaChange); companion.destroy(); },
    getState() { return { progress: clock.progress, playing: clock.playing, reducedMotion: isReduced(), renderers: contract.panels.map((panel) => panel.renderer), sceneVersion: scene.schemaVersion, resolvedSceneVersion: resolvedScene.schemaVersion, composedSceneVersion: composedScene.schemaVersion, profile: contract.view.profile, destroyed }; },
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
