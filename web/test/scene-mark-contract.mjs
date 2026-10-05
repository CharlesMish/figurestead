import assert from "node:assert/strict";
import fs from "node:fs";
import {
  MARK_KINDS, assertMarkKind, CORE_REGISTRY, compileTerminalScene,
  createRendererRegistry, defineRenderer, compileMotionPlan, markMotionState,
  renderLayerForMark, partitionPanelMarks, resolveTerminalScene, resolveSceneFrame,
  validateEvidenceCoverage, resolvedSceneToSvg,
} from "../src/index.js";
import { typographyContract } from "./svg-typography-fixtures.mjs";

const cases = [];
const test = (name, run) => cases.push({ name, run });
const source = () => typographyContract("lavender_fog_notebook");
const terminal = compileTerminalScene(source());
const resolved = resolveTerminalScene(terminal);
const changedScene = (scene, mark) => ({ ...scene, panels: [{ ...scene.panels[0], marks: [mark] }] });
const unknown = { id: "unrecognized", kind: "reference-bnad", geometry: null };
const rejectsKind = (fn) => assert.throws(fn, (error) => error.name === "FiguresteadConfigError" && error.path.endsWith(".kind"));

function panel(mark, band = "") {
  const categories = { x: null, y: null }, scales = { x: { type: "linear" }, y: { type: "linear" } };
  for (const axis of band) { scales[axis] = { type: "band" }; categories[axis] = ["A", "B"]; }
  return { id: "evidence", marks: [{ id: "mark", ...mark }], scales, categories, domain: { x: [0, 10], y: [0, 10] } };
}
const examples = {
  point: [{ x: 2, y: 3 }],
  segment: [{ from: { x: 1, y: 2 }, to: { x: 3, y: 4 } }],
  "summary-line": [{ slope: 1000, intercept: -9999 }],
  bar: [{ category: "A", value: 4, orientation: "vertical" }, "x"],
  cell: [{ xCategory: "A", yCategory: "B", value: 100 }, "xy"],
  interval: [{ low: 2, high: 8, category: "A" }, "y"],
  "median-rule": [{ group: "A", y: 3 }, "x"],
  connector: [{ x1: 2, x2: 8, yCategory: "A" }, "y"],
  "reference-band": [{ from: 2, to: 4 }],
  "baseline-rule": [{ x: 3 }],
  "row-band": [{ categoryFrom: "A", categoryTo: "B" }, "y"],
  rug: [{ x: 2, yCategory: "A" }, "y"],
  "temporal-bar": [{ xFrom: 1, xTo: 3, value: 200, maximum: 300 }],
  "renderer-mark": [{ evidence: { x: 2, y: 3 } }],
};

test("closed vocabulary has an evidence policy for every kind", () => {
  assert.ok(Object.isFrozen(MARK_KINDS));
  assert.equal(new Set(MARK_KINDS).size, MARK_KINDS.length);
  assert.deepEqual(Object.keys(examples).sort(), [...MARK_KINDS].sort());
  const declarations = fs.readFileSync(new URL("../types/index.d.ts", import.meta.url), "utf8");
  const tuple = declarations.match(/export const MARK_KINDS: readonly \[([\s\S]*?)\];/);
  assert.ok(tuple, "public mark-kind tuple is missing");
  assert.deepEqual([...tuple[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]), [...MARK_KINDS]);
  for (const [kind, [fields, band]] of Object.entries(examples)) {
    const p = panel({ kind, ...fields }, band);
    assertMarkKind(p.marks[0]);
    const result = validateEvidenceCoverage([p]);
    assert.equal(result.clean, true, kind);
    assert.equal(result.complete, true, kind);
    assert.deepEqual(result.uncheckedMarks, []);
    assert.ok(["reference", "data", "summary"].includes(renderLayerForMark(p.marks[0])));
    assert.equal(markMotionState(p.marks[0], 0, 1, 1).opacity, 1);
  }
});

test("unknown kind rejects at coverage, layer, geometry and motion boundaries", () => {
  rejectsKind(() => validateEvidenceCoverage([panel(unknown)]));
  rejectsKind(() => renderLayerForMark(unknown));
  rejectsKind(() => partitionPanelMarks([unknown]));
  rejectsKind(() => resolveTerminalScene(changedScene(terminal, unknown)));
  rejectsKind(() => compileMotionPlan(changedScene(terminal, unknown), { motion: "none" }));
  for (const progress of [0, .5, 1]) for (const strategy of ["none", "reveal"]) {
    rejectsKind(() => markMotionState(unknown, 0, 1, progress, strategy));
    rejectsKind(() => resolveSceneFrame(changedScene(resolved, unknown), progress));
  }
  for (const invalid of [null, {}, { kind: "" }, { kind: 1 }]) rejectsKind(() => assertMarkKind(invalid));
});

test("known kind cannot silently disappear from an incompatible geometry resolver", () => {
  rejectsKind(() => resolveTerminalScene(changedScene(terminal, { id: "wrong", kind: "reference-band", from: 0, to: 1 })));
});

test("unreadable required coordinates and domains reject instead of passing empty coverage", () => {
  for (const value of [undefined, NaN, Infinity, "2"]) {
    assert.throws(() => validateEvidenceCoverage([panel({ kind: "point", x: value, y: 3 })]), /finite number/);
  }
  const p = panel({ kind: "point", x: 2, y: 3 });
  p.domain.x = null;
  assert.throws(() => validateEvidenceCoverage([p]), /finite x domain/);
  assert.throws(() => validateEvidenceCoverage([panel({ kind: "segment", from: { x: -1, y: 2 }, to: { x: 3, y: 4 } })]), /clipping may not hide evidence/);
  assert.throws(() => validateEvidenceCoverage([panel({ kind: "reference-band", from: 2, to: 11 })]), /clipping may not hide evidence/);
});

