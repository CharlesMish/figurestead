const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { chromium, firefox } = require("playwright");

const mode = process.argv[2];
if (!new Set(["before", "after"]).has(mode)) throw new Error("usage: run-compact-layout-audit.cjs before|after");

const repository = path.resolve(__dirname, "../..");
const auditOutputRoot = process.env.FIGURESTEAD_AUDIT_OUTPUT_ROOT;
const evidenceRoot = auditOutputRoot
  ? path.join(path.resolve(auditOutputRoot), "compact-layout", mode)
  : path.join(repository, "specimen-study", "evidence", "layout-hardening", mode);
const baseUrl = process.env.FIGURESTEAD_LAYOUT_URL || "http://127.0.0.1:4179/";
const representative = [
  "watershed_storm_response", "circadian_phase_shift", "instrument_calibration", "dose_response_plate", "treatment_replicates",
  "paired_seasonal_distributions", "field_sampling_coverage", "reservoir_oxygen_thresholds",
];
fs.mkdirSync(evidenceRoot, { recursive: true });

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

function chromiumExecutable() {
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  const candidate = fs.existsSync(cache) ? fs.readdirSync(cache).filter((name) => name.startsWith("chromium-")).sort().reverse()
    .map((name) => path.join(cache, name, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"))
    .find((file) => fs.existsSync(file)) : null;
  return candidate || chromium.executablePath();
}

function firefoxExecutable() {
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  const candidate = fs.existsSync(cache) ? fs.readdirSync(cache).filter((name) => name.startsWith("firefox-")).sort().reverse()
    .map((name) => path.join(cache, name, "firefox", "Nightly.app", "Contents", "MacOS", "firefox"))
    .find((file) => fs.existsSync(file)) : null;
  return candidate || firefox.executablePath();
}

async function waitForStudy(page) {
  await page.waitForFunction(() => document.documentElement.dataset.specimenReady === "true");
  await page.waitForTimeout(100);
}

async function measuredBounds(page, sceneId, globalName = "__FIGURESTEAD_SPECIMEN_STUDY__") {
  return page.evaluate(({ sceneId, globalName }) => {
    const FONT_STACK = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";
    const study = window[globalName];
    const rendered = globalName === "__technicalShowcaseAudit"
      ? { instance: study.motionFigure, canvas: document.querySelector("#motion-canvas") }
      : study.rendered.find((item) => item.id === sceneId);
    const resolved = rendered.instance.getResolvedScene();
    const panel = resolved.panels[0], layout = panel.layout, axes = panel.axes;
    const plot = axes.plot ?? layout.plot, canvas = rendered.canvas, context = canvas.getContext("2d");
    const metric = (text, fontSize) => {
      context.save(); context.font = `${fontSize}px ${FONT_STACK}`;
      const value = context.measureText(String(text)); context.restore();
      const ascent = value.actualBoundingBoxAscent ?? fontSize * 0.78;
      const descent = value.actualBoundingBoxDescent ?? fontSize * 0.22;
      return { width: value.width, ascent, descent, height: ascent + descent };
    };
    const union = (boxes) => boxes.reduce((result, box) => result == null ? box : ({
      left: Math.min(result.left, box.left), top: Math.min(result.top, box.top),
      right: Math.max(result.right, box.right), bottom: Math.max(result.bottom, box.bottom),
    }), null);
    const xSlot = axes.x.step?.() ?? Math.max(40, (plot.right - plot.left) / Math.max(1, axes.xTicks.length));
    context.save(); context.font = `${layout.font.axis}px ${FONT_STACK}`;
    const rotateX = layout.text?.rotateX ?? (axes.xType === "band" && axes.xTicks.some((tick) => context.measureText(tick.label).width > xSlot * 0.92));
    context.restore();
    const xTickY = layout.text?.xTickY ?? plot.bottom + 7 * layout.scale;
    const xTicks = union(axes.xTicks.map((tick) => {
      const m = metric(tick.label, layout.font.axis);
      if (rotateX) {
        const depth = (m.width + m.height) / Math.sqrt(2);
        return { left: 0, right: 0, top: xTickY, bottom: xTickY + depth };
      }
      return { left: 0, right: 0, top: xTickY, bottom: xTickY + m.height };
    })) ?? { left: 0, right: 0, top: xTickY, bottom: xTickY };
    xTicks.left = plot.left; xTicks.right = plot.right;
    const xMetric = metric(panel.spec.xLabel || "", layout.font.axis);
    const xAnchor = layout.text?.xLabelY ?? layout.rect.bottom - 6 * layout.scale;
    const xTitle = panel.spec.xLabel ? {
      left: (plot.left + plot.right - xMetric.width) / 2, right: (plot.left + plot.right + xMetric.width) / 2,
      top: xAnchor - xMetric.height, bottom: xAnchor,
    } : null;
    const pMetric = metric(panel.spec.signature || "", layout.font.signature);
    const provenanceAnchor = layout.provenance?.y ?? layout.rect.bottom - 8 * layout.scale;
    const provenance = resolved.theme.mode !== "paper" && panel.spec.signature ? {
      left: layout.provenance?.left ?? plot.left,
      right: (layout.provenance?.left ?? plot.left) + pMetric.width,
      top: provenanceAnchor - pMetric.ascent, bottom: provenanceAnchor + pMetric.descent,
    } : null;
    const yTickMetric = axes.yTicks.map((tick) => metric(tick.label, layout.font.axis));
    const yTickWidth = Math.max(0, ...yTickMetric.map((item) => item.width));
    const yTicks = { left: plot.left - 7 * layout.scale - yTickWidth, right: plot.left - 7 * layout.scale, top: plot.top, bottom: plot.bottom };
    const yMetric = metric(panel.spec.yLabel || "", layout.font.axis);
    const yAnchor = layout.text?.yLabelX ?? layout.rect.left + 12 * layout.scale;
    const yTitle = panel.spec.yLabel ? { left: yAnchor, right: yAnchor + yMetric.height, top: plot.top, bottom: plot.bottom } : null;
    const canvasRect = canvas.getBoundingClientRect();
    return {
      sceneId, renderer: panel.renderer,
      canvas: { cssWidth: canvasRect.width, cssHeight: canvasRect.height, backingWidth: canvas.width, backingHeight: canvas.height, dpr: devicePixelRatio },
      font: layout.font,
      regions: { plot: { ...plot }, xTicks, xTitle, provenance, yTicks, yTitle },
      gaps: {
        plotToXTicks: xTicks.top - plot.bottom,
        xTicksToTitle: xTitle ? xTitle.top - xTicks.bottom : null,
        xTitleToProvenance: xTitle && provenance ? provenance.top - xTitle.bottom : null,
        yTitleToTicks: yTitle ? yTicks.left - yTitle.right : null,
        yTicksToPlot: plot.left - yTicks.right,
      },
      intersections: {
        xTitleProvenance: xTitle && provenance ? Math.max(0, Math.min(xTitle.right, provenance.right) - Math.max(xTitle.left, provenance.left)) * Math.max(0, Math.min(xTitle.bottom, provenance.bottom) - Math.max(xTitle.top, provenance.top)) : 0,
        yTitleTicks: yTitle ? Math.max(0, Math.min(yTitle.right, yTicks.right) - Math.max(yTitle.left, yTicks.left)) * Math.max(0, Math.min(yTitle.bottom, yTicks.bottom) - Math.max(yTitle.top, yTicks.top)) : 0,
      },
      plotArea: (plot.right - plot.left) * (plot.bottom - plot.top),
      providedAnnotationBounds: layout.annotationBounds ?? null,
    };
  }, { sceneId, globalName });
}

async function captureStudy(browser, engine, pageName, viewport, screenshotName, fullPage = false, deviceScaleFactor = 1) {
  const context = await browser.newContext({ viewport, reducedMotion: "no-preference", deviceScaleFactor });
  const page = await context.newPage();
  await page.goto(`${baseUrl}specimen-study/${pageName}`, { waitUntil: "load" });
  await waitForStudy(page);
  const screenshot = path.join(evidenceRoot, screenshotName);
  await page.screenshot({ path: screenshot, fullPage });
  const bounds = {};
  for (const id of representative) bounds[id] = await measuredBounds(page, id);
  const documentState = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight,
    horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
  }));
  await context.close();
  return { engine, pageName, viewport, deviceScaleFactor, documentState, screenshot: path.relative(repository, screenshot), screenshotSha256: sha256(screenshot), bounds };
}

