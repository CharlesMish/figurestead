import assert from "node:assert/strict";
import fs from "node:fs";

import {
  CORE_REGISTRY,
  compileTerminalScene,
  exportFigureSvg,
  resolveTerminalScene,
  validateContract,
} from "../src/index.js";
import { TEMPORAL_RENDERERS } from "../src/extensions/temporal/index.js";

const theme = JSON.parse(fs.readFileSync("src/figurestead/themes/slipware.json", "utf8")).themes.slipware;
const profile = { key: "geometry", name: "Geometry", marker: "ring_core", markerSize: 42, markerAlpha: 0.84, edgeWidth: 1.05, coreFraction: 0.12, pointGlow: false, gridX: true, gridY: true, gridAlpha: 0.4, summaryGlow: false };
const timeline = { rainIn: [0, 0], marksEnter: [0, 1], summaryCompiles: [0.8, 1], rainOut: [0, 0], settle: [0.9, 1] };
const motion = { frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0, trailAlpha: 0, seed: 1, durationMs: 1 };
const style = { glyphs: ["ring", "square", "triangle", "diamond"], lineStyles: ["solid", "dash", "dot", "dash-dot"], series: {} };

function makeContract({ renderer = "line", data, xScale = { type: renderer === "strip_summary" ? "band" : "linear" }, yScale = { type: "linear" }, annotations = [] } = {}) {
  const defaultData = { x: [0, 1, 2], revealOrder: "x", series: [{ key: "s", label: "S", y: [0, 1, 2] }] };
  return {
    schemaVersion: "0.4", rendererApiVersion: "1", theme, profile, timeline, motion, style,
    spec: { title: "Scientific geometry", subtitle: "", xLabel: "x", yLabel: "y", signature: "figurestead", description: "Deterministic geometry regression." },
    layout: { type: "grid", columns: 1, gap: 18, sharedX: false, sharedY: false },
    view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
    panels: [{ id: "panel", renderer, spec: {}, xScale, yScale, annotations, encoding: { interpolation: "linear" }, data: data ?? defaultData }],
  };
}

function stages(source, registry = CORE_REGISTRY) {
  const terminal = compileTerminalScene(source, { registry });
  const resolved = resolveTerminalScene(terminal, { width: 640, height: 480 });
  return { terminal, resolved, panel: resolved.panels[0] };
}

function assertDomain(source, expectedX, expectedY, registry = CORE_REGISTRY) {
  const { terminal, panel } = stages(source, registry);
  assert.deepEqual(terminal.panels[0].domain.x, expectedX);
  assert.deepEqual(terminal.panels[0].domain.y, expectedY);
  assert.deepEqual(panel.domain.x, expectedX);
  assert.deepEqual(panel.domain.y, expectedY);
  return panel;
}

function assertDomainError(source, axis, registry = CORE_REGISTRY) {
  assert.throws(
    () => validateContract(source, registry),
    (error) => error.name === "FiguresteadConfigError" && error.path === `config.panels[0].${axis}Scale.domain`,
  );
}

function scatterContract(x, y, options = {}) {
  return makeContract({
    renderer: "scatter",
    data: { x, y, series: Array(x.length).fill("s"), seriesLabels: { s: "S" }, summary: "linear_fit" },
    ...options,
  });
}

function summaryMark(source) {
  const { terminal, resolved } = stages(source);
  const terminalMark = terminal.panels[0].marks.find((mark) => mark.kind === "summary-line");
  const resolvedMark = resolved.panels[0].marks.find((mark) => mark.kind === "summary-line");
  assert.ok(terminalMark, "terminal linear-fit mark is missing");
  assert.ok(resolvedMark?.geometry, "resolved linear-fit geometry is missing");
  return { terminalMark, resolvedMark };
}

function assertApprox(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= 1e-12, `${message}: expected ${expected}, received ${actual}`);
}

function assertFit(source, expectedSlope, expectedIntercept) {
  const { terminalMark, resolvedMark } = summaryMark(source);
  assertApprox(terminalMark.slope, expectedSlope, "terminal slope");
  assertApprox(terminalMark.intercept, expectedIntercept, "terminal intercept");
  assert.equal(resolvedMark.slope, terminalMark.slope);
  assert.equal(resolvedMark.intercept, terminalMark.intercept);
  const svg = exportFigureSvg(source, { width: 640, height: 480 });
  const element = svg.match(/<path[^>]*data-mark-id="panel\/summary\/linear-fit"[^>]*\/>/)?.[0];
  assert.ok(element, "SVG linear-fit path is missing");
  assert.match(element, new RegExp(`\\bd="M ${resolvedMark.geometry.x1} ${resolvedMark.geometry.y1} L ${resolvedMark.geometry.x2} ${resolvedMark.geometry.y2}"`));
}

