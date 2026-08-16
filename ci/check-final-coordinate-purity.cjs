const assert = require("node:assert/strict");
const { chromium, firefox } = require("playwright");

const specimenUrl = process.env.FIGURESTEAD_SPECIMEN_URL || "http://127.0.0.1:4179/specimen-study/";
const rendererKeys = ["line", "scatter", "strip_summary"];
const assertionsPerRenderer = 16;

(async () => {
  const results = [];
  for (const [engine, browserType] of Object.entries({ chromium, firefox })) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: "no-preference" });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(specimenUrl, { waitUntil: "load" });
      await page.waitForFunction(() => document.documentElement.dataset.specimenReady === "true");
      const observed = await page.evaluate(async ({ rendererKeys, assertionsPerRenderer }) => {
        const { createFigurestead, createRendererRegistry, defineRenderer } = await import("/web/src/index.js");
        const study = window.__FIGURESTEAD_SPECIMEN_STUDY__;
        const checks = [];
        const check = (condition, name) => {
          if (!condition) throw new Error(`final-coordinate purity assertion failed: ${name}`);
          checks.push(name);
        };
        const waitFor = async (predicate, timeoutMs = 1000) => {
          const deadline = performance.now() + timeoutMs;
          while (!predicate()) {
            if (performance.now() >= deadline) throw new Error("final-coordinate purity wait timed out");
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        };
        const rendererResults = [];
        for (const rendererKey of rendererKeys) {
          const source = study.rendered.find((item) => item.contract.panels.length === 1 && item.contract.panels[0].renderer === rendererKey);
          check(Boolean(source), `${rendererKey}: specimen contract exists`);
          const contract = structuredClone(source.contract);
          contract.motion.durationMs = 1000;
          const base = study.registry.get(rendererKey);
          let drawCalls = 0;
          const custom = defineRenderer({
            ...base,
            key: `coordinate_purity_${rendererKey}`,
            draw(context, environment) { drawCalls += 1; return base.draw(context, environment); },
          });
          contract.panels[0].renderer = custom.key;
          const registry = createRendererRegistry([...study.registry.definitions(), custom]);
          const canvas = document.createElement("canvas");
          canvas.style.cssText = "width:760px;height:520px";
          document.body.append(canvas);
          let progressCallbacks = 0;
          const controller = createFigurestead(canvas, contract, {
            autoplay: false,
            reducedMotion: false,
            registry,
            onProgress() { progressCallbacks += 1; },
          });
          controller.play();
          await waitFor(() => controller.getState().progress > 0.05);
          controller.pause();
          const movingState = controller.getState();
          check(movingState.progress > 0 && movingState.progress < 1 && !movingState.playing, `${rendererKey}: nonterminal paused state established`);
          const scene = controller.getScene(), resolved = controller.getResolvedScene(), composed = controller.getComposedScene();
          const companion = canvas.nextElementSibling, companionText = companion?.textContent;
          const movingPixels = canvas.toDataURL(), movingDrawCalls = drawCalls, movingCallbacks = progressCallbacks;
          const movingCoordinates = controller.getFinalCoordinates();
          check(movingCoordinates[0].points.length > 0, `${rendererKey}: nonempty final coordinates returned`);
          check(movingCoordinates[0].points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)), `${rendererKey}: final screen coordinates are finite`);
          check(movingCoordinates[0].points.every((point) => point.dataX != null && point.dataY != null), `${rendererKey}: final data coordinates remain identified`);
          check(canvas.toDataURL() === movingPixels, `${rendererKey}: moving pixels unchanged by query`);
          check(JSON.stringify(controller.getState()) === JSON.stringify(movingState), `${rendererKey}: moving lifecycle state unchanged by query`);
          check(controller.getScene() === scene && controller.getResolvedScene() === resolved && controller.getComposedScene() === composed, `${rendererKey}: scene identities unchanged by query`);
          check(canvas.nextElementSibling === companion && companion?.textContent === companionText, `${rendererKey}: accessibility companion unchanged by query`);
          check(drawCalls === movingDrawCalls, `${rendererKey}: query does not invoke renderer draw`);
          check(progressCallbacks === movingCallbacks, `${rendererKey}: query emits no progress callback`);

          controller.setReducedMotion(true);
          const terminalState = controller.getState();
          check(terminalState.progress === 1 && !terminalState.playing, `${rendererKey}: terminal state established`);
          const terminalPixels = canvas.toDataURL(), terminalDrawCalls = drawCalls;
          const terminalCoordinates = controller.getFinalCoordinates();
          check(canvas.toDataURL() === terminalPixels, `${rendererKey}: terminal pixels unchanged by query`);
          check(JSON.stringify(controller.getState()) === JSON.stringify(terminalState), `${rendererKey}: terminal lifecycle state unchanged by query`);
          check(drawCalls === terminalDrawCalls, `${rendererKey}: terminal query does not invoke renderer draw`);
          check(JSON.stringify(terminalCoordinates) === JSON.stringify(movingCoordinates), `${rendererKey}: returned terminal coordinates retain prior semantics`);
          controller.destroy();
          canvas.remove();
          rendererResults.push({ renderer: rendererKey, points: movingCoordinates[0].points.length });
        }
        if (checks.length !== rendererKeys.length * assertionsPerRenderer) {
          throw new Error(`expected ${rendererKeys.length * assertionsPerRenderer} assertions, executed ${checks.length}`);
        }
        return { assertions: checks.length, renderers: rendererResults };
      }, { rendererKeys, assertionsPerRenderer });
      assert.deepEqual(errors, [], `${engine}: browser errors`);
      results.push({ engine, ...observed });
    } finally {
      await browser.close();
    }
  }
  const expected = Object.keys({ chromium, firefox }).length * rendererKeys.length * assertionsPerRenderer;
  const executed = results.reduce((sum, item) => sum + item.assertions, 0);
  assert.equal(executed, expected);
  console.log(JSON.stringify({
    suite: "browser-final-coordinate-purity",
    result: "PASS",
    expectedAssertionCount: expected,
    executedAssertionCount: executed,
    results,
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
