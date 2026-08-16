const fs = require("node:fs");
const path = require("node:path");
const { chromium, firefox } = require("playwright");

const mode = process.env.FIGURESTEAD_AUDIT_MODE || "check";
const compareAcceptedEvidence = process.env.FIGURESTEAD_HOST_HEIGHT_COMPARE_EVIDENCE !== "0";
const baseUrl = process.env.FIGURESTEAD_HOST_HEIGHT_URL || "http://127.0.0.1:4179/audit/host-height-ownership/";
const outputRoot = process.env.FIGURESTEAD_HOST_HEIGHT_OUTPUT_ROOT || path.join(__dirname, "evidence");
const engines = { chromium, firefox };

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function summaries(records) {
  return records.flatMap((record) => record.study.mechanisms.map((mechanism) => {
    const cases = record.study.metrics.filter((item) => item.mechanism === mechanism);
    const stress = record.study.stress.filter((item) => item.mechanism === mechanism);
    return {
      engine: record.engine, mechanism, caseCount: cases.length,
      addedHeight: {
        minimum: Math.min(...cases.map((item) => item.preferredHeight - item.hostBaseline)),
        median: median(cases.map((item) => item.preferredHeight - item.hostBaseline)),
        maximum: Math.max(...cases.map((item) => item.preferredHeight - item.hostBaseline)),
      },
      resizeCallbacks: { median: median(cases.map((item) => item.resizeCallbacks)), maximum: Math.max(...cases.map((item) => item.resizeCallbacks)) },
      stableCaseCount: cases.filter((item) => item.noAccumulation && item.noJitter && item.noOscillation).length,
      stableStressCount: stress.filter((item) => item.deterministic && item.reversible && item.noAccumulation && item.noOnePixelJitter && item.noOscillation).length,
      expectedDestroyStateCount: cases.filter((item) => item.destruction.sizingRestored).length,
    };
  }));
}
function engineComparison(records) {
  const [left, right] = records;
  const differences = [];
  left.study.metrics.forEach((a) => {
    const b = right.study.metrics.find((item) => item.mechanism === a.mechanism && item.host === a.host && item.fixture === a.fixture && item.width === a.width);
    for (const field of ["hostBaseline", "preferredHeight", "measuredHeaderDemand", "plotHeightPreserved", "noAccumulation", "noOscillation"]) {
      const equal = typeof a[field] === "number" && typeof b[field] === "number" ? Math.abs(a[field] - b[field]) <= 0.02 : a[field] === b[field];
      if (!equal) differences.push({ mechanism: a.mechanism, host: a.host, fixture: a.fixture, width: a.width, field, [left.engine]: a[field], [right.engine]: b[field] });
    }
  });
  return { structuralDifferenceCount: differences.length, differences, interpretation: differences.length ? "engine differences recorded" : "no meaningful ownership or geometry divergence" };
}

