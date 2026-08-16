import assert from "node:assert/strict";
import fs from "node:fs";

import {
  compileTerminalScene,
  exportFigureSvg,
} from "../src/index.js";
import { colorContrast } from "../src/color-space.js";
import { deriveFigureLayout } from "../src/figure-layout.js";
import { deriveLayout } from "../src/layout.js";
import { themeResolutionForProfile } from "../src/paper-profile.js";
import {
  SCREEN_LEGIBILITY_VERSION,
  SCREEN_PROJECT_LEGIBILITY_FLOORS,
  resolveScreenTheme,
} from "../src/screen-legibility.js";

const themeFiles = [
  "deep_observatory_sage_core",
  "lavender_fog_notebook",
  "midnight_transit_signal_slate",
  "registration_ink",
  "slipware",
  "ultraviolet_laboratory",
];

const themes = Object.fromEntries(themeFiles.map((key) => {
  const pack = JSON.parse(fs.readFileSync(`src/figurestead/themes/${key}.json`, "utf8"));
  return [key, pack.themes[key]];
}));

const expectedFaint = Object.freeze({
  deep_observatory_sage_core: "#71817C",
  lavender_fog_notebook: "#7B718B",
  midnight_transit_signal_slate: "#637980",
  registration_ink: "#817469",
  slipware: "#7A6D63",
  ultraviolet_laboratory: "#8D83B2",
});

function contractFor(theme) {
  return {
    schemaVersion: "0.4",
    rendererApiVersion: "1",
    theme,
    profile: { key: "readability", name: "Readability", marker: "ring_core", markerSize: 42, markerAlpha: 0.84, edgeWidth: 1.05, coreFraction: 0.12, pointGlow: false, gridX: true, gridY: true, gridAlpha: 0.4, summaryGlow: false },
    timeline: { rainIn: [0, 0], marksEnter: [0, 1], summaryCompiles: [0.8, 1], rainOut: [0, 0], settle: [0.9, 1] },
    motion: { frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0, trailAlpha: 0, seed: 1, durationMs: 1 },
    style: { glyphs: ["ring", "square", "triangle", "diamond"], lineStyles: ["solid", "dash", "dot", "dash-dot"], series: {} },
    spec: { title: "Compact scientific title", subtitle: "Compact scientific subtitle", xLabel: "observation", yLabel: "response", signature: "figurestead · source", description: "Readability regression fixture." },
    layout: { type: "grid", columns: 1, gap: 18, sharedX: false, sharedY: false },
    view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
    panels: [{ id: "line", renderer: "line", spec: { title: "Compact scientific title", subtitle: "Compact scientific subtitle" }, xScale: { type: "linear" }, yScale: { type: "linear" }, annotations: [], encoding: { interpolation: "linear" }, data: { x: [0, 1, 2], revealOrder: "x", series: [{ key: "series-1", label: "Series 1", y: [0, 1, 0] }] } }],
  };
}

const cases = [];
const test = (name, run) => cases.push({ name, run });

test("named screen/project legibility policy is explicit", () => {
  assert.equal(SCREEN_LEGIBILITY_VERSION, "figurestead.screen-legibility/1");
  assert.deepEqual(SCREEN_PROJECT_LEGIBILITY_FLOORS, { provenanceContrast: 3.4, compactProvenancePx: 9 });
});

test("all six curated themes resolve provenance against their actual field", () => {
  const changed = [];
  for (const key of themeFiles) {
    const source = themes[key];
    const result = resolveScreenTheme(source);
    assert.equal(result.theme.faint, expectedFaint[key], key);
    assert.ok(colorContrast(result.theme.faint, result.theme.field) >= 3.4, key);
    assert.equal(result.report.surface, "field", key);
    assert.equal(result.report.minimum, 3.4, key);
    assert.equal(result.report.resolution.changed, source.faint.toUpperCase() !== expectedFaint[key], key);
    if (result.report.resolution.changed) changed.push(key);
  }
  assert.deepEqual(changed, ["registration_ink", "slipware"]);
});

test("profile resolution applies the same screen resolver and leaves paper policy separate", () => {
  const screen = themeResolutionForProfile(themes.slipware, "atlas");
  assert.equal(screen.theme.faint, "#7A6D63");
  assert.equal(screen.report.schemaVersion, SCREEN_LEGIBILITY_VERSION);
  const paper = themeResolutionForProfile(themes.slipware, "paper");
  assert.equal(paper.theme.mode, "paper");
  assert.equal(paper.report.schemaVersion, "figurestead.paper-profile/1");
});

test("362 by 196 compact single-panel hierarchy changes only the adopted floors", () => {
  const layout = deriveLayout(362, 196);
  assert.equal(layout.scale, 0.55);
  assert.deepEqual(layout.plot, { left: 54, right: 340, top: 72, bottom: 138 });
  assert.equal(layout.font.title, 14);
  assert.equal(layout.font.subtitle, 9);
  assert.equal(layout.font.signature, 9);
  const subtitleBaseline = Math.max(layout.font.title + layout.font.subtitle + 14, layout.plot.top * 0.73);
  assert.equal(Number((layout.plot.top - subtitleBaseline).toFixed(2)), 19.44);
});

test("wide single-panel behavior and ceilings remain unchanged", () => {
  const wide = deriveLayout(1160, 700);
  assert.deepEqual({ title: wide.font.title, subtitle: wide.font.subtitle, signature: wide.font.signature }, { title: 19, subtitle: 12.5, signature: 10 });
  const ceiling = deriveLayout(2000, 1200);
  assert.deepEqual({ title: ceiling.font.title, subtitle: ceiling.font.subtitle, signature: ceiling.font.signature }, { title: 22, subtitle: 14, signature: 11 });
});

test("multi-panel title floors stay at 14 and 11 while compact provenance becomes 9", () => {
  const multi = deriveFigureLayout(390, 900, {
    panels: [{}, {}],
    layout: { columns: 1, gap: 18 },
    theme: themes.slipware,
    spec: { signature: "figurestead" },
  });
  assert.equal(multi.font.title, 14);
  assert.equal(multi.panels[0].font.title, 11);
  assert.equal(multi.font.signature, 9);
  assert.equal(multi.panels[0].font.signature, 9);
});

test("compact SVG carries the resolved provenance color and adopted title/signature floors", () => {
  const svg = exportFigureSvg(contractFor(themes.slipware), { width: 362, height: 196 });
  assert.match(svg, /font-size="14"[^>]*>Compact scientific title<\/text>/);
  assert.match(svg, /fill="#7A6D63"[^>]*font-size="9"[^>]*data-layer="provenance"/);
});

test("compiled terminal scene keeps scientific evidence intact while resolving provenance", () => {
  const scene = compileTerminalScene(contractFor(themes.registration_ink));
  assert.equal(scene.theme.faint, "#817469");
  assert.deepEqual(scene.panels[0].domain.x, [-0.16, 2.16]);
  assert.deepEqual(scene.panels[0].domain.y, [-0.08, 1.08]);
  assert.equal(scene.panels[0].marks.filter((mark) => mark.kind === "point").length, 3);
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
assert.equal(cases.length, 8, "expected exactly 8 readability cases");
assert.equal(executedCaseCount, 8, "expected every readability case to execute");
console.log(JSON.stringify({ suite: "readability-micro-polish", expectedCaseCount: 8, executedCaseCount, themeCaseCount: 6, result: "PASS" }));
