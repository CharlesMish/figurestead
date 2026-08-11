const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { chromium, firefox } = require("playwright");

const repositoryRoot = path.resolve(__dirname, "../..");
const studyRoot = path.join(repositoryRoot, "specimen-study");
const evidenceRoot = path.join(studyRoot, "evidence");
const screenshotsRoot = path.join(evidenceRoot, "screenshots");
const individualRoot = path.join(evidenceRoot, "individual");
const baseUrl = process.env.FIGURESTEAD_SPECIMEN_URL || "http://127.0.0.1:4179/specimen-study/";
const engines = { chromium, firefox };
const widths = [1440, 390];
const motionPreferences = ["no-preference", "reduce"];
const pages = [
  { key: "lab", path: "index.html", count: 12 },
  { key: "montage", path: "at-a-glance.html", count: 8 },
];
const showcaseOrder = [
  "watershed_storm_response", "circadian_phase_shift", "instrument_calibration", "dose_response_plate",
  "treatment_replicates", "paired_seasonal_distributions", "field_sampling_coverage", "reservoir_oxygen_thresholds",
];
const stressOrder = [
  "gene_expression_recovery", "particle_size_relationship", "lab_precision", "migration_monitoring_coverage",
];

fs.mkdirSync(screenshotsRoot, { recursive: true });
fs.mkdirSync(individualRoot, { recursive: true });

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (file) => sha256(fs.readFileSync(file));

function installedFirefoxExecutable() {
  if (process.env.FIGURESTEAD_FIREFOX_EXECUTABLE) return process.env.FIGURESTEAD_FIREFOX_EXECUTABLE;
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  const candidates = fs.existsSync(cache)
    ? fs.readdirSync(cache).filter((name) => name.startsWith("firefox-")).sort().reverse()
      .map((name) => path.join(cache, name, "firefox", "Nightly.app", "Contents", "MacOS", "firefox"))
    : [];
  return candidates.find((candidate) => fs.existsSync(candidate)) || firefox.executablePath();
}

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.specimenReady === "true");
  await page.waitForTimeout(80);
}

function activeElementState() {
  const element = document.activeElement;
  const style = getComputedStyle(element);
  const intersect = (a, b) => ({
    left: Math.max(a.left, b.left), top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom),
  });
  const rect = element?.getBoundingClientRect?.() ?? { left: 0, top: 0, right: 0, bottom: 0 };
  let visible = intersect(rect, { left: 0, top: 0, right: innerWidth, bottom: innerHeight });
  const clippedAncestors = [];
  for (let ancestor = element?.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const ancestorStyle = getComputedStyle(ancestor);
    const ancestorRect = ancestor.getBoundingClientRect();
    if (ancestorStyle.display === "none" || ancestorStyle.visibility === "hidden" || Number(ancestorStyle.opacity) === 0) {
      visible = { left: 0, top: 0, right: 0, bottom: 0 };
      clippedAncestors.push(`${ancestor.tagName.toLowerCase()}:not-rendered`);
      break;
    }
    if (ancestorStyle.clip && ancestorStyle.clip !== "auto" && /rect\(\s*0(?:px)?[, ]+0(?:px)?[, ]+0(?:px)?[, ]+0(?:px)?\s*\)/.test(ancestorStyle.clip)) {
      visible = { left: 0, top: 0, right: 0, bottom: 0 };
      clippedAncestors.push(`${ancestor.tagName.toLowerCase()}:zero-clip`);
      break;
    }
    if ([ancestorStyle.overflow, ancestorStyle.overflowX, ancestorStyle.overflowY].some((value) => ["hidden", "clip"].includes(value))) {
      visible = intersect(visible, ancestorRect);
    }
  }
  const width = Math.max(0, visible.right - visible.left);
  const height = Math.max(0, visible.bottom - visible.top);
  return {
    tag: element?.tagName?.toLowerCase() || null,
    text: (element?.textContent || element?.getAttribute?.("aria-label") || "").trim(),
    href: element?.getAttribute?.("href") || null,
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    visibleArea: width * height,
    clippedAncestors,
  };
}

