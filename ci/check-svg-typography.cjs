// Render each export as its own SVG document, without the site's CSS or fonts.
const assert = require("node:assert/strict");
const { chromium, firefox } = require("playwright");

(async () => {
  const { exportFigureSvg } = await import("../web/src/index.js");
  const { typographyContract, typographyLayouts, typographyThemes } = await import("../web/test/svg-typography-fixtures.mjs");
  const results = [];
  for (const [engine, type] of Object.entries({ chromium, firefox })) {
    const browser = await type.launch({ headless: true });
    try {
      for (const theme of typographyThemes) for (const layout of typographyLayouts) {
        const svg = exportFigureSvg(typographyContract(theme, layout), layout);
        const page = await browser.newPage({ viewport: { width: layout.width + 30, height: layout.height + 30 } });
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
          await page.goto(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
          const observed = await page.evaluate(async () => {
            await document.fonts.ready;
            const root = document.documentElement;
            const box = node => { const r = node.getBBox(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.y + r.height }; };
            const texts = [...root.querySelectorAll("text")];
            return {
              viewBox: root.getAttribute("viewBox"),
              fontFamilies: texts.map(node => getComputedStyle(node).fontFamily),
              role: root.getAttribute("role"),
              accessible: root.getAttribute("aria-labelledby").split(/\s+/).every(id => document.getElementById(id)?.textContent),
              panels: [...root.querySelectorAll("[data-panel-id]")].map(panel => {
                const title = panel.querySelector('[data-header-part="title"]');
                const subtitle = panel.querySelector('[data-header-part="subtitle"]');
                const plot = panel.querySelector('clipPath rect');
                return { title: box(title), subtitle: subtitle ? box(subtitle) : null, subtitleText: subtitle?.textContent, display: subtitle ? getComputedStyle(subtitle).display : null, plotTop: Number(plot.getAttribute("y")) };
              }),
            };
          });
          const context = `${engine}/${theme}/${layout.key}`;
          assert.deepEqual(errors, [], context);
          assert.equal(observed.viewBox, `0 0 ${layout.width} ${layout.height}`, context);
          assert.equal(observed.role, "img", context);
          assert.ok(observed.accessible, `${context}: accessible title/description references`);
          assert.ok(observed.fontFamilies.length > 0 && observed.fontFamilies.every(font => font.includes("ui-monospace") && font.includes("monospace")), `${context}: inherited monospace intent`);
          assert.equal(observed.panels.length, layout.panels ?? 1, context);
          for (const panel of observed.panels) {
            assert.equal(panel.subtitleText, 'Synthetic "A" & B', `${context}: visible subtitle text`);
            assert.ok(panel.subtitle && panel.display !== "none" && panel.subtitle.width > 0 && panel.subtitle.height > 0, `${context}: painted subtitle bounds`);
            assert.ok(panel.title.y >= 0 && panel.subtitle.y >= panel.title.bottom, `${context}: header rows do not overlap`);
            assert.ok(panel.subtitle.x >= 0 && panel.subtitle.x + panel.subtitle.width <= layout.width && panel.subtitle.bottom <= panel.plotTop, `${context}: subtitle stays within export and above plot`);
          }
          results.push({ engine, theme, layout: layout.key, result: "PASS" });
        } finally { await page.close(); }
      }
    } finally { await browser.close(); }
  }
  assert.equal(results.length, 28, "all standalone browser cases executed");
  console.log(JSON.stringify({ suite: "standalone-svg-typography", result: "PASS", executedCaseCount: results.length, results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
