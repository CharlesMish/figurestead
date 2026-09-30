const assert = require("node:assert/strict");
const { chromium, firefox } = require("playwright");
const base = process.env.FIGURESTEAD_BASE_URL || "http://127.0.0.1:4179/";

(async () => {
  const results = [];
  for (const [engine, type] of Object.entries({ chromium, firefox })) {
    const browser = await type.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 760 }, reducedMotion: "reduce" });
      const pageErrors = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      // This static fixture avoids starting unrelated controllers in the host.
      await page.goto(new URL("ci/fixtures/readability-micro-polish.html", base).href);
      const observed = await page.evaluate(async () => {
        const api = await import("/web/src/index.js");
        const { numericContract, numericRejectionCases } = await import("/ci/fixtures/numeric-array-validation.js");
        const theme = (await (await fetch("/src/figurestead/themes/lavender_fog_notebook.json")).json()).themes.lavender_fog_notebook;
        const cases = numericRejectionCases(theme), runtimeErrors = [];
        const check = (condition, message) => { if (!condition) throw Error(message); };
        const same = (left, right, message) => check(JSON.stringify(left) === JSON.stringify(right), message);
        const options = { autoplay: false, reducedMotion: true, dprCap: 1, onError: error => runtimeErrors.push(error.message) };
        const canvasFor = () => {
          const canvas = document.createElement("canvas");
          canvas.style.cssText = "width:760px;height:520px"; document.body.append(canvas);
          return canvas;
        };
        const reject = (fn, path, name) => {
          let rejected;
          try { fn(); } catch (error) { rejected = error; }
          check(rejected?.name === "FiguresteadConfigError" && rejected.path === path, `${name}: expected indexed rejection at ${path}`);
        };
        let executed = 0;
        const identityStages = [];
        for (const renderer of ["line", "scatter", "strip_summary"]) {
          const input = numericContract(theme, renderer), canvas = canvasFor();
          const figure = api.createFigurestead(canvas, input, options);
          try {
            // Preserve a hidden rank across rejected setConfig as well as setData.
            if (renderer === "line") figure.setData({ ...input.panels[0].data, series: [input.panels[0].data.series[1]] });
            const snapshot = () => ({
              state: figure.getState(), scene: figure.getScene(), resolved: figure.getResolvedScene(), composed: figure.getComposedScene(),
              pixels: canvas.toDataURL(), dimensions: [canvas.width, canvas.height],
              companion: canvas.nextElementSibling, dom: canvas.nextElementSibling.outerHTML,
              svg: api.exportFigureSvg(figure.getScene(), { width: 760, height: 520 }),
            });
            const before = snapshot();
            for (const test of cases.filter(test => test.renderer === renderer)) {
              const contract = test.make(), expectedPath = `config.panels[0].data.${test.dataPath}`;
              if (renderer === "line") contract.panels[0].data.series.push({ key: "rejected-newcomer", label: "Rejected", y: [1, 1, 1] });
              const invalidCanvas = canvasFor(), html = invalidCanvas.outerHTML, blank = invalidCanvas.toDataURL();
              try {
                reject(() => api.createFigurestead(invalidCanvas, contract, options), expectedPath, `${test.name}/create`);
                check(invalidCanvas.outerHTML === html && invalidCanvas.toDataURL() === blank, `${test.name}: rejected creation changed canvas`);
                check(!invalidCanvas.nextElementSibling, `${test.name}: rejected creation attached content`);
                executed += 1;
              } finally { invalidCanvas.remove(); }
              for (const route of ["setData", "setConfig"]) {
                reject(() => route === "setData" ? figure.setData(contract.panels[0].data) : figure.setConfig(contract), expectedPath, `${test.name}/${route}`);
                const after = snapshot();
                for (const key of ["scene", "resolved", "composed", "companion"]) check(after[key] === before[key], `${test.name}/${route}: changed ${key}`);
                for (const key of ["state", "pixels", "dimensions", "dom", "svg"]) same(after[key], before[key], `${test.name}/${route}: changed ${key}`);
                executed += 1;
              }
            }
            figure.resize();
            same(canvas.toDataURL(), before.pixels, `${renderer}: redraw after refusal changed pixels`);
            same(figure.getState(), before.state, `${renderer}: redraw after refusal changed state`);
            if (renderer === "line") {
              const data = input.panels[0].data, [a, b] = data.series, c = { key: "C", label: "C", y: [3, 3, 3] };
              for (const series of [[b, c], [a, b, c]]) {
                figure.setData({ ...data, series });
                const styles = figure.getScene().seriesStyles;
                check(styles.B.glyph === "square" && styles.B.lineStyle === "dash", "B lost its established identity or rhythm");
                check(styles.C.glyph === "triangle", "rejected candidate consumed or reset a registration rank");
                if (styles.A) check(styles.A.glyph === "ring", "hidden A rank was reset by rejected setConfig");
                identityStages.push(series.map(row => row.key));
              }
            }
          } finally { figure.destroy(); canvas.remove(); }
        }
        same(runtimeErrors, [], "synchronous rejection must not become a draw error");
        return { caseCount: cases.length, executed, identityStages, runtimeErrors };
      });
      assert.deepEqual(pageErrors, [], `${engine}: unexpected page errors`);
      assert.equal(observed.caseCount, 70);
      assert.equal(observed.executed, 210, "all cases must exercise creation and both update routes");
      assert.deepEqual(observed.identityStages, [["B", "C"], ["A", "B", "C"]]);
      results.push({ engine, ...observed });
    } finally { await browser.close(); }
  }
  assert.equal(results.length, 2);
  console.log(JSON.stringify({ suite: "browser-numeric-array-validation", result: "PASS", results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