test("categorical evidence is checked without comparing color/count encodings to axis domains", () => {
  for (const [kind, fields, band] of [
    ["point", { group: "absent", xOffset: 0, y: 3 }, "x"],
    ["cell", { xCategory: "absent", yCategory: "B" }, "xy"],
    ["row-band", { categoryFrom: "A", categoryTo: "absent" }, "y"],
  ]) assert.throws(() => validateEvidenceCoverage([panel({ kind, ...fields }, band)]), /outside .* categories/);
  const p = panel({ kind: "point", group: 1, y: 3 }, "x");
  p.categories.x = ["1", "2"];
  assert.equal(validateEvidenceCoverage([p]).clean, true);
  assert.equal(validateEvidenceCoverage([panel({ kind: "bar", category: "A", missing: true, value: null }, "x")]).clean, true);
  assert.throws(() => validateEvidenceCoverage([panel({ kind: "interval", low: 2, high: 8, observed: 11, category: "A" }, "y")]), /clipping may not hide evidence/);
});

test("time coordinates use timestamps while invalid dates reject", () => {
  const p = panel({ kind: "point", x: "2025-01-02", y: 3 });
  p.scales.x = { type: "time" };
  p.domain.x = ["2025-01-01", "2025-01-03"];
  assert.equal(validateEvidenceCoverage([p]).clean, true);
  p.marks[0].x = new Date("2025-01-02T00:00:00.123Z");
  p.domain.x = [new Date("2025-01-01"), new Date("2025-01-03")];
  assert.equal(validateEvidenceCoverage([p]).clean, true);
  p.marks[0].x = new Date(NaN);
  assert.throws(() => validateEvidenceCoverage([p]), /valid Date or date string/);
  p.marks[0].x = "not a date";
  assert.throws(() => validateEvidenceCoverage([p]), /valid Date or date string/);
});

test("opaque custom evidence reports incomplete coverage without disabling custom drawing", () => {
  const p = panel({ kind: "renderer-mark", evidence: { payload: [1, 2, 3] } });
  const result = validateEvidenceCoverage([p]);
  assert.equal(result.clean, false);
  assert.equal(result.complete, false);
  assert.deepEqual(result.uncheckedMarks, [{ panelId: "evidence", markId: "mark", reason: "custom-renderer-evidence" }]);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.uncheckedMarks) && Object.isFrozen(result.uncheckedMarks[0]));
  p.marks[0].evidence.x = 11;
  assert.throws(() => validateEvidenceCoverage([p]), /clipping may not hide evidence/);
});

test("registered custom line and strip retain their compatibility geometry", () => {
  for (const key of ["line", "strip_summary"]) {
    const base = CORE_REGISTRY.get(key), custom = defineRenderer({ ...base, key: `custom_${key}` });
    const registry = createRendererRegistry([...CORE_REGISTRY.definitions(), custom]);
    const config = source(); config.panels[0].renderer = custom.key;
    if (key === "strip_summary") {
      config.panels[0].xScale = { type: "band" };
      config.panels[0].data = { groups: ["A", "B"], group: ["A", "B"], values: [2, 3], series: ["s", "s"], seriesLabels: { s: "S" }, summary: "median", revealOrder: "input" };
    }
    const scene = compileTerminalScene(config, { registry });
    assert.equal(scene.evidenceCoverage.complete, true);
    const customResolved = resolveTerminalScene(scene);
    assert.equal(customResolved.panels[0].resolved, false);
    assert.ok(customResolved.panels[0].marks.some((mark) => Number.isFinite(mark.geometry?.cx)));
    assert.throws(() => resolvedSceneToSvg(customResolved), /compatibility path/);
  }
});

test("registered custom time points preserve Date evidence and subsecond coordinates", () => {
  const base = CORE_REGISTRY.get("line");
  const epoch = Date.UTC(2025, 0, 1);
  const custom = defineRenderer({ ...base, key: "custom_dates",
    prepare(contract) {
      const prepared = base.prepare(contract);
      return { ...prepared, points: prepared.points.map((point) => ({ ...point, x: new Date(epoch + point.x * 86400000 + 123) })) };
    },
    domains() { return { x: [epoch, epoch + 3 * 86400000], y: [-1, 2] }; },
  });
  const registry = createRendererRegistry([...CORE_REGISTRY.definitions(), custom]);
  const config = source(); config.panels[0].renderer = custom.key; config.panels[0].xScale = { type: "time" };
  const scene = compileTerminalScene(config, { registry });
  assert.equal(scene.evidenceCoverage.complete, true);
  const p = resolveTerminalScene(scene).panels[0];
  assert.ok(p.marks.every((mark) => Number.isFinite(mark.geometry.cx) && Number.isFinite(mark.geometry.cy)));
  assert.equal(p.marks[0].evidence.x.getTime(), epoch + 123);
});

for (const { name, run } of cases) {
  try { run(); } catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}
console.log(JSON.stringify({ suite: "scene-mark-contract", cases: cases.length, markKinds: MARK_KINDS.length, result: "PASS" }));
