#!/usr/bin/env node
/** Verify one exact repository-retained @figurestead/web candidate without publishing. */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "@figurestead/web";
const REPOSITORY_URL = "git+https://github.com/CharlesMish/figurestead.git";
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_ROOT, "../..");

function fail(message) {
  throw new Error(`npm candidate preflight: ${message}`);
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value == null) fail(`invalid CLI arguments near ${flag ?? "end of input"}`);
    if (values[flag]) fail(`duplicate CLI option ${flag}`);
    values[flag] = value;
  }
  const version = values["--version"];
  const expectedSha256 = values["--expected-sha256"];
  const releaseRoot = values["--release-root"] ?? "release/npm";
  const unexpected = Object.keys(values).filter((key) => !["--version", "--expected-sha256", "--release-root"].includes(key));
  if (unexpected.length) fail(`unknown CLI option ${unexpected[0]}`);
  if (!VERSION_PATTERN.test(version ?? "") || version.includes("..")) fail("version must be one safe exact npm prerelease version");
  if (!SHA256_PATTERN.test(expectedSha256 ?? "")) fail("expected SHA-256 must be exactly 64 lowercase hexadecimal characters");
  return { version, expectedSha256, releaseRoot: path.resolve(process.cwd(), releaseRoot) };
}

function requireDirectory(candidate, label) {
  let stat;
  try {
    stat = lstatSync(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`${label} is missing`);
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`${label} must be a real directory, not a symlink`);
}

function requireRegularFile(candidate, label) {
  let stat;
  try {
    stat = lstatSync(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`${label} is missing`);
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`${label} must be a regular retained file, not a symlink`);
}

function requireExactMembers(directory, expected, label) {
  const members = readdirSync(directory, { withFileTypes: true });
  if (members.some((member) => member.isSymbolicLink())) fail(`${label} must not contain symlinks`);
  const actual = members.map((member) => member.name).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    fail(`${label} members differ: expected ${expected.join(", ")}; observed ${actual.join(", ") || "none"}`);
  }
}

function sha256(candidate) {
  return createHash("sha256").update(readFileSync(candidate)).digest("hex");
}

