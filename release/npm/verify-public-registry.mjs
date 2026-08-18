#!/usr/bin/env node
/** Bounded post-publish verification of exact @figurestead/web registry bytes. */

import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DIST_TAG_PATTERN = /^[a-z][a-z0-9._-]*$/;
export const DEFAULT_DELAYS_MS = Object.freeze([0, 5_000, 10_000, 15_000, 30_000, 30_000, 30_000]);

export class RegistryVerificationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RegistryVerificationError";
    this.code = code;
    this.details = details;
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function registryUrl(registry, pathname) {
  return new URL(pathname, registry).href;
}

function failRegistry(message, details = {}) {
  throw new RegistryVerificationError("POST_PUBLISH_REGISTRY_FAILURE", message, details);
}

async function readJson(response, label) {
  let value;
  try {
    value = await response.json();
  } catch {
    failRegistry(`${label} returned malformed JSON`, { status: response.status });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    failRegistry(`${label} returned an unexpected JSON shape`, { status: response.status });
  }
  return value;
}

async function oneAttempt({ packageName, version, expectedSha256, distTag, registry, fetchImpl }) {
  const encodedPackage = encodeURIComponent(packageName);
  const encodedVersion = encodeURIComponent(version);
  const metadataUrl = registryUrl(registry, `${encodedPackage}/${encodedVersion}`);
  let response;
  try {
    response = await fetchImpl(metadataUrl, { headers: { accept: "application/json" } });
  } catch (error) {
    failRegistry(`exact-version metadata request failed: ${error.message}`);
  }
  if (response.status === 404) {
    return { retryable: true, reason: "exact version is not visible yet" };
  }
  if (response.status !== 200) {
    failRegistry(`exact-version metadata returned HTTP ${response.status}`, { status: response.status });
  }

  const metadata = await readJson(response, "exact-version metadata");
  if (metadata.name !== packageName || metadata.version !== version) {
    failRegistry("exact-version metadata has the wrong package identity", {
      observedName: metadata.name,
      observedVersion: metadata.version,
    });
  }
  if (typeof metadata.dist?.tarball !== "string" || metadata.dist.tarball.length === 0) {
    failRegistry("exact-version metadata has no usable dist.tarball URL");
  }

  let tarballUrl;
  try {
    tarballUrl = new URL(metadata.dist.tarball);
  } catch {
    failRegistry("exact-version metadata contains an invalid dist.tarball URL");
  }
  const registryOrigin = new URL(registry).origin;
  if (tarballUrl.protocol !== "https:" || tarballUrl.origin !== registryOrigin || tarballUrl.username || tarballUrl.password) {
    failRegistry("dist.tarball must be an unauthenticated HTTPS URL on the configured registry origin", {
      observedTarballUrl: tarballUrl.href,
    });
  }

  try {
    response = await fetchImpl(tarballUrl.href, { headers: { accept: "application/octet-stream" } });
  } catch (error) {
    failRegistry(`exact tarball request failed: ${error.message}`);
  }
  if (response.status === 404) {
    return { retryable: true, reason: "version metadata is visible but its tarball is not visible yet" };
  }
  if (response.status !== 200) {
    failRegistry(`exact tarball returned HTTP ${response.status}`, { status: response.status });
  }
  const tarballBytes = Buffer.from(await response.arrayBuffer());
  const actualSha256 = sha256(tarballBytes);
  if (actualSha256 !== expectedSha256) {
    throw new RegistryVerificationError(
      "POST_PUBLISH_INTEGRITY_FAILURE",
      "public tarball SHA-256 differs from the approved retained candidate; retry is forbidden",
      { expectedSha256, actualSha256, bytes: tarballBytes.length },
    );
  }

  const tagsUrl = registryUrl(registry, `-/package/${encodedPackage}/dist-tags`);
  try {
    response = await fetchImpl(tagsUrl, { headers: { accept: "application/json" } });
  } catch (error) {
    failRegistry(`dist-tag request failed: ${error.message}`);
  }
  if (response.status === 404) {
    return { retryable: true, reason: `dist-tag ${distTag} is not visible yet` };
  }
  if (response.status !== 200) {
    failRegistry(`dist-tag metadata returned HTTP ${response.status}`, { status: response.status });
  }
  const tags = await readJson(response, "dist-tag metadata");
  if (tags[distTag] !== version) {
    return {
      retryable: true,
      reason: `dist-tag ${distTag} points to ${JSON.stringify(tags[distTag] ?? null)} instead of ${version}`,
    };
  }

  return {
    retryable: false,
    tarball: { url: tarballUrl.href, sha256: actualSha256, bytes: tarballBytes.length },
  };
}

