import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const typographyThemes = ["lavender_fog_notebook", "ultraviolet_laboratory"];
export const typographyLayouts = [
  { key: "compact", width: 320, height: 240 },
  { key: "responsive-edge", width: 480, height: 300 },
  { key: "ordinary-edge", width: 481, height: 320 },
  { key: "study", width: 760, height: 520 },
  { key: "wide", width: 1160, height: 700 },
  { key: "paper", width: 760, height: 520, profile: "paper" },
  { key: "panels", width: 1160, height: 700, panels: 2 },
];

export function typographyContract(key, { profile = "atlas", panels = 1, subtitle = 'Synthetic "A" & B' } = {}) {
  const file = fileURLToPath(new URL(`../../src/figurestead/themes/${key}.json`, import.meta.url));
  const theme = JSON.parse(fs.readFileSync(file, "utf8")).themes[key];
  const spec = { title: "Response & <control>", subtitle, xLabel: "Time", yLabel: "Response", signature: "figurestead" };
  return {
    schemaVersion: "0.4", rendererApiVersion: "1", theme,
    profile: { key: "example", name: "Example", marker: "ring_core", markerSize: 42, markerAlpha: .84, edgeWidth: 1.05, coreFraction: .12, pointGlow: false, gridX: true, gridY: true, gridAlpha: .4, summaryGlow: false },
    timeline: { rainIn: [0, 0], marksEnter: [0, 1], summaryCompiles: [.8, 1], rainOut: [0, 0], settle: [.9, 1] },
    motion: { frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0, trailAlpha: 0, seed: 1, durationMs: 1 },
    style: {}, spec,
    layout: { type: "grid", columns: panels, gap: 18, sharedX: false, sharedY: false },
    view: { profile, motion: "none", ambient: "none", strategy: "none" },
    panels: Array.from({ length: panels }, (_, i) => ({
      id: `response-${i}`, renderer: "line", spec: { ...spec },
      data: { x: [0, 1, 2], revealOrder: "x", series: [{ key: "sample", label: "Sample", y: [0, 1, .5] }] },
    })),
  };
}
