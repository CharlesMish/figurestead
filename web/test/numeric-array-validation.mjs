import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CORE_REGISTRY, validateContract, compileFigureModel, compileTerminalScene,
  exportFigureSvg, exportFigureArtifacts, sceneToSvg, resolveTerminalScene,
  composeResolvedScene, resolvedSceneToSvg,
} from "../src/index.js";
import { numericContract, numericRejectionCases } from "../../ci/fixtures/numeric-array-validation.js";

const theme = JSON.parse(fs.readFileSync("src/figurestead/themes/lavender_fog_notebook.json")).themes.lavender_fog_notebook;
const cases = numericRejectionCases(theme);
assert.equal(cases.length, 70, "five numeric fields, fourteen invalid inputs each");
const routes = { validateContract, compileFigureModel, compileTerminalScene, exportFigureSvg, exportFigureArtifacts };
for (const test of cases) {
  for (const [name, route] of Object.entries(routes)) {
    assert.throws(() => route(test.make()), error =>
      error.name === "FiguresteadConfigError" && error.path === `config.panels[0].data.${test.dataPath}`,
    `${test.name}: ${name} must reject before producing a scene or export`);
  }
  assert.throws(() => CORE_REGISTRY.get(test.renderer).validateData(test.make().panels[0].data), error =>
    error.name === "FiguresteadConfigError" && error.path === `config.data.${test.dataPath}`,
  `${test.name}: direct registry validation`);
}

// Dense controls retain every authored observation and adjacent segment, while
// cadence changes only visible markers. Duplicate x values are not compacted.
let denseCases = 0;
for (const x of [[0], [0, 1, 2, 3, 4, 5], [0, 1, 1, 3, 4, 5]]) for (const stride of [1, 4]) {
  const contract = numericContract(theme), data = contract.panels[0].data;
  data.x = x; data.series.forEach((series, row) => { series.y = x.map((_, index) => index + row + 1); });
  contract.style.markerStride = stride;
  const scene = compileTerminalScene(contract), panel = scene.panels[0];
  assert.equal(panel.marks.filter(mark => mark.kind === "point").length, 2 * x.length);
  for (const series of data.series) {
    assert.deepEqual(panel.marks.filter(mark => mark.kind === "point" && mark.series === series.key).map(mark => [mark.x, mark.y]), x.map((value, i) => [value, series.y[i]]));
    assert.deepEqual(panel.marks.filter(mark => mark.kind === "segment" && mark.series === series.key).map(mark => [mark.from.x, mark.to.x]), x.slice(1).map((value, i) => [x[i], value]));
  }
  assert.equal(scene.seriesStyles.B.lineStyle, "dash");
  const composed = composeResolvedScene(resolveTerminalScene(scene, { width: 760, height: 520 }));
  const selected = x.map((_, i) => i).filter(i => i % stride === 0 || i === x.length - 1);
  assert.deepEqual(composed.panels[0].marks.filter(mark => mark.kind === "point" && mark.series === "A").map(mark => Number(mark.id.split("/").at(-1))), selected);
  const svg = exportFigureSvg(contract, { width: 760, height: 520 });
  assert.doesNotMatch(svg, /NaN|Infinity/);
  assert.equal(svg, sceneToSvg(scene, { width: 760, height: 520 }));
  assert.equal(svg, exportFigureArtifacts(contract, { width: 760, height: 520 }).svg);
  assert.doesNotMatch(resolvedSceneToSvg(composed), /NaN|Infinity/);
  denseCases += 1;
}
for (const renderer of ["scatter", "strip_summary"]) {
  const scene = compileTerminalScene(numericContract(theme, renderer));
  assert.equal(scene.panels[0].marks.filter(mark => mark.kind === "point").length, 3);
  assert.doesNotMatch(sceneToSvg(scene), /NaN|Infinity/);
  denseCases += 1;
}
const narrow = numericContract(theme); narrow.panels[0].yScale.domain = [0, 1];
assert.throws(() => compileTerminalScene(narrow), /clipping may not hide evidence/);
assert.equal(denseCases, 8);
console.log(JSON.stringify({ suite: "numeric-array-validation", result: "PASS", rejectionCases: cases.length, admissionRoutes: 6, denseCases }));
