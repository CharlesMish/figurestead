const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { chromium, firefox } = require("playwright");

const repositoryRoot = path.resolve(__dirname, "../..");
const studyRoot = path.join(repositoryRoot, "specimen-study");
const checkOnly = process.env.FIGURESTEAD_AUDIT_MODE === "check";
const auditOutputRoot = process.env.FIGURESTEAD_AUDIT_OUTPUT_ROOT;
const evidenceRoot = auditOutputRoot
  ? path.join(path.resolve(auditOutputRoot), "response-matrix")
  : path.join(studyRoot, "evidence", "corpus-v0.2", "response-matrix");
const baseUrl = process.env.FIGURESTEAD_SPECIMEN_URL || "http://127.0.0.1:4179/specimen-study/";
const widths = [1440, 390];
const motionPreferences = ["no-preference", "reduce"];
const expectedHabitats = ["Headwater", "Riffle", "Deep pool", "Side channel", "Floodplain", "Wet meadow", "Tidal creek", "Mudflat", "Seagrass bed", "Open estuary"];
const expectedBands = ["Very low", "Low", "Moderate", "Elevated", "High", "Very high"];

fs.mkdirSync(evidenceRoot, { recursive: true });

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function firefoxExecutable() {
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  const candidates = (fs.existsSync(cache) ? fs.readdirSync(cache) : [])
    .filter((name) => name.startsWith("firefox-")).sort().reverse()
    .map((name) => path.join(cache, name, "firefox", "Nightly.app", "Contents", "MacOS", "firefox"));
  return candidates.find((candidate) => fs.existsSync(candidate)) || firefox.executablePath();
}

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.matrixReady === "true");
  await page.evaluate(async () => { await document.fonts?.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}

function focusedState() {
  const element = document.activeElement;
  const rect = element?.getBoundingClientRect?.();
  const style = element ? getComputedStyle(element) : null;
  const visibleWidth = rect ? Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left)) : 0;
  const visibleHeight = rect ? Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top)) : 0;
  return {
    text: (element?.textContent || "").trim(), tag: element?.tagName?.toLowerCase() || null,
    visibleArea: visibleWidth * visibleHeight, outline: style ? `${style.outlineStyle} ${style.outlineWidth}` : "none 0px",
  };
}

async function keyboardAudit(page) {
  const expected = await page.locator('a[href],summary,button,input,select,textarea,[tabindex]:not([tabindex="-1"])').count();
  const states = [];
  for (let index = 0; index < expected; index += 1) { await page.keyboard.press("Tab"); await page.waitForTimeout(30); states.push(await page.evaluate(focusedState)); }
  return {
    expected, reached: states.length, states,
    firstIsSkip: states[0]?.text.includes("Skip to matrix study"),
    allVisible: states.every((state) => state.visibleArea > 0),
    allOutlined: states.every((state) => !state.outline.startsWith("none") && !state.outline.endsWith("0px")),
  };
}

