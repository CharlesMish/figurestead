import { createFigurestead, resolveTheme, validateThemePack, type FiguresteadContract } from "@figurestead/web";
import slipwarePack from "@figurestead/web/themes/slipware" with { type: "json" };

const theme = resolveTheme(validateThemePack(slipwarePack), "slipware");
const contract = {
  schemaVersion: "0.4", rendererApiVersion: "1", theme,
  profile: { key: "package", name: "Package", marker: "ring_core", markerSize: 42, markerAlpha: 0.84, edgeWidth: 1.05, coreFraction: 0.12, pointGlow: false, gridX: true, gridY: true, gridAlpha: 0.4, summaryGlow: false },
  timeline: { rainIn: [0, 0], marksEnter: [0, 1], summaryCompiles: [0.8, 1], rainOut: [0, 0], settle: [0.9, 1] },
  motion: { frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0, trailAlpha: 0, seed: 1, durationMs: 1 },
  style: { glyphs: ["ring", "square", "triangle", "diamond"], lineStyles: ["solid", "dash", "dot", "dash-dot"], series: {} },
  spec: {
    title: "Watershed storm response across monitored headwater sites",
    subtitle: "Observed discharge and suspended sediment through the complete event window",
  },
  layout: { type: "grid", columns: 1, gap: 18, sharedX: false, sharedY: false },
  view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
  panels: [{ renderer: "line", data: { x: [0, 1], revealOrder: "x", series: [{ key: "a", y: [0, 1] }] } }],
} satisfies FiguresteadContract;
const canvas = document.querySelector<HTMLCanvasElement>("#figure");
if (!canvas) throw new Error("missing canvas");
const heightRequests: Array<{ preferredHeight: number; baselineHeight: number; width: number }> = [];
const figure = createFigurestead(canvas, contract, {
  autoplay: false,
  reducedMotion: true,
  heightNegotiation: {
    getBaselineHeight: () => 196,
    requestPreferredHeight({ preferredHeight, baselineHeight, width, signal }) {
      if (!signal.aborted) heightRequests.push({ preferredHeight, baselineHeight, width });
    },
  },
});
figure.resize();
await Promise.resolve();
const heightRequest = heightRequests.at(-1);
if (!heightRequest || heightRequest.preferredHeight <= heightRequest.baselineHeight) {
  throw new Error(`packed host-height negotiation did not request growth: ${JSON.stringify(heightRequests)}`);
}
document.documentElement.dataset.packageThemeReady = "true";
document.documentElement.dataset.theme = theme.key;
document.documentElement.dataset.renderers = figure.getState().renderers.join(",");
document.documentElement.dataset.heightNegotiation = JSON.stringify(heightRequest);
