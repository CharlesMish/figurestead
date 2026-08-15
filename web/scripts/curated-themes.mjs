import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(webRoot, "..");
const canonicalRoot = path.join(repositoryRoot, "src", "figurestead", "themes");
const packageRoot = path.join(webRoot, "themes");
const themeFiles = Object.freeze([
  "slipware.json",
  "registration_ink.json",
  "ultraviolet_laboratory.json",
  "lavender_fog_notebook.json",
  "midnight_transit_signal_slate.json",
  "deep_observatory_sage_core.json",
]);
const report = (value) => {
  if (process.env.FIGURESTEAD_THEME_STAGE_REPORT === "1") console.log(JSON.stringify(value));
};

function assertInside(child, parent, label) {
  const relative = path.relative(parent, child);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a child of ${parent}`);
  }
}

function stage() {
  assertInside(packageRoot, webRoot, "theme staging directory");
  const authoritative = fs.readdirSync(canonicalRoot).filter((name) => name.endsWith(".json")).sort();
  const expected = [...themeFiles].sort();
  if (JSON.stringify(authoritative) !== JSON.stringify(expected)) {
    throw new Error(`curated theme authority changed; expected ${expected.join(", ")}, found ${authoritative.join(", ")}`);
  }
  fs.rmSync(packageRoot, { recursive: true, force: true });
  fs.mkdirSync(packageRoot, { recursive: true });
  for (const filename of themeFiles) {
    const source = path.join(canonicalRoot, filename);
    const destination = path.join(packageRoot, filename);
    const pack = JSON.parse(fs.readFileSync(source, "utf8"));
    if (pack.schemaVersion !== "figurestead.theme-pack/1" || Object.keys(pack.themes ?? {}).length !== 1) {
      throw new Error(`canonical curated theme ${filename} is not one single-theme Figurestead pack`);
    }
    fs.copyFileSync(source, destination);
    if (!fs.readFileSync(source).equals(fs.readFileSync(destination))) {
      throw new Error(`staged theme bytes differ from canonical authority: ${filename}`);
    }
  }
  report({ action: "stage-curated-themes", files: themeFiles.length, result: "PASS" });
}

function clean() {
  assertInside(packageRoot, webRoot, "theme staging directory");
  fs.rmSync(packageRoot, { recursive: true, force: true });
  report({ action: "clean-curated-themes", result: "PASS" });
}

const action = process.argv[2];
if (action === "stage") stage();
else if (action === "clean") clean();
else throw new Error("usage: node web/scripts/curated-themes.mjs <stage|clean>");