(async () => {
  if (mode === "write") fs.mkdirSync(outputRoot, { recursive: true });
  const records = []; let assertions = 0;
  for (const [engine, browserType] of Object.entries(engines)) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1200, height: 2200 }, reducedMotion: "reduce", deviceScaleFactor: 1 });
      const errors = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(baseUrl, { waitUntil: "load", timeout: 120000 });
      await page.waitForFunction(() => document.documentElement.dataset.studyReady === "true", null, { timeout: 180000 });
      const study = await page.evaluate(() => window.__FIGURESTEAD_HOST_HEIGHT_STUDY__);
      const check = (condition, message) => { assertions += 1; if (!condition) throw new Error(`${engine}: ${message}`); };
      check(study.studyOnly && !study.productionSizingOptionImplemented && !study.productionHeaderWrappingImplemented && !study.productionCssHeightMutationImplemented, "study boundary failed");
      check(JSON.stringify(study.mechanisms) === JSON.stringify(["A", "B", "C"]), "mechanism set diverged");
      check(JSON.stringify(study.hosts) === JSON.stringify(["natural", "fixed", "aspect-ratio", "flex-grid", "external-change"]), "host set diverged");
      check(study.metrics.length === 225, `expected 225 primary cases, observed ${study.metrics.length}`);
      check(new Set(study.metrics.map((item) => item.fixture)).size === 5 && new Set(study.metrics.map((item) => item.width)).size === 3, "fixture/width matrix incomplete");
      check(study.metrics.every((item) => item.finalObservedCanvasRect.height === item.preferredHeight), "preferred height was not applied exactly");
      check(study.metrics.every((item) => item.header.titleComplete && item.header.subtitleComplete && item.plotHeightPreserved), "accepted B header/plot invariant failed");
      check(study.metrics.every((item) => item.accessibility.companionCount === 1 && item.accessibility.adjacentToCanvas && item.accessibility.titleComplete && item.accessibility.subtitleComplete && !item.accessibility.clippedBySizingAncestor), "accessibility ownership failed");
      check(study.metrics.every((item) => item.noAccumulation && item.noJitter && item.noOscillation && item.duplicateRequestSuppressed), "primary settlement failed");
      check(study.metrics.every((item) => item.destruction.companionCount === 0 && item.destruction.sizingRestored), "destroy state failed");
      check(study.metrics.filter((item) => item.mechanism === "B").every((item) => item.destruction.sizingResidueExpected), "host-applied residue semantics missing");
      check(study.metrics.filter((item) => item.mechanism !== "B").every((item) => !item.destruction.sizingResidueExpected), "direct ownership residue semantics wrong");
      const failedHostAppliedStress = study.stress.filter((item) => item.mechanism === "B" && !(item.deterministic && item.reversible && item.noAccumulation && item.noOnePixelJitter && item.noOscillation && item.companionRemoved));
      check(study.stress.length === 15 && failedHostAppliedStress.length === 0, `host-applied resize stress failed: ${JSON.stringify(failedHostAppliedStress)}`);
      check(study.stress.filter((item) => item.mechanism !== "B" && ["natural", "flex-grid"].includes(item.host)).every((item) => item.baselineAmbiguityObserved), "direct ownership failed to reproduce auto-height baseline ambiguity");
      check(study.transitions.length === 3 && study.transitions.every((item) => item.rejectedReplacementPreservedHeight && item.rejectedReplacementPreservedIdentity && item.companionRemoved && item.steps.every((step) => step.height === step.preferredHeight && step.accessibility.companionCount === 1)), "setConfig transitions failed");
      check(study.runtimeFailures.length === 3 && study.runtimeFailures.every((item) => item.errorCount === 1 && item.preservedAcceptedHeight && item.failedState.runtimeFailed && item.recovered), "runtime failure sizing/recovery failed");
      check(study.delayedHostApplication.length === 5 && study.delayedHostApplication.every((item) => item.oneFrameAtBaseline && item.settledExactly && item.duplicateSuppressed), "next-frame host application failed");
      check(study.declinedHostRequests.length === 5 && study.declinedHostRequests.every((item) => item.requestDeclined && item.remainedFixed && item.accessibilityComplete && item.companionsAfterDestroy === 0), "declined host request did not retain fixed-height fallback");
      const failedRemounts = study.remounts.filter((item) => item.mechanism === "B" && !(item.sameAsCleanMount && item.hostCleanupRequired && item.companionAfterDestroy === 0 && item.companionOnRemount === 1));
      check(study.remounts.length === 15 && failedRemounts.length === 0, `host-applied destroy/remount failed: ${JSON.stringify(failedRemounts)}`);
      check(study.remounts.filter((item) => item.mechanism !== "B" && ["natural", "flex-grid"].includes(item.host)).every((item) => item.autoIntrinsicBaselineDrift), "direct ownership remount failed to expose intrinsic baseline drift");
      check(study.currentOwnership.figuresteadWrites === "canvas backing width/height attributes only" && study.currentOwnership.resizeObserverTarget === "canvas" && !study.currentOwnership.exportsAffected, "current source diagnosis diverged");
      check(errors.length === 0, `runtime errors: ${errors.join("; ")}`);
      records.push({ engine, study });
      if (mode === "write") await page.locator(".visual-grid").screenshot({ path: path.join(outputRoot, `${engine}-mechanism-contact.png`) });
      await page.close();
    } finally { await browser.close(); }
  }
  const payload = stable({
    schemaVersion: "figurestead.host-height-ownership-evidence/1", mode: "study-only",
    browserCaseCount: records.length, primaryCaseCount: records.reduce((sum, item) => sum + item.study.metrics.length, 0),
    stressCaseCount: records.reduce((sum, item) => sum + item.study.stress.length, 0),
    transitionCaseCount: records.reduce((sum, item) => sum + item.study.transitions.length, 0),
    runtimeFailureCaseCount: records.reduce((sum, item) => sum + item.study.runtimeFailures.length, 0),
    delayedHostCaseCount: records.reduce((sum, item) => sum + item.study.delayedHostApplication.length, 0),
    declinedHostCaseCount: records.reduce((sum, item) => sum + item.study.declinedHostRequests.length, 0),
    remountCaseCount: records.reduce((sum, item) => sum + item.study.remounts.length, 0),
    assertionCount: assertions, summaries: summaries(records), engineComparison: engineComparison(records), records,
  });
  const json = `${JSON.stringify(payload, null, 2)}\n`, target = path.join(outputRoot, "metrics.json");
  if (mode === "write") fs.writeFileSync(target, json);
  else if (compareAcceptedEvidence) {
    if (!fs.existsSync(target)) throw new Error(`missing accepted host-height evidence ${target}; run with FIGURESTEAD_AUDIT_MODE=write`);
    if (fs.readFileSync(target, "utf8") !== json) throw new Error("host-height study metrics diverged from accepted local evidence");
  }
  if (payload.browserCaseCount !== 2 || payload.primaryCaseCount !== 450 || payload.stressCaseCount !== 30 || payload.transitionCaseCount !== 6 || payload.runtimeFailureCaseCount !== 6 || payload.delayedHostCaseCount !== 10 || payload.declinedHostCaseCount !== 10 || payload.remountCaseCount !== 30 || assertions !== 44) throw new Error("unexpected nonzero case/assertion count");
  console.log(JSON.stringify({ suite: "host-height-ownership", mode, compareAcceptedEvidence, browserCaseCount: payload.browserCaseCount, primaryCaseCount: payload.primaryCaseCount, stressCaseCount: payload.stressCaseCount, transitionCaseCount: payload.transitionCaseCount, runtimeFailureCaseCount: payload.runtimeFailureCaseCount, delayedHostCaseCount: payload.delayedHostCaseCount, declinedHostCaseCount: payload.declinedHostCaseCount, remountCaseCount: payload.remountCaseCount, assertionCount: assertions, summaries: payload.summaries, engineComparison: payload.engineComparison, result: "PASS", outputRoot }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
