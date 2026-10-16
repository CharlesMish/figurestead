const assert = require("node:assert/strict");
const { chromium, firefox } = require("playwright");
const fs = require("node:fs"), path = require("node:path");
const baseUrl = process.env.FIGURESTEAD_BASE_URL || "http://127.0.0.1:4179/";
const output = process.env.FIGURESTEAD_CATEGORY_TICK_OUTPUT;

(async () => {
  const results = []; let assertions = 0;
  const check = (condition, message) => { assertions++; assert.ok(condition, message); };
  for (const [engine, browserType] of Object.entries({ chromium, firefox })) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1500, height: 1500 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
      await page.goto(baseUrl);
      for (const [profile, width, height, short] of [["atlas", 420, 300, false], ["atlas", 420, 520, false], ["atlas", 760, 520, false], ["paper", 420, 520, false], ["atlas", 760, 520, true]]) {
        const result = await page.evaluate(async ({ profile, width, height, short }) => {
          document.body.replaceChildren(); document.body.style.margin = "0";
          const api = await import("/web/src/index.js"), { categoryTickContract } = await import("/ci/fixtures/category-ticks.js");
          const theme = (await (await fetch("/src/figurestead/themes/lavender_fog_notebook.json")).json()).themes.lavender_fog_notebook;
          const contract = categoryTickContract(theme, short ? ["A", "B"] : undefined); contract.view.profile = profile;
          const labels = contract.panels[0].data.groups, canvas = document.createElement("canvas");
          canvas.style.cssText = `display:block;width:${width}px;height:${height}px`; document.body.append(canvas);
          const context = canvas.getContext("2d"), paint = context.fillText.bind(context), paints = [];
          context.fillText = (text, x, y, ...args) => {
            if (labels.some(label => text === label || label.startsWith(String(text).slice(0, -1)) && String(text).endsWith("…"))) {
              const metric = context.measureText(text), t = context.getTransform();
              const corners = [[-metric.actualBoundingBoxLeft, -metric.actualBoundingBoxAscent], [metric.actualBoundingBoxRight, -metric.actualBoundingBoxAscent], [-metric.actualBoundingBoxLeft, metric.actualBoundingBoxDescent], [metric.actualBoundingBoxRight, metric.actualBoundingBoxDescent]].map(([a, b]) => ({ x: t.a * (x + a) + t.c * (y + b) + t.e, y: t.b * (x + a) + t.d * (y + b) + t.f }));
              paints.push({ text, left: Math.min(...corners.map(p => p.x)), right: Math.max(...corners.map(p => p.x)), top: Math.min(...corners.map(p => p.y)), bottom: Math.max(...corners.map(p => p.y)) });
            }
            return paint(text, x, y, ...args);
          };
          const controller = api.createFigurestead(canvas, contract, { autoplay: false, reducedMotion: true, dprCap: 1, accessibility: { visible: true } });
          const composed = controller.getComposedScene(), panel = composed.panels[0];
          const inspectSvg = (source, expected) => {
            const container = document.createElement("div"); container.innerHTML = source; document.body.append(container);
            const svg = container.querySelector("svg"), rect = svg.getBoundingClientRect();
            const ticks = [...svg.querySelectorAll("g[data-layer='axes'] > text")].filter(node => expected.some(tick => tick.displayLabel === [...node.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(""))).map(node => {
              const box = node.getBoundingClientRect();
              return { text: [...node.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(""), full: node.getAttribute("data-full-label"), title: node.querySelector("title")?.textContent, left: box.left - rect.left, right: box.right - rect.left, top: box.top - rect.top, bottom: box.bottom - rect.top };
            });
            return ticks;
          };
          const plan = panel.axes.xTicks, liveSvg = inspectSvg(api.resolvedSceneToSvg(composed), plan);
          const standalone = api.resolveTerminalScene(api.compileTerminalScene(contract), { width, height });
          const standaloneSvg = inspectSvg(api.exportFigureSvg(contract, { width, height }), standalone.panels[0].axes.xTicks);
          const table = document.querySelector("table")?.textContent;
          const output = { profile, width, height, short, labels, plan, plot: panel.layout.plot, paints, liveSvg, standaloneSvg, table };
          controller.destroy(); return output;
        }, { profile, width, height, short });
        const key = `${engine}/${profile}/${width}x${height}/${short ? "short" : "long"}`;
        check(result.plot.bottom > result.plot.top && result.plot.right > result.plot.left, `${key}: positive plot`);
        check(result.plan.length === 2 && result.liveSvg.length === 2 && result.standaloneSvg.length === 2, `${key}: both ticks in every painter`);
        for (const label of result.labels) check(result.table.includes(label), `${key}: full accessible label`);
        for (const [index, tick] of result.plan.entries()) {
          check(tick.label === result.labels[index], `${key}: original label retained`);
          check(result.paints.some(p => p.text === tick.displayLabel) && result.liveSvg[index].text === tick.displayLabel, `${key}: shared visible label`);
          if (short) check(tick.displayLabel === tick.label && tick.display.rotation === 0, `${key}: short text unchanged`);
          else if (tick.label !== tick.displayLabel) check(result.liveSvg[index].full === tick.label && result.liveSvg[index].title === tick.label, `${key}: full SVG metadata`);
        }
        for (const [kind, boxes] of Object.entries({ canvas: result.paints, svg: result.liveSvg, standaloneSvg: result.standaloneSvg })) for (const box of boxes) {
          check(box.left >= -.05 && box.right <= width + .05 && box.top >= -.05 && box.bottom <= height + .05, `${key}/${kind}: contained native bounds ${JSON.stringify(box)}`);
        }
        results.push({ engine, ...result });
        if (output && !short) { fs.mkdirSync(output, { recursive: true }); await page.locator("canvas").screenshot({ path: path.join(output, `${engine}-${profile}-${width}x${height}.png`) }); }
      }
      const rollback = await page.evaluate(async () => {
        document.body.replaceChildren();
        const api = await import("/web/src/index.js"), { categoryTickContract } = await import("/ci/fixtures/category-ticks.js"), { lineIdentityContract } = await import("/ci/fixtures/line-identity.js");
        const theme = (await (await fetch("/src/figurestead/themes/lavender_fog_notebook.json")).json()).themes.lavender_fog_notebook;
        const canvas = document.createElement("canvas"); canvas.style.cssText = "width:420px;height:90px"; document.body.append(canvas);
        const instance = api.createFigurestead(canvas, lineIdentityContract(theme), { autoplay: false, reducedMotion: true, dprCap: 1 });
        const scene = instance.getComposedScene(), pixels = canvas.toDataURL(), html = document.body.innerHTML; let error;
        try { instance.setConfig(categoryTickContract(theme)); } catch (caught) { error = `${caught.name}: ${caught.message}`; }
        const result = { error, sameScene: scene === instance.getComposedScene(), samePixels: pixels === canvas.toDataURL(), sameDom: html === document.body.innerHTML };
        instance.destroy(); return result;
      });
      check(/FiguresteadConfigError.*insufficient category tick space/.test(rollback.error), `${engine}: clear capacity rejection ${JSON.stringify(rollback)}`);
      check(rollback.sameScene && rollback.samePixels && rollback.sameDom, `${engine}: rejected update is transactional`);
      results.push({ engine, rollback });
    } finally { await browser.close(); }
  }
  const report = { suite: "shared-category-ticks", result: "PASS", cases: results.length, assertions, results };
  if (output) fs.writeFileSync(path.join(output, "native-results.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ suite: report.suite, result: report.result, cases: report.cases, assertions }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
