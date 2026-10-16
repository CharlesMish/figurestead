import assert from "node:assert/strict";
import fs from "node:fs";
import { compileTerminalScene, resolveTerminalScene, resolvedSceneToSvg } from "../src/index.js";
import { composeResolvedScene } from "../src/composition.js";
import { resolveResponsiveCanvasScene } from "../src/responsive-header.js";
import { categoryTickContract, LONG_CATEGORIES } from "../../ci/fixtures/category-ticks.js";
import { lineIdentityContract } from "../../ci/fixtures/line-identity.js";
const theme = JSON.parse(fs.readFileSync("src/figurestead/themes/lavender_fog_notebook.json")).themes.lavender_fog_notebook;
const cases = [], test = (name, run) => cases.push({ name, run });
const resolve = (config, width, height, options = {}) => resolveTerminalScene(compileTerminalScene(config), { width, height, ...options });
const checkPlan = (result, labels) => {
  const panel = result.panels[0], { plot, rect } = panel.layout;
  assert.ok(plot.right > plot.left && plot.bottom > plot.top);
  assert.deepEqual(panel.axes.xTicks.map(t => t.label), labels);
  for (const tick of panel.axes.xTicks) {
    assert.ok(tick.display && tick.displayLabel.length);
    assert.ok(tick.display.bounds.left >= rect.left && tick.display.bounds.right <= rect.right);
    assert.ok(tick.display.bounds.top >= plot.bottom && tick.display.bounds.bottom <= rect.bottom);
    assert.equal(tick.display.x, panel.axes.x(tick.value) + panel.axes.x.bandwidth() / 2);
  }
};
for (const [profile, width, height] of [["atlas", 420, 300], ["atlas", 420, 520], ["atlas", 760, 520], ["paper", 420, 520]]) {
  test(`${profile} ${width}x${height}: shared abbreviated plan and finite positive plot`, () => {
    const config = categoryTickContract(theme); config.view.profile = profile;
    const first = resolve(config, width, height), second = resolve(config, width, height);
    checkPlan(first, LONG_CATEGORIES);
    assert.deepEqual(first.panels[0].axes.xTicks, second.panels[0].axes.xTicks);
    assert.ok(first.panels[0].axes.xTicks.some(t => t.displayLabel.endsWith("…")));
    const svg = resolvedSceneToSvg(composeResolvedScene(first));
    for (const tick of first.panels[0].axes.xTicks) {
      assert.ok(svg.includes(`>${tick.displayLabel}</text>`));
      if (tick.label !== tick.displayLabel) assert.ok(svg.includes(`data-full-label="${tick.label}"`));
    }
  });
}
test("short categorical labels retain their full unrotated treatment", () => {
  const result = resolve(categoryTickContract(theme, ["A", "B"]), 760, 520);
  checkPlan(result, ["A", "B"]);
  assert.deepEqual(result.panels[0].axes.xTicks.map(t => [t.displayLabel, t.display.rotation]), [["A", 0], ["B", 0]]);
  assert.doesNotMatch(resolvedSceneToSvg(composeResolvedScene(result)), /data-full-label="[AB]"/);
});
test("numeric ticks do not acquire categorical layout or display metadata", () => {
  const result = resolve(lineIdentityContract(theme), 760, 520);
  assert.equal(result.panels[0].layout.categoryTicks, undefined);
  assert.ok(result.panels[0].axes.xTicks.every(t => t.display === undefined && t.displayLabel === undefined));
});
test("native callback metrics own abbreviation, including rotated font bounds", () => {
  const metric = (s, size) => ({ width: Array.from(s).length * size, ascent: size * .7, descent: size * .2, fontAscent: size * 1.1, fontDescent: size * .3 });
  const result = resolve(categoryTickContract(theme), 420, 300, { measureText: metric });
  checkPlan(result, LONG_CATEGORIES);
  assert.ok(result.panels[0].layout.categoryTicks.metrics.every(m => m.fontAscent === 11));
});
test("Unicode abbreviation never splits an authored code point", () => {
  const labels = ["🧪α".repeat(40), "🧬β".repeat(40)], result = resolve(categoryTickContract(theme, labels), 420, 300);
  checkPlan(result, labels);
  for (const tick of result.panels[0].axes.xTicks) {
    assert.ok(tick.displayLabel.isWellFormed());
    assert.ok(tick.label.startsWith(tick.displayLabel.slice(0, -1)));
  }
});
test("final header allocation regenerates category anchors without losing the plan", () => {
  const source = compileTerminalScene(categoryTickContract(theme));
  const first = resolveResponsiveCanvasScene(source, { width: 420, height: 300, baselineHeight: 300 }).resolved;
  const expanded = resolveResponsiveCanvasScene(source, { width: 420, height: 340, baselineHeight: 300 }).resolved;
  checkPlan(expanded, LONG_CATEGORIES);
  for (let index = 0; index < 2; index++) {
    assert.equal(expanded.panels[0].axes.xTicks[index].display.y - first.panels[0].axes.xTicks[index].display.y, 40);
  }
});
test("impossible categorical allocation fails clearly instead of emitting zero geometry", () => {
  assert.throws(() => resolve(categoryTickContract(theme), 420, 120), /insufficient category tick space/);
});
for (const { name, run } of cases) { run(); console.log(`PASS ${name}`); }
console.log(`category ticks: ${cases.length}/${cases.length} PASS`);
