const assert = require("node:assert/strict");
const { chromium, firefox } = require("playwright");

const specimenUrl = process.env.FIGURESTEAD_SPECIMEN_URL || "http://127.0.0.1:4179/specimen-study/";
const engines = { chromium, firefox };
const expectedAssertionsPerEngine = 31;

(async () => {
  const results = [];
  for (const [engine, browserType] of Object.entries(engines)) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: "no-preference" });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(specimenUrl, { waitUntil: "load" });
      await page.waitForFunction(() => document.documentElement.dataset.specimenReady === "true");
      const observed = await page.evaluate(async () => {
        const { createFigurestead, createRendererRegistry, defineRenderer } = await import("/web/src/index.js");
        const study = window.__FIGURESTEAD_SPECIMEN_STUDY__;
        const checks = [];
        const check = (condition, name) => {
          if (!condition) throw new Error(`controller integrity assertion failed: ${name}`);
          checks.push(name);
        };
        const waitFor = async (predicate, timeoutMs = 1000) => {
          const deadline = performance.now() + timeoutMs;
          while (!predicate()) {
            if (performance.now() >= deadline) throw new Error("controller integrity wait timed out");
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        };
        const canvasForTest = () => {
          const canvas = document.createElement("canvas");
          canvas.style.cssText = "width:760px;height:520px";
          document.body.append(canvas);
          return canvas;
        };
        const contractA = structuredClone(study.rendered[0].contract);
        contractA.spec.title = "Accepted A";
        contractA.panels[0].spec.title = "Accepted A";
        contractA.motion.durationMs = 1000;
        const baseRenderer = study.registry.get(contractA.panels[0].renderer);
        const rejectPrepare = defineRenderer({
          ...baseRenderer,
          key: "controller_reject_prepare",
          prepare() { throw new Error("inert prepare rejection"); },
        });
        const rejectDescription = defineRenderer({
          ...baseRenderer,
          key: "controller_reject_description",
          describe() { throw new Error("inert accessibility rejection"); },
        });
        const expectedRuntimeError = new Error("inert asynchronous draw proof");
        const rejectDraw = defineRenderer({
          ...baseRenderer,
          key: "controller_reject_draw",
          draw(context, environment) {
            if (environment.progress > 0) throw expectedRuntimeError;
            return baseRenderer.draw(context, environment);
          },
        });
        const registry = createRendererRegistry([...study.registry.definitions(), rejectPrepare, rejectDescription, rejectDraw]);

        const canvas = canvasForTest();
        const controller = createFigurestead(canvas, contractA, { autoplay: false, reducedMotion: false, registry });
        const stateA = controller.getState();
        const sceneA = controller.getScene();
        const resolvedA = controller.getResolvedScene();
        const composedA = controller.getComposedScene();
        const pixelsA = canvas.toDataURL();
        const rejectedSchema = structuredClone(contractA);
        rejectedSchema.spec.title = "Rejected schema B";
        rejectedSchema.view.profile = "report";
        rejectedSchema.panels = [];
        let schemaError;
        try { controller.setConfig(rejectedSchema); } catch (error) { schemaError = error; }
        check(schemaError?.name === "FiguresteadConfigError" && schemaError.path === "config.panels", "invalid schema keeps FiguresteadConfigError path");
        const invalidCreationCanvas = canvasForTest();
        let creationError;
        try { createFigurestead(invalidCreationCanvas, rejectedSchema, { autoplay: false, registry }); } catch (error) { creationError = error; }
        check(creationError?.name === "FiguresteadConfigError" && creationError.path === "config.panels", "synchronous creation retains FiguresteadConfigError behavior");
        invalidCreationCanvas.remove();
        check(JSON.stringify(controller.getState()) === JSON.stringify(stateA), "invalid schema preserves complete reported state");
        check(controller.getScene() === sceneA, "invalid schema preserves terminal scene identity");
        check(controller.getResolvedScene() === resolvedA, "invalid schema preserves resolved scene identity");
        check(controller.getComposedScene() === composedA, "invalid schema preserves composed scene identity");
        check(canvas.nextElementSibling?.querySelector("h2")?.textContent === "Accepted A", "invalid schema preserves accessibility companion");
        check(canvas.toDataURL() === pixelsA, "invalid schema preserves rendered pixels");
        controller.resize();
        check(JSON.stringify(controller.getState()) === JSON.stringify(stateA), "resize after rejection preserves reported A state");
        check(canvas.toDataURL() === pixelsA, "resize after rejection redraws A without mixed chrome");

        const rejectedPreparation = structuredClone(contractA);
        rejectedPreparation.spec.title = "Rejected preparation B";
        rejectedPreparation.panels[0].renderer = rejectPrepare.key;
        let prepareError;
        try { controller.setConfig(rejectedPreparation); } catch (error) { prepareError = error; }
        check(prepareError?.message === "inert prepare rejection", "renderer preparation rejection is reproduced");
        check(JSON.stringify(controller.getState()) === JSON.stringify(stateA) && controller.getScene() === sceneA, "renderer preparation rejection preserves A");

        const rejectedCompanion = structuredClone(contractA);
        rejectedCompanion.spec.title = "Rejected accessibility B";
        rejectedCompanion.panels[0].renderer = rejectDescription.key;
        let companionError;
        try { controller.setConfig(rejectedCompanion); } catch (error) { companionError = error; }
        check(companionError?.message === "inert accessibility rejection", "accessibility preparation rejection is reproduced");
        check(JSON.stringify(controller.getState()) === JSON.stringify(stateA) && canvas.nextElementSibling?.querySelector("h2")?.textContent === "Accepted A", "accessibility preparation rejection preserves A");

        controller.play();
        await waitFor(() => controller.getState().playing && controller.getState().progress > 0);
        const movingProgress = controller.getState().progress;
        try { controller.setConfig(rejectedSchema); } catch {}
        check(controller.getState().playing, "rejected replacement preserves active motion state");
        check(controller.getState().progress >= movingProgress && controller.getState().renderers[0] === contractA.panels[0].renderer, "rejected replacement leaves motion on A");
        controller.pause();

        const contractC = structuredClone(contractA);
        contractC.spec.title = "Accepted C";
        contractC.panels[0].spec.title = "Accepted C";
        contractC.panels[0].data.series[0].y = contractC.panels[0].data.series[0].y.map((value) => value * 0.9);
        controller.setConfig(contractC);
        check(controller.getState().renderers[0] === contractC.panels[0].renderer && controller.getState().profile === contractC.view.profile && controller.getState().runtimeFailed === false, "later valid C is accepted coherently");
        check(controller.getScene().spec.title === "Accepted C" && controller.getResolvedScene().spec.title === "Accepted C" && controller.getComposedScene().spec.title === "Accepted C", "terminal resolved and composed scenes all report C");
        check(canvas.nextElementSibling?.querySelector("h2")?.textContent === "Accepted C", "accessibility companion advances to C");
        check(canvas.toDataURL() !== pixelsA, "successful C replacement redraws new contract");
        controller.destroy(); canvas.remove();

        const runtimeCanvas = canvasForTest();
        const runtimeContract = structuredClone(contractA);
        runtimeContract.panels[0].renderer = rejectDraw.key;
        const runtimeErrors = [];
        const lifecycleStates = [];
        const runtimeController = createFigurestead(runtimeCanvas, runtimeContract, {
          autoplay: false,
          reducedMotion: false,
          registry,
          onState: (state) => lifecycleStates.push(state),
          onError: (error, context) => runtimeErrors.push({ error, context }),
        });
        runtimeController.play();
        await waitFor(() => runtimeErrors.length === 1);
        const failedState = runtimeController.getState();
        const failedProgress = failedState.progress;
        await new Promise((resolve) => setTimeout(resolve, 100));
        check(runtimeErrors.length === 1, "asynchronous draw failure reaches onError exactly once");
        check(runtimeErrors[0].error === expectedRuntimeError, "onError receives the original error object");
        check(runtimeErrors[0].context.phase === "draw" && runtimeErrors[0].context.progress === failedProgress, "onError receives distinct draw context");
        check(!lifecycleStates.includes("error"), "runtime failure is not reinterpreted as a lifecycle notification");
        check(failedState.playing === false && failedState.runtimeFailed === true, "runtime failure enters stopped failed state");
        check(runtimeController.getState().progress === failedProgress, "failed animation makes no uncontrolled progress");
        runtimeController.play(); runtimeController.replay(); runtimeController.resize(); runtimeController.setReducedMotion(true); runtimeController.setReducedMotion(false);
        await new Promise((resolve) => setTimeout(resolve, 100));
        check(runtimeErrors.length === 1 && runtimeController.getState().progress === failedProgress, "failed controller cannot enter a repeated draw loop");
        runtimeController.setConfig(contractC);
        check(runtimeController.getState().runtimeFailed === false && runtimeController.getState().playing === false && runtimeController.getScene().spec.title === "Accepted C", "valid replacement recovers a runtime-failed controller");
        runtimeController.destroy(); runtimeCanvas.remove();

        const callbackCanvas = canvasForTest();
        let throwingCallbackCalls = 0;
        const callbackController = createFigurestead(callbackCanvas, runtimeContract, {
          autoplay: false,
          reducedMotion: false,
          registry,
          onError() { throwingCallbackCalls += 1; throw new Error("inert host callback failure"); },
        });
        callbackController.play();
        await waitFor(() => callbackController.getState().runtimeFailed);
        await new Promise((resolve) => setTimeout(resolve, 100));
        check(throwingCallbackCalls === 1, "throwing host error callback is invoked only once");
        check(callbackController.getState().playing === false && callbackController.getState().runtimeFailed === true, "throwing host callback cannot destabilize safe state");
        callbackController.destroy(); callbackCanvas.remove();

        return { checks, failedState, lifecycleStates, runtimeErrorMessage: runtimeErrors[0].error.message };
      });
      assert.equal(pageErrors.length, 0, `${engine}: unexpected page errors: ${pageErrors.join("; ")}`);
      assert.equal(observed.checks.length + 1, expectedAssertionsPerEngine, `${engine}: controller assertion count drifted`);
      results.push({ engine, assertionCount: observed.checks.length + 1, ...observed });
    } finally {
      await browser.close();
    }
  }
  assert.equal(results.length, 2, "expected Chromium and Firefox controller-integrity cases");
  console.log(JSON.stringify({
    suite: "controller-transactionality-runtime-errors",
    expectedEngineCount: 2,
    executedEngineCount: results.length,
    expectedAssertionCount: expectedAssertionsPerEngine * 2,
    executedAssertionCount: results.reduce((sum, result) => sum + result.assertionCount, 0),
    result: "PASS",
    results,
  }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