function verifyAfter(captures, paperExports, footerOptionality) {
  const failures = [];
  for (const capture of captures) {
    if (capture.documentState?.horizontalOverflow) failures.push(`${capture.engine}/${capture.pageName}: horizontal overflow ${capture.documentState.horizontalOverflow}px`);
    Object.values(capture.bounds).forEach((item) => {
      const expected = item.providedAnnotationBounds;
      if (!expected) failures.push(`${capture.engine}/${item.sceneId}: missing layout annotation bounds`);
      for (const [name, value] of Object.entries(item.gaps)) {
        if (value != null && value < 3.5) failures.push(`${capture.engine}/${item.sceneId}: ${name} gap ${value}px`);
      }
      for (const [name, value] of Object.entries(item.intersections)) {
        if (value !== 0) failures.push(`${capture.engine}/${item.sceneId}: ${name} intersection ${value}px²`);
      }
      for (const [name, box] of Object.entries(item.regions)) {
        if (!box) continue;
        if (box.left < -0.5 || box.top < -0.5 || box.right > item.canvas.cssWidth + 0.5 || box.bottom > item.canvas.cssHeight + 0.5) {
          failures.push(`${capture.engine}/${item.sceneId}: ${name} escapes the CSS canvas`);
        }
      }
      if (item.canvas.dpr === 2 && (item.canvas.backingWidth !== Math.round(item.canvas.cssWidth * 2) || item.canvas.backingHeight !== Math.round(item.canvas.cssHeight * 2))) {
        failures.push(`${capture.engine}/${item.sceneId}: DPR2 backing dimensions diverge from CSS dimensions`);
      }
    });
  }
  const beforePath = path.join(repository, "specimen-study", "evidence", "layout-hardening", "before", "bounds.json");
  if (fs.existsSync(beforePath)) {
    const before = JSON.parse(fs.readFileSync(beforePath, "utf8"));
    const beforeFonts = new Map();
    before.captures.forEach((capture) => Object.values(capture.bounds).forEach((item) => beforeFonts.set(`${capture.pageName}:${item.sceneId}`, item.font)));
    captures.filter((capture) => capture.engine === "chromium" && capture.deviceScaleFactor === 1).forEach((capture) => Object.values(capture.bounds).forEach((item) => {
      const baseline = beforeFonts.get(`${capture.pageName}:${item.sceneId}`);
      if (baseline && JSON.stringify(baseline) !== JSON.stringify(item.font)) failures.push(`${capture.pageName}/${item.sceneId}: typography changed`);
    }));
  }
  if (!paperExports || paperExports.length !== 2) failures.push("paper export evidence is missing");
  paperExports?.forEach((item) => {
    if (!item.clean || item.minimumPt < 6.372 || item.requiredPt !== 6) failures.push(`${item.paperSize}: physical typography audit changed`);
    if (item.widthAttribute !== `${item.widthMm}mm`) failures.push(`${item.paperSize}: SVG physical width changed`);
    Object.entries(item.annotationGaps).forEach(([name, value]) => {
      if (value != null && value < 3.5) failures.push(`${item.paperSize}: ${name} export gap ${value}px`);
    });
  });
  if (paperExports && Math.min(...paperExports.map((item) => item.minimumPt)) !== 6.372) failures.push("paper pair minimum changed from 6.372 pt");
  if (!footerOptionality?.provenanceRemoved || footerOptionality.reclaimedPlotHeight <= 0) failures.push("removing the optional footer did not remove its reserved band");
  if (footerOptionality?.footerWithoutXTitleGap < 3.5) failures.push("footer without an x-axis title is not separated from tick labels");
  if (failures.length) throw new Error(`compact layout assertions failed:\n${failures.join("\n")}`);
  return {
    clean: true,
    assertions: [
      "measured plot/tick/title/footer and y-title/tick/plot regions do not overlap",
      "all measured inter-region gaps are at least 3.5 CSS px",
      "document-level horizontal overflow is zero",
      "measured annotation regions remain inside the CSS canvas",
      "DPR2 backing dimensions match the CSS canvas at 2×",
      "axis/title/signature font sizes match the frozen before-state",
      "89 mm and 183 mm SVG exports retain a 6.372 pt minimum against the 6 pt project floor",
      "removing an optional provenance footer reclaims its reserved plot-height band",
    ],
  };
}

