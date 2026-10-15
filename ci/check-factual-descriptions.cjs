const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, firefox } = require("playwright");

const url = process.env.FIGURESTEAD_SPECIMEN_URL || "http://127.0.0.1:4179/specimen-study/";
const output = process.env.FIGURESTEAD_FACTUAL_REVIEW_OUTPUT;
if (output) fs.mkdirSync(output, { recursive: true });

(async () => {
  const results = [];
  for (const [engine, browserType] of Object.entries({ chromium, firefox })) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1100, height: 1100 }, reducedMotion: "reduce" });
      await page.goto(url, { waitUntil: "load" });
      const result = await page.evaluate(async () => {
        const F = await import("/web/src/index.js");
        const { lineIdentityContract } = await import("/ci/fixtures/line-identity.js");
        const theme = (await (await fetch("/src/figurestead/themes/lavender_fog_notebook.json")).json()).themes.lavender_fog_notebook;
        document.body.replaceChildren(); document.body.style.cssText = "margin:20px;font:14px sans-serif";
        const checks = [], cases = [];
        const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
        const jobs = [
          { renderer: "line", before: { x: [0, 1, 2], series: [{ key: "A", label: "Control", y: [1, 2, 4] }] }, after: { x: [0, 1, 2, 3], series: [{ key: "A", label: "Control", y: [2, 4, 6, 8] }] }, first: "3 observations per series (3 total)", second: "4 observations per series (4 total)" },
          { renderer: "scatter", before: { x: [0, 1, 2], y: [1, 3, 5], summary: "linear_fit" }, after: { x: [0, 1, 2], y: [4, 3, 2], summary: "linear_fit" }, first: "slope 2; intercept 1", second: "slope -1; intercept 4" },
          { renderer: "strip_summary", before: { groups: ["Empty", "A", "B"], group: ["A", "A", "B", "B", "B"], values: [1, 2, 3, 4, 5], summary: "median" }, after: { groups: ["Empty", "A", "B"], group: ["B", "B"], values: [10, 14], summary: "median" }, first: "A: n=2; median 1.5. B: n=3; median 4", second: "A: n=0; no median. B: n=2; median 12" },
        ];
        for (const job of jobs) {
          const contract = lineIdentityContract(theme), panel = contract.panels[0];
          contract.spec = { ...contract.spec, title: `${job.renderer} current facts`, description: "An authored statement with three observations.", note: "Synthetic example; not measurements." };
          panel.renderer = job.renderer; panel.xScale = { type: job.renderer === "strip_summary" ? "band" : "linear" };
          panel.data = job.before; panel.spec = { description: "The author owns this interpretation.", note: "Panel source context." };
          const holder = document.createElement("section"); holder.id = `case-${job.renderer}`;
          const canvas = document.createElement("canvas"); canvas.style.cssText = "width:760px;height:520px"; holder.append(canvas); document.body.append(holder);
          const controller = F.createFigurestead(canvas, contract, { autoplay: false, reducedMotion: true, accessibility: { visible: true }, dprCap: 1 });
          const inspect = (phase, data, expected) => {
            const scene = controller.getScene(), composed = controller.getComposedScene(), p = scene.panels[0];
            const root = canvas.nextElementSibling, texts = [...root.querySelectorAll("p")].map((node) => node.textContent);
            const svg = new DOMParser().parseFromString(F.resolvedSceneToSvg(composed), "image/svg+xml");
            const desc = svg.querySelector("desc").textContent;
            const rows = [...root.querySelectorAll("tbody tr")].map((row) => [...row.children].map((cell) => cell.textContent));
            check(p.factualSummary.includes(expected), `${job.renderer}/${phase} current factual values`);
            check(texts.includes(p.factualSummary), `${job.renderer}/${phase} live companion matches scene facts`);
            check(desc.includes(p.factualSummary), `${job.renderer}/${phase} SVG description matches scene facts`);
            check(texts.includes("Authored context: An authored statement with three observations."), `${job.renderer}/${phase} arbitrary authored narrative preserved and attributed`);
            check(texts.includes("Authored panel context: The author owns this interpretation."), `${job.renderer}/${phase} panel context additive`);
            check(texts.filter((text) => text === "Source note: Synthetic example; not measurements.").length === 1, `${job.renderer}/${phase} root source note once`);
            check(texts.filter((text) => text === "Source note: Panel source context.").length === 1, `${job.renderer}/${phase} panel source note once`);
            check(desc.includes("Source note: Synthetic example; not measurements.") && desc.includes("Source note: Panel source context."), `${job.renderer}/${phase} SVG carries both source contexts`);
            check(![...svg.querySelectorAll("text")].some((node) => node.textContent.includes("Synthetic example")), `${job.renderer}/${phase} no new painted footer`);
            check(rows.length === (data.values ?? data.x).length, `${job.renderer}/${phase} complete raw table`);
            if (job.renderer === "line") {
              check(p.marks.filter((mark) => mark.kind === "point").length === data.x.length, `${job.renderer}/${phase} count matches actual point records`);
              check(rows.every((row, i) => row[0] === String(data.x[i]) && row[1] === String(data.series[0].y[i])), `${job.renderer}/${phase} raw numbers unchanged`);
            } else if (job.renderer === "scatter") {
              const mark = p.marks.find((mark) => mark.kind === "summary-line");
              check(mark.slope === (phase === "before" ? 2 : -1) && mark.intercept === (phase === "before" ? 1 : 4), `${job.renderer}/${phase} factual coefficients equal actual model mark`);
              check(rows.every((row, i) => row[0] === String(data.x[i]) && row[1] === String(data.y[i])), `${job.renderer}/${phase} full raw observations`);
            } else {
              const medians = p.marks.filter((mark) => mark.kind === "median-rule");
              check(JSON.stringify(medians.map((mark) => [mark.group, mark.y])) === JSON.stringify(phase === "before" ? [["A", 1.5], ["B", 4]] : [["B", 12]]), `${job.renderer}/${phase} factual medians equal actual summary marks`);
              check(p.factualSummary.includes("Empty: n=0; no median") && !medians.some((mark) => mark.group === "Empty"), `${job.renderer}/${phase} empty group has no invented statistic`);
              check(rows.every((row, i) => row[0] === data.group[i] && row[1] === String(data.values[i])), `${job.renderer}/${phase} full raw groups and values`);
            }
            return { phase, factualSummary: p.factualSummary, authoredContext: texts.filter((text) => text.startsWith("Authored")), rows, summaryMarks: p.marks.filter((mark) => ["summary-line", "median-rule"].includes(mark.kind)) };
          };
          const before = inspect("before", job.before, job.first);
          controller.setData(job.after);
          const after = inspect("after", job.after, job.second);
          check(canvas.nextElementSibling === holder.querySelector(".figurestead-accessibility") && holder.querySelectorAll(".figurestead-accessibility").length === 1, `${job.renderer} companion replaced atomically`);
          cases.push({ renderer: job.renderer, before, after });
        }
        return { assertions: checks.length, checks, cases, userAgent: navigator.userAgent };
      });
      if (output) {
        for (const renderer of ["line", "scatter", "strip_summary"]) await page.locator(`#case-${renderer}`).screenshot({ path: path.join(output, `${engine}-${renderer}.png`) });
      }
      results.push({ engine, ...result });
    } finally { await browser.close(); }
  }
  assert.equal(results.length, 2);
  console.log(JSON.stringify({ result: "PASS", assertions: results.reduce((n, r) => n + r.assertions, 0), results }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
