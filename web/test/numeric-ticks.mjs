import assert from "node:assert/strict";
import fs from "node:fs";
import { compileTerminalScene, resolveTerminalScene, resolvedSceneToSvg, exportFigureSvg, timeTicks, formatTimeTick } from "../src/index.js";
import { formatNumericTicks, formatTimeTicks, ticks } from "../src/scales.js";
import { drawAxes } from "../src/marks.js";
import { drawTemporalAxes } from "../src/extensions/temporal/shared.js";
import { NUMERIC_TICK_CASES, numericTickContract } from "../../ci/fixtures/numeric-ticks.js";
const theme = JSON.parse(fs.readFileSync("src/figurestead/themes/slipware.json")).themes.slipware;
let cases = 0;
for (const fixture of NUMERIC_TICK_CASES) for (const axis of ["x", "y"]) for (const [profile, width, height] of [["atlas", 320, 360], ["atlas", 960, 600], ["paper", 760, 520]]) {
  const contract = numericTickContract(theme, fixture, axis, profile), original = structuredClone(contract);
  const scene = compileTerminalScene(contract);
  if (fixture.name === "multiple-years" && axis === "x" && width === 320) {
    assert.throws(() => resolveTerminalScene(scene, { width, height }), /insufficient x numeric tick space/);
    cases++; continue;
  }
  const resolved = resolveTerminalScene(scene, { width, height });
  const panel = resolved.panels[0], actual = panel.axes[`${axis}Ticks`];
  const values = (fixture.type === "time" ? timeTicks : ticks)(fixture.domain, 5);
  assert.deepEqual(actual.map(t => t.value), values, `${fixture.name}: tick coordinates`);
  assert.deepEqual(panel.domain[axis], fixture.domain);
  assert.deepEqual(contract, original);
  assert.deepEqual(scene.panels[0].data, compileTerminalScene(original).panels[0].data);
  assert.equal(new Set(actual.map(t => t.label)).size, new Set(values).size);
  for (const tick of actual) {
    const parsed = fixture.type === "time" ? Date.parse(tick.label) : Number(tick.label);
    assert.equal(parsed, tick.value, `${fixture.name}: numeric truth, not just uniqueness`);
    assert.equal(tick.numericDisplay.lines.map(l => l.text).join(""), tick.label);
    assert.doesNotMatch(tick.label, /…/);
    assert.ok(tick.numericDisplay.bounds.left >= 0 && tick.numericDisplay.bounds.right <= width);
  }
  const svg = resolvedSceneToSvg(resolved);
  for (const tick of actual) for (const line of tick.numericDisplay.lines) assert.ok(svg.includes(`>${line.text}</`));
  cases++;
}
assert.deepEqual(formatNumericTicks([2000, 2010, 2020]), ["2000", "2010", "2020"]);
assert.deepEqual(formatNumericTicks([1040, 1060]), ["1040", "1060"]);
assert.deepEqual(formatNumericTicks([.01, .015, .02]), ["0.01", "0.015", "0.02"]);
assert.deepEqual(formatNumericTicks([0, 5, 10]), ["0", "5", "10"]);
assert.deepEqual(formatNumericTicks([-0.004, -0.002, 0, .002, .004]), ["-4.0e-3", "-2.0e-3", "0", "2.0e-3", "4.0e-3"]);
for (const values of [[1.00000000000001, 1.00000000000002], [Number.MIN_VALUE, Number.MIN_VALUE * 2], [-1e300, 1e300], [0, 0, 0]]) {
  assert.deepEqual(formatNumericTicks(values).map(Number), values);
}
for (const domain of [[Date.UTC(2024, 0, 1), Date.UTC(2025, 0, 1)], [0, 1000]]) {
  for (const v of domain) assert.equal(Date.parse(formatTimeTick(v, domain)), v);
}
const instant = Date.UTC(2024, 2, 1);
assert.equal(Date.parse(formatTimeTick(instant + 123)), instant + 123);
assert.deepEqual(formatTimeTicks([instant, instant]), ["2024-03", "2024-03"]);
// Explicit non-goal: preserve the independently reported generator defect.
assert.deepEqual(timeTicks([instant, instant + 4], 5), Array(5).fill(instant));
// Unlike the deferred epoch-rounding defect, these coordinates are distinct.
// Date cannot faithfully format them: reject instead of silently truncating.
assert.deepEqual(timeTicks([0, 2], 5), [0, .5, 1, 1.5, 2]);
for (const value of [.5, -.5, 1.5]) assert.throws(() => formatTimeTick(value), /fractional-millisecond formatting is unsupported/);
const subMillisecond = numericTickContract(theme, { type: "time", domain: [0, 2] });
assert.throws(() => resolveTerminalScene(compileTerminalScene(subMillisecond)), /fractional-millisecond formatting is unsupported/);
assert.throws(() => exportFigureSvg(subMillisecond), /fractional-millisecond formatting is unsupported/);
const contract = numericTickContract(theme, NUMERIC_TICK_CASES.find(f => f.name === "years"));
assert.throws(() => resolveTerminalScene(compileTerminalScene(contract), { width: 320, height: 360,
  measureText: text => ({ width: text.length * 100, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 }) }),
  /insufficient [xy] numeric tick space; enlarge the figure/);
