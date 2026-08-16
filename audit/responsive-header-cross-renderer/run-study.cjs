const fs = require("node:fs");
const path = require("node:path");
const { chromium, firefox } = require("playwright");

const mode = process.env.FIGURESTEAD_AUDIT_MODE || "check";
const compareAcceptedEvidence = process.env.FIGURESTEAD_CROSS_HEADER_COMPARE_EVIDENCE !== "0";
const baseUrl = process.env.FIGURESTEAD_CROSS_HEADER_URL || "http://127.0.0.1:4179/audit/responsive-header-cross-renderer/";
const outputRoot = process.env.FIGURESTEAD_CROSS_HEADER_OUTPUT_ROOT || path.join(__dirname, "evidence");
const engines = { chromium, firefox }, widths = [320, 362, 390];
const fixtures = ["watershed_storm_response", "circadian_phase_shift", "instrument_calibration", "paired_seasonal_distributions", "field_sampling_coverage"];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function summarize(records, engine) {
  const variants = records.filter((record) => record.engine === engine).flatMap((record) => record.metrics);
  const bVariants = variants.filter((item) => item.policy === "B"), growth = bVariants.map((item) => item.addedHeight);
  const maximum = Math.max(...growth);
  const worstCases = bVariants.filter((item) => item.addedHeight === maximum).map((item) => ({ specimen: item.specimen, width: item.width, addedHeight: item.addedHeight, measuredAdditionalHeaderHeight: item.measuredAdditionalHeaderHeight, addedHeightPercentage: item.addedHeightPercentage }));
  return {
    engine,
    variantCount: variants.length,
    bGrowth: { minimum: Math.min(...growth), median: median(growth), maximum, worstCases },
    floorSatisfaction: Object.fromEntries([60, 72, 120].map((floor) => [floor, variants.filter((item) => item.policy === "C" && item.candidateFloors[String(floor)].baselineSatisfies).length])),
    classifications: Object.fromEntries(["comfortable", "usable", "marginal", "not defensible"].map((label) => [label, variants.filter((item) => item.policy === "C" && item.plotReadability.classification === label).length])),
  };
}
function compareEngines(records) {
  const byEngine = Object.fromEntries(["chromium", "firefox"].map((engine) => [engine, records.filter((record) => record.engine === engine).flatMap((record) => record.metrics)]));
  const differences = [];
  byEngine.chromium.forEach((left) => {
    const right = byEngine.firefox.find((item) => item.specimen === left.specimen && item.width === left.width && item.policy === left.policy);
    const fields = {
      addedHeight: [left.addedHeight, right.addedHeight],
      measuredAdditionalHeaderHeight: [left.measuredAdditionalHeaderHeight, right.measuredAdditionalHeaderHeight],
      baselinePlotHeight: [left.baselinePlotHeight, right.baselinePlotHeight],
      policyPlotHeight: [left.policyPlotHeight, right.policyPlotHeight],
      titleLines: [left.title.lineCount, right.title.lineCount],
      subtitleLines: [left.subtitle.lineCount, right.subtitle.lineCount],
      titleComplete: [left.title.complete, right.title.complete],
      subtitleComplete: [left.subtitle.complete, right.subtitle.complete],
    };
    Object.entries(fields).forEach(([field, values]) => { if (values[0] !== values[1]) differences.push({ specimen: left.specimen, width: left.width, policy: left.policy, field, chromium: values[0], firefox: values[1] }); });
  });
  return { structuralDifferenceCount: differences.length, differences, interpretation: differences.length ? "meaningful structural divergence recorded" : "no meaningful header or plot-geometry divergence" };
}