async function keyboardAudit(page, openDetails) {
  if (openDetails) await page.locator("details").evaluateAll((items) => items.forEach((item) => { item.open = true; }));
  const expectedCount = await page.locator('a[href],button,input:not([type="hidden"]),summary,[tabindex]:not([tabindex="-1"])').count();
  const sequence = [];
  let first = null;
  for (let index = 0; index < expectedCount + 3; index += 1) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(50);
    const active = await page.evaluate(activeElementState);
    if (active.tag === "body") continue;
    const signature = `${active.tag}|${active.href}|${active.text}`;
    if (first == null) first = signature;
    else if (signature === first || signature === `${sequence.at(-1)?.tag}|${sequence.at(-1)?.href}|${sequence.at(-1)?.text}`) break;
    sequence.push(active);
  }
  return {
    expectedCount,
    reachedCount: sequence.length,
    sequence,
    allVisible: sequence.every((item) => item.visibleArea > 0 && item.clippedAncestors.length === 0),
    allOutlined: sequence.every((item) => item.outlineStyle !== "none" && item.outlineWidth !== "0px"),
  };
}

async function inspect(page) {
  const structure = await page.evaluate(() => {
    const study = window.__FIGURESTEAD_SPECIMEN_STUDY__;
    const figures = [...document.querySelectorAll(".specimen")];
    const companions = [...document.querySelectorAll(".figurestead-accessibility")];
    const immediateDuplicateHeadings = companions.flatMap((companion) => {
      const h2 = companion.querySelector(":scope > h2")?.textContent.trim();
      return [...companion.querySelectorAll(":scope > section > h3")]
        .filter((h3) => h3.textContent.trim() === h2).map(() => h2);
    });
    const hiddenInteractive = [...document.querySelectorAll(".figurestead-sr-only")].flatMap((companion) =>
      [...companion.querySelectorAll("a[href],button,input,select,textarea,summary,[tabindex]")]
        .filter((element) => element.tabIndex >= 0).map((element) => `${element.tagName}:${element.textContent.trim()}`),
    );
    const canvasAccessibility = [...document.querySelectorAll("canvas[data-scene-canvas]")].map((canvas) => ({
      sceneId: canvas.dataset.sceneCanvas,
      role: canvas.getAttribute("role"),
      labelledBy: canvas.getAttribute("aria-labelledby"),
      targetsExist: (canvas.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean).every((id) => Boolean(document.getElementById(id))),
    }));
    const rendered = study.rendered.map((item) => ({
      id: item.id,
      tier: item.scene.tier,
      renderer: item.scene.renderer,
      theme: item.scene.suggestedTheme.key,
      seed: item.scene.seed,
      fingerprint: item.canvas.closest(".specimen").dataset.evidenceFingerprint,
      state: item.instance.getState(),
      glyphCount: item.contract.style.glyphs.length,
      lineStyleCount: item.contract.style.lineStyles.length,
      seriesCount: item.scene.renderer === "line" ? item.scene.data.series.length : new Set(item.scene.data.series || []).size,
      provenanceKind: item.scene.provenance.kind,
    }));
    return {
      mode: study.mode,
      innerWidth,
      clientWidth: document.documentElement.clientWidth,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      order: figures.map((figure) => figure.dataset.sceneId),
      sceneCount: figures.length,
      stressInMontage: figures.filter((figure) => figure.dataset.tier === "stress").map((figure) => figure.dataset.sceneId),
      immediateDuplicateHeadings,
      hiddenInteractive,
      hiddenTableCount: document.querySelectorAll(".figurestead-sr-only table").length,
      canvasAccessibility,
      rendered,
      detailsCount: document.querySelectorAll("details.scene-disclosure").length,
      sourceLinkCount: document.querySelectorAll('.scene-disclosure a[href$=".json"],.scene-disclosure a[href$=".csv"]').length,
      ready: document.documentElement.dataset.specimenReady,
      mediaReduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  });
  const pixelFingerprints = await page.locator("canvas[data-scene-canvas]").evaluateAll((canvases) => canvases.map((canvas) => {
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0x811c9dc5;
    for (const value of pixels) { hash ^= value; hash = Math.imul(hash, 0x01000193); }
    return { id: canvas.dataset.sceneCanvas, fingerprint: `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}@${canvas.width}x${canvas.height}` };
  }));
  structure.pixelHashes = Object.fromEntries(pixelFingerprints.map((item) => [item.id, item.fingerprint]));
  return structure;
}

function findingsFor(testCase) {
  const findings = [];
  const { pageKey, width, reducedMotion, structure, keyboard, runtimeErrors } = testCase;
  const expect = (condition, message) => { if (!condition) findings.push(message); };
  const expectedOrder = pageKey === "montage" ? showcaseOrder : [...showcaseOrder, ...stressOrder];
  expect(runtimeErrors.length === 0, `runtime/console errors: ${runtimeErrors.join(" | ")}`);
  expect(structure.ready === "true", "study readiness signal missing");
  expect(structure.innerWidth === width, `viewport is ${structure.innerWidth}, expected ${width}`);
  expect(structure.horizontalOverflow === 0, `horizontal overflow is ${structure.horizontalOverflow}px`);
  expect(JSON.stringify(structure.order) === JSON.stringify(expectedOrder), "scene source order diverged from the frozen study order");
  expect(structure.sceneCount === expectedOrder.length, `rendered ${structure.sceneCount}, expected ${expectedOrder.length}`);
  if (pageKey === "montage") expect(structure.stressInMontage.length === 0, `stress scene entered montage: ${structure.stressInMontage.join(", ")}`);
  expect(structure.immediateDuplicateHeadings.length === 0, "single-panel accessibility companions contain duplicate immediate headings");
  expect(structure.hiddenInteractive.length === 0, "hidden accessibility companion contains focusable controls");
  expect(structure.hiddenTableCount === structure.sceneCount, "one or more real data-table companions are missing");
  expect(structure.canvasAccessibility.every((item) => item.role === "img" && item.labelledBy && item.targetsExist), "canvas accessibility association is incomplete");
  expect(structure.rendered.every((item) => item.state.progress === 1 && !item.state.playing), "a static figure is not settled");
  expect(structure.rendered.every((item) => item.state.reducedMotion === reducedMotion), "reduced-motion state disagrees with the test context");
  expect(structure.rendered.every((item) => item.glyphCount === 4), "marker vocabulary changed from four glyphs");
  expect(structure.rendered.every((item) => item.lineStyleCount === 4), "line-style cycle changed");
  expect(structure.rendered.every((item) => item.provenanceKind === "deterministic_synthetic"), "fixture provenance is not deterministic synthetic");
  expect(keyboard.reachedCount === keyboard.expectedCount, `keyboard traversal reached ${keyboard.reachedCount}/${keyboard.expectedCount} targets`);
  expect(keyboard.sequence[0]?.text.includes("Skip to"), "skip link is not first in keyboard order");
  expect(keyboard.allVisible, "a keyboard target has no visible area or is clipped");
  expect(keyboard.allOutlined, "a keyboard target lacks a visible outline");
  if (pageKey === "lab") {
    expect(structure.detailsCount === 12 && structure.sourceLinkCount === 24, "lab disclosures do not expose all JSON/CSV sources");
    const gene = structure.rendered.find((item) => item.id === "gene_expression_recovery");
    const precision = structure.rendered.find((item) => item.id === "lab_precision");
    expect(gene?.seriesCount === 6 && gene?.glyphCount === 4, "six-series line stress boundary changed");
    expect(precision?.seriesCount === 6 && precision?.glyphCount === 4, "six-identity point stress boundary changed");
  }
  return findings;
}

async function captureStandardEvidence(browser, engineName) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.goto(`${baseUrl}index.html`, { waitUntil: "load" });
  await ready(page);
  await page.screenshot({ path: path.join(screenshotsRoot, `${engineName}-lab-1440-full.png`), fullPage: true });
  if (engineName === "chromium") {
    for (const id of [...showcaseOrder, ...stressOrder]) {
      await page.locator(`canvas[data-scene-canvas="${id}"]`).screenshot({ path: path.join(individualRoot, `${id}.png`) });
    }
  }
  await context.close();

  const narrow = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });
  const narrowPage = await narrow.newPage();
  await narrowPage.goto(`${baseUrl}index.html`, { waitUntil: "load" });
  await ready(narrowPage);
  await narrowPage.screenshot({ path: path.join(screenshotsRoot, `${engineName}-lab-390-full.png`), fullPage: true });
  await narrow.close();

  const wide = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "no-preference" });
  const widePage = await wide.newPage();
  await widePage.goto(`${baseUrl}at-a-glance.html`, { waitUntil: "load" });
  await ready(widePage);
  await widePage.screenshot({ path: path.join(screenshotsRoot, `${engineName}-montage-1920x1080.png`), fullPage: false });
  await wide.close();

  const montageNarrow = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });
  const montageNarrowPage = await montageNarrow.newPage();
  await montageNarrowPage.goto(`${baseUrl}at-a-glance.html`, { waitUntil: "load" });
  await ready(montageNarrowPage);
  await montageNarrowPage.screenshot({ path: path.join(screenshotsRoot, `${engineName}-montage-390-full.png`), fullPage: true });
  await montageNarrow.close();
}

