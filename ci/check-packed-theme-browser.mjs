import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium, firefox } from "playwright";
import { createServer } from "vite";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(repositoryRoot, "ci", "fixtures", "npm-consumer", "browser");
const tarball = path.resolve(process.argv[2] ?? "");
if (!process.argv[2] || !fs.statSync(tarball, { throwIfNoEntry: false })?.isFile()) {
  throw new Error("usage: node ci/check-packed-theme-browser.mjs <packed-package.tgz>");
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "figurestead-packed-theme-browser-"));
let server;
try {
  fs.cpSync(fixtureRoot, temporaryRoot, { recursive: true });
  fs.writeFileSync(path.join(temporaryRoot, "package.json"), `${JSON.stringify({ name: "figurestead-packed-theme-browser", private: true, type: "module" }, null, 2)}\n`);
  const install = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", tarball], {
    cwd: temporaryRoot,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: path.join(temporaryRoot, ".npm-cache") },
  });
  if (install.status !== 0) throw new Error(`packed package install failed\n${install.stdout}\n${install.stderr}`);

  server = await createServer({ root: temporaryRoot, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0];
  if (!url) throw new Error("Vite did not expose a local packed-consumer URL");

  const results = [];
  for (const [engine, browserType] of Object.entries({ chromium, firefox })) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 760, height: 600 }, reducedMotion: "reduce" });
      const errors = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url, { waitUntil: "load" });
      await page.waitForFunction(() => document.documentElement.dataset.packageThemeReady === "true");
      const evidence = await page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        if (!canvas) throw new Error("packed consumer did not create a canvas");
        const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
        const nonTransparent = pixels ? Array.from({ length: pixels.length / 4 }, (_, index) => pixels[index * 4 + 3]).some((alpha) => alpha > 0) : false;
        return {
          ready: document.documentElement.dataset.packageThemeReady,
          theme: document.documentElement.dataset.theme,
          renderers: document.documentElement.dataset.renderers,
          nonTransparent,
        };
      });
      if (JSON.stringify(evidence) !== JSON.stringify({ ready: "true", theme: "slipware", renderers: "line", nonTransparent: true })) {
        throw new Error(`${engine}: unexpected packed theme evidence ${JSON.stringify(evidence)}`);
      }
      if (errors.length) throw new Error(`${engine}: runtime errors: ${errors.join("; ")}`);
      results.push({ engine, ...evidence });
    } finally {
      await browser.close();
    }
  }
  if (results.length !== 2) throw new Error(`expected 2 packed-theme browser cases, executed ${results.length}`);
  console.log(JSON.stringify({ suite: "npm-packed-theme-browser", expectedCaseCount: 2, executedCaseCount: results.length, result: "PASS", results }, null, 2));
} finally {
  await server?.close();
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
