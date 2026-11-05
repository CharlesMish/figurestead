const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { chromium, firefox } = require("playwright");
const baseUrl = process.env.FIGURESTEAD_BASE_URL || "http://127.0.0.1:4179/";
const apiPath = process.env.FIGURESTEAD_TICK_API || "/web/src/index.js";
const output = process.env.FIGURESTEAD_TICK_OUTPUT;
(async () => {
  const results = []; let assertions = 0;
  const check = (condition, message) => { assertions++; assert.ok(condition, message); };
  for (const [engine, type] of Object.entries({ chromium, firefox })) {
    const browser = await type.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1, timezoneId: "America/Chicago", reducedMotion: "reduce" });
      await page.goto(baseUrl);
      const cases = await page.evaluate(async () => (await import("/ci/fixtures/numeric-ticks.js")).NUMERIC_TICK_CASES);
      for (const fixture of cases) for (const axis of ["x", "y"]) for (const [profile, width, height] of [["atlas", 320, 360], ["atlas", 960, 600], ["paper", 760, 520]]) {
        const result = await page.evaluate(async ({ fixture, axis, profile, width, height, apiPath }) => {
          document.body.replaceChildren(); document.body.style.margin = "0";
          const api = await import(apiPath), { numericTickContract } = await import("/ci/fixtures/numeric-ticks.js");
          const theme = (await (await fetch("/src/figurestead/themes/slipware.json")).json()).themes.slipware;
          const contract = numericTickContract(theme, fixture, axis, profile), original = JSON.stringify(contract);
          const canvas = document.createElement("canvas"); canvas.style.cssText = `width:${width}px;height:${height}px;display:block`; document.body.append(canvas);
          const ctx = canvas.getContext("2d"), paint = ctx.fillText.bind(ctx), calls = [];
          ctx.fillText = (text, x, y, ...rest) => {
            const m = ctx.measureText(text), t = ctx.getTransform();
            calls.push({ text: String(text), x, y, maxWidth: rest[0] ?? null,
              left: t.a * (x - m.actualBoundingBoxLeft) + t.e, right: t.a * (x + m.actualBoundingBoxRight) + t.e,
              top: t.d * (y - m.actualBoundingBoxAscent) + t.f, bottom: t.d * (y + m.actualBoundingBoxDescent) + t.f });
            return paint(text, x, y, ...rest);
          };
          let controller;
          try { controller = api.createFigurestead(canvas, contract, { autoplay: false, reducedMotion: true, dprCap: 1 }); }
          catch(error) { return { error: error.message, name: error.name }; }
          const panel = controller.getComposedScene().panels[0];
          const svgString = api.resolvedSceneToSvg(controller.getComposedScene());
          const div = document.createElement("div"); div.innerHTML = svgString; document.body.append(div);
          const svg = div.querySelector("svg"), box = svg.getBoundingClientRect();
          const plans = [...panel.axes.xTicks, ...panel.axes.yTicks];
          const axisNodes = doc => {
            const nodes = []; let node = doc.querySelector('[data-layer="axes"] > path').nextElementSibling;
            for (let i = 0; i < plans.length; i++, node = node.nextElementSibling) {
              if (node?.localName !== "text") throw Error("unexpected SVG tick structure");
              nodes.push(node);
            }
            return nodes;
          };
          const nodes = axisNodes(svg);
          const svgTicks = nodes.slice(0, plans.length).map(node => {
            const b = node.getBoundingClientRect();
            return { text: node.textContent, left: b.left - box.left, right: b.right - box.left, top: b.top - box.top, bottom: b.bottom - box.top };
          });
          const tickCalls = plans.map(tick => tick.numericDisplay.lines.map(line => calls.findLast(c => c.text === line.text && Math.abs(c.x - line.x) < .001 && Math.abs(c.y - line.y) < .001)));
          const standalone = api.exportFigureSvg(contract, { width, height });
          const xml = new DOMParser().parseFromString(standalone, "image/svg+xml");
          const standaloneLabels = axisNodes(xml).map(t=>t.textContent);
          const out = { plans: plans.map(t=>({ value:t.value,label:t.label,display:t.numericDisplay })), tickCalls, svgTicks,
            domains: panel.domain, dataUnchanged: original === JSON.stringify(contract), standaloneLabels,
            table: canvas.nextElementSibling.querySelector('table')?.textContent, description: svg.querySelector('desc')?.textContent };
          controller.destroy(); return out;
        }, { fixture, axis, profile, width, height, apiPath });
        const key = `${engine}/${fixture.name}/${axis}/${profile}/${width}`;
        if (fixture.name === "multiple-years" && axis === "x" && width === 320) {
          check(result.name === "FiguresteadConfigError" && /insufficient x numeric tick space/.test(result.error), `${key}: honest capacity`);
          results.push({ key, ...result }); continue;
        }
        check(!result.error, `${key}: unexpected rejection ${result.error}`);
        check(result.dataUnchanged && JSON.stringify(result.domains[axis]) === JSON.stringify(fixture.domain), `${key}: data/domain unchanged`);
        check(result.svgTicks.length === result.plans.length, `${key}: all SVG ticks present`);
        for (const [index, tick] of result.plans.entries()) {
          const parsed = tick.label.includes("T") || /^\d{4}-/.test(tick.label) ? Date.parse(tick.label) : Number(tick.label);
          // Values on the target time axis can legitimately be year-only strings.
          check(parsed === tick.value || fixture.type === "time" && Date.parse(tick.label) === tick.value, `${key}: truthful ${tick.label} / ${tick.value}`);
          check(result.svgTicks[index].text === tick.label && result.standaloneLabels[index] === tick.label, `${key}: resolved/Canvas/SVG agreement ${JSON.stringify({ tick:tick.label, live:result.svgTicks[index].text, standalone:result.standaloneLabels[index], labels:result.standaloneLabels })}`);
          check(result.tickCalls[index].every(Boolean) && result.tickCalls[index].map(c=>c.text).join("") === tick.label, `${key}: actual fillText, no later abbreviation`);
          for (const ink of [...result.tickCalls[index], result.svgTicks[index]]) {
            check(ink.left >= -.5 && ink.right <= width + .5 && ink.top >= -.5 && ink.bottom <= height + .5, `${key}: contained actual ink ${JSON.stringify(ink)}`);
            check(!ink.text.includes("…") && ink.maxWidth == null, `${key}: no ellipsis or paint compression`);
          }
        }
        check(result.table && result.description, `${key}: evidence companion retained`);
        results.push({ key, ...result });
        if (output && axis === "x" && profile === "atlas" && width === 320 && ["years","counts","intraday"].includes(fixture.name)) {
          fs.mkdirSync(output,{recursive:true}); await page.locator("canvas").screenshot({ path:path.join(output,`${engine}-${fixture.name}.png`) });
        }
      }
    } finally { await browser.close(); }
  }
  if(output){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'numeric-ticks.json'),JSON.stringify({assertions,results},null,2));}
  console.log(JSON.stringify({suite:"native-numeric-ticks",cases:results.length,assertions,result:"PASS"}));
})().catch(error=>{console.error(error);process.exitCode=1;});
