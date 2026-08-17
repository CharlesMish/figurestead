import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { chromium, firefox } from "playwright";
import { createServer } from "vite";

const tarball = path.resolve(process.argv[2] ?? "");
if (!process.argv[2] || !fs.statSync(tarball, { throwIfNoEntry: false })?.isFile()) {
  throw new Error("usage: node ci/check-packed-readme-first-success.mjs <packed-package.tgz>");
}

const readme = execFileSync("tar", ["-xOf", tarball, "package/README.md"], { encoding: "utf8" });
const extract = (name, language) => {
  const marker = `<!-- figurestead-npm-first-success:${name} -->`;
  const start = readme.indexOf(marker);
  assert.notEqual(start, -1, `packed README marker missing: ${name}`);
  const fenced = readme.slice(start + marker.length).match(new RegExp("^\\s*```" + language + "\\n([\\s\\S]*?)\\n```", "u"));
  assert.ok(fenced, `packed README code fence missing after ${name}`);
  return fenced[1];
};

assert.match(readme, /This package ships first-party TypeScript declarations/);
assert.match(readme, /This package also ships six curated theme subpaths/);
assert.doesNotMatch(readme, /prepared at repository HEAD/i);
assert.doesNotMatch(readme, /future authorized npm release/i);
const html = extract("index.html", "html");
const javascript = extract("main.js", "js");
const importSpecifiers = [...javascript.matchAll(/from\s+"([^"]+)"/gu)].map((match) => match[1]);
assert.ok(importSpecifiers.length >= 2, "README example must import the package root and a curated theme");
assert.ok(importSpecifiers.every((specifier) => specifier === "@figurestead/web" || specifier.startsWith("@figurestead/web/")), "README example must not use repository-relative imports");

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "figurestead-packed-readme-first-success-"));
let server;
try {
  fs.writeFileSync(path.join(temporaryRoot, "package.json"), `${JSON.stringify({ name: "figurestead-readme-first-success", private: true, type: "module" }, null, 2)}\n`);
  fs.writeFileSync(path.join(temporaryRoot, "index.html"), `${html}\n`);
  fs.writeFileSync(path.join(temporaryRoot, "main.js"), `${javascript}\n`);
  const install = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", tarball], {
    cwd: temporaryRoot,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: path.join(temporaryRoot, ".npm-cache") },
  });
  if (install.status !== 0) throw new Error(`packed README consumer install failed\n${install.stdout}\n${install.stderr}`);

  server = await createServer({ root: temporaryRoot, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0];
  if (!url) throw new Error("Vite did not expose a local README consumer URL");

  const results = [];
  for (const [engine, browserType] of Object.entries({ chromium, firefox })) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 840, height: 650 }, reducedMotion: "reduce" });
      const errors = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url, { waitUntil: "load" });
      await page.waitForFunction(() => document.documentElement.dataset.figuresteadReady === "true");
      const evidence = await page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        if (!canvas) throw new Error("README first success did not provide a canvas");
        const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
        return {
          ready: document.documentElement.dataset.figuresteadReady,
          width: canvas.width,
          height: canvas.height,
          nonTransparent: pixels ? Array.from({ length: pixels.length / 4 }, (_, index) => pixels[index * 4 + 3]).some((alpha) => alpha > 0) : false,
        };
      });
      assert.deepEqual(evidence, { ready: "true", width: 760, height: 520, nonTransparent: true }, `${engine}: README evidence differs`);
      assert.deepEqual(errors, [], `${engine}: README example runtime errors`);
      results.push({ engine, ...evidence });
    } finally {
      await browser.close();
    }
  }

  assert.equal(results.length, 2, "expected Chromium and Firefox README cases");
  console.log(JSON.stringify({
    suite: "npm-packed-readme-first-success",
    expectedCaseCount: 8,
    executedCaseCount: 8,
    packedReadmeSha256: crypto.createHash("sha256").update(readme).digest("hex"),
    packageOnlyImportSpecifiers: importSpecifiers,
    result: "PASS",
    results,
  }, null, 2));
} finally {
  await server?.close();
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
