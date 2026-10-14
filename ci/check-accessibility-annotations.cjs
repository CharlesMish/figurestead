const assert = require("node:assert/strict");
const { chromium, firefox } = require("playwright");

const specimenUrl = process.env.FIGURESTEAD_SPECIMEN_URL || "http://127.0.0.1:4179/specimen-study/";
const assertionsPerEngine = 81;

(async () => {
  const results = [];
  for (const [engine, browserType] of Object.entries({ chromium, firefox })) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: "reduce" });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(specimenUrl, { waitUntil: "load" });
      await page.waitForFunction(() => document.documentElement.dataset.specimenReady === "true");
      const observed = await page.evaluate(async ({ assertionsPerEngine }) => {
        const { compileTerminalScene, createFigurestead, resolvedSceneToSvg } = await import("/web/src/index.js");
        const study = window.__FIGURESTEAD_SPECIMEN_STUDY__;
        const base = structuredClone(study.rendered.find((item) => item.contract.panels[0].renderer === "line").contract);
        const firstMark = compileTerminalScene(base, { registry: study.registry }).panels[0].marks.find((mark) => mark.kind === "point");
        const checks = [];
        const check = (condition, name) => {
          if (!condition) throw new Error(`accessibility annotation assertion failed: ${name}`);
          checks.push(name);
        };
        check(Boolean(firstMark?.id), "authoritative evidence anchor exists");
        let hiddenInteractiveControls = 0;
        const render = (annotation) => {
          const contract = structuredClone(base);
          contract.panels[0].annotations = [annotation];
          const canvas = document.createElement("canvas");
          canvas.style.cssText = "width:760px;height:520px";
          document.body.append(canvas);
          const controller = createFigurestead(canvas, contract, { autoplay: false, reducedMotion: true, registry: study.registry });
          const root = canvas.nextElementSibling;
          hiddenInteractiveControls += root?.querySelectorAll("summary").length ?? 0;
          const prose = [...root.querySelectorAll("p")].map((item) => item.textContent).find((text) => text.startsWith("Focus annotation:"));
          const composed = controller.getComposedScene().panels[0].composedAnnotations[0];
          const companionCount = root?.classList.contains("figurestead-accessibility") ? 1 : 0;
          controller.destroy();
          canvas.remove();
          return { prose, composed, companionCount };
        };

        const coordinate = render({ type: "focus", x: firstMark.x, y: firstMark.y, label: "Coordinate-bound peak" });
        check(coordinate.composed.status === "authored-coordinate", "coordinate-bound annotation remains authored-coordinate");
        check(coordinate.prose === `Focus annotation: Coordinate-bound peak at x ${firstMark.x}, y ${firstMark.y}.`, "coordinate-bound prose reports authored data coordinates");
        check(!coordinate.prose.includes("undefined"), "coordinate-bound prose never contains undefined");
        check(coordinate.companionCount === 1, "coordinate-bound render has exactly one companion");

        const relative = render({ type: "focus", space: "plot", x: 0.5, y: 0.5, label: "Plot midpoint" });
        check(relative.composed.status === "authored-coordinate", "plot-relative focus retains composed annotation semantics");
        check(relative.prose === "Focus annotation: Plot midpoint (plot-relative position).", "plot-relative focus is identified without fabricated data coordinates");
        check(!relative.prose.includes(" at x "), "plot fractions are never announced as data coordinates");

        const anchored = render({ type: "focus", anchorId: firstMark.id, label: "Evidence-bound peak" });
        check(anchored.composed.status === "evidence-bound", "anchorId resolves against composed geometry");
        check(anchored.composed.boundMarkId === firstMark.id, "anchorId retains authoritative bound mark identity");
        check(anchored.prose === `Focus annotation: Evidence-bound peak at x ${firstMark.x}, y ${firstMark.y}.`, "anchorId prose reports bound mark data coordinates");
        check(!anchored.prose.includes("undefined"), "anchorId prose never contains undefined");
        check(anchored.prose.includes("Evidence-bound peak"), "anchorId prose retains complete label");

        const missing = render({ type: "focus", anchorId: "missing/evidence/mark", label: "Missing anchor" });
        check(missing.composed.status === "missing-anchor", "unknown anchor retains missing-anchor status");
        check(missing.prose === "Focus annotation: Missing anchor.", "unknown anchor truthfully omits coordinates");
        check(!missing.prose.includes(" at x "), "unknown anchor does not fabricate coordinate clause");

        const malformed = render({ type: "focus", label: "Unresolved focus" });
        check(malformed.composed.status === "unresolved", "coordinate-free focus retains unresolved status");
        check(malformed.prose === "Focus annotation: Unresolved focus.", "unresolved focus retains truthful complete prose");
        check(!malformed.prose.includes("undefined"), "unresolved prose never contains undefined");
        check(hiddenInteractiveControls === 0, "hidden companions remain noninteractive");
        // This root-label contract is generated by the public Python export_contract()
        // call in ci/fixtures/accessibility-python-root-labels.py.
        const pythonInput = await (await fetch("/ci/fixtures/accessibility-python-root-labels.json")).json();
        check(pythonInput.panels[0].spec.xLabel == null && pythonInput.panels[0].spec.yLabel == null, "Python fixture has root-only axis labels");
        const cases = [];
        for (const renderer of ["line", "scatter", "strip_summary"]) {
          for (const precedence of ["figure", "scale", "panel"]) {
            const contract = structuredClone(pythonInput), panel = contract.panels[0];
            panel.renderer = renderer;
            if (renderer === "line") panel.data = { x: [100, 200, 300], series: [{ key: "sample", label: "Sample", y: [280, 300, 320] }] };
            if (renderer === "strip_summary") {
              panel.xScale = { type: "band" };
              panel.data = { groups: ["Control", "Treatment"], group: ["Control", "Treatment", "Treatment"], values: [280, 300, 320], series: ["sample", "sample", "sample"], seriesLabels: { sample: "Sample" }, summary: "median" };
            }
            if (precedence !== "figure") { panel.xScale.label = "Scale time (min)"; panel.yScale.label = "Scale temperature (C)"; }
            if (precedence === "panel") { panel.spec.xLabel = "Panel time (h)"; panel.spec.yLabel = "Panel temperature (F)"; }
            const labels = precedence === "figure" ? ["Time (s)", "Temperature (K)"] : precedence === "scale" ? ["Scale time (min)", "Scale temperature (C)"] : ["Panel time (h)", "Panel temperature (F)"];
            const headers = renderer === "line" ? [labels[0], "Sample"] : renderer === "scatter" ? [...labels, "series"] : ["group", labels[1], "series"];
            cases.push({ contract, labels, headers, name: `${renderer}/${precedence}` });
          }
        }
        // Mixed precedence and multi-panel reuse must agree independently for each axis.
        const multi = structuredClone(pythonInput);
        multi.panels.push(structuredClone(multi.panels[0])); multi.panels[1].id = "second";
        multi.panels[0].xScale.label = "Scale time (min)";
        multi.panels[1].spec.yLabel = "Panel temperature (F)";
        cases.push({ contract: multi, labels: ["Scale time (min)", "Temperature (K)"], headers: ["Scale time (min)", "Temperature (K)", "series"], name: "multi-panel/first" });
        cases.push({ contract: multi, panelIndex: 1, labels: ["Time (s)", "Panel temperature (F)"], headers: ["Time (s)", "Panel temperature (F)", "series"], name: "multi-panel/second" });
        const unlabelled = structuredClone(pythonInput); delete unlabelled.spec.xLabel; delete unlabelled.spec.yLabel;
        cases.push({ contract: unlabelled, labels: ["", ""], headers: ["x", "y", "series"], name: "unlabelled" });
        for (const { contract, labels, headers, panelIndex = 0, name } of cases) {
          const canvas = document.createElement("canvas"), drawnText = [];
          canvas.style.cssText = "width:1008px;height:624px"; document.body.append(canvas);
          const context = canvas.getContext("2d"), fillText = context.fillText.bind(context);
          context.fillText = (text, ...args) => { drawnText.push(text); return fillText(text, ...args); };
          const controller = createFigurestead(canvas, contract, { autoplay: false, reducedMotion: true });
          const scene = controller.getComposedScene(), panel = scene.panels[panelIndex];
          const section = canvas.nextElementSibling.querySelectorAll(":scope > section")[panelIndex];
          const axisLabels = [...section.querySelectorAll("dd")].slice(0, 2).map((node) => node.textContent);
          const tableHeaders = [...section.querySelectorAll("thead th")].map((node) => node.textContent);
          const svg = new DOMParser().parseFromString(resolvedSceneToSvg(scene), "image/svg+xml");
          const svgText = [...svg.querySelectorAll("text")].map((node) => node.textContent);
          check(JSON.stringify([panel.spec.xLabel, panel.spec.yLabel]) === JSON.stringify(labels), `${name}: resolved renderer labels use expected precedence`);
          check(JSON.stringify(axisLabels) === JSON.stringify(labels.map((label) => label || "Unlabelled")), `${name}: companion preserves effective axis labels/units`);
          check(JSON.stringify(tableHeaders) === JSON.stringify(headers), `${name}: renderer table description receives effective labels/units`);
          check(labels.filter(Boolean).every((label) => drawnText.includes(label)), `${name}: Canvas paints effective labels`);
          check(labels.filter(Boolean).every((label) => svgText.includes(label)), `${name}: SVG paints the same effective labels`);
          controller.destroy(); canvas.remove();
        }
        if (checks.length !== assertionsPerEngine) throw new Error(`expected ${assertionsPerEngine} assertions, executed ${checks.length}`);
        return { assertions: checks.length, anchorId: firstMark.id, anchorProse: anchored.prose };
      }, { assertionsPerEngine });
      assert.deepEqual(errors, [], `${engine}: browser errors`);
      results.push({ engine, ...observed });
    } finally {
      await browser.close();
    }
  }
  const executed = results.reduce((sum, item) => sum + item.assertions, 0);
  assert.equal(executed, assertionsPerEngine * 2);
  console.log(JSON.stringify({
    suite: "browser-accessibility-annotations",
    result: "PASS",
    expectedAssertionCount: assertionsPerEngine * 2,
    executedAssertionCount: executed,
    results,
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
