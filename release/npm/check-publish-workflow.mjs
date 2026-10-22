#!/usr/bin/env node
/** Static release-authority checks for the npm publication workflow. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = readFileSync(path.join(repositoryRoot, ".github/workflows/publish-npm.yml"), "utf8");
const verifyStart = workflow.indexOf("  verify-candidate:\n");
const publishStart = workflow.indexOf("  publish:\n");
const verifyPublicStart = workflow.indexOf("  verify-public:\n");
assert.ok(verifyStart >= 0 && publishStart > verifyStart && verifyPublicStart > publishStart);
const unprivilegedGate = workflow.slice(verifyStart, publishStart);
const privilegedPublish = workflow.slice(publishStart, verifyPublicStart);
const publicReadback = workflow.slice(verifyPublicStart);

const cases = [
  ["canonical verifier runs in both gates", (workflow.match(/node release\/npm\/verify-candidate\.mjs/g) ?? []).length === 2],
  ["unprivileged gate has no environment", !/^    environment:/m.test(unprivilegedGate)],
  ["unprivileged gate has no OIDC permission", !/id-token:\s*write/.test(unprivilegedGate)],
  ["publish waits for candidate gate", /needs:\s*verify-candidate/.test(privilegedPublish)],
  ["publication environment belongs only to publish job", /^    environment:/m.test(privilegedPublish)],
  ["OIDC belongs only to publish job", /id-token:\s*write/.test(privilegedPublish)],
  ["publish consumes exact workflow-derived tarball", /npm publish\s+"release\/npm\/\$VERSION\/dist\/figurestead-web-\$VERSION\.tgz"/m.test(privilegedPublish)],
  ["publication-command failure has a distinct terminal summary", /steps\.npm-publish\.outcome == 'failure'/.test(privilegedPublish)],
  ["workflow never delegates path selection to the manifest", !workflow.includes("SHA256SUMS.txt")],
  ["public readback waits for successful publish", /needs:\s*publish/.test(publicReadback)],
  ["public readback checks out committed verification authority", /actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803/.test(publicReadback)],
  ["public readback uses canonical propagation-aware verifier", /node release\/npm\/verify-public-registry\.mjs/.test(publicReadback)],
  ["public readback receives exact approved digest", /--expected-sha256 "\$EXPECTED_SHA256"/.test(publicReadback)],
  ["public readback receives requested dist-tag", /--dist-tag "\$DIST_TAG"/.test(publicReadback)],
  ["public readback has no OIDC permission", !/id-token:\s*write/.test(publicReadback)],
  ["public readback no longer relies on immediate npm pack", !/npm pack/.test(publicReadback)],
];

// Secure runners are separate from the unchanged public consumer engine floor.
const correctness = readFileSync(path.join(repositoryRoot, ".github/workflows/pr-correctness.yml"), "utf8");
function verifyToolchains(publisher, ci) {
  assert.deepEqual([...publisher.matchAll(/node-version: ([^\s]+)/g)].map((match) => match[1]),
    ["24.22.1", "24.22.1", "24.22.1"], "publisher Node pins");
  assert.equal(publisher.split('test "$(node --version)" = "v24.22.1"').length - 1, 2, "publisher Node assertions");
  assert.equal(publisher.split('test "$(npm --version)" = "11.19.1"').length - 1, 2, "publisher npm assertions");
  assert.deepEqual([...ci.matchAll(/node-version: ([^\s]+)/g)].map((match) => match[1]).sort(),
    ["22.23.4", "24.22.1", "24.22.1", "24.22.1"], "correctness Node pins");
  for (const [node, npm, count] of [["24.22.1", "11.19.1", 3], ["22.23.4", "10.9.9", 1]]) {
    assert.equal(ci.split(`test "$(node --version)" = "v${node}"`).length - 1, count, "correctness Node assertions");
    assert.equal(ci.split(`test "$(npm --version)" = "${npm}"`).length - 1, count, "correctness npm assertions");
  }
}
verifyToolchains(workflow, correctness);
cases.push(["secure Node and bundled npm pins and runtime assertions agree", true]);
const publicPackage = JSON.parse(readFileSync(path.join(repositoryRoot, "web/package.json"), "utf8"));
cases.push(["public consumer engine floor remains distinct from runner pins", publicPackage.engines.node === ">=22.22.0"]);
// A stale setup pin or exact-version assertion must fail before publication.
for (const [name, publisher, ci] of [
  ["publisher Node pin", workflow.replace("node-version: 24.22.1", "node-version: 24.17.0"), correctness],
  ["publisher Node assertion", workflow.replace('= "v24.22.1"', '= "v24.17.0"'), correctness],
  ["publisher npm assertion", workflow.replace('= "11.19.1"', '= "11.13.0"'), correctness],
  ["Node22 CI pin", workflow, correctness.replace("node-version: 22.23.4", "node-version: 22.22.0")],
  ["Node22 npm assertion", workflow, correctness.replace('= "10.9.9"', '= "10.9.0"')],
  ["Node24 CI assertion", workflow, correctness.replace('= "v24.22.1"', '= "v24.17.0"')],
]) {
  assert.throws(() => verifyToolchains(publisher, ci), assert.AssertionError, name);
  cases.push([`stale ${name} rejects`, true]);
}

for (const [name, passed] of cases) assert.equal(passed, true, name);
console.log(JSON.stringify({
  suite: "npm-publish-workflow-integrity",
  expectedCaseCount: 24,
  executedCaseCount: cases.length,
  result: "PASS",
  cases: cases.map(([name]) => name),
}, null, 2));