const cases = [];
const test = (name, run) => cases.push({ name, run });

test("x omitted preserves automatic extent", () => assertDomain(makeContract(), [-0.16, 2.16], [-0.16, 2.16]));
test("x explicit wider than data", () => assertDomain(makeContract({ xScale: { type: "linear", domain: [0, 100] } }), [0, 100], [-0.16, 2.16]));
test("x explicit matching data", () => assertDomain(makeContract({ xScale: { type: "linear", domain: [0, 2] } }), [0, 2], [-0.16, 2.16]));
test("x explicit narrower than data follows the existing no-hidden-evidence policy", () => {
  assert.throws(
    () => compileTerminalScene(makeContract({ xScale: { type: "linear", domain: [0.5, 1.5] } })),
    (error) => error.name === "FiguresteadConfigError" && error.path.endsWith(".x") && error.message.includes("clipping may not hide evidence"),
  );
});
test("x reversed domain rejected", () => assertDomainError(makeContract({ xScale: { type: "linear", domain: [2, 0] } }), "x"));
test("x non-finite domain rejected", () => assertDomainError(makeContract({ xScale: { type: "linear", domain: [0, Number.POSITIVE_INFINITY] } }), "x"));

test("y omitted preserves automatic extent", () => assertDomain(makeContract(), [-0.16, 2.16], [-0.16, 2.16]));
test("y explicit wider than data", () => assertDomain(makeContract({ yScale: { type: "linear", domain: [0, 100] } }), [-0.16, 2.16], [0, 100]));
test("y explicit matching data", () => assertDomain(makeContract({ yScale: { type: "linear", domain: [0, 2] } }), [-0.16, 2.16], [0, 2]));
test("y explicit narrower than data follows the existing no-hidden-evidence policy", () => {
  assert.throws(
    () => compileTerminalScene(makeContract({ yScale: { type: "linear", domain: [0.5, 1.5] } })),
    (error) => error.name === "FiguresteadConfigError" && error.path.endsWith(".y") && error.message.includes("clipping may not hide evidence"),
  );
});
test("y reversed domain rejected", () => assertDomainError(makeContract({ yScale: { type: "linear", domain: [2, 0] } }), "y"));
test("y non-finite domain rejected", () => assertDomainError(makeContract({ yScale: { type: "linear", domain: [0, Number.NaN] } }), "y"));

test("both authored axes govern line terminal and resolved geometry", () => {
  const source = makeContract({ xScale: { type: "linear", domain: [0, 100] }, yScale: { type: "linear", domain: [-10, 10] } });
  const panel = assertDomain(source, [0, 100], [-10, 10]);
  const first = panel.marks.find((mark) => mark.kind === "point");
  assert.equal(first.geometry.cx, panel.layout.plot.left);
  assert.equal(first.geometry.cy, panel.axes.y(0));
  const svg = exportFigureSvg(source, { width: 640, height: 480 });
  const element = svg.match(/<circle[^>]*data-mark-id="panel\/point\/s\/0"[^>]*\/>/)?.[0];
  assert.ok(element, "SVG point for terminal mark is missing");
  assert.match(element, new RegExp(`\\bcx="${first.geometry.cx}"`));
  assert.match(element, new RegExp(`\\bcy="${first.geometry.cy}"`));
});

test("scale domain overrides retained data-level domain", () => assertDomain(makeContract({
  data: { x: [0, 1, 2], revealOrder: "x", xDomain: [-5, 5], yDomain: [-6, 6], series: [{ key: "s", label: "S", y: [0, 1, 2] }] },
  xScale: { type: "linear", domain: [0, 100] }, yScale: { type: "linear", domain: [-10, 10] },
}), [0, 100], [-10, 10]));
test("data-level domain remains the supported fallback", () => assertDomain(makeContract({
  data: { x: [0, 1, 2], revealOrder: "x", xDomain: [-5, 5], yDomain: [-6, 6], series: [{ key: "s", label: "S", y: [0, 1, 2] }] },
}), [-5, 5], [-6, 6]));

