import fs from "node:fs";

import {
  compileTerminalScene,
  composeResolvedScene,
  exportFigureArtifacts,
  exportFigureSvg,
  resolvedSceneToSvg,
  resolveTerminalScene,
  sceneToSvg,
} from "../src/index.js";


const theme = JSON.parse(fs.readFileSync("src/figurestead/themes/slipware.json", "utf8")).themes.slipware;
const contract = {
  schemaVersion: "0.4",
  rendererApiVersion: "1",
  theme,
  profile: { key: "audit", name: "Audit", marker: "ring_core", markerSize: 42, markerAlpha: 0.84, edgeWidth: 1.05, coreFraction: 0.12, pointGlow: false, gridX: true, gridY: true, gridAlpha: 0.4, summaryGlow: false },
  timeline: { rainIn: [0, 0], marksEnter: [0, 1], summaryCompiles: [0.8, 1], rainOut: [0, 0], settle: [0.9, 1] },
  motion: { frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0, trailAlpha: 0, seed: 1, durationMs: 1 },
  style: { glyphs: ["ring", "square", "triangle", "diamond"], lineStyles: ["solid", "dash", "dot", "dash-dot"], series: {} },
  spec: { title: "SVG boundary", subtitle: "", xLabel: "x", yLabel: "y", signature: "figurestead", description: "inert structural proof" },
  layout: { type: "grid", columns: 1, gap: 18, sharedX: false, sharedY: false },
  view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
  panels: [{ id: "line", renderer: "line", spec: {}, xScale: { type: "linear" }, yScale: { type: "linear" }, annotations: [], encoding: { interpolation: "linear" }, data: { x: [0, 1], revealOrder: "x", series: [{ key: "s", label: "S", y: [0, 1] }] } }],
};

function stages(source) {
  const scene = compileTerminalScene(source);
  const composed = composeResolvedScene(resolveTerminalScene(scene, { width: 640, height: 480 }));
  return { scene, composed };
}

function outputs(source) {
  const { scene, composed } = stages(source);
  return {
    exportFigureSvg: exportFigureSvg(source, { width: 640, height: 480 }),
    exportFigureArtifacts: exportFigureArtifacts(source, { width: 640, height: 480 }).svg,
    sceneToSvg: sceneToSvg(scene, { width: 640, height: 480 }),
    resolvedSceneToSvg: resolvedSceneToSvg(composed, { width: 640, height: 480 }),
  };
}

function colorBoundary(value) {
  const source = structuredClone(contract);
  source.theme.field = value;
  const valid = stages(contract);
  const scene = JSON.parse(JSON.stringify(valid.scene));
  scene.theme.field = value;
  const composed = { ...valid.composed, theme: { ...valid.composed.theme, field: value } };
  const calls = {
    exportFigureSvg: () => exportFigureSvg(source, { width: 640, height: 480 }),
    exportFigureArtifacts: () => exportFigureArtifacts(source, { width: 640, height: 480 }).svg,
    sceneToSvg: () => sceneToSvg(scene, { width: 640, height: 480 }),
    resolvedSceneToSvg: () => resolvedSceneToSvg(composed, { width: 640, height: 480 }),
  };
  return Object.fromEntries(Object.entries(calls).map(([name, call]) => {
    try {
      return [name, { rejected: false, svg: call() }];
    } catch (error) {
      return [name, { rejected: true, error: `${error.name}: ${error.message}` }];
    }
  }));
}

const textContract = structuredClone(contract);
textContract.spec.title = "Title & <proof> \"quote\" 'apostrophe' \u0001 end";
textContract.panels[0].spec.title = textContract.spec.title;

const payloads = {
  inertElement: `\"/><g data-proof=\"inert\"></g><rect fill=\"`,
  angleBracket: "#12345<",
  ampersand: "#12345&",
  urlReference: "url(https://invalid.example/proof)",
  controlCharacter: "#12345\u0001",
};

process.stdout.write(JSON.stringify({
  valid: outputs(contract),
  escapedText: outputs(textContract),
  invalidColors: Object.fromEntries(Object.entries(payloads).map(([name, value]) => [name, colorBoundary(value)])),
}));
