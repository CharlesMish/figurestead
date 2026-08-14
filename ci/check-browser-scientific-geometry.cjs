const { chromium, firefox } = require("playwright");

const specimenUrl = process.env.FIGURESTEAD_SPECIMEN_URL || "http://127.0.0.1:4179/specimen-study/";
const engines = { chromium, firefox };
const expectedAssertionsPerEngine = 14;

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const close = (left, right) => Math.abs(left - right) <= 1e-12;

(async () => {
  const results = [];
  let executedAssertionCount = 0;
  for (const [engine, browserType] of Object.entries(engines)) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
      const errors = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(specimenUrl, { waitUntil: "load" });
      await page.waitForFunction(() => document.documentElement.dataset.specimenReady === "true");
      const observed = await page.evaluate(async () => {
        const study = window.__FIGURESTEAD_SPECIMEN_STUDY__;
        const byId = (id) => study.rendered.find((item) => item.id === id);
        const readDomains = (id) => {
          const item = byId(id);
          return {
            terminal: item.terminalScene.panels[0].domain,
            resolved: item.instance.getResolvedScene().panels[0].domain,
          };
        };
        const calibration = byId("instrument_calibration");
        const terminalFit = calibration.terminalScene.panels[0].marks.find((mark) => mark.kind === "summary-line");
        const calibrationResolved = calibration.instance.getResolvedScene();
        const resolvedFit = calibrationResolved.panels[0].marks.find((mark) => mark.kind === "summary-line");
        const { compileTerminalScene, resolvedSceneToSvg, validateContract } = await import("/web/src/index.js");
        const svg = resolvedSceneToSvg(calibrationResolved, { sourceScene: calibration.terminalScene });
        const documentNode = new DOMParser().parseFromString(svg, "image/svg+xml");
        const svgFitPath = documentNode.querySelector('[data-mark-id="instrument_calibration/summary/linear-fit"]')?.getAttribute("d");
        const invalid = (x, y) => {
          const contract = structuredClone(calibration.contract);
          contract.panels[0].data = { x, y, series: Array(x.length).fill("s"), seriesLabels: { s: "S" }, summary: "linear_fit" };
          try {
            validateContract(contract, study.registry);
            return { rejected: false };
          } catch (error) {
            return { rejected: true, name: error.name, path: error.path, message: error.message };
          }
        };
        const coreRenderers = new Set(["line", "scatter", "strip_summary"]);
        const authoredFixtureDomains = study.rendered.filter((item) => {
          const panel = item.contract.panels[0];
          return coreRenderers.has(panel.renderer) && (panel.xScale.domain || panel.yScale.domain);
        }).map((item) => {
          const panel = item.contract.panels[0];
          const automatic = structuredClone(item.contract);
          delete automatic.panels[0].xScale.domain;
          delete automatic.panels[0].yScale.domain;
          return {
            id: item.id,
            authored: { x: panel.xScale.domain || null, y: panel.yScale.domain || null },
            terminal: item.terminalScene.panels[0].domain,
            formerAutomatic: compileTerminalScene(automatic, { registry: study.registry }).panels[0].domain,
          };
        });
        return {
          circadian: readDomains("circadian_phase_shift"),
          calibration: readDomains("instrument_calibration"),
          treatment: readDomains("treatment_replicates"),
          terminalFit: { slope: terminalFit.slope, intercept: terminalFit.intercept },
          resolvedFit: { slope: resolvedFit.slope, intercept: resolvedFit.intercept, geometry: resolvedFit.geometry },
          svgFitPath,
          onePoint: invalid([1], [5]),
          constantX: invalid([1, 1, 1], [1, 2, 3]),
          authoredFixtureDomains,
        };
      });
      let assertions = 0;
      const check = (condition, message) => {
        assertions += 1;
        if (!condition) throw new Error(`${engine}: ${message}`);
      };
      check(same(observed.circadian.terminal, { x: [0, 24], y: [0.35, 1.75] }), "circadian terminal domains diverged");
      check(same(observed.circadian.resolved, observed.circadian.terminal), "circadian resolved domains diverged");
      check(same(observed.calibration.terminal, { x: [-3, 93], y: [-5, 100] }), "calibration terminal domains diverged");
      check(same(observed.calibration.resolved, observed.calibration.terminal), "calibration resolved domains diverged");
      check(same(observed.treatment.terminal.y, [0.65, 2.35]), "strip-summary terminal y domain diverged");
      check(same(observed.treatment.resolved.y, observed.treatment.terminal.y), "strip-summary resolved y domain diverged");
      check(close(observed.terminalFit.slope, 0.9926296212121212), "calibration slope changed");
      check(close(observed.terminalFit.intercept, 0.5321095454545386), "calibration intercept changed");
      check(close(observed.resolvedFit.slope, observed.terminalFit.slope) && close(observed.resolvedFit.intercept, observed.terminalFit.intercept), "resolved fit coefficients diverged");
      check(observed.svgFitPath === `M ${observed.resolvedFit.geometry.x1} ${observed.resolvedFit.geometry.y1} L ${observed.resolvedFit.geometry.x2} ${observed.resolvedFit.geometry.y2}`, "SVG fit geometry diverged");
      check(observed.onePoint.rejected && observed.onePoint.path === "config.panels[0].data.summary" && observed.onePoint.message.includes("at least two finite observations"), "one-point fit was not rejected precisely");
      check(observed.constantX.rejected && observed.constantX.path === "config.panels[0].data.summary" && observed.constantX.message.includes("at least two distinct finite x values"), "constant-x fit was not rejected precisely");
      const expectedAuthoredFixtures = ["circadian_phase_shift", "dose_response_plate", "gene_expression_recovery", "habitat_class_response", "instrument_calibration", "lab_precision", "paired_seasonal_distributions", "particle_size_relationship", "treatment_replicates", "watershed_storm_response"];
      check(same(observed.authoredFixtureDomains.map((item) => item.id).sort(), expectedAuthoredFixtures) && observed.authoredFixtureDomains.every((item) => (item.authored.x === null || same(item.terminal.x, item.authored.x)) && (item.authored.y === null || same(item.terminal.y, item.authored.y))), "accepted authored-domain fixtures diverged");
      check(errors.length === 0, `runtime errors: ${errors.join("; ")}`);
      if (assertions !== expectedAssertionsPerEngine) throw new Error(`${engine}: expected ${expectedAssertionsPerEngine} assertions, executed ${assertions}`);
      executedAssertionCount += assertions;
      results.push({ engine, assertions, observed });
    } finally {
      await browser.close();
    }
  }
  if (results.length !== 2) throw new Error(`expected exactly 2 browser cases, executed ${results.length}`);
  if (executedAssertionCount !== 28) throw new Error(`expected exactly 28 browser assertions, executed ${executedAssertionCount}`);
  console.log(JSON.stringify({ suite: "browser-scientific-geometry", expectedCaseCount: 2, executedCaseCount: results.length, expectedAssertionCount: 28, executedAssertionCount, result: "PASS", results }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
