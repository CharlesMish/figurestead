import assert from "node:assert/strict";
import * as root from "@figurestead/web";
import * as temporal from "@figurestead/web/extensions/temporal";
import slipwarePack from "@figurestead/web/themes/slipware" with { type: "json" };
import registrationInkPack from "@figurestead/web/themes/registration-ink" with { type: "json" };
import ultravioletLaboratoryPack from "@figurestead/web/themes/ultraviolet-laboratory" with { type: "json" };
import lavenderFogNotebookPack from "@figurestead/web/themes/lavender-fog-notebook" with { type: "json" };
import midnightTransitSignalSlatePack from "@figurestead/web/themes/midnight-transit-signal-slate" with { type: "json" };
import deepObservatorySageCorePack from "@figurestead/web/themes/deep-observatory-sage-core" with { type: "json" };

const theme = root.resolveTheme(root.validateThemePack(slipwarePack), "slipware");
const contract = {
  schemaVersion: "0.4", rendererApiVersion: "1", theme,
  profile: { key: "package", name: "Package", marker: "ring_core", markerSize: 42, markerAlpha: 0.84, edgeWidth: 1.05, coreFraction: 0.12, pointGlow: false, gridX: true, gridY: true, gridAlpha: 0.4, summaryGlow: false },
  timeline: { rainIn: [0, 0], marksEnter: [0, 1], summaryCompiles: [0.8, 1], rainOut: [0, 0], settle: [0.9, 1] },
  motion: { frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0, trailAlpha: 0, seed: 1, durationMs: 1 },
  style: { glyphs: ["ring", "square", "triangle", "diamond"], lineStyles: ["solid", "dash", "dot", "dash-dot"], series: {} },
  spec: { title: "Package theme smoke" },
  layout: { type: "grid", columns: 1, gap: 18, sharedX: false, sharedY: false },
  view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
  panels: [{ renderer: "line", data: { x: [0, 1], revealOrder: "x", series: [{ key: "a", y: [0, 1] }] } }],
};

const cases = [
  () => assert.equal(root.validateContract(contract).theme.key, "slipware"),
  () => assert.match(root.exportFigureSvg(contract, { width: 640, height: 400 }), /^<svg /),
  () => assert.deepEqual(temporal.TEMPORAL_RENDERERS.map(({ key }) => key), ["temporal_coverage", "temporal_observations"]),
  () => [slipwarePack, registrationInkPack, ultravioletLaboratoryPack, lavenderFogNotebookPack, midnightTransitSignalSlatePack, deepObservatorySageCorePack].forEach((pack) => root.validateThemePack(pack)),
];
for (const run of cases) run();
console.log(JSON.stringify({ suite: "npm-types-theme-node-consumer", expectedCaseCount: 4, executedCaseCount: cases.length, curatedThemes: 6, result: "PASS" }));
