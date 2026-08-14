import assert from "node:assert/strict";
import * as root from "@figurestead/web";
import * as temporal from "@figurestead/web/extensions/temporal";

const cases = [
  () => assert.equal(root.FIGURESTEAD_PACKAGE_VERSION, "0.9.0-alpha.1"),
  () => assert.equal(typeof root.exportFigureSvg, "function"),
  () => assert.deepEqual(temporal.TEMPORAL_RENDERERS.map((renderer) => renderer.key), ["temporal_coverage", "temporal_observations"]),
];
for (const run of cases) run();
assert.equal(cases.length, 3, "expected exactly 3 packed npm checks");
console.log(JSON.stringify({ suite: "npm-packed-smoke", expectedCaseCount: 3, executedCaseCount: cases.length, result: "PASS" }));
