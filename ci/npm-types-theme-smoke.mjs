import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(repositoryRoot, "ci", "fixtures", "npm-consumer");
const tarball = path.resolve(process.argv[2] ?? "");
if (!process.argv[2] || !fs.statSync(tarball, { throwIfNoEntry: false })?.isFile()) {
  throw new Error("usage: node ci/npm-types-theme-smoke.mjs <packed-package.tgz>");
}

const themes = Object.freeze([
  ["slipware.json", "themes/slipware.json"],
  ["registration_ink.json", "themes/registration_ink.json"],
  ["ultraviolet_laboratory.json", "themes/ultraviolet_laboratory.json"],
  ["lavender_fog_notebook.json", "themes/lavender_fog_notebook.json"],
  ["midnight_transit_signal_slate.json", "themes/midnight_transit_signal_slate.json"],
  ["deep_observatory_sage_core.json", "themes/deep_observatory_sage_core.json"],
]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd ?? repositoryRoot, encoding: "utf8", env: options.env ?? process.env });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  if (options.print !== false && result.stdout.trim()) process.stdout.write(result.stdout);
  return result.stdout;
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "figurestead-packed-consumer-"));
try {
  fs.cpSync(fixtureRoot, temporaryRoot, { recursive: true });
  fs.writeFileSync(path.join(temporaryRoot, "package.json"), `${JSON.stringify({ name: "figurestead-packed-consumer", private: true, type: "module" }, null, 2)}\n`);
  const cache = path.join(temporaryRoot, ".npm-cache");
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", tarball], {
    cwd: temporaryRoot,
    env: { ...process.env, npm_config_cache: cache },
  });

  const installedRoot = path.join(temporaryRoot, "node_modules", "@figurestead", "web");
  const requiredMembers = [
    "types/index.d.ts",
    "types/extensions/temporal.d.ts",
    "types/theme-json.d.ts",
    ...themes.map(([, packaged]) => packaged),
  ];
  requiredMembers.forEach((member) => assert.ok(fs.statSync(path.join(installedRoot, member)).isFile(), `packed member missing: ${member}`));

  themes.forEach(([canonical, packaged]) => {
    const authoritative = fs.readFileSync(path.join(repositoryRoot, "src", "figurestead", "themes", canonical));
    const delivered = fs.readFileSync(path.join(installedRoot, packaged));
    assert.ok(authoritative.equals(delivered), `packaged theme differs byte-for-byte: ${canonical}`);
  });

  const declarationText = [
    fs.readFileSync(path.join(installedRoot, "types", "index.d.ts"), "utf8"),
    fs.readFileSync(path.join(installedRoot, "types", "extensions", "temporal.d.ts"), "utf8"),
  ].join("\n");
  assert.doesNotMatch(declarationText, /\bany\b/, "public declarations must not rely on any");

  const declaredRuntimeNames = new Set([...declarationText.matchAll(/^export\s+(?:declare\s+)?(?:class|function|const)\s+([A-Za-z0-9_]+)/gm)].map((match) => match[1]));
  const runtimeSourceNames = [
    ["src/index.js", "types/index.d.ts"],
    ["src/extensions/temporal/index.js", "types/extensions/temporal.d.ts"],
  ].map(([sourcePath, declarationPath]) => {
    const source = fs.readFileSync(path.join(installedRoot, sourcePath), "utf8");
    const declarations = fs.readFileSync(path.join(installedRoot, declarationPath), "utf8");
    const direct = [...source.matchAll(/^export\s+(?:const|function|class)\s+([A-Za-z0-9_]+)/gm)].map((match) => match[1]);
    const forwarded = [...source.matchAll(/export\s*\{([^}]+)\}/g)].flatMap((match) => match[1].split(",").map((name) => name.trim().split(/\s+as\s+/).at(-1)));
    const localDeclarations = new Set([...declarations.matchAll(/^export\s+(?:declare\s+)?(?:class|function|const)\s+([A-Za-z0-9_]+)/gm)].map((match) => match[1]));
    const names = [...new Set([...direct, ...forwarded])];
    const missing = names.filter((name) => !localDeclarations.has(name));
    assert.deepEqual(missing, [], `${sourcePath} has runtime exports missing from ${declarationPath}`);
    return names.length;
  });
  assert.ok(declaredRuntimeNames.size > 0, "declaration runtime-name inventory must be nonempty");

  const fixtureFiles = fs.readdirSync(temporaryRoot).filter((name) => name.endsWith(".ts"));
  const fixtureText = fixtureFiles.map((name) => fs.readFileSync(path.join(temporaryRoot, name), "utf8")).join("\n");
  const validCaseCount = (fixtureText.match(/@valid-case/g) ?? []).length;
  const negativeCaseCount = (fixtureText.match(/@negative-case/g) ?? []).length;
  const expectedErrorCount = (fixtureText.match(/@ts-expect-error/g) ?? []).length;
  assert.equal(validCaseCount, 7, "packed TypeScript valid fixture count drifted");
  assert.equal(negativeCaseCount, 5, "packed TypeScript negative fixture count drifted");
  assert.equal(expectedErrorCount, negativeCaseCount, "each negative case must carry one expected compiler error");

  run(process.execPath, [path.join(repositoryRoot, "node_modules", "typescript", "bin", "tsc"), "--project", path.join(temporaryRoot, "tsconfig.json")], { cwd: temporaryRoot });
  run(process.execPath, [path.join(temporaryRoot, "node-smoke.mjs")], { cwd: temporaryRoot });
  run(process.execPath, [path.join(repositoryRoot, "node_modules", "vite", "bin", "vite.js"), "build", "browser", "--outDir", "dist", "--emptyOutDir"], { cwd: temporaryRoot });
  assert.ok(fs.statSync(path.join(temporaryRoot, "browser", "dist", "index.html")).isFile(), "Vite browser build was not produced");

  const bytes = fs.statSync(tarball).size;
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(tarball)).digest("hex");
  console.log(JSON.stringify({
    suite: "npm-packed-types-themes",
    result: "PASS",
    validTypeScriptCases: validCaseCount,
    expectedErrorCases: negativeCaseCount,
    curatedThemeIdentityCases: themes.length,
    requiredPackedMembers: requiredMembers.length,
    declaredRuntimeExports: runtimeSourceNames.reduce((sum, count) => sum + count, 0),
    viteBuildCases: 1,
    tarball: path.basename(tarball),
    bytes,
    sha256,
  }));
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
