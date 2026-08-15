import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const expected = packageJson.devDependencies.playwright;
const expectedTypeScript = packageJson.devDependencies.typescript;
const expectedVite = packageJson.devDependencies.vite;

assert.match(expected, /^\d+\.\d+\.\d+$/, "Playwright must remain exactly pinned");
assert.match(expectedTypeScript, /^\d+\.\d+\.\d+$/, "TypeScript must remain exactly pinned");
assert.match(expectedVite, /^\d+\.\d+\.\d+$/, "Vite must remain exactly pinned");
assert.equal(lock.packages["node_modules/playwright"].version, expected);
assert.equal(lock.packages["node_modules/playwright-core"].version, expected);
assert.equal(lock.packages["node_modules/typescript"].version, expectedTypeScript);
assert.equal(lock.packages["node_modules/vite"].version, expectedVite);

for (const relative of ["THIRD_PARTY_NOTICES.md", "web/THIRD_PARTY_NOTICES.md"]) {
  const notice = fs.readFileSync(path.join(root, relative), "utf8");
  const match = notice.match(
    /verification environment use(?:d|s) Playwright (\d+\.\d+\.\d+) and\s+playwright-core (\d+\.\d+\.\d+)/,
  );
  assert.ok(match, `${relative}: Playwright notice statement is missing`);
  assert.equal(match[1], expected, `${relative}: Playwright version drifted from package.json`);
  assert.equal(match[2], expected, `${relative}: playwright-core version drifted from package.json`);
  assert.match(notice, new RegExp(`TypeScript ${expectedTypeScript.replaceAll(".", "\\.")}`), `${relative}: TypeScript notice version is missing`);
  assert.match(notice, new RegExp(`Vite ${expectedVite.replaceAll(".", "\\.")}`), `${relative}: Vite notice version is missing`);
}

console.log(`browser-tooling-notice-consistency: PASS (2 notices; Playwright ${expected}; TypeScript ${expectedTypeScript}; Vite ${expectedVite})`);
