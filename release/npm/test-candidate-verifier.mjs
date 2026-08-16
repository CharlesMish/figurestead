#!/usr/bin/env node
/** Adversarial, non-publishing regressions for the retained npm candidate boundary. */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CURATED_THEME_PACKAGES } from "../../web/scripts/curated-themes.mjs";

const VERSION = "1.2.3-alpha.4";
const BASENAME = `figurestead-web-${VERSION}.tgz`;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(HERE, "../..");
const CANONICAL_THEME_ROOT = path.join(REPOSITORY_ROOT, "src", "figurestead", "themes");
const VERIFIER = path.join(HERE, "verify-candidate.mjs");
const TEMP = mkdtempSync(path.join(os.tmpdir(), "figurestead-npm-verifier-tests-"));
const NPM_ENVIRONMENT = { ...process.env, npm_config_cache: path.join(TEMP, ".npm-cache") };

function sha256(candidate) {
  return createHash("sha256").update(readFileSync(candidate)).digest("hex");
}

function createCandidate(root, {
  packageName = "@figurestead/web",
  packageVersion = VERSION,
  omitThemeExport = null,
  omitThemeFile = null,
  mutateThemeFile = null,
} = {}) {
  const source = path.join(root, "source");
  const releaseRoot = path.join(root, "release", "npm");
  const dist = path.join(releaseRoot, VERSION, "dist");
  mkdirSync(path.join(source, "src", "extensions", "temporal"), { recursive: true });
  mkdirSync(path.join(source, "types", "extensions"), { recursive: true });
  mkdirSync(path.join(source, "themes"), { recursive: true });
  mkdirSync(dist, { recursive: true });
  const themeExports = Object.fromEntries(CURATED_THEME_PACKAGES
    .filter(({ filename }) => filename !== omitThemeExport)
    .map(({ subpath, filename }) => [subpath, { types: "./types/theme-json.d.ts", default: `./themes/${filename}` }]));
  writeFileSync(path.join(source, "package.json"), JSON.stringify({
    name: packageName,
    version: packageVersion,
    private: false,
    type: "module",
    license: "MIT",
    repository: { type: "git", url: "git+https://github.com/CharlesMish/figurestead.git", directory: "web" },
    types: "./types/index.d.ts",
    exports: {
      ".": { types: "./types/index.d.ts", import: "./src/index.js" },
      "./extensions/temporal": { types: "./types/extensions/temporal.d.ts", import: "./src/extensions/temporal/index.js" },
      ...themeExports,
    },
    files: ["src", "types", "themes"],
  }, null, 2) + "\n");
  writeFileSync(path.join(source, "src", "index.js"), [
    `export const FIGURESTEAD_PACKAGE_VERSION = ${JSON.stringify(packageVersion)};`,
    "export function exportFigureSvg() { return '<svg/>'; }",
    "export function validateThemePack(pack) { if (pack?.schemaVersion !== 'figurestead.theme-pack/1') throw new TypeError('invalid theme pack'); return pack; }",
    "",
  ].join("\n"));
  writeFileSync(path.join(source, "types", "index.d.ts"), "export declare const FIGURESTEAD_PACKAGE_VERSION: string;\n");
  writeFileSync(path.join(source, "types", "extensions", "temporal.d.ts"), "export declare const TEMPORAL_RENDERERS: readonly unknown[];\n");
  writeFileSync(path.join(source, "types", "theme-json.d.ts"), "declare const pack: unknown; export default pack;\n");
  CURATED_THEME_PACKAGES.forEach(({ filename }) => {
    if (filename === omitThemeFile) return;
    const destination = path.join(source, "themes", filename);
    cpSync(path.join(CANONICAL_THEME_ROOT, filename), destination);
    if (filename === mutateThemeFile) appendFileSync(destination, "\n");
  });
  writeFileSync(path.join(source, "src", "extensions", "temporal", "index.js"), [
    "export const TEMPORAL_RENDERERS = [",
    "  { key: 'temporal_coverage' },",
    "  { key: 'temporal_observations' },",
    "];",
    "",
  ].join("\n"));
  const packed = JSON.parse(execFileSync(
    "npm", ["pack", source, "--pack-destination", dist, "--json"], { encoding: "utf8", env: NPM_ENVIRONMENT },
  ))[0].filename;
  const candidate = path.join(dist, BASENAME);
  if (packed !== BASENAME) renameSync(path.join(dist, packed), candidate);
  const digest = sha256(candidate);
  writeFileSync(path.join(releaseRoot, VERSION, "SHA256SUMS.txt"), `${digest}  ${BASENAME}\n`);
  return { releaseRoot, candidate, manifest: path.join(releaseRoot, VERSION, "SHA256SUMS.txt"), digest, expectedSha256: digest };
}