async function inspect(page, width, reducedMotion) {
  return page.evaluate(({ width, reducedMotion, expectedHabitats, expectedBands }) => {
    const study = window.__FIGURESTEAD_MATRIX_STUDY__;
    const rows = [...document.querySelectorAll("#matrix-table tbody tr")];
    const headers = [...document.querySelectorAll("#matrix-table thead th")].slice(1).map((item) => item.textContent.trim());
    const rowLabels = rows.map((row) => row.querySelector("th").textContent.trim().replace(/ \(.+\)$/, ""));
    const cells = [...document.querySelectorAll("#matrix-table td")];
    const images = [...document.images].map((image) => ({ src: image.getAttribute("src"), complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }));
    const elevatedFloodplain = cells.find((cell) => cell.dataset.habitat === "Floodplain" && cell.dataset.band === "Elevated");
    const columnShareSums = expectedHabitats.map((habitat) => cells.filter((cell) => cell.dataset.habitat === habitat).reduce((sum, cell) => sum + Number(cell.dataset.share), 0));
    const columnCountSums = expectedHabitats.map((habitat) => cells.filter((cell) => cell.dataset.habitat === habitat).reduce((sum, cell) => sum + Number(cell.dataset.count), 0));
    const allCellTextExact = cells.every((cell) => cell.textContent.trim() === `${(Number(cell.dataset.share) * 100).toFixed(1)}% · n=${cell.dataset.count}`);
    const tableScroller = document.querySelector(".table-scroll");
    return {
      ready: document.documentElement.dataset.matrixReady,
      viewport: innerWidth,
      expectedWidth: width,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      reducedMotionMatches: matchMedia("(prefers-reduced-motion: reduce)").matches === reducedMotion,
      animatedElements: [...document.querySelectorAll("*")].filter((element) => {
        const style = getComputedStyle(element); return style.animationName !== "none" || style.transitionDuration.split(",").some((value) => parseFloat(value) > 0);
      }).length,
      sectionOrder: [...document.querySelectorAll("main > section")].map((section) => section.querySelector("h2")?.id),
      headers, rowLabels, rowCount: rows.length, cellCount: cells.length,
      rowScopesCorrect: rows.every((row) => row.querySelector("th")?.scope === "row"),
      columnScopesCorrect: [...document.querySelectorAll("#matrix-table thead th")].every((cell) => cell.scope === "col"),
      binDefinitionsPresent: study.scene.responseBands.every((band) => document.body.textContent.includes(band.displayRange)),
      columnShareSums, columnCountSums, allCellTextExact,
      elevatedFloodplain: elevatedFloodplain ? { text: elevatedFloodplain.textContent.trim(), count: elevatedFloodplain.dataset.count, share: elevatedFloodplain.dataset.share } : null,
      images,
      tableContained: tableScroller.scrollWidth >= tableScroller.clientWidth && tableScroller.getBoundingClientRect().right <= document.documentElement.clientWidth,
      rawObservationCount: study.scene.rawObservations.length,
      rendererAuthority: study.scene.rendererAuthority,
    };
  }, { width, reducedMotion, expectedHabitats, expectedBands });
}

function findingsFor(structure, keyboard) {
  const findings = [];
  const expect = (condition, message) => { if (!condition) findings.push(message); };
  expect(structure.ready === "true", "matrix readiness signal missing");
  expect(structure.viewport === structure.expectedWidth, "viewport width mismatch");
  expect(structure.horizontalOverflow === 0, `document horizontal overflow is ${structure.horizontalOverflow}px`);
  expect(structure.reducedMotionMatches && structure.animatedElements === 0, "reduced-motion/static behavior mismatch");
  expect(JSON.stringify(structure.sectionOrder) === JSON.stringify(["wide-title", "scale-title", "comparison-title", "decision-title"]), "study source order changed");
  expect(JSON.stringify(structure.headers) === JSON.stringify(expectedHabitats), "habitat column order changed");
  expect(JSON.stringify(structure.rowLabels) === JSON.stringify(expectedBands), "response-band row order changed");
  expect(structure.rowCount === 6 && structure.cellCount === 60, "accessible table is not 10 by 6");
  expect(structure.rowScopesCorrect && structure.columnScopesCorrect, "table header scopes are incomplete");
  expect(structure.binDefinitionsPresent, "numerical bin definitions are not associated with the table");
  expect(structure.columnCountSums.every((value) => value === 30), "one or more habitat count columns do not sum to 30");
  expect(structure.columnShareSums.every((value) => Math.abs(value - 1) <= 1e-12), "one or more habitat share columns do not sum to 1 within the declared 1e-12 floating tolerance");
  expect(structure.allCellTextExact, "visible table cell text diverges from its exact data attributes");
  expect(structure.elevatedFloodplain?.count === "8" && Number(structure.elevatedFloodplain?.share) === 8 / 30, "Floodplain/Elevated lookup is incorrect");
  expect(structure.images.every((image) => image.complete && image.naturalWidth > 0), "one or more evidence images failed to load");
  expect(structure.tableContained, "accessible table escapes its contained scroll region");
  expect(structure.rawObservationCount === 300, "raw observation count is not 300");
  expect(structure.rendererAuthority === "figurestead.extensions.matrix.categorical_matrix", "renderer authority changed");
  expect(keyboard.expected === keyboard.reached && keyboard.firstIsSkip && keyboard.allVisible && keyboard.allOutlined, "keyboard/focus audit failed");
  return findings;
}

