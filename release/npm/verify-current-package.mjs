#!/usr/bin/env node
/** Exercise the canonical retained-candidate verifier against a fresh real web/ pack. */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyCandidate } from "./verify-candidate.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageRoot = path.join(repositoryRoot, "web");
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const version = packageJson.version;
const basename = `figurestead-web-${version}.tgz`;
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "figurestead-current-real-pack-"));
const releaseRoot = path.join(temporaryRoot, "release", "npm");
const versionRoot = path.join(releaseRoot, version);
const distRoot = path.join(versionRoot, "dist");

try {
  mkdirSync(distRoot, { recursive: true });
  const packed = JSON.parse(execFileSync(
    "npm",
    ["pack", packageRoot, "--pack-destination", distRoot, "--json"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, npm_config_cache: path.join(temporaryRoot, ".npm-cache") },
    },
  ));
  assert.equal(packed.length, 1, "real current web source must produce exactly one tarball");
  assert.equal(packed[0].filename, basename, "real current pack basename must derive from web/package.json");
  const candidate = path.join(distRoot, basename);
  const digest = createHash("sha256").update(readFileSync(candidate)).digest("hex");
  writeFileSync(path.join(versionRoot, "SHA256SUMS.txt"), `${digest}  ${basename}\n`);
  const report = verifyCandidate({ version, expectedSha256: digest, releaseRoot });
  console.log(JSON.stringify({
    suite: "npm-current-real-pack-candidate-verifier",
    expectedCaseCount: 1,
    executedCaseCount: 1,
    result: report.result,
    package: report.package,
    candidate: { basename, bytes: report.candidate.bytes, sha256: digest },
    checks: report.checks,
    retainedCandidateCreated: false,
  }, null, 2));
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