function validateOptions({ packageName, version, expectedSha256, distTag, registry, delaysMs }) {
  if (packageName !== "@figurestead/web") failRegistry("package name must be exactly @figurestead/web");
  if (!VERSION_PATTERN.test(version ?? "") || version.includes("..")) failRegistry("version must be one safe exact npm version");
  if (!SHA256_PATTERN.test(expectedSha256 ?? "")) failRegistry("expected SHA-256 must be 64 lowercase hexadecimal characters");
  if (!DIST_TAG_PATTERN.test(distTag ?? "")) failRegistry("dist-tag is invalid");
  let parsedRegistry;
  try {
    parsedRegistry = new URL(registry);
  } catch {
    failRegistry("registry must be a valid URL");
  }
  if (parsedRegistry.protocol !== "https:" || parsedRegistry.username || parsedRegistry.password) {
    failRegistry("registry must be an unauthenticated HTTPS URL");
  }
  if (!Array.isArray(delaysMs) || delaysMs.length === 0 || delaysMs[0] !== 0
      || delaysMs.some((delay) => !Number.isSafeInteger(delay) || delay < 0)) {
    failRegistry("retry schedule must be a nonempty integer array beginning with zero");
  }
}

export async function verifyPublicRegistry({
  packageName = "@figurestead/web",
  version,
  expectedSha256,
  distTag,
  registry = "https://registry.npmjs.org/",
  delaysMs = DEFAULT_DELAYS_MS,
  fetchImpl = globalThis.fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  log = () => {},
}) {
  validateOptions({ packageName, version, expectedSha256, distTag, registry, delaysMs });
  if (typeof fetchImpl !== "function") failRegistry("fetch implementation is unavailable");
  let waitedMs = 0;
  const observations = [];

  for (let index = 0; index < delaysMs.length; index += 1) {
    const delayMs = delaysMs[index];
    if (delayMs > 0) {
      log(`waiting ${delayMs} ms before registry-readback attempt ${index + 1}/${delaysMs.length}`);
      await sleep(delayMs);
      waitedMs += delayMs;
    }
    const attempt = index + 1;
    const result = await oneAttempt({ packageName, version, expectedSha256, distTag, registry, fetchImpl });
    if (!result.retryable) {
      log(`registry-readback attempt ${attempt}/${delaysMs.length}: exact bytes and dist-tag confirmed`);
      return {
        schemaVersion: "figurestead.npm-public-registry-verification/1",
        result: "PASS",
        package: { name: packageName, version },
        distTag,
        attempt,
        waitedMs,
        retryScheduleMs: [...delaysMs],
        tarball: result.tarball,
        checks: {
          exactVersionMetadata: true,
          exactApprovedDigest: true,
          requestedDistTag: true,
        },
        observations,
      };
    }
    observations.push({ attempt, reason: result.reason });
    log(`registry-readback attempt ${attempt}/${delaysMs.length}: WAIT — ${result.reason}`);
  }

  throw new RegistryVerificationError(
    "POST_PUBLISH_VISIBILITY_TIMEOUT",
    "npm reported publication success, but bounded registry readback could not confirm the exact public version, tarball, and dist-tag. Do not republish automatically.",
    { attempts: delaysMs.length, waitedMs, observations },
  );
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value == null) failRegistry(`invalid CLI arguments near ${flag ?? "end of input"}`);
    if (values[flag]) failRegistry(`duplicate CLI option ${flag}`);
    values[flag] = value;
  }
  const allowed = ["--package", "--version", "--expected-sha256", "--dist-tag", "--registry"];
  const unexpected = Object.keys(values).filter((key) => !allowed.includes(key));
  if (unexpected.length) failRegistry(`unknown CLI option ${unexpected[0]}`);
  return {
    packageName: values["--package"] ?? "@figurestead/web",
    version: values["--version"],
    expectedSha256: values["--expected-sha256"],
    distTag: values["--dist-tag"],
    registry: values["--registry"] ?? "https://registry.npmjs.org/",
  };
}

function appendSummary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await verifyPublicRegistry({
      ...parseArguments(process.argv.slice(2)),
      log: (message) => console.error(message),
    });
    console.log(JSON.stringify(report, null, 2));
    appendSummary([
      "### Post-publish registry verification: confirmed",
      "",
      `- Exact public artifact: \`${report.package.name}@${report.package.version}\``,
      `- SHA-256: \`${report.tarball.sha256}\``,
      `- Dist-tag: \`${report.distTag}\``,
      `- Attempts: ${report.attempt}; bounded wait: ${report.waitedMs} ms`,
    ].join("\n"));
  } catch (error) {
    const code = error instanceof RegistryVerificationError ? error.code : "POST_PUBLISH_REGISTRY_FAILURE";
    const details = error instanceof RegistryVerificationError ? error.details : {};
    console.error(`${code}: ${error.message}`);
    if (Object.keys(details).length) console.error(JSON.stringify(details, null, 2));
    appendSummary([
      `### Post-publish registry verification: ${code}`,
      "",
      "The npm publish command had already reported success. Registry identity could not be accepted by this separate readback gate.",
      "Do not automatically republish, recut, or change authentication in response to this result.",
      "",
      `- Detail: ${error.message}`,
    ].join("\n"));
    process.exitCode = 1;
  }
}