// Small paper figures retain their existing outside legend. Full numeric text
// must either fit in the remaining space or reject, never become an ellipsis.
for (const name of ["ordinary", "negative", "years", "counts", "fractional", "intraday"]) {
  const c = numericTickContract(theme, NUMERIC_TICK_CASES.find(f => f.name === name), "x", "paper");
  const r = resolveTerminalScene(compileTerminalScene(c), { width: 336, height: 260 });
  assert.ok(r.panels[0].axes.xTicks.every(t => t.numericDisplay.lines.map(l => l.text).join("") === t.label));
}
const tightPaper = numericTickContract(theme, NUMERIC_TICK_CASES.find(f => f.name === "multiple-years"), "x", "paper");
assert.throws(() => resolveTerminalScene(compileTerminalScene(tightPaper), { width: 336, height: 260 }), /insufficient x numeric tick space/);

// Renderer-definition draw paths also use whole-axis precision and paint full
// strings, even when bypassing the controller's resolved-scene path.
const calls = [], context = new Proxy({ font: "original", measureText: text => ({ width: text.length * 6,
  actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }), fillText: (...args) => calls.push(args) },
  { get: (target, key) => key in target ? target[key] : () => {} });
const layout = { width: 1000, height: 600, scale: 1, font: { axis: 12 }, plot: { left: 100, right: 900, top: 80, bottom: 500 } };
const config = { theme, profile: { gridX: true, gridY: true, gridAlpha: .4 }, spec: {} };
drawAxes(context, { config, layout, scales: { x: v => 100 + (v - 2000) * 40, y: v => 500 - (v - 1040) * 10 }, xTicks: [2000, 2010, 2020], yTicks: [1040, 1060] });
assert.deepEqual(calls.map(c => c[0]), ["1040", "1060", "2000", "2010", "2020"]);
assert.ok(calls.every(c => c.length === 3), "no Canvas maxWidth compression");
calls.length = 0;
drawTemporalAxes(context, { contract: config, layout, scales: { x: v => 100 + (v - instant) / 27000, y: v => 500 - v * 100,
  xDomain: [instant, instant + 21600000], xTicks: [instant, instant + 10800000, instant + 21600000], yTicks: [0, 1, 2] } });
assert.deepEqual(calls.slice(0, 6).map(c => c[0]), ["2024-03-01T", "00:00Z", "2024-03-01T", "03:00Z", "2024-03-01T", "06:00Z"]);
assert.ok(calls.every(c => c.length === 3));
console.log(`numeric ticks: ${cases} resolved cases plus precision, compatibility, compact-paper, direct-paint and capacity controls PASS`);
