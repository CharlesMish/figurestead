const assert = require("node:assert/strict");
const { chromium, firefox } = require("playwright");

const specimenUrl = process.env.FIGURESTEAD_SPECIMEN_URL || "http://127.0.0.1:4179/specimen-study/";
const engines = { chromium, firefox };
  const expectedCasesPerEngine = 45;

(async () => {
  const results = [];
  for (const [engine, browserType] of Object.entries(engines)) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, reducedMotion: "no-preference" });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(specimenUrl, { waitUntil: "load" });
      await page.waitForFunction(() => document.documentElement.dataset.specimenReady === "true");
      const observed = await page.evaluate(async () => {
        const { createFigurestead, createRendererRegistry, defineRenderer, exportFigureSvg } = await import("/web/src/index.js");
        const study = window.__FIGURESTEAD_SPECIMEN_STUDY__;
        const cases = [];
        const check = (condition, name, detail = null) => {
          if (!condition) throw new Error(`responsive-header production assertion failed: ${name}${detail == null ? "" : ` (${JSON.stringify(detail)})`}`);
          cases.push(name);
        };
        const settle = async (frames = 3) => {
          for (let index = 0; index < frames; index += 1) await new Promise((resolve) => requestAnimationFrame(resolve));
          await new Promise((resolve) => setTimeout(resolve, 0));
        };
        const longTitle = "Watershed response across headwater, agricultural, and downstream monitoring sites";
        const longSubtitle = "Storm-linked discharge and suspended sediment response under a shared deterministic observation contract";
        const shortTitle = "Observed response";
        const shortSubtitle = "Measured series.";
        const contractFor = (title = longTitle, subtitle = longSubtitle) => {
          const contract = structuredClone(study.rendered[0].contract);
          contract.spec.title = title; contract.spec.subtitle = subtitle;
          contract.panels[0].spec.title = title; contract.panels[0].spec.subtitle = subtitle;
          contract.motion.durationMs = 120;
          return contract;
        };
        const makeHost = ({ width = 320, height = 196, kind = "fixed" } = {}) => {
          const frame = document.createElement("div");
          frame.style.width = `${width}px`;
          if (kind === "flex") { frame.style.display = "flex"; frame.style.alignItems = "stretch"; }
          const canvas = document.createElement("canvas");
          canvas.width = 116; canvas.height = 70; canvas.style.width = "100%";
          if (kind === "aspect") { canvas.style.height = "auto"; canvas.style.aspectRatio = "116 / 70"; }
          else if (kind === "natural") canvas.style.height = "auto";
          else canvas.style.height = `${height}px`;
          frame.append(canvas); document.body.append(frame);
          return { frame, canvas, width, baseline: height, initialStyle: canvas.getAttribute("style") };
        };
        const remove = (host, controller) => { controller?.destroy(); host.frame.remove(); };
        const header = (controller) => controller.getResolvedScene().panels[0].layout.headerText;
        const plotHeight = (controller) => { const plot = controller.getResolvedScene().panels[0].layout.plot; return plot.bottom - plot.top; };
        const companionText = (host) => host.canvas.nextElementSibling?.textContent ?? "";

        const defaultHost = makeHost();
        const defaultController = createFigurestead(defaultHost.canvas, contractFor(), { autoplay: false, reducedMotion: true, registry: study.registry, dprCap: 1 });
        await settle();
        const defaultHeader = header(defaultController), baselinePlotHeight = plotHeight(defaultController);
        check(defaultHeader.policy === "C" && defaultHeader.title.lines.length <= 2 && defaultHeader.subtitle.lines.length <= 1, "default fixed-height C policy");
        check(defaultHost.canvas.getAttribute("style") === defaultHost.initialStyle, "default preserves host CSS");
        check(companionText(defaultHost).includes(longTitle) && companionText(defaultHost).includes(longSubtitle), "default accessibility strings remain complete");
        remove(defaultHost, defaultController);

        const overwideToken = "BishopCreekWatershedStationIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789";
        const overwideHost = makeHost({ width: 362 });
        const overwideController = createFigurestead(overwideHost.canvas, contractFor(overwideToken, shortSubtitle), { autoplay: false, reducedMotion: true, registry: study.registry, dprCap: 1 });
        await settle();
        const overwideHeader = header(overwideController), overwidePanel = overwideController.getResolvedScene().panels[0];
        const overwideContext = overwideHost.canvas.getContext("2d");
        overwideContext.font = `500 ${overwidePanel.layout.font.title}px ui-monospace`;
        const overwideMaximum = overwidePanel.layout.plot.right - overwidePanel.layout.plot.left;
        check(!overwideHeader.title.complete && overwideHeader.title.lines.every((line) => overwideContext.measureText(line).width <= overwideMaximum + 0.01) && overwideHeader.title.lines.at(-1).endsWith("…") && companionText(overwideHost).includes(overwideToken), "over-wide unbreakable token is visually ellipsized and remains accessible");
        remove(overwideHost, overwideController);

        async function negotiatedMount({ application = "immediate", kind = "fixed", requestImpl = null, baseline = 196, errors = [] } = {}) {
          const host = makeHost({ kind, height: baseline });
          const requests = [], baselineReads = []; let controller;
          const adapter = {
            getBaselineHeight(context) { baselineReads.push({ baseline, currentHeight: context.currentHeight, width: context.width }); return baseline; },
            requestPreferredHeight(request) {
              requests.push(request);
              if (requestImpl) return requestImpl(request, host, () => controller);
              if (application === "decline") return undefined;
              const apply = () => { host.canvas.style.height = `${request.preferredHeight}px`; controller?.resize(); };
              if (application === "delayed") requestAnimationFrame(apply); else apply();
              return undefined;
            },
          };
          controller = createFigurestead(host.canvas, contractFor(), { autoplay: false, reducedMotion: true, registry: study.registry, dprCap: 1, heightNegotiation: adapter, onError: (error, context) => errors.push({ error, context }) });
          await settle(5);
          return { host, controller, requests, baselineReads, adapter, setBaseline(value) { baseline = value; } };
        }

        const immediate = await negotiatedMount();
        check(header(immediate.controller).policy === "B" && Math.abs(plotHeight(immediate.controller) - baselinePlotHeight) < 0.02, "immediate B preserves baseline plot height");
        check(immediate.requests.length === 1 && immediate.host.canvas.getBoundingClientRect().height === immediate.requests[0].preferredHeight, "immediate absolute request settles once");
        check(immediate.requests[0].baselineHeight === 196 && immediate.requests[0].width === 320 && immediate.requests[0].signal instanceof AbortSignal, "request carries absolute context and signal");
        check(header(immediate.controller).title.lines.length <= 2 && header(immediate.controller).subtitle.lines.length <= 2 && companionText(immediate.host).includes(longTitle) && companionText(immediate.host).includes(longSubtitle), "B bounds visual lines and keeps complete accessible header");
        check(immediate.baselineReads.some((item) => item.currentHeight === immediate.requests[0].preferredHeight && item.baseline === 196), "applied preferred height never becomes the next baseline");
        remove(immediate.host, immediate.controller);

        const delayed = await negotiatedMount({ application: "delayed" });
        check(header(delayed.controller).policy === "B" && delayed.requests.length === 1, "delayed host application settles without acknowledgement");
        remove(delayed.host, delayed.controller);

        const declined = await negotiatedMount({ application: "decline" });
        check(header(declined.controller).policy === "C" && declined.requests.length === 1 && declined.host.canvas.getBoundingClientRect().height === 196, "declined request retains C fallback");
        remove(declined.host, declined.controller);

        const clamped = await negotiatedMount({ requestImpl(request, host, getController) { host.canvas.style.height = "215px"; getController()?.resize(); } });
        check(header(clamped.controller).policy === "C" && clamped.host.canvas.getBoundingClientRect().height === 215 && clamped.host.canvas.getBoundingClientRect().height < clamped.requests[0].preferredHeight && clamped.requests.length === 1, "clamped 215px height degrades through C without retry");
        remove(clamped.host, clamped.controller);

        const belowBaseline = await negotiatedMount({ requestImpl(request, host, getController) { host.canvas.style.height = "180px"; getController()?.resize(); } });
        const belowScene = belowBaseline.controller.getResolvedScene();
        check(header(belowBaseline.controller).policy === "C" && belowScene.layout.height === 180 && belowScene.panels[0].layout.plot.bottom <= 180 && belowBaseline.requests.length === 1, "host clamp below baseline resolves C inside the real canvas without retry");
        remove(belowBaseline.host, belowBaseline.controller);

        const delayedStaleHost = makeHost(), delayedStaleRequests = [];
        const delayedStaleController = createFigurestead(delayedStaleHost.canvas, contractFor(), { autoplay: false, reducedMotion: true, registry: study.registry, heightNegotiation: { getBaselineHeight: () => 196, requestPreferredHeight: (request) => delayedStaleRequests.push(request) } });
        await settle();
        delayedStaleHost.frame.style.width = "362px"; delayedStaleController.resize(); await settle();
        const staleBeforeApply = delayedStaleHost.canvas.getAttribute("style");
        if (!delayedStaleRequests[0].signal.aborted) delayedStaleHost.canvas.style.height = `${delayedStaleRequests[0].preferredHeight}px`;
        check(delayedStaleRequests.length === 2 && delayedStaleRequests[0].signal.aborted && !delayedStaleRequests[1].signal.aborted && delayedStaleHost.canvas.getAttribute("style") === staleBeforeApply, "delayed R1 is stale after width creates R2");
        remove(delayedStaleHost, delayedStaleController);

        const syncResize = await negotiatedMount();
        syncResize.controller.resize(); syncResize.controller.resize(); await settle();
        check(syncResize.requests.length === 1, "same-generation duplicate suppression");
        check(syncResize.controller.getState().runtimeFailed === false, "synchronous resize callback cannot recurse into failure");
        const firstSignal = syncResize.requests[0].signal;
        syncResize.controller.setConfig(contractFor()); await settle();
        check(firstSignal.aborted && syncResize.requests.length === 2, "accepted replacement aborts and starts generation");
        check(syncResize.requests[0].preferredHeight === syncResize.requests[1].preferredHeight, "same numeric request emits in a new generation");
        const acceptedSignal = syncResize.requests[1].signal;
        const invalid = contractFor(); invalid.panels = [];
        try { syncResize.controller.setConfig(invalid); } catch {}
        await settle();
        check(!acceptedSignal.aborted && syncResize.requests.length === 2, "rejected replacement preserves generation");
        syncResize.controller.setConfig(contractFor(shortTitle, shortSubtitle)); await settle();
        check(acceptedSignal.aborted && syncResize.requests.length === 3 && syncResize.requests.at(-1).preferredHeight === 196, "invalid then valid recovery creates baseline-valued generation");
        const recoveredSignal = syncResize.requests.at(-1).signal;
        syncResize.host.frame.style.width = "362px"; syncResize.controller.resize(); await settle();
        check(recoveredSignal.aborted && syncResize.requests.length === 4, "width change aborts stale request");
        const widthSignal = syncResize.requests.at(-1).signal;
        syncResize.setBaseline(205); syncResize.controller.resize(); await settle();
        check(widthSignal.aborted && syncResize.requests.length === 5 && syncResize.requests.at(-1).baselineHeight === 205, "baseline change starts fresh generation");
        const destroySignal = syncResize.requests.at(-1).signal, retainedStyle = syncResize.host.canvas.getAttribute("style");
        syncResize.controller.destroy();
        check(destroySignal.aborted && syncResize.host.canvas.getAttribute("style") === retainedStyle, "destroy aborts without restoring host CSS");
        syncResize.host.frame.remove();

        const fastHost = makeHost(); const fastRequests = []; let fastController;
        fastController = createFigurestead(fastHost.canvas, contractFor(), { autoplay: false, reducedMotion: true, registry: study.registry, heightNegotiation: { getBaselineHeight: () => 196, requestPreferredHeight: (request) => fastRequests.push(request) } });
        fastController.setConfig(contractFor("Superseding accepted generation", longSubtitle));
        await settle();
        check(fastRequests.length === 1 && !fastRequests[0].signal.aborted, "superseded queued generation never dispatches");
        remove(fastHost, fastController);

        const remountHost = makeHost(), remountRequests = [];
        const remountAdapter = { getBaselineHeight: () => 196, requestPreferredHeight: (request) => remountRequests.push(request) };
        const firstMount = createFigurestead(remountHost.canvas, contractFor(), { autoplay: false, reducedMotion: true, registry: study.registry, heightNegotiation: remountAdapter });
        await settle(); const staleMountRequest = remountRequests[0]; firstMount.destroy();
        const secondMount = createFigurestead(remountHost.canvas, contractFor(shortTitle, shortSubtitle), { autoplay: false, reducedMotion: true, registry: study.registry, heightNegotiation: remountAdapter });
        await settle();
        const styleBeforeStaleMount = remountHost.canvas.getAttribute("style");
        if (!staleMountRequest.signal.aborted) remountHost.canvas.style.height = `${staleMountRequest.preferredHeight}px`;
        check(staleMountRequest.signal.aborted && remountRequests.length === 2 && remountHost.canvas.getAttribute("style") === styleBeforeStaleMount && remountHost.frame.querySelectorAll(".figurestead-accessibility").length === 1, "destroyed mount request cannot apply after remount");
        remove(remountHost, secondMount);

        const hiddenHost = makeHost(); const hiddenRequests = []; let hiddenController;
        hiddenHost.canvas.style.display = "none";
        hiddenController = createFigurestead(hiddenHost.canvas, contractFor(), { autoplay: false, reducedMotion: true, registry: study.registry, heightNegotiation: { getBaselineHeight: () => 196, requestPreferredHeight: (request) => hiddenRequests.push(request) } });
        await settle();
        check(hiddenRequests.length === 0, "zero-area mount defers negotiation");
        hiddenHost.canvas.style.display = "block"; hiddenController.resize(); await settle();
        check(hiddenRequests.length === 1, "visible remount state negotiates freshly");
        remove(hiddenHost, hiddenController);

        const nullHost = makeHost(); const nullRequests = [];
        const nullController = createFigurestead(nullHost.canvas, contractFor(), { autoplay: false, reducedMotion: true, registry: study.registry, heightNegotiation: { getBaselineHeight: () => null, requestPreferredHeight: (request) => nullRequests.push(request) } });
        await settle();
        check(nullRequests.length === 0 && header(nullController).policy === "C", "null baseline defers with C fallback");
        remove(nullHost, nullController);

        const promiseMount = await negotiatedMount({ requestImpl() { return Promise.resolve("ignored acknowledgement"); } });
        check(promiseMount.requests.length === 1 && header(promiseMount.controller).policy === "C", "resolved Promise return is not an acknowledgement");
        remove(promiseMount.host, promiseMount.controller);

        const promiseErrors = [];
        const rejectedPromiseMount = await negotiatedMount({ errors: promiseErrors, requestImpl() { return Promise.reject(new Error("inert async request failure")); } });
        await settle();
        check(promiseErrors.length === 1 && promiseErrors[0].context.phase === "height-negotiation" && !rejectedPromiseMount.controller.getState().runtimeFailed, "rejected Promise is contained without acknowledgement or retry");
        remove(rejectedPromiseMount.host, rejectedPromiseMount.controller);

        const requestErrors = [];
        const throwingMount = await negotiatedMount({ errors: requestErrors, requestImpl() { throw new Error("inert request failure"); } });
        check(requestErrors.length === 1 && requestErrors[0].context.phase === "height-negotiation" && requestErrors[0].context.operation === "request" && !throwingMount.controller.getState().runtimeFailed, "request error is contained and separately surfaced");
        remove(throwingMount.host, throwingMount.controller);

        const throwingErrorHost = makeHost(); let throwingErrorCalls = 0;
        const throwingErrorController = createFigurestead(throwingErrorHost.canvas, contractFor(), { autoplay: false, reducedMotion: true, registry: study.registry, heightNegotiation: { getBaselineHeight: () => 196, requestPreferredHeight() { throw new Error("inert request failure with throwing reporter"); } }, onError() { throwingErrorCalls += 1; throw new Error("inert reporter failure"); } });
        await settle();
        check(throwingErrorCalls === 1 && !throwingErrorController.getState().runtimeFailed, "throwing onError cannot destabilize negotiation");
        remove(throwingErrorHost, throwingErrorController);

        const baselineErrorHost = makeHost(), baselineErrors = [];
        const baselineErrorController = createFigurestead(baselineErrorHost.canvas, contractFor(), { autoplay: false, reducedMotion: true, registry: study.registry, heightNegotiation: { getBaselineHeight() { throw new Error("inert baseline failure"); }, requestPreferredHeight() { throw new Error("must not request"); } }, onError: (error, context) => baselineErrors.push({ error, context }) });
        await settle();
        check(baselineErrors.length >= 1 && baselineErrors.every((item) => item.context.phase === "height-negotiation" && item.context.operation === "baseline") && !baselineErrorController.getState().runtimeFailed, "baseline error is contained and separately surfaced");
        remove(baselineErrorHost, baselineErrorController);

        for (const kind of ["natural", "aspect", "flex"]) {
          const mounted = await negotiatedMount({ kind });
          check(mounted.requests.length === 1 && header(mounted.controller).policy === "B", `${kind} host applies absolute preference`);
          remove(mounted.host, mounted.controller);
        }

        const external = await negotiatedMount();
        const externalSignal = external.requests[0].signal;
        external.setBaseline(211); external.host.canvas.style.height = "211px"; external.controller.resize(); await settle();
        check(externalSignal.aborted && external.requests.at(-1).baselineHeight === 211, "external host baseline is authoritative");
        remove(external.host, external.controller);

        const wideReferenceHost = makeHost({ width: 640, height: 196 });
        const wideReferenceController = createFigurestead(wideReferenceHost.canvas, contractFor(), { autoplay: false, reducedMotion: true, registry: study.registry, dprCap: 1 });
        await settle();
        const wideReferencePlotHeight = plotHeight(wideReferenceController);
        remove(wideReferenceHost, wideReferenceController);
        const compactToWide = await negotiatedMount({ application: "decline" });
        compactToWide.host.canvas.style.height = `${compactToWide.requests[0].preferredHeight}px`;
        compactToWide.host.frame.style.width = "640px";
        compactToWide.controller.resize();
        const pendingWidePlotHeight = plotHeight(compactToWide.controller);
        await settle();
        check(Math.abs(pendingWidePlotHeight - wideReferencePlotHeight) < 0.02 && compactToWide.requests.at(-1).preferredHeight === 196, "compact-to-wide transition keeps baseline plot geometry while requesting baseline height");
        remove(compactToWide.host, compactToWide.controller);

        const lifecycle = await negotiatedMount();
        const lifecycleSignal = lifecycle.requests[0].signal, lifecycleCount = lifecycle.requests.length;
        lifecycle.controller.setReducedMotion(false); lifecycle.controller.play(); lifecycle.controller.pause(); lifecycle.controller.setReducedMotion(true); document.dispatchEvent(new Event("visibilitychange")); await settle();
        check(!lifecycleSignal.aborted && lifecycle.requests.length === lifecycleCount, "motion and reduced-motion changes do not create sizing generations");
        remove(lifecycle.host, lifecycle.controller);

        const autoplayHost = makeHost(), autoplayRequests = [];
        const autoplayController = createFigurestead(autoplayHost.canvas, contractFor(), { autoplay: true, reducedMotion: false, registry: study.registry, heightNegotiation: { getBaselineHeight: () => 196, requestPreferredHeight: (request) => autoplayRequests.push(request) } });
        await new Promise((resolve) => setTimeout(resolve, 180));
        check(autoplayRequests.length === 1 && !autoplayRequests[0].signal.aborted, "autoplay progress does not create sizing generations");
        remove(autoplayHost, autoplayController);

        const baseRenderer = study.registry.get(contractFor().panels[0].renderer);
        const drawFailure = defineRenderer({ ...baseRenderer, key: "responsive_header_draw_failure", draw(context, environment) { if (environment.progress > 0) throw new Error("inert draw failure"); return baseRenderer.draw(context, environment); } });
        const failureRegistry = createRendererRegistry([...study.registry.definitions(), drawFailure]);
        const failureContract = contractFor(); failureContract.panels[0].renderer = drawFailure.key;
        const failureHost = makeHost(), failureRequests = [], failureErrors = [];
        const failureController = createFigurestead(failureHost.canvas, failureContract, { autoplay: false, reducedMotion: false, registry: failureRegistry, heightNegotiation: { getBaselineHeight: () => 196, requestPreferredHeight: (request) => failureRequests.push(request) }, onError: (error, context) => failureErrors.push({ error, context }) });
        await settle(); failureController.play(); await new Promise((resolve) => setTimeout(resolve, 180));
        check(failureController.getState().runtimeFailed && failureErrors.some((item) => item.context.phase === "draw") && failureRequests.length === 1, "draw failure remains separate from negotiation");
        const failedSignal = failureRequests[0].signal;
        failureController.setConfig(contractFor(shortTitle, shortSubtitle)); await settle();
        check(!failureController.getState().runtimeFailed && failedSignal.aborted && failureRequests.length === 2 && failureRequests.at(-1).preferredHeight === 196, "valid replacement recovers draw failure and sizing generation");
        remove(failureHost, failureController);

        const transition = await negotiatedMount();
        transition.controller.setConfig(contractFor(shortTitle, shortSubtitle)); await settle();
        const shortHeight = transition.requests.at(-1).preferredHeight;
        transition.controller.setConfig(contractFor()); await settle();
        check(shortHeight === 196 && transition.requests.at(-1).preferredHeight > shortHeight && companionText(transition.host).includes(longSubtitle), "short-long replacement is reversible and accessible");
        remove(transition.host, transition.controller);

        const stress = await negotiatedMount();
        const stressRecords = [];
        for (const width of [390, 362, 320, 390, 362, 320, 320, 362, 390, 320]) {
          stress.host.frame.style.width = `${width}px`; stress.controller.resize(); await settle();
          stressRecords.push({ width, preferredHeight: stress.requests.at(-1).preferredHeight, observedHeight: stress.host.canvas.getBoundingClientRect().height });
        }
        const stableByWidth = [320, 362, 390].every((width) => new Set(stressRecords.filter((item) => item.width === width).map((item) => `${item.preferredHeight}:${item.observedHeight}`)).size === 1);
        check(stableByWidth && stressRecords.every((item) => item.preferredHeight === item.observedHeight) && stress.requests.length <= 11, "repeated width stress has no accumulation jitter oscillation or storm");
        remove(stress.host, stress.controller);

        const svg = exportFigureSvg(contractFor(), { width: 320, height: 196 });
        const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
        const svgHeader = parsed.querySelector('[data-responsive-header="C"]');
        check(parsed.documentElement.getAttribute("width") === "320" && parsed.documentElement.getAttribute("height") === "196" && parsed.documentElement.getAttribute("viewBox") === "0 0 320 196" && parsed.querySelector("title")?.textContent === longTitle && Boolean(parsed.querySelector("desc")?.textContent) && svgHeader?.querySelectorAll('[data-header-part="title"] tspan').length <= 2 && svgHeader?.querySelectorAll('[data-header-part="subtitle"] tspan').length <= 1 && svgHeader?.querySelector('[data-header-part="title"]')?.getAttribute("data-full-text") === longTitle, "fixed SVG dimensions and accessible strings remain authoritative");

        return { cases, baselinePlotHeight, defaultHeader };
      });
      assert.equal(pageErrors.length, 0, `${engine}: unexpected page errors: ${pageErrors.join("; ")}`);
      assert.equal(observed.cases.length, expectedCasesPerEngine, `${engine}: production case count drifted`);
      results.push({ engine, caseCount: observed.cases.length, cases: observed.cases, baselinePlotHeight: observed.baselinePlotHeight });
    } finally {
      await browser.close();
    }
  }
  assert.equal(results.length, 2, "expected Chromium and Firefox production cases");
  console.log(JSON.stringify({ suite: "responsive-header-production", expectedEngineCount: 2, executedEngineCount: results.length, expectedCaseCount: expectedCasesPerEngine * 2, executedCaseCount: results.reduce((sum, item) => sum + item.caseCount, 0), result: "PASS", results }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
