import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(process.argv[2] ?? "output");
await mkdir(output, { recursive: true });
const pkg = JSON.parse(await readFile(path.join(root, "node_modules/@figurestead/web/package.json")));
if (pkg.version !== "0.9.0-alpha.5") throw new Error("Use the published alpha.5 package");
const port = Number(process.env.GALLERY_PORT ?? 43181);
const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", b => serverLog += b);
server.stderr.on("data", b => serverLog += b);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
let browser;
try {
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error(serverLog);
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`Vite did not start: ${serverLog}`);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1120, height: 800 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle" });
  await page.waitForSelector('html[data-figurestead-ready="true"]');
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4) colors.add(`${data[i]},${data[i+1]},${data[i+2]},${data[i+3]}`);
    return { png: canvas.toDataURL("image/png").split(",")[1], svg: window.galleryExample.svg, width: canvas.width, height: canvas.height, colors: colors.size };
  });
  if (errors.length || result.width !== 1008 || result.height !== 624 || result.colors < 20) throw new Error(JSON.stringify({ errors, result: { width: result.width, height: result.height, colors: result.colors } }));
  const images=[];
  for (const [extension, bytes] of [["png", Buffer.from(result.png, "base64")], ["svg", Buffer.from(result.svg)]]) {
    const file = `browser-line.${extension}`;
    await writeFile(path.join(output, file), bytes);
    images.push({ file, bytes: bytes.length, sha256: hash(bytes), width: result.width, height: result.height, theme: "ultraviolet_laboratory" });
  }
  const sources={};
  for (const file of ["main.js", "capture.mjs", "index.html", "fixture.json", "package.json", "package-lock.json"]) sources[file]=hash(await readFile(path.join(root,file)));
  const record={ package: pkg.name, version: pkg.version, node: process.version, chromium: browser.version(), platform: `${process.platform}/${process.arch}`, deviceScaleFactor: 1, state: "settled Canvas; no motion", distinctColors: result.colors, sources, images, errors };
  await writeFile(path.join(output, "browser-render.json"), JSON.stringify(record,null,2)+"\n");
  console.log(JSON.stringify({ result:"PASS", package:pkg.version, outputs:images.length, colors:result.colors }));
} finally {
  if (browser) await browser.close();
  server.kill();
}
