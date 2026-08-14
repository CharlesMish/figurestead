const { chromium, firefox } = require("playwright");

const baseUrl = process.env.FIGURESTEAD_BASE_URL || "http://127.0.0.1:4179/";
const engines = { chromium, firefox };

(async () => {
  const results = [];
  for (const [name, browserType] of Object.entries(engines)) {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 760, height: 700 }, reducedMotion: "reduce" });
      const errors = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${baseUrl}examples/browser-first-success/`, { waitUntil: "load" });
      await page.waitForFunction(() => document.documentElement.dataset.exampleReady === "true");
      const status = await page.locator("#status").textContent();
      if (status !== "Rendered · line · terminal progress 1") throw new Error(`${name}: unexpected status ${status}`);
      if (errors.length) throw new Error(`${name}: runtime errors: ${errors.join("; ")}`);
      results.push({ engine: name, status });
    } finally {
      await browser.close();
    }
  }
  if (results.length !== 2) throw new Error(`expected exactly 2 first-success cases, executed ${results.length}`);
  console.log(JSON.stringify({ suite: "browser-first-success", expectedCaseCount: 2, executedCaseCount: results.length, result: "PASS", results }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