(async () => {
  const captures = [];
  let paperExports = null;
  let footerOptionality = null;
  const engines = mode === "after" ? [["chromium", chromium, chromiumExecutable()], ["firefox", firefox, firefoxExecutable()]] : [["chromium", chromium, chromiumExecutable()]];
  for (const [engine, browserType, executablePath] of engines) {
    const browser = await browserType.launch({ headless: true, executablePath });
    try {
      const prefix = engine === "chromium" ? "" : `${engine}-`;
      captures.push(await captureStudy(browser, engine, "index.html", { width: 1440, height: 1000 }, `${prefix}specimen-lab-1440.png`, false));
      captures.push(await captureStudy(browser, engine, "at-a-glance.html", { width: 1920, height: 1080 }, `${prefix}montage-1920x1080.png`, false));
      captures.push(await captureStudy(browser, engine, "at-a-glance.html", { width: 390, height: 844 }, `${prefix}montage-390.png`, true));
      if (engine === "chromium" && mode === "after") captures.push(await captureStudy(browser, engine, "at-a-glance.html", { width: 390, height: 844 }, "montage-390-dpr2.png", true, 2));
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" });
      const page = await context.newPage();
      await page.goto(`${baseUrl}technical-showcase/`, { waitUntil: "load" });
      await page.waitForFunction(() => document.documentElement.dataset.showcaseReady === "true");
      await page.waitForTimeout(100);
      const screenshot = path.join(evidenceRoot, `${prefix}v2-normal-figure.png`);
      await page.locator("#motion-canvas").screenshot({ path: screenshot });
      captures.push({
        engine, pageName: "technical-showcase", viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1,
        screenshot: path.relative(repository, screenshot), screenshotSha256: sha256(screenshot),
        bounds: { v2_motion: await measuredBounds(page, "v2_motion", "__technicalShowcaseAudit") },
      });
      if (engine === "chromium" && mode === "after") {
        const exportEvidence = await page.evaluate(async () => {
          const { exportFigureArtifacts } = await import("/web/src/index.js");
          const scene = window.__technicalShowcaseAudit.motionFigure.getScene();
          const paperExports = ["paper-single", "paper-double"].map((paperSize) => {
            const result = exportFigureArtifacts(scene, { paperSize });
            const audit = result.manifest.physical.typographyAudit;
            return {
              paperSize, widthMm: result.manifest.physical.widthMm,
              widthAttribute: /<svg[^>]*\bwidth="([^"]+)"/.exec(result.svg)?.[1] ?? null,
              minimumPt: audit.minimumPt, requiredPt: audit.requiredPt, clean: audit.clean,
              fonts: result.composed.panels.map((panel) => ({ panelId: panel.id, ...panel.layout.font })),
              annotationGaps: result.composed.panels[0].layout.annotationBounds.gaps,
              svg: result.svg,
            };
          });
          const withFooter = exportFigureArtifacts(scene, { width: 640, height: 400 });
          const withoutFooterScene = structuredClone(scene);
          withoutFooterScene.spec.signature = "";
          withoutFooterScene.panels.forEach((panel) => { panel.spec.signature = ""; });
          const withoutFooter = exportFigureArtifacts(withoutFooterScene, { width: 640, height: 400 });
          const withoutXTitleScene = structuredClone(scene);
          withoutXTitleScene.spec.xLabel = "";
          withoutXTitleScene.panels.forEach((panel) => { panel.spec.xLabel = ""; });
          const withoutXTitle = exportFigureArtifacts(withoutXTitleScene, { width: 640, height: 400 });
          return {
            paperExports,
            footerOptionality: {
              withFooterPlotBottom: withFooter.composed.panels[0].layout.plot.bottom,
              withoutFooterPlotBottom: withoutFooter.composed.panels[0].layout.plot.bottom,
              reclaimedPlotHeight: withoutFooter.composed.panels[0].layout.plot.bottom - withFooter.composed.panels[0].layout.plot.bottom,
              provenanceRemoved: withoutFooter.composed.panels[0].layout.annotationBounds.provenance == null,
              footerWithoutXTitleGap: withoutXTitle.composed.panels[0].layout.annotationBounds.gaps.xTicksToProvenance,
            },
          };
        });
        paperExports = exportEvidence.paperExports;
        footerOptionality = exportEvidence.footerOptionality;
        paperExports = paperExports.map((item) => {
          const file = path.join(evidenceRoot, `${item.paperSize}.svg`);
          fs.writeFileSync(file, item.svg);
          const { svg, ...record } = item;
          return { ...record, file: path.relative(repository, file), bytes: fs.statSync(file).size, sha256: sha256(file) };
        });
      }
      await context.close();
    } finally { await browser.close(); }
  }
  const verification = mode === "after" ? verifyAfter(captures, paperExports, footerOptionality) : null;
  const expectedCaptureCount = mode === "after" ? 9 : 4;
  if (captures.length !== expectedCaptureCount) throw new Error(`expected ${expectedCaptureCount} compact-layout captures, executed ${captures.length}`);
  const report = { schemaVersion: "figurestead.compact-layout-evidence/1", mode, expectedCaptureCount, executedCaptureCount: captures.length, verification, footerOptionality, paperExports, captures };
  fs.writeFileSync(path.join(evidenceRoot, "bounds.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ mode, evidenceRoot: path.relative(repository, evidenceRoot), captures: captures.map((item) => ({ pageName: item.pageName, screenshot: item.screenshot })) }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
