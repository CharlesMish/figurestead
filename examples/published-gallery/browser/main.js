import { createFigurestead, exportFigureSvg, resolveTheme, validateThemePack } from "@figurestead/web";
import ultravioletPack from "@figurestead/web/themes/ultraviolet-laboratory" with { type: "json" };
import fixture from "./fixture.json" with { type: "json" };

const data = fixture.line;
const theme = resolveTheme(validateThemePack(ultravioletPack), "ultraviolet_laboratory");
const contract = {
  schemaVersion: "0.4", rendererApiVersion: "1", theme,
  profile: { key: "gallery", name: "Gallery", marker: "ring_core", markerSize: 42, markerAlpha: .84, edgeWidth: 1.05, coreFraction: .12, pointGlow: false, gridX: true, gridY: true, gridAlpha: .4, summaryGlow: false },
  timeline: { rainIn: [0, 0], marksEnter: [0, 1], summaryCompiles: [.8, 1], rainOut: [0, 0], settle: [.9, 1] },
  motion: { frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0, trailAlpha: 0, seed: 1, durationMs: 1 },
  style: { directLabels: false },
  spec: { title: data.title, xLabel: data.xlabel, yLabel: data.ylabel, signature: "figurestead" },
  view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
  panels: [{ id: "responses", renderer: "line", spec: { title: data.title, xLabel: data.xlabel, yLabel: data.ylabel },
    data: { x: data.x, revealOrder: "x", series: data.ys.map((y, i) => ({ key: `S${i+1}`, label: data.labels[i], y })) } }],
};
const canvas = document.querySelector("canvas");
const figure = createFigurestead(canvas, contract, { autoplay: false, reducedMotion: true });
figure.resize();
// Inspection/export hooks for this example, not new Figurestead APIs.
window.galleryExample = { contract, svg: exportFigureSvg(contract, { width: 1008, height: 624 }) };
document.documentElement.dataset.figuresteadReady = "true";
