import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CORE_RENDERERS,
  CORE_REGISTRY,
  compileFigureModel,
  composeResolvedScene,
  resolveTerminalScene,
  FIGURESTEAD_PACKAGE_VERSION,
  exportFigureSvg,
  validateContract,
} from "../src/index.js";
import { prepareAccessibilityCompanion } from "../src/accessibility.js";
import { TEMPORAL_RENDERERS } from "../src/extensions/temporal/index.js";

const theme = JSON.parse(fs.readFileSync("src/figurestead/themes/slipware.json", "utf8")).themes.slipware;

const contract = {
  schemaVersion: "0.4",
  rendererApiVersion: "1",
  theme,
  profile: { key: "ci", name: "CI", marker: "ring_core", markerSize: 42, markerAlpha: 0.84, edgeWidth: 1.05, coreFraction: 0.12, pointGlow: false, gridX: true, gridY: true, gridAlpha: 0.4, summaryGlow: false },
  timeline: { rainIn: [0, 0], marksEnter: [0, 1], summaryCompiles: [0.8, 1], rainOut: [0, 0], settle: [0.9, 1] },
  motion: { frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0, trailAlpha: 0, seed: 1, durationMs: 1 },
  style: { glyphs: ["ring", "square", "triangle", "diamond"], lineStyles: ["solid", "dash", "dot", "dash-dot"], series: {} },
  spec: { title: "Figurestead CI smoke", subtitle: "Deterministic public API", xLabel: "observation", yLabel: "response", signature: "figurestead · ci", description: "One line with three observations." },
  layout: { type: "grid", columns: 1, gap: 18, sharedX: false, sharedY: false },
  view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
  panels: [{ id: "line", renderer: "line", spec: { title: "Figurestead CI smoke", xLabel: "observation", yLabel: "response", description: "One line with three observations." }, xScale: { type: "linear" }, yScale: { type: "linear" }, annotations: [], encoding: { interpolation: "linear" }, presentation: { panelSurface: true, frame: true, legend: "none", lineWidth: 2, markerScale: 1 }, data: { x: [0, 1, 2], revealOrder: "x", series: [{ key: "series-1", label: "Series 1", y: [0, 1, 0] }] } }],
};

const cases = [
  () => {
    assert.equal(FIGURESTEAD_PACKAGE_VERSION, "0.9.0-alpha.5");
    assert.deepEqual(CORE_RENDERERS.map((renderer) => renderer.key), ["line", "scatter", "strip_summary"]);
  },
  () => {
    assert.deepEqual(TEMPORAL_RENDERERS.map((renderer) => renderer.key), ["temporal_coverage", "temporal_observations"]);
  },
  () => {
    validateContract(contract);
    const svg = exportFigureSvg(contract, { width: 640, height: 480 });
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /Figurestead CI smoke/);
  },
  () => {
    // A minimal DOM tree captures companion meaning; native checks cover real DOM/paint.
    const previousDocument = globalThis.document;
    globalThis.document = { createElement(tag) { return { tag, children: [], style: {}, append(...children) { this.children.push(...children); }, setAttribute() {} }; } };
    const descendants = (root, tag) => [root, ...root.children.flatMap((child) => descendants(child, tag))].filter((node) => node.tag === tag);
    try {
      const input = JSON.parse(fs.readFileSync("ci/fixtures/accessibility-python-root-labels.json", "utf8"));
      input.panels[0].annotations = [{ type: "focus", space: "plot", x: .5, y: .5, label: "Middle" }];
      for (const precedence of ["figure", "scale", "panel"]) {
        const candidate = structuredClone(input), panel = candidate.panels[0];
        if (precedence !== "figure") { panel.xScale.label = "Scale x (s)"; panel.yScale.label = "Scale y (K)"; }
        if (precedence === "panel") { panel.spec.xLabel = "Panel x (s)"; panel.spec.yLabel = "Panel y (K)"; }
        const model = compileFigureModel(candidate), composedScene = composeResolvedScene(resolveTerminalScene(model.scene, { width: 760, height: 520 }));
        const effectiveLabels = [composedScene.panels[0].spec.xLabel, composedScene.panels[0].spec.yLabel];
        const { root } = prepareAccessibilityCompanion(null, model.contract, CORE_REGISTRY, { composedScene });
        assert.deepEqual(descendants(root, "dd").slice(0, 2).map((node) => node.textContent), effectiveLabels);
        const head = descendants(root, "thead")[0];
        assert.deepEqual(descendants(head, "th").map((node) => node.textContent), [...effectiveLabels, "series"]);
        assert.ok(descendants(root, "p").some((node) => node.textContent === "Focus annotation: Middle (plot-relative position)."));
      }
    } finally {
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    }
  },
];

for (const run of cases) run();
assert.equal(cases.length, 4, "expected exactly 4 browser-core smoke cases");
console.log(JSON.stringify({ suite: "browser-core-smoke", expectedCaseCount: 4, executedCaseCount: cases.length, result: "PASS" }));
