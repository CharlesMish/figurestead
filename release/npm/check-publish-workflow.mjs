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

const cases = [
  ["canonical verifier runs in both gates", (workflow.match(/node release\/npm\/verify-candidate\.mjs/g) ?? []).length === 2],
  ["unprivileged gate has no environment", !/^    environment:/m.test(unprivilegedGate)],
  ["unprivileged gate has no OIDC permission", !/id-token:\s*write/.test(unprivilegedGate)],
  ["publish waits for candidate gate", /needs:\s*verify-candidate/.test(privilegedPublish)],
  ["publication environment belongs only to publish job", /^    environment:/m.test(privilegedPublish)],
  ["OIDC belongs only to publish job", /id-token:\s*write/.test(privilegedPublish)],
  ["publish consumes exact workflow-derived tarball", /npm publish\s+"release\/npm\/\$VERSION\/dist\/figurestead-web-\$VERSION\.tgz"/m.test(privilegedPublish)],
  ["workflow never delegates path selection to the manifest", !workflow.includes("SHA256SUMS.txt")],
];

for (const [name, passed] of cases) assert.equal(passed, true, name);
console.log(JSON.stringify({
  suite: "npm-publish-workflow-integrity",
  expectedCaseCount: 8,
  executedCaseCount: cases.length,
  result: "PASS",
  cases: cases.map(([name]) => name),
}, null, 2));