async function runEngine(engineName, browserType) {
  const executablePath = engineName === "firefox" ? installedFirefoxExecutable() : browserType.executablePath();
  const browser = await browserType.launch({ headless: true, executablePath });
  const report = {
    schemaVersion: "figurestead.specimen-browser-audit/1",
    engine: engineName,
    playwrightVersion: require("playwright/package.json").version,
    browserVersion: browser.version(),
    nodeVersion: process.version,
    executableSha256: fileHash(executablePath),
    cases: [],
  };
  try {
    for (const pageSpec of pages) {
      for (const width of widths) {
        for (const motionPreference of motionPreferences) {
          const reducedMotion = motionPreference === "reduce";
          const context = await browser.newContext({
            viewport: { width, height: width === 390 ? 844 : 1000 },
            reducedMotion: reducedMotion ? "reduce" : "no-preference",
          });
          const page = await context.newPage();
          const runtimeErrors = [];
          page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`); });
          page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
          await page.goto(`${baseUrl}${pageSpec.path}`, { waitUntil: "load" });
          await ready(page);
          const structure = await inspect(page);
          const keyboard = await keyboardAudit(page, pageSpec.key === "lab");
          const testCase = { pageKey: pageSpec.key, width, reducedMotion, runtimeErrors, structure, keyboard };
          testCase.findings = findingsFor(testCase);
          testCase.result = testCase.findings.length ? "FAIL" : "PASS";
          report.cases.push(testCase);
          await context.close();
        }
      }
    }
    for (const pageSpec of pages) {
      for (const width of widths) {
        const pair = report.cases.filter((item) => item.pageKey === pageSpec.key && item.width === width);
        const normal = pair.find((item) => !item.reducedMotion);
        const reduced = pair.find((item) => item.reducedMotion);
        if (JSON.stringify(normal.structure.pixelHashes) !== JSON.stringify(reduced.structure.pixelHashes)) {
          normal.findings.push("normal and reduced-motion terminal canvas pixels diverge"); normal.result = "FAIL";
          reduced.findings.push("normal and reduced-motion terminal canvas pixels diverge"); reduced.result = "FAIL";
        }
        if (JSON.stringify(normal.structure.rendered.map((item) => item.fingerprint)) !== JSON.stringify(reduced.structure.rendered.map((item) => item.fingerprint))) {
          normal.findings.push("normal and reduced-motion normalized fingerprints diverge"); normal.result = "FAIL";
          reduced.findings.push("normal and reduced-motion normalized fingerprints diverge"); reduced.result = "FAIL";
        }
      }
    }
    await captureStandardEvidence(browser, engineName);
  } finally {
    await browser.close();
  }
  report.result = report.cases.every((item) => item.result === "PASS") ? "PASS" : "FAIL";
  fs.writeFileSync(path.join(evidenceRoot, `${engineName}.json`), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

(async () => {
  const reports = [];
  for (const [name, browserType] of Object.entries(engines)) reports.push(await runEngine(name, browserType));
  const evidenceFiles = [...fs.readdirSync(screenshotsRoot).map((name) => path.join(screenshotsRoot, name)),
    ...fs.readdirSync(individualRoot).map((name) => path.join(individualRoot, name))];
  const summary = {
    schemaVersion: "figurestead.specimen-study-verification/1",
    generatedAt: new Date().toISOString(),
    result: reports.every((report) => report.result === "PASS") ? "PASS" : "FAIL",
    engines: reports.map((report) => ({
      engine: report.engine, browserVersion: report.browserVersion, playwrightVersion: report.playwrightVersion,
      nodeVersion: report.nodeVersion, executableSha256: report.executableSha256,
      caseCount: report.cases.length, passCount: report.cases.filter((item) => item.result === "PASS").length,
    })),
    matrix: { pages: pages.map((item) => item.key), widths, motionPreferences },
    evidence: evidenceFiles.sort().map((file) => ({
      path: path.relative(studyRoot, file), bytes: fs.statSync(file).size, sha256: fileHash(file),
    })),
    alternateMontageRequired: false,
  };
  fs.writeFileSync(path.join(studyRoot, "audit", "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.result !== "PASS") process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