function inspectTarball(candidate, version) {
  let members;
  try {
    members = execFileSync("tar", ["-tzf", candidate], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  } catch {
    fail("exact candidate is not a readable gzip tar archive");
  }
  if (!members.length) fail("exact candidate archive is empty");
  for (const member of members) {
    const trimmed = member.endsWith("/") ? member.slice(0, -1) : member;
    if (
      member.includes("\\")
      || path.posix.isAbsolute(trimmed)
      || path.posix.normalize(trimmed) !== trimmed
      || trimmed.split("/").some((part) => part === ".." || part === ".")
      || !(trimmed === "package" || trimmed.startsWith("package/"))
    ) fail(`unsafe or unexpected archive member ${JSON.stringify(member)}`);
  }

  let packageJson;
  try {
    packageJson = JSON.parse(execFileSync(
      "tar", ["-xOf", candidate, "package/package.json"], { encoding: "utf8" },
    ));
  } catch {
    fail("exact candidate has no readable package/package.json");
  }
  if (packageJson.name !== PACKAGE_NAME) fail(`package name must be ${PACKAGE_NAME}`);
  if (packageJson.version !== version) fail(`package version must be ${version}`);
  if (packageJson.private !== false) fail("package private disposition must be false");
  if (packageJson.license !== "MIT") fail("package license must be MIT");
  if (packageJson.repository?.url !== REPOSITORY_URL) fail("package repository URL differs");
  if (packageJson.exports?.["."] !== "./src/index.js") fail("root package export differs");
  if (packageJson.exports?.["./extensions/temporal"] !== "./src/extensions/temporal/index.js") {
    fail("temporal extension export differs");
  }
  return packageJson;
}

function smokeInstalledCandidate(candidate, version) {
  const consumer = mkdtempSync(path.join(os.tmpdir(), "figurestead-npm-candidate-"));
  const npmEnvironment = { ...process.env, npm_config_cache: path.join(consumer, ".npm-cache") };
  try {
    execFileSync("npm", ["init", "--yes"], { cwd: consumer, env: npmEnvironment, stdio: "ignore" });
    execFileSync(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", candidate],
      { cwd: consumer, env: npmEnvironment, stdio: "ignore" },
    );
    const smoke = path.join(consumer, "npm-package-smoke.mjs");
    copyFileSync(path.join(REPOSITORY_ROOT, "ci/npm-package-smoke.mjs"), smoke);
    execFileSync(process.execPath, [smoke], {
      cwd: consumer,
      env: { ...npmEnvironment, EXPECTED_VERSION: version },
      stdio: "pipe",
    });
  } catch (error) {
    const detail = error?.stderr?.toString().trim();
    fail(`installed root/temporal import smoke failed${detail ? `: ${detail}` : ""}`);
  } finally {
    rmSync(consumer, { recursive: true, force: true });
  }
}

export function verifyCandidate({ version, expectedSha256, releaseRoot }) {
  const basename = `figurestead-web-${version}.tgz`;
  const versionDirectory = path.join(releaseRoot, version);
  const distDirectory = path.join(versionDirectory, "dist");
  const manifest = path.join(versionDirectory, "SHA256SUMS.txt");
  const candidate = path.join(distDirectory, basename);

  requireDirectory(releaseRoot, "npm release root");
  try {
    requireDirectory(versionDirectory, `No accepted retained npm candidate exists for version ${version}; version directory`);
  } catch (error) {
    if (String(error.message).includes("is missing")) {
      fail(`No accepted retained npm candidate exists for version ${version}. Publication is unavailable until a versioned candidate has landed through protected review.`);
    }
    throw error;
  }
  requireExactMembers(versionDirectory, ["SHA256SUMS.txt", "dist"], "versioned candidate directory");
  requireDirectory(distDirectory, "candidate dist directory");
  requireExactMembers(distDirectory, [basename], "candidate dist directory");
  requireRegularFile(manifest, "candidate checksum manifest");
  requireRegularFile(candidate, "exact expected candidate tarball");
  const realReleaseRoot = realpathSync(releaseRoot);
  if (
    realpathSync(candidate) !== path.join(realReleaseRoot, version, "dist", basename)
    || realpathSync(manifest) !== path.join(realReleaseRoot, version, "SHA256SUMS.txt")
  ) fail("candidate paths must not use symlink indirection or escape the release root");

  const manifestText = readFileSync(manifest, "utf8");
  const canonicalManifest = `${expectedSha256}  ${basename}\n`;
  if (manifestText !== canonicalManifest) {
    fail(`manifest must contain exactly one canonical record for ${basename} using the approved SHA-256`);
  }
  const manifestDigest = manifestText.slice(0, 64);
  if (manifestDigest !== expectedSha256) fail("manifest digest does not equal approved SHA-256");
  const actualSha256 = sha256(candidate);
  if (actualSha256 !== expectedSha256) fail("actual exact candidate tarball SHA-256 does not equal approved SHA-256");

  const packageJson = inspectTarball(candidate, version);
  smokeInstalledCandidate(candidate, version);
  return {
    schemaVersion: "figurestead.npm-retained-candidate-verification/1",
    result: "PASS",
    package: { name: packageJson.name, version: packageJson.version },
    candidate: {
      path: path.relative(process.cwd(), candidate) || candidate,
      basename,
      sha256: actualSha256,
      bytes: lstatSync(candidate).size,
    },
    manifest: { path: path.relative(process.cwd(), manifest) || manifest, canonicalRecordCount: 1 },
    checks: {
      exactWorkflowControlledPath: true,
      regularFilesWithoutSymlinkIndirection: true,
      canonicalManifestRecord: true,
      approvedDigestDirectlyMatchesCandidateBytes: true,
      packageIdentity: true,
      rootAndTemporalImports: true,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = verifyCandidate(parseArguments(process.argv.slice(2)));
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