async function runEngine(name, browserType) {
  const executablePath = name === "firefox" ? firefoxExecutable() : browserType.executablePath();
  const browser = await browserType.launch({ headless: true, executablePath });
  const report = { engine: name, browserVersion: browser.version(), playwrightVersion: require("playwright/package.json").version, nodeVersion: process.version, cases: [] };
  try {
    for (const width of widths) for (const preference of motionPreferences) {
      const reducedMotion = preference === "reduce";
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: reducedMotion ? "reduce" : "no-preference" });
      const page = await context.newPage();
      const runtimeErrors = [];
      page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`); });
      page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
      await page.goto(`${baseUrl}matrix-study.html`, { waitUntil: "load" });
      await ready(page);
      const structure = await inspect(page, width, reducedMotion);
      const keyboard = await keyboardAudit(page);
      const findings = [...runtimeErrors, ...findingsFor(structure, keyboard)];
      report.cases.push({ width, reducedMotion, result: findings.length ? "FAIL" : "PASS", findings, structure, keyboard });
      if (!checkOnly && !reducedMotion) await page.screenshot({ path: path.join(evidenceRoot, `${name}-matrix-study-${width}.png`), fullPage: true });
      await context.close();
    }
  } finally { await browser.close(); }
  report.result = report.cases.every((item) => item.result === "PASS") ? "PASS" : "FAIL";
  return report;
}

(async () => {
  const reports = [await runEngine("chromium", chromium), await runEngine("firefox", firefox)];
  const staticFiles = ["populated-wide.png", "populated-wide.svg", "populated-montage-cell.png", "populated-narrow-390.png"];
  const summary = {
    schemaVersion: "figurestead.response-matrix-browser-audit/1",
    result: reports.length === 2 && reports.every((report) => report.result === "PASS" && report.cases.length === 4) ? "PASS" : "FAIL",
    matrix: { engines: ["chromium", "firefox"], widths, motionPreferences },
    reports,
    mode: checkOnly ? "check" : "evidence",
    expectedCaseCount: 8,
    executedCaseCount: reports.reduce((total, report) => total + report.cases.length, 0),
    staticEvidence: Object.fromEntries(staticFiles.map((name) => {
      const file = path.join(studyRoot, "evidence", "corpus-v0.2", "response-matrix", name);
      return [name, { sha256: sha256(file), bytes: fs.statSync(file).size }];
    })),
    sparseReference: { path: "site/assets/evidence-matrix.png", sha256: sha256(path.join(repositoryRoot, "site", "assets", "evidence-matrix.png")) },
    documentedLimitations: [
      "At 640 × 416, the provenance note crosses long rotated labels and exact annotations require close inspection.",
      "At 390 × 520, the existing static renderer clips title/legend text and crowds labels; no compact matrix policy was invented.",
    ],
    alternateMontageRequired: false,
  };
  const summaryPath = auditOutputRoot
    ? path.join(evidenceRoot, "summary.json")
    : path.join(studyRoot, "audit", "response-matrix-browser.json");
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ result: summary.result, engines: reports.map((report) => ({ engine: report.engine, version: report.browserVersion, cases: report.cases.length, passed: report.cases.filter((item) => item.result === "PASS").length })), documentedLimitations: summary.documentedLimitations }, null, 2));
  if (summary.result !== "PASS") process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