(async () => {
  const records = [];
  let assertions = 0;
  if (mode === "write") fs.mkdirSync(outputRoot, { recursive: true });
  for (const [engine, browserType] of Object.entries(engines)) {
    const browser = await browserType.launch({ headless: true });
    try {
      for (const width of widths) {
        const page = await browser.newPage({ viewport: { width: 1900, height: 1900 }, reducedMotion: "reduce", deviceScaleFactor: 1 });
        const errors = [];
        page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${baseUrl}?width=${width}`, { waitUntil: "load" });
        await page.waitForFunction(() => document.documentElement.dataset.studyReady === "true");
        const observed = await page.evaluate(() => window.__FIGURESTEAD_CROSS_HEADER_STUDY__);
        const check = (condition, message) => { assertions += 1; if (!condition) throw new Error(`${engine}/${width}: ${message}`); };
        check(observed.studyOnly && !observed.productionWrappingImplemented && !observed.productionHeightNegotiationImplemented, "study-only boundary failed");
        check(JSON.stringify(observed.fixtureOrder) === JSON.stringify(fixtures), "fixture authority/order diverged");
        check(JSON.stringify(observed.policies) === JSON.stringify(["B", "C"]), "primary policies diverged");
        check(observed.metrics.length === 10, "expected five fixtures by two policies");
        check(observed.metrics.some((item) => item.theme === "slipware") && observed.metrics.some((item) => item.theme === "deep_observatory_sage_core"), "required light/dark themes missing");
        check(observed.metrics.every((item) => item.accessibility.titleComplete && item.accessibility.subtitleComplete), "accessible header text is incomplete");
        check(observed.metrics.filter((item) => item.policy === "B").every((item) => item.title.complete && item.subtitle.complete), "B failed to retain complete visual headers");
        check(observed.metrics.filter((item) => item.policy === "B").every((item) => item.policyPlotHeight === item.baselinePlotHeight), "B changed plot height");
        check(observed.metrics.filter((item) => item.policy === "B").every((item) => item.policyPlot.top - item.baselinePlot.top === item.addedHeight || Math.abs((item.policyPlot.top - item.baselinePlot.top) - item.addedHeight) < 1), "B plot translation does not match height growth");
        check(observed.metrics.filter((item) => item.policy === "C").every((item) => item.policyCanvas.height === item.baselineCanvas.height && JSON.stringify(item.policyPlot) === JSON.stringify(item.baselinePlot)), "C changed fixed-height geometry");
        check(observed.metrics.every((item) => item.counts.dataBefore === item.counts.dataAfter && item.counts.marksBefore === item.counts.marksAfter), "scientific counts changed");
        check(observed.metrics.every((item) => !item.overlap && !item.clipping), "header overlap or clipping detected");
        check(observed.metrics.every((item) => ["none", "60", "72", "120"].every((floor) => floor in item.candidateFloors)), "candidate floor evidence missing");
        check(observed.resizeStability.length === 5 && observed.resizeStability.every((item) => item.deterministic && item.reversible && item.noAccumulation && item.noOscillation && item.monotonicByWidth && !item.statefulMemoryRequired), "resize stability failed");
        check(observed.resizeStability.every((item) => item.expectedHeights[width] === observed.metrics.find((metric) => metric.specimen === item.specimen && metric.policy === "B").policyCanvas.height), "resize probe diverged from resolved renderer height");
        check(errors.length === 0, `runtime errors: ${errors.join("; ")}`);
        const result = { engine, ...observed }; records.push(result);
        if (mode === "write") {
          await page.locator(".study-grid").screenshot({ path: path.join(outputRoot, `${engine}-${width}-contact.png`) });
          await page.locator(".focus-section").screenshot({ path: path.join(outputRoot, `${engine}-${width}-focus.png`) });
        }
        await page.close();
      }
    } finally { await browser.close(); }
  }
  const summaries = Object.keys(engines).map((engine) => summarize(records, engine));
  const payload = stable({
    schemaVersion: "figurestead.responsive-header-cross-renderer-evidence/1",
    mode: "study-only",
    productionWrappingImplemented: false,
    productionHeightNegotiationImplemented: false,
    browserCaseCount: records.length,
    variantCaseCount: records.reduce((sum, record) => sum + record.metrics.length, 0),
    assertionCount: assertions,
    summaries,
    engineComparison: compareEngines(records),
    records,
  });
  const json = `${JSON.stringify(payload, null, 2)}\n`, target = path.join(outputRoot, "metrics.json");
  if (mode === "write") fs.writeFileSync(target, json);
  else if (compareAcceptedEvidence) {
    if (!fs.existsSync(target)) throw new Error(`missing accepted cross-renderer evidence ${target}; run with FIGURESTEAD_AUDIT_MODE=write`);
    if (fs.readFileSync(target, "utf8") !== json) throw new Error("cross-renderer study metrics diverged from accepted local evidence");
  }
  if (records.length !== 6 || payload.variantCaseCount !== 60 || assertions !== 96) throw new Error(`expected 6 browser / 60 variant / 96 assertion cases, observed ${records.length} / ${payload.variantCaseCount} / ${assertions}`);
  console.log(JSON.stringify({ suite: "responsive-header-cross-renderer", mode, compareAcceptedEvidence, browserCaseCount: records.length, variantCaseCount: payload.variantCaseCount, assertionCount: assertions, summaries, result: "PASS", outputRoot }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
