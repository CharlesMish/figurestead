const { chromium, firefox } = require("playwright");

const baseUrl = process.env.FIGURESTEAD_BASE_URL || "http://127.0.0.1:4179/";
const engines = { chromium, firefox };
const expectedFaint = {
  deep_observatory_sage_core: "#71817C",
  lavender_fog_notebook: "#7B718B",
  midnight_transit_signal_slate: "#637980",
  registration_ink: "#817469",
  slipware: "#7A6D63",
  ultraviolet_laboratory: "#8D83B2",
};

(async () => {
  const results = [];
  let executedBrowserCaseCount = 0;
  let executedAssertionCount = 0;
  for (const [engine, browserType] of Object.entries(engines)) {
    const browser = await browserType.launch({ headless: true });
    try {
      for (const viewport of [
        { key: "narrow", width: 390, height: 844, figureWidth: 362, figureHeight: 196 },
        { key: "wide", width: 1440, height: 1000, figureWidth: 1160, figureHeight: 700 },
      ]) {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
        const errors = [];
        page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(new URL("ci/fixtures/readability-micro-polish.html", baseUrl).href, { waitUntil: "load" });
        const observed = await page.evaluate(async ({ figureWidth, figureHeight }) => {
          const api = await import("/web/src/index.js");
          const themeKeys = [
            "deep_observatory_sage_core",
            "lavender_fog_notebook",
            "midnight_transit_signal_slate",
            "registration_ink",
            "slipware",
            "ultraviolet_laboratory",
          ];
          const themePacks = await Promise.all(themeKeys.map(async (key) => {
            const response = await fetch(`/src/figurestead/themes/${key}.json`);
            return (await response.json()).themes[key];
          }));
          const profile = { key: "readability", name: "Readability", marker: "ring_core", markerSize: 42, markerAlpha: 0.84, edgeWidth: 1.05, coreFraction: 0.12, pointGlow: false, gridX: true, gridY: true, gridAlpha: 0.4, summaryGlow: false };
          const timeline = { rainIn: [0, 0], marksEnter: [0, 1], summaryCompiles: [0.8, 1], rainOut: [0, 0], settle: [0.9, 1] };
          const motion = { frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0, trailAlpha: 0, seed: 1, durationMs: 1 };
          const style = { glyphs: ["ring", "square", "triangle", "diamond"], lineStyles: ["solid", "dash", "dot", "dash-dot"], series: {} };
          const makeContract = (theme, key) => ({
            schemaVersion: "0.4", rendererApiVersion: "1", theme, profile, timeline, motion, style,
            spec: { title: "Compact scientific title", subtitle: "Compact scientific subtitle", xLabel: "observation", yLabel: "response", signature: `figurestead · readability · ${key}`, description: "Browser readability regression fixture." },
            layout: { type: "grid", columns: 1, gap: 18, sharedX: false, sharedY: false },
            view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
            panels: [{ id: "line", renderer: "line", spec: { title: "Compact scientific title", subtitle: "Compact scientific subtitle" }, xScale: { type: "linear" }, yScale: { type: "linear" }, annotations: [], encoding: { interpolation: "linear" }, data: { x: [0, 1, 2], revealOrder: "x", series: [{ key: "series-1", label: "Series 1", y: [0, 1, 0] }] } }],
          });

          const records = [];
          for (let index = 0; index < themeKeys.length; index += 1) {
            const key = themeKeys[index], theme = themePacks[index], signature = `figurestead · readability · ${key}`;
            const calls = [];
            const originalFillText = CanvasRenderingContext2D.prototype.fillText;
            CanvasRenderingContext2D.prototype.fillText = function fillText(text, ...args) {
              if (text === signature) calls.push({ font: this.font, fillStyle: String(this.fillStyle) });
              return originalFillText.call(this, text, ...args);
            };
            const canvas = document.createElement("canvas");
            canvas.style.width = `${figureWidth}px`;
            canvas.style.height = `${figureHeight}px`;
            document.body.append(canvas);
            const contract = makeContract(theme, key);
            const instance = api.createFigurestead(canvas, contract, { autoplay: false, reducedMotion: true, dprCap: 1 });
            const scene = instance.getScene(), resolved = instance.getResolvedScene(), panel = resolved.panels[0];
            const svgText = api.exportFigureSvg(contract, { width: figureWidth, height: figureHeight });
            const svg = new DOMParser().parseFromString(svgText, "image/svg+xml");
            const provenance = svg.querySelector('[data-layer="provenance"]');
            const title = svg.querySelector('[data-header-part="title"]') ?? [...svg.querySelectorAll('g[data-layer="axes"] > text')].find((node) => node.textContent === "Compact scientific title");
            records.push({
              key,
              sourceFaint: theme.faint,
              resolvedFaint: scene.theme.faint,
              contrast: api.contrastRatio(scene.theme.faint, scene.theme.field),
              font: panel.layout.font,
              plot: panel.layout.plot,
              canvasSignature: calls.at(-1) ?? null,
              svg: {
                provenanceFill: provenance?.getAttribute("fill") ?? null,
                provenanceFont: Number(provenance?.getAttribute("font-size")),
                titleFont: Number(title?.getAttribute("font-size")),
              },
            });
            instance.destroy();
            canvas.remove();
            CanvasRenderingContext2D.prototype.fillText = originalFillText;
          }
          return records;
        }, { figureWidth: viewport.figureWidth, figureHeight: viewport.figureHeight });

        let assertions = 0;
        const check = (condition, message) => {
          assertions += 1;
          if (!condition) throw new Error(`${engine}/${viewport.key}: ${message}`);
        };
        const changed = observed.filter((item) => item.sourceFaint.toUpperCase() !== item.resolvedFaint).map((item) => item.key);
        check(observed.length === 6, "all six curated themes were not exercised");
        check(observed.every((item) => item.resolvedFaint === expectedFaint[item.key]), "resolved provenance mapping diverged");
        check(observed.every((item) => item.contrast >= 3.4), "provenance missed the 3.4 project floor");
        check(JSON.stringify(changed) === JSON.stringify(["registration_ink", "slipware"]), "unexpected curated theme was changed");
        const expectedFonts = viewport.key === "narrow" ? { title: 14, subtitle: 9, signature: 9 } : { title: 19, subtitle: 12.5, signature: 10 };
        check(observed.every((item) => item.font.title === expectedFonts.title && item.font.subtitle === expectedFonts.subtitle && item.font.signature === expectedFonts.signature), "resolved layout hierarchy diverged");
        check(observed.every((item) => item.canvasSignature && Number.parseFloat(item.canvasSignature.font) === expectedFonts.signature && item.canvasSignature.fillStyle.toUpperCase() === item.resolvedFaint), "Canvas provenance style diverged");
        check(observed.every((item) => item.svg.provenanceFill === item.resolvedFaint && item.svg.provenanceFont === expectedFonts.signature && item.svg.titleFont === expectedFonts.title), "SVG title/provenance style diverged");
        check(errors.length === 0, `runtime errors: ${errors.join("; ")}`);
        if (assertions !== 8) throw new Error(`${engine}/${viewport.key}: expected 8 assertions, executed ${assertions}`);
        executedBrowserCaseCount += 1;
        executedAssertionCount += assertions;
        results.push({ engine, viewport: viewport.key, figure: [viewport.figureWidth, viewport.figureHeight], assertions, changed, observed });
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
  if (executedBrowserCaseCount !== 4) throw new Error(`expected 4 browser cases, executed ${executedBrowserCaseCount}`);
  if (executedAssertionCount !== 32) throw new Error(`expected 32 assertions, executed ${executedAssertionCount}`);
  console.log(JSON.stringify({ suite: "browser-readability-micro-polish", expectedCaseCount: 4, executedCaseCount: executedBrowserCaseCount, expectedAssertionCount: 32, executedAssertionCount, result: "PASS", results }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
