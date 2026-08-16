const fs = require("node:fs");
const path = require("node:path");
const { chromium, firefox } = require("playwright");

const mode = process.env.FIGURESTEAD_AUDIT_MODE || "check";
const compareAcceptedEvidence = process.env.FIGURESTEAD_HEADER_STUDY_COMPARE_EVIDENCE !== "0";
const baseUrl = process.env.FIGURESTEAD_HEADER_STUDY_URL || "http://127.0.0.1:4179/audit/responsive-header-study/";
const outputRoot = process.env.FIGURESTEAD_HEADER_STUDY_OUTPUT_ROOT || path.join(__dirname, "evidence");
const engines = { chromium, firefox };
const widths = [320, 362, 390];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

(async () => {
  const records = [];
  let assertions = 0;
  if (mode === "write") fs.mkdirSync(outputRoot, { recursive: true });
  for (const [engine, browserType] of Object.entries(engines)) {
    const browser = await browserType.launch({ headless: true });
    try {
      for (const width of widths) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce" });
        const errors = [];
        page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${baseUrl}?width=${width}`, { waitUntil: "load" });
        await page.waitForFunction(() => document.documentElement.dataset.studyReady === "true");
        const observed = await page.evaluate(() => window.__FIGURESTEAD_HEADER_STUDY__);
        const check = (condition, message) => { assertions += 1; if (!condition) throw new Error(`${engine}/${width}: ${message}`); };
        check(observed.studyOnly && observed.metrics.every((item) => item.productionWrapping === false), "study-only boundary failed");
        check(observed.metrics.length === 6, "expected 2 themes by 3 policies");
        check(new Set(observed.metrics.map((item) => item.theme)).size === 2, "light/dark theme coverage missing");
        check(JSON.stringify([...new Set(observed.metrics.map((item) => item.policy))]) === JSON.stringify(["A", "B", "C"]), "policy coverage diverged");
        check(observed.metrics.every((item) => item.accessibilityTextComplete), "full accessibility text was not retained");
        check(observed.metrics.filter((item) => item.policy === "B").every((item) => item.plotHeight === item.preWrapPlotHeight), "policy B did not preserve plot height");
        check(observed.metrics.filter((item) => item.policy === "A").every((item) => item.plotHeight < item.preWrapPlotHeight), "policy A did not expose plot-area cost");
        check(observed.metrics.every((item) => item.multiPanelReferenceClear === false), "120 px reference unexpectedly cleared");
        check(errors.length === 0, `runtime errors: ${errors.join("; ")}`);
        const result = { engine, ...observed };
        records.push(result);
        if (mode === "write") await page.locator(".study-grid").screenshot({ path: path.join(outputRoot, `${engine}-${width}.png`) });
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
  const payload = stable({
    schemaVersion: "figurestead.responsive-header-study-evidence/1",
    mode: "study-only",
    productionWrappingImplemented: false,
    browserCaseCount: records.length,
    assertionCount: assertions,
    records,
  });
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  const target = path.join(outputRoot, "metrics.json");
  if (mode === "write") fs.writeFileSync(target, json);
  else if (compareAcceptedEvidence) {
    if (!fs.existsSync(target)) throw new Error(`missing accepted study evidence ${target}; run with FIGURESTEAD_AUDIT_MODE=write`);
    if (fs.readFileSync(target, "utf8") !== json) throw new Error("responsive-header study metrics diverged from accepted evidence");
  }
  if (records.length !== 6 || assertions !== 54) throw new Error(`expected 6 browser cases / 54 assertions, observed ${records.length} / ${assertions}`);
  console.log(JSON.stringify({ suite: "responsive-header-feasibility", mode, compareAcceptedEvidence, browserCaseCount: records.length, assertionCount: assertions, result: "PASS", outputRoot }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
