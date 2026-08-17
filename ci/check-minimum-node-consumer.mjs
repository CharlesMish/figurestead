import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tarball = path.resolve(process.argv[2] ?? "");
if (!process.argv[2] || !fs.statSync(tarball, { throwIfNoEntry: false })?.isFile()) {
  throw new Error("usage: node ci/check-minimum-node-consumer.mjs <packed-package.tgz>");
}

const packageJson = JSON.parse(execFileSync("tar", ["-xOf", tarball, "package/package.json"], { encoding: "utf8" }));
assert.equal(packageJson.engines?.node, ">=22.22.0", "public consumer Node floor drifted");
const [major, minor] = process.versions.node.split(".").map(Number);
assert.ok(major > 22 || (major === 22 && minor >= 22), `consumer smoke requires Node >=22.22.0; observed ${process.version}`);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "figurestead-minimum-node-consumer-"));
try {
  fs.writeFileSync(path.join(temporaryRoot, "package.json"), `${JSON.stringify({ name: "figurestead-minimum-node-consumer", private: true, type: "module" }, null, 2)}\n`);
  const environment = { ...process.env, npm_config_cache: path.join(temporaryRoot, ".npm-cache"), npm_config_engine_strict: "true" };
  const install = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", tarball], {
    cwd: temporaryRoot,
    env: environment,
    encoding: "utf8",
  });
  if (install.status !== 0) throw new Error(`engine-strict packed install failed\n${install.stdout}\n${install.stderr}`);
  fs.copyFileSync(path.join(repositoryRoot, "ci", "npm-package-smoke.mjs"), path.join(temporaryRoot, "npm-package-smoke.mjs"));
  execFileSync(process.execPath, [path.join(temporaryRoot, "npm-package-smoke.mjs")], {
    cwd: temporaryRoot,
    env: { ...environment, EXPECTED_VERSION: packageJson.version },
    stdio: "inherit",
  });
  console.log(JSON.stringify({
    suite: "npm-minimum-node-consumer",
    expectedCaseCount: 11,
    executedCaseCount: 11,
    node: process.version,
    engines: packageJson.engines.node,
    engineStrictInstall: "PASS",
    runtimeImportCases: 9,
    result: "PASS",
  }));
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