test("scatter consumes the same explicit numeric domains", () => assertDomain(makeContract({
  renderer: "scatter",
  data: { x: [0, 1, 2], y: [2, 1, 0], series: ["s", "s", "s"], seriesLabels: { s: "S" }, summary: null },
  xScale: { type: "linear", domain: [-2, 8] }, yScale: { type: "linear", domain: [-3, 7] },
}), [-2, 8], [-3, 7]));
test("strip-summary consumes its explicit numeric y domain", () => assertDomain(makeContract({
  renderer: "strip_summary",
  data: { groups: ["a", "b"], values: [1, 2], group: ["a", "b"], series: ["s", "s"], seriesLabels: { s: "S" }, summary: "median" },
  yScale: { type: "linear", domain: [0, 10] },
}), [-0.5, 1.5], [0, 10]));

test("temporal extension retains its established authored-domain behavior", () => {
  const registry = CORE_REGISTRY.with(...TEMPORAL_RENDERERS);
  const source = makeContract({
    renderer: "temporal_observations",
    data: { dates: ["2026-01-02", "2026-01-03"], values: [2, 4], site: "A", referenceBands: [] },
    xScale: { type: "time", domain: ["2026-01-01", "2026-01-10"] },
    yScale: { type: "linear", domain: [0, 10] },
  });
  assertDomain(source, [Date.parse("2026-01-01T00:00:00Z"), Date.parse("2026-01-10T00:00:00Z")], [0, 10], registry);
});

test("linear fit rejects one observation at the summary path", () => {
  assert.throws(
    () => validateContract(scatterContract([1], [5])),
    (error) => error.name === "FiguresteadConfigError" && error.path === "config.panels[0].data.summary" && error.message.includes("at least two finite observations"),
  );
});
test("linear fit rejects constant x at the summary path", () => {
  assert.throws(
    () => validateContract(scatterContract([1, 1, 1], [1, 2, 3])),
    (error) => error.name === "FiguresteadConfigError" && error.path === "config.panels[0].data.summary" && error.message.includes("at least two distinct finite x values"),
  );
});
test("linear fit rejects non-finite x at its exact input path", () => {
  assert.throws(
    () => validateContract(scatterContract([0, Number.POSITIVE_INFINITY], [1, 2])),
    (error) => error.name === "FiguresteadConfigError" && error.path === "config.panels[0].data.x[1]",
  );
});
test("linear fit rejects non-finite y at its exact input path", () => {
  assert.throws(
    () => validateContract(scatterContract([0, 1], [1, Number.NaN])),
    (error) => error.name === "FiguresteadConfigError" && error.path === "config.panels[0].data.y[1]",
  );
});
test("linear fit accepts two distinct observations", () => assertFit(scatterContract([0, 2], [1, 5]), 2, 1));
test("linear fit accepts three exact observations", () => assertFit(scatterContract([0, 1, 2], [1, 3, 5]), 2, 1));
test("linear fit preserves a real horizontal relation when x varies", () => assertFit(scatterContract([0, 1, 2], [5, 5, 5]), 0, 5));
test("linear fit returns stable coefficients for noisy observations", () => assertFit(scatterContract([0, 1, 2, 3], [1.1, 2.9, 5.2, 6.8]), 1.94, 1.09));
test("accepted instrument calibration fixture retains authored domains and fit", () => {
  const fixture = JSON.parse(fs.readFileSync("specimen-study/corpus-v0.2/scenes/instrument_calibration.json", "utf8"));
  const source = scatterContract(fixture.data.x, fixture.data.y, fixture.suggestedScales);
  const panel = assertDomain(source, [-3, 93], [-5, 100]);
  assert.equal(panel.marks.filter((mark) => mark.kind === "point").length, 40);
  assertFit(source, 0.9926296212121212, 0.5321095454545386);
});

let executedCaseCount = 0;
for (const { name, run } of cases) {
  try {
    run();
    executedCaseCount += 1;
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}
assert.equal(cases.length, 27, "expected exactly 27 scientific-geometry cases");
assert.equal(executedCaseCount, 27, "expected all scientific-geometry cases to execute");
console.log(JSON.stringify({ suite: "scientific-geometry", domainCaseCount: 18, linearFitCaseCount: 9, expectedCaseCount: 27, executedCaseCount, result: "PASS" }));
