import assert from "node:assert/strict";
import fs from "node:fs";
import { compileFigureModel, exportFigureSvg, CORE_REGISTRY } from "../src/index.js";
import { formatFactualValues, figureDescription } from "../src/factual-description.js";
import { lineIdentityContract } from "../../ci/fixtures/line-identity.js";

const theme = JSON.parse(fs.readFileSync("src/figurestead/themes/lavender_fog_notebook.json")).themes.lavender_fog_notebook;
function make(renderer, data) {
  const contract = lineIdentityContract(theme), panel = contract.panels[0];
  panel.renderer = renderer; panel.xScale = { type: renderer === "strip_summary" ? "band" : "linear" };
  panel.data = data;
  contract.spec.description = "Authored scientific interpretation stays authored.";
  contract.spec.note = "Synthetic observations; no measurements.";
  panel.spec.description = "An authored panel context.";
  panel.spec.note = "Panel source context.";
  return contract;
}

const cases = [
  ["line", { x: [0, 1, 2], series: [{ key: "A", label: "Control", y: [1, 2, 4] }] }, "1 connected series; 3 observations per series (3 total). Observed x range 0 to 2; observed y range 1 to 4."],
  ["line", { x: [2], series: [{ key: "A", y: [4] }, { key: "B", y: [5] }] }, "2 point-only series; 1 observation per series (2 total). Observed x range 2 to 2; observed y range 4 to 5."],
  ["scatter", { x: [0, 1, 2], y: [1, 3, 5], summary: "linear_fit" }, "3 unconnected observations. Observed x range 0 to 2; observed y range 1 to 5. Linear fit across all 3 observations: slope 2; intercept 1."],
  ["scatter", { x: [0, 1, 2], y: [1, 3, 5], summary: null }, "3 unconnected observations. Observed x range 0 to 2; observed y range 1 to 5."],
  ["strip_summary", { groups: ["Empty", "A", "B"], group: ["A", "A", "B", "B", "B"], values: [1, 2, 3, 4, 5], summary: "median" }, "5 observations across 3 ordered groups. Empty: n=0; no median. A: n=2; median 1.5. B: n=3; median 4."],
  ["strip_summary", { groups: ["A", "Empty"], group: ["A", "A"], values: [1, 2], summary: null }, "2 observations across 2 ordered groups. A: n=2. Empty: n=0; no median."],
];
for (const [renderer, data, expected] of cases) {
  const contract = make(renderer, data), model = compileFigureModel(contract);
  const { prepared, description, contract: effective } = model.preparedPanels[0];
  assert.equal(description.summary, expected);
  assert.equal(model.scene.panels[0].factualSummary, expected);
  assert.deepEqual(CORE_REGISTRY.get(renderer).describe(effective), description, "public describe uses the same preparation authority");
  assert.deepEqual(CORE_REGISTRY.get(renderer).describe(effective, prepared), description);
  assert.equal(description.rows.length, renderer === "strip_summary" ? data.values.length : data.x.length);
  assert.ok(figureDescription(model.scene).includes(expected));
  const svg = exportFigureSvg(contract, { width: 760, height: 520 });
  assert.ok(svg.slice(svg.indexOf("<desc"), svg.indexOf("</desc>")).includes(expected));
  assert.ok(svg.includes("Authored context: Authored scientific interpretation stays authored."));
  assert.ok(svg.includes("Authored panel context: An authored panel context."));
  assert.ok(svg.includes("Source note: Synthetic observations; no measurements."));
  assert.ok(svg.includes("Source note: Panel source context."));
  const marks = model.scene.panels[0].marks;
  if (renderer === "scatter" && data.summary) {
    const fit = marks.find((mark) => mark.kind === "summary-line");
    assert.deepEqual([fit.slope, fit.intercept], [prepared.fit.slope, prepared.fit.intercept]);
    assert.deepEqual([fit.slope, fit.intercept], [2, 1]);
  }
  if (renderer === "strip_summary" && data.summary) {
    const medians = marks.filter((mark) => mark.kind === "median-rule");
    assert.deepEqual(medians.map((mark) => [mark.group, mark.y]), [["A", 1.5], ["B", 4]]);
    assert.deepEqual(prepared.groups.map((group) => [group.group, group.n, group.median]), [["Empty", 0, null], ["A", 2, 1.5], ["B", 3, 4]]);
  }
}
// Description precision is display-only, collision-aware, and honest about rounding.
assert.deepEqual(formatFactualValues([5, 5.04, -2.25, 0, -0]), ["5", "5.04", "-2.25", "0", "0"]);
assert.deepEqual(formatFactualValues([1.00000001, 1.00000002]), ["1.00000001", "1.00000002"]);
assert.deepEqual(formatFactualValues([Math.PI]), ["approximately 3.14159"]);
assert.deepEqual(formatFactualValues([Number.MIN_VALUE, 1e308]), ["5e-324", "1e+308"]);
const precise = make("scatter", { x: [0, 1], y: [Math.PI, Math.E] });
assert.deepEqual(compileFigureModel(precise).preparedPanels[0].description.rows.map((row) => row[1]), [Math.PI, Math.E], "raw tables retain exact values");
// Data-only replacements cannot retain a previously calculated model or median.
for (const [renderer, first, second] of [
  ["scatter", { x: [0, 1, 2], y: [1, 3, 5], summary: "linear_fit" }, { x: [0, 1, 2], y: [4, 3, 2], summary: "linear_fit" }],
  ["strip_summary", { groups: ["A", "B"], group: ["A", "B"], values: [1, 2], summary: "median" }, { groups: ["A", "B"], group: ["B", "B"], values: [10, 14], summary: "median" }],
]) {
  const c = make(renderer, first), before = compileFigureModel(c);
  c.panels[0].data = second;
  const after = compileFigureModel(c);
  assert.notEqual(before.scene.panels[0].factualSummary, after.scene.panels[0].factualSummary);
  assert.equal(c.spec.description, before.contract.spec.description);
  if (renderer === "scatter") {
    const mark = after.scene.panels[0].marks.find((mark) => mark.kind === "summary-line");
    assert.deepEqual([mark.slope, mark.intercept], [-1, 4]);
    assert.match(after.scene.panels[0].factualSummary, /slope -1; intercept 4/);
  } else {
    const marks = after.scene.panels[0].marks.filter((mark) => mark.kind === "median-rule");
    assert.deepEqual(marks.map((mark) => [mark.group, mark.y]), [["B", 12]]);
    assert.match(after.scene.panels[0].factualSummary, /A: n=0; no median\. B: n=2; median 12/);
  }
}
console.log("factual descriptions: 6 core fixtures, precision/raw-table controls and 2 updates PASS");
