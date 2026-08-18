#!/usr/bin/env node
/** Deterministic, non-publishing regressions for bounded public-registry readback. */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RegistryVerificationError, verifyPublicRegistry } from "./verify-public-registry.mjs";

const VERSION = "0.9.0-alpha.2";
const PACKAGE_NAME = "@figurestead/web";
const DIST_TAG = "alpha";
const ALPHA2_SHA256 = "ac737f3e243b6cb941c801c387a9725dd565132cab5fa1e4c74cb4ebd4eb7f78";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALPHA2_CANDIDATE = path.join(HERE, VERSION, "dist", `figurestead-web-${VERSION}.tgz`);
const REGISTRY = "https://registry.example/";
const TARBALL_URL = `${REGISTRY}@figurestead/web/-/figurestead-web-${VERSION}.tgz`;
const METADATA_PATH = `/${encodeURIComponent(PACKAGE_NAME)}/${encodeURIComponent(VERSION)}`;
const TAGS_PATH = `/-/package/${encodeURIComponent(PACKAGE_NAME)}/dist-tags`;

let assertionCount = 0;
const cases = [];

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.equal(actual, expected, message);
}

function match(actual, expected, message) {
  assertionCount += 1;
  assert.match(actual, expected, message);
}

function ok(actual, message) {
  assertionCount += 1;
  assert.ok(actual, message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function metadata({ name = PACKAGE_NAME, version = VERSION, tarball = TARBALL_URL } = {}) {
  return json({ name, version, dist: { tarball } });
}

function bytesResponse(bytes, status = 200) {
  return new Response(bytes, { status, headers: { "content-type": "application/octet-stream" } });
}

function endpoint(url) {
  const parsed = new URL(url);
  if (parsed.pathname === TAGS_PATH) return "tags";
  if (parsed.pathname === METADATA_PATH) return "metadata";
  if (parsed.href === TARBALL_URL) return "tarball";
  throw new Error(`unexpected fixture URL ${url}`);
}

function exactFetch(bytes, { tagVersion = VERSION } = {}) {
  return async (url) => {
    switch (endpoint(url)) {
      case "metadata": return metadata();
      case "tarball": return bytesResponse(bytes);
      case "tags": return json({ [DIST_TAG]: tagVersion });
      default: throw new Error("unreachable fixture endpoint");
    }
  };
}

async function failure(run) {
  try {
    await run();
  } catch (error) {
    assertionCount += 1;
    assert.ok(error instanceof RegistryVerificationError, `unexpected failure type: ${error}`);
    return error;
  }
  assertionCount += 1;
  assert.fail("fixture unexpectedly passed");
}

async function test(name, run) {
  await run();
  cases.push(name);
}

const alpha2Bytes = readFileSync(ALPHA2_CANDIDATE);
equal(sha256(alpha2Bytes), ALPHA2_SHA256, "retained alpha.2 fixture authority changed");

await test("immediate success against exact retained alpha.2 bytes", async () => {
  const sleeps = [];
  const report = await verifyPublicRegistry({
    version: VERSION,
    expectedSha256: ALPHA2_SHA256,
    distTag: DIST_TAG,
    registry: REGISTRY,
    fetchImpl: exactFetch(alpha2Bytes),
    sleep: async (delay) => sleeps.push(delay),
  });
  equal(report.result, "PASS");
  equal(report.attempt, 1);
  equal(report.tarball.sha256, ALPHA2_SHA256);
  equal(report.tarball.bytes, 84_601);
  equal(sleeps.length, 0);
});

await test("exact version absent twice then visible", async () => {
  let metadataCalls = 0;
  const sleeps = [];
  const fetchImpl = async (url) => {
    if (endpoint(url) === "metadata" && ++metadataCalls <= 2) return json({ error: "Not found" }, 404);
    return exactFetch(alpha2Bytes)(url);
  };
  const report = await verifyPublicRegistry({
    version: VERSION,
    expectedSha256: ALPHA2_SHA256,
    distTag: DIST_TAG,
    registry: REGISTRY,
    fetchImpl,
    sleep: async (delay) => sleeps.push(delay),
  });
  equal(report.attempt, 3);
  equal(metadataCalls, 3);
  equal(sleeps.join(","), "5000,10000");
  equal(report.observations.length, 2);
});

await test("exact version remains absent through bounded timeout", async () => {
  let calls = 0;
  const sleeps = [];
  const error = await failure(() => verifyPublicRegistry({
    version: VERSION,
    expectedSha256: ALPHA2_SHA256,
    distTag: DIST_TAG,
    registry: REGISTRY,
    delaysMs: [0, 1, 2],
    fetchImpl: async () => {
      calls += 1;
      return json({ error: "Not found" }, 404);
    },
    sleep: async (delay) => sleeps.push(delay),
  }));
  equal(error.code, "POST_PUBLISH_VISIBILITY_TIMEOUT");
  equal(error.details.attempts, 3);
  equal(error.details.waitedMs, 3);
  equal(calls, 3);
  equal(sleeps.join(","), "1,2");
  match(error.message, /Do not republish automatically/);
});

await test("wrong public tarball digest fails immediately without retry", async () => {
  const wrongBytes = Buffer.from("wrong published artifact");
  let calls = 0;
  const sleeps = [];
  const error = await failure(() => verifyPublicRegistry({
    version: VERSION,
    expectedSha256: ALPHA2_SHA256,
    distTag: DIST_TAG,
    registry: REGISTRY,
    fetchImpl: async (url) => {
      calls += 1;
      return exactFetch(wrongBytes)(url);
    },
    sleep: async (delay) => sleeps.push(delay),
  }));
  equal(error.code, "POST_PUBLISH_INTEGRITY_FAILURE");
  equal(calls, 2);
  equal(sleeps.length, 0);
  match(error.message, /retry is forbidden/);
});

await test("metadata visible before tarball then exact tarball visible", async () => {
  let tarballCalls = 0;
  const sleeps = [];
  const fetchImpl = async (url) => {
    if (endpoint(url) === "tarball" && ++tarballCalls === 1) return bytesResponse("not found", 404);
    return exactFetch(alpha2Bytes)(url);
  };
  const report = await verifyPublicRegistry({
    version: VERSION,
    expectedSha256: ALPHA2_SHA256,
    distTag: DIST_TAG,
    registry: REGISTRY,
    fetchImpl,
    sleep: async (delay) => sleeps.push(delay),
  });
  equal(report.attempt, 2);
  equal(tarballCalls, 2);
  equal(sleeps.join(","), "5000");
  match(report.observations[0].reason, /tarball is not visible/);
});

await test("malformed exact-version response fails without retry", async () => {
  let calls = 0;
  const sleeps = [];
  const error = await failure(() => verifyPublicRegistry({
    version: VERSION,
    expectedSha256: ALPHA2_SHA256,
    distTag: DIST_TAG,
    registry: REGISTRY,
    fetchImpl: async () => {
      calls += 1;
      return new Response("not json", { status: 200 });
    },
    sleep: async (delay) => sleeps.push(delay),
  }));
  equal(error.code, "POST_PUBLISH_REGISTRY_FAILURE");
  equal(calls, 1);
  equal(sleeps.length, 0);
  match(error.message, /malformed JSON/);
});

await test("unexpected authorization response fails without retry", async () => {
  let calls = 0;
  const sleeps = [];
  const error = await failure(() => verifyPublicRegistry({
    version: VERSION,
    expectedSha256: ALPHA2_SHA256,
    distTag: DIST_TAG,
    registry: REGISTRY,
    fetchImpl: async () => {
      calls += 1;
      return json({ error: "unauthorized" }, 401);
    },
    sleep: async (delay) => sleeps.push(delay),
  }));
  equal(error.code, "POST_PUBLISH_REGISTRY_FAILURE");
  equal(calls, 1);
  equal(sleeps.length, 0);
  match(error.message, /HTTP 401/);
});

await test("dist-tag propagation is bounded after exact bytes match", async () => {
  let tagCalls = 0;
  const sleeps = [];
  const fetchImpl = async (url) => {
    if (endpoint(url) === "tags") {
      tagCalls += 1;
      return json({ [DIST_TAG]: tagCalls === 1 ? "0.9.0-alpha.1" : VERSION });
    }
    return exactFetch(alpha2Bytes)(url);
  };
  const report = await verifyPublicRegistry({
    version: VERSION,
    expectedSha256: ALPHA2_SHA256,
    distTag: DIST_TAG,
    registry: REGISTRY,
    fetchImpl,
    sleep: async (delay) => sleeps.push(delay),
  });
  equal(report.attempt, 2);
  equal(tagCalls, 2);
  equal(sleeps.join(","), "5000");
  match(report.observations[0].reason, /points to/);
});

await test("wrong package identity fails without downloading", async () => {
  let calls = 0;
  const error = await failure(() => verifyPublicRegistry({
    version: VERSION,
    expectedSha256: ALPHA2_SHA256,
    distTag: DIST_TAG,
    registry: REGISTRY,
    fetchImpl: async () => {
      calls += 1;
      return metadata({ name: "@figurestead/not-web" });
    },
    sleep: async () => assert.fail("identity failure must not sleep"),
  }));
  equal(error.code, "POST_PUBLISH_REGISTRY_FAILURE");
  equal(calls, 1);
  match(error.message, /wrong package identity/);
});

equal(cases.length, 9, "expected exactly nine registry-readback cases");
ok(assertionCount > 0, "assertion count must be nonzero");
console.log(JSON.stringify({
  suite: "npm-public-registry-readback",
  expectedCaseCount: 9,
  executedCaseCount: cases.length,
  assertionCount,
  result: "PASS",
  cases,
}, null, 2));
