import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(webRoot, "..");
const canonicalRoot = path.join(repositoryRoot, "src", "figurestead", "themes");
const packageRoot = path.join(webRoot, "themes");
export const CURATED_THEME_PACKAGES = Object.freeze([
  { subpath: "./themes/slipware", filename: "slipware.json" },
  { subpath: "./themes/registration-ink", filename: "registration_ink.json" },
  { subpath: "./themes/ultraviolet-laboratory", filename: "ultraviolet_laboratory.json" },
  { subpath: "./themes/lavender-fog-notebook", filename: "lavender_fog_notebook.json" },
  { subpath: "./themes/midnight-transit-signal-slate", filename: "midnight_transit_signal_slate.json" },
  { subpath: "./themes/deep-observatory-sage-core", filename: "deep_observatory_sage_core.json" },
]);
const themeFiles = Object.freeze(CURATED_THEME_PACKAGES.map(({ filename }) => filename));
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const action = process.argv[2];
  if (action === "stage") stage();
  else if (action === "clean") clean();
  else throw new Error("usage: node web/scripts/curated-themes.mjs <stage|clean>");
}
