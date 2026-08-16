const assert = require("node:assert/strict");
const { chromium, firefox } = require("playwright");

const specimenUrl = process.env.FIGURESTEAD_SPECIMEN_URL || "http://127.0.0.1:4179/specimen-study/";
const assertionsPerEngine = 17;

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
        const { compileTerminalScene, createFigurestead } = await import("/web/src/index.js");
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
