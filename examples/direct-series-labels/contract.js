import { resolveTheme, validateThemePack } from "@figurestead/web";
import lavenderPack from "@figurestead/web/themes/lavender-fog-notebook" with { type: "json" };

const theme = resolveTheme(validateThemePack(lavenderPack), "lavender_fog_notebook");
export function makeContract(directLabels = false) {
  return {
    schemaVersion: "0.4", rendererApiVersion: "1", theme,
    profile: { key: "example", name: "Example", marker: "ring_core", markerSize: 42, markerAlpha: .84, edgeWidth: 1.05, coreFraction: .12, pointGlow: false, gridX: true, gridY: true, gridAlpha: .4, summaryGlow: false },
    timeline: { rainIn: [0, 0], marksEnter: [0, 1], summaryCompiles: [.8, 1], rainOut: [0, 0], settle: [.9, 1] },
    motion: { frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0, trailAlpha: 0, seed: 1, durationMs: 1 },
    style: { directLabels },
    spec: { title: "Three synthetic responses", xLabel: "Time", yLabel: "Response", signature: "figurestead" },
    view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
    panels: [{ id: "responses", renderer: "line", spec: { title: "Three synthetic responses", xLabel: "Time", yLabel: "Response" },
      data: { x: [0, 1, 2], revealOrder: "x", series: [
        { key: "S1", label: "Control", y: [1, 2, 3] },
        { key: "S2", label: "Treatment", y: [2, 3, 3.05] },
        { key: "S3", label: "Model", y: [3, 4, 3.1] },
      ] } }],
  };
}