function cloneFixture(source, label) {
  const root = path.join(TEMP, label);
  cpSync(source, root, { recursive: true });
  return {
    releaseRoot: path.join(root, "release", "npm"),
    candidate: path.join(root, "release", "npm", VERSION, "dist", BASENAME),
    manifest: path.join(root, "release", "npm", VERSION, "SHA256SUMS.txt"),
  };
}

function runVerifier({ releaseRoot, expectedSha256 }, expectedPattern = null) {
  const result = spawnSync(process.execPath, [
    VERIFIER,
    "--version", VERSION,
    "--expected-sha256", expectedSha256,
    "--release-root", releaseRoot,
  ], { encoding: "utf8", env: NPM_ENVIRONMENT });
  const output = `${result.stdout}\n${result.stderr}`;
  if (expectedPattern == null) {
    assert.equal(result.status, 0, output);
    assert.equal(JSON.parse(result.stdout).result, "PASS");
  } else {
    assert.notEqual(result.status, 0, "adversarial fixture unexpectedly passed");
    assert.match(output, expectedPattern);
  }
}

const cases = [];
function test(name, run) {
  run();
  cases.push(name);
}

try {
  const validRoot = path.join(TEMP, "valid-base");
  const valid = createCandidate(validRoot);

  test("valid exact retained candidate", () => runVerifier(valid));

  test("wrong approved digest", () => {
    const fixture = cloneFixture(validRoot, "wrong-approved-digest");
    const wrongDigest = "0".repeat(64);
    writeFileSync(fixture.manifest, `${wrongDigest}  ${BASENAME}\n`);
    runVerifier({ ...fixture, expectedSha256: wrongDigest }, /actual exact candidate tarball SHA-256 does not equal approved/);
  });

  test("manifest names unrelated repository file", () => {
    const fixture = cloneFixture(validRoot, "unrelated-file");
    const unrelated = path.join(TEMP, "unrelated-file", "README.md");
    writeFileSync(unrelated, "unrelated evidence\n");
    const digest = sha256(unrelated);
    writeFileSync(fixture.manifest, `${digest}  ..\/..\/..\/..\/README.md\n`);
    runVerifier({ ...fixture, expectedSha256: digest }, /manifest must contain exactly one canonical record/);
  });

  test("manifest traversal pathname", () => {
    const fixture = cloneFixture(validRoot, "traversal");
    writeFileSync(fixture.manifest, `${valid.digest}  ..\/..\/README.md\n`);
    runVerifier({ ...fixture, expectedSha256: valid.digest }, /manifest must contain exactly one canonical record/);
  });

  test("manifest names another tarball", () => {
    const fixture = cloneFixture(validRoot, "second-tarball");
    const otherTarball = path.join(TEMP, "second-tarball", "another.tgz");
    cpSync(fixture.candidate, otherTarball);
    appendFileSync(fixture.candidate, "different publish target");
    const otherDigest = sha256(otherTarball);
    writeFileSync(fixture.manifest, `${otherDigest}  ..\/..\/..\/..\/another.tgz\n`);
    runVerifier({ ...fixture, expectedSha256: otherDigest }, /manifest must contain exactly one canonical record/);
  });

  test("correct bytes under wrong basename", () => {
    const fixture = cloneFixture(validRoot, "wrong-basename");
    renameSync(fixture.candidate, path.join(path.dirname(fixture.candidate), "unexpected.tgz"));
    runVerifier({ ...fixture, expectedSha256: valid.digest }, /candidate dist directory members differ/);
  });

  test("wrong package name", () => {
    const fixtureRoot = path.join(TEMP, "wrong-name");
    const fixture = createCandidate(fixtureRoot, { packageName: "@figurestead/not-web" });
    runVerifier(fixture, /package name must be @figurestead\/web/);
  });

  test("wrong package version", () => {
    const fixtureRoot = path.join(TEMP, "wrong-version");
    const fixture = createCandidate(fixtureRoot, { packageVersion: "1.2.3-alpha.5" });
    runVerifier(fixture, /package version must be 1\.2\.3-alpha\.4/);
  });

  test("candidate mutated after manifest", () => {
    const fixture = cloneFixture(validRoot, "mutated");
    appendFileSync(fixture.candidate, "mutation");
    runVerifier({ ...fixture, expectedSha256: valid.digest }, /actual exact candidate tarball SHA-256 does not equal approved/);
  });

  test("missing candidate version", () => {
    const releaseRoot = path.join(TEMP, "missing", "release", "npm");
    mkdirSync(releaseRoot, { recursive: true });
    runVerifier({ releaseRoot, expectedSha256: valid.digest }, /No accepted retained npm candidate exists/);
  });

  test("empty manifest", () => {
    const fixture = cloneFixture(validRoot, "empty-manifest");
    writeFileSync(fixture.manifest, "");
    runVerifier({ ...fixture, expectedSha256: valid.digest }, /manifest must contain exactly one canonical record/);
  });

  test("duplicate manifest records", () => {
    const fixture = cloneFixture(validRoot, "duplicate-manifest");
    writeFileSync(fixture.manifest, `${valid.digest}  ${BASENAME}\n${valid.digest}  ${BASENAME}\n`);
    runVerifier({ ...fixture, expectedSha256: valid.digest }, /manifest must contain exactly one canonical record/);
  });

  test("malformed manifest SHA", () => {
    const fixture = cloneFixture(validRoot, "malformed-sha");
    writeFileSync(fixture.manifest, `${"g".repeat(64)}  ${BASENAME}\n`);
    runVerifier({ ...fixture, expectedSha256: valid.digest }, /manifest must contain exactly one canonical record/);
  });

  test("absolute manifest pathname", () => {
    const fixture = cloneFixture(validRoot, "absolute-path");
    writeFileSync(fixture.manifest, `${valid.digest}  /tmp/${BASENAME}\n`);
    runVerifier({ ...fixture, expectedSha256: valid.digest }, /manifest must contain exactly one canonical record/);
  });

  test("candidate symlink indirection", () => {
    const fixture = cloneFixture(validRoot, "symlink");
    const external = path.join(TEMP, "external-valid.tgz");
    cpSync(fixture.candidate, external);
    rmSync(fixture.candidate);
    symlinkSync(external, fixture.candidate);
    runVerifier({ ...fixture, expectedSha256: valid.digest }, /must not contain symlinks/);
  });

  test("missing curated theme export", () => {
    const fixture = createCandidate(path.join(TEMP, "missing-theme-export"), { omitThemeExport: "slipware.json" });
    runVerifier(fixture, /public package export subpaths differ/);
  });

  test("missing curated theme member", () => {
    const fixture = createCandidate(path.join(TEMP, "missing-theme-member"), { omitThemeFile: "slipware.json" });
    runVerifier(fixture, /curated theme member is missing/);
  });

  test("curated theme bytes differ from canonical authority", () => {
    const fixture = createCandidate(path.join(TEMP, "mutated-theme"), { mutateThemeFile: "slipware.json" });
    runVerifier(fixture, /curated theme bytes differ from canonical authority/);
  });

  assert.equal(cases.length, 18, "expected exactly 18 npm candidate integrity cases");
  console.log(JSON.stringify({
    suite: "npm-candidate-integrity",
    expectedCaseCount: 18,
    executedCaseCount: cases.length,
    result: "PASS",
    cases,
  }, null, 2));
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}
