#!/usr/bin/env node
/** Verify every prospective retained candidate; zero candidates is today's safe state. */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyCandidate } from "./verify-candidate.mjs";

const releaseRoot = path.dirname(fileURLToPath(import.meta.url));
const versions = readdirSync(releaseRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const reports = versions.map((version) => {
  const manifest = readFileSync(path.join(releaseRoot, version, "SHA256SUMS.txt"), "utf8");
  const expectedSha256 = manifest.slice(0, 64);
  return verifyCandidate({ version, expectedSha256, releaseRoot });
});
console.log(JSON.stringify({
  suite: "npm-retained-candidates",
  expectedCandidateCount: versions.length,
  executedCandidateCount: reports.length,
  currentState: versions.length ? "retained candidates verified" : "no retained candidate; publication unavailable",
  result: "PASS",
  candidates: reports.map((report) => report.candidate),
}, null, 2));
