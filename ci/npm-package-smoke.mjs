import assert from "node:assert/strict";
import * as root from "@figurestead/web";
import * as temporal from "@figurestead/web/extensions/temporal";
import slipware from "@figurestead/web/themes/slipware" with { type: "json" };
import registrationInk from "@figurestead/web/themes/registration-ink" with { type: "json" };
import ultravioletLaboratory from "@figurestead/web/themes/ultraviolet-laboratory" with { type: "json" };
import lavenderFogNotebook from "@figurestead/web/themes/lavender-fog-notebook" with { type: "json" };
import midnightTransitSignalSlate from "@figurestead/web/themes/midnight-transit-signal-slate" with { type: "json" };
import deepObservatorySageCore from "@figurestead/web/themes/deep-observatory-sage-core" with { type: "json" };

const expectedVersion = process.env.EXPECTED_VERSION;
assert.ok(expectedVersion, "EXPECTED_VERSION must identify the package version under test");

const cases = [
  () => assert.equal(root.FIGURESTEAD_PACKAGE_VERSION, expectedVersion),
  () => assert.equal(typeof root.exportFigureSvg, "function"),
  () => assert.deepEqual(temporal.TEMPORAL_RENDERERS.map((renderer) => renderer.key), ["temporal_coverage", "temporal_observations"]),
  ...[
    slipware,
    registrationInk,
    ultravioletLaboratory,
    lavenderFogNotebook,
    midnightTransitSignalSlate,
    deepObservatorySageCore,
  ].map((pack) => () => assert.equal(root.validateThemePack(pack).schemaVersion, "figurestead.theme-pack/1")),
];
for (const run of cases) run();
assert.equal(cases.length, 9, "expected exactly 9 packed npm checks");
console.log(JSON.stringify({ suite: "npm-packed-smoke", expectedCaseCount: 9, executedCaseCount: cases.length, result: "PASS" }));
