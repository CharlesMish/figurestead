const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { chromium, firefox } = require("playwright");

const repositoryRoot = path.resolve(__dirname, "../..");
const studyRoot = path.join(repositoryRoot, "specimen-study");
const evidenceRoot = path.join(studyRoot, "evidence", "corpus-v0.2");
const screenshotsRoot = path.join(evidenceRoot, "screenshots");
const individualRoot = path.join(evidenceRoot, "individual");
const categoricalRoot = path.join(evidenceRoot, "categorical");
const baseUrl = process.env.FIGURESTEAD_SPECIMEN_URL || "http://127.0.0.1:4179/specimen-study/";
const engines = { chromium, firefox };
const widths = [1440, 390];
const motionPreferences = ["no-preference", "reduce"];
const pages = [
  { key: "lab", path: "index.html", count: 13 },
  { key: "montage", path: "at-a-glance.html", count: 8 },
];
const showcaseOrder = [
  "watershed_storm_response", "circadian_phase_shift", "instrument_calibration", "dose_response_plate",
  "treatment_replicates", "paired_seasonal_distributions", "field_sampling_coverage", "reservoir_oxygen_thresholds",
];
const candidateOrder = ["habitat_class_response"];
const stressOrder = [
  "gene_expression_recovery", "particle_size_relationship", "lab_precision", "migration_monitoring_coverage",
];

fs.mkdirSync(screenshotsRoot, { recursive: true });
fs.mkdirSync(individualRoot, { recursive: true });
fs.mkdirSync(categoricalRoot, { recursive: true });

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (file) => sha256(fs.readFileSync(file));

function installedFirefoxExecutable() {
  if (process.env.FIGURESTEAD_FIREFOX_EXECUTABLE) return process.env.FIGURESTEAD_FIREFOX_EXECUTABLE;
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  const candidates = fs.existsSync(cache)
    ? fs.readdirSync(cache).filter((name) => name.startsWith("firefox-")).sort().reverse()
      .map((name) => path.join(cache, name, "firefox", "Nightly.app", "Contents", "MacOS", "firefox"))
    : [];
  return candidates.find((candidate) => fs.existsSync(candidate)) || firefox.executablePath();
}

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.dataset.specimenReady === "true");
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.__FIGURESTEAD_SPECIMEN_STUDY__?.rendered.forEach((item) => item.instance.resize());
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(80);
}

function activeElementState() {
  const element = document.activeElement;
  const style = getComputedStyle(element);
  const intersect = (a, b) => ({
    left: Math.max(a.left, b.left), top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom),
  });
  const rect = element?.getBoundingClientRect?.() ?? { left: 0, top: 0, right: 0, bottom: 0 };
  let visible = intersect(rect, { left: 0, top: 0, right: innerWidth, bottom: innerHeight });
  const clippedAncestors = [];
  for (let ancestor = element?.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const ancestorStyle = getComputedStyle(ancestor);
    const ancestorRect = ancestor.getBoundingClientRect();
    if (ancestorStyle.display === "none" || ancestorStyle.visibility === "hidden" || Number(ancestorStyle.opacity) === 0) {
      visible = { left: 0, top: 0, right: 0, bottom: 0 };
      clippedAncestors.push(`${ancestor.tagName.toLowerCase()}:not-rendered`);
      break;
    }
    if (ancestorStyle.clip && ancestorStyle.clip !== "auto" && /rect\(\s*0(?:px)?[, ]+0(?:px)?[, ]+0(?:px)?[, ]+0(?:px)?\s*\)/.test(ancestorStyle.clip)) {
      visible = { left: 0, top: 0, right: 0, bottom: 0 };
      clippedAncestors.push(`${ancestor.tagName.toLowerCase()}:zero-clip`);
      break;
    }
    if ([ancestorStyle.overflow, ancestorStyle.overflowX, ancestorStyle.overflowY].some((value) => ["hidden", "clip"].includes(value))) {
      visible = intersect(visible, ancestorRect);
    }
  }
  const width = Math.max(0, visible.right - visible.left);
  const height = Math.max(0, visible.bottom - visible.top);
  return {
    tag: element?.tagName?.toLowerCase() || null,
    text: (element?.textContent || element?.getAttribute?.("aria-label") || "").trim(),
    href: element?.getAttribute?.("href") || null,
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    visibleArea: width * height,
    clippedAncestors,
  };
}

async function keyboardAudit(page, openDetails) {
  if (openDetails) await page.locator("details").evaluateAll((items) => items.forEach((item) => { item.open = true; }));
  const expectedCount = await page.locator('a[href],button,input:not([type="hidden"]),summary,[tabindex]:not([tabindex="-1"])').count();
  const sequence = [];
  let first = null;
  for (let index = 0; index < expectedCount + 3; index += 1) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(50);
    const active = await page.evaluate(activeElementState);
    if (active.tag === "body") continue;
    const signature = `${active.tag}|${active.href}|${active.text}`;
    if (first == null) first = signature;
    else if (signature === first || signature === `${sequence.at(-1)?.tag}|${sequence.at(-1)?.href}|${sequence.at(-1)?.text}`) break;
    sequence.push(active);
  }
  return {
    expectedCount,
    reachedCount: sequence.length,
    sequence,
    allVisible: sequence.every((item) => item.visibleArea > 0 && item.clippedAncestors.length === 0),
    allOutlined: sequence.every((item) => item.outlineStyle !== "none" && item.outlineWidth !== "0px"),
  };
}

async function inspect(page) {
  const structure = await page.evaluate(async () => {
    const study = window.__FIGURESTEAD_SPECIMEN_STUDY__;
    const figures = [...document.querySelectorAll(".specimen")];
    const companions = [...document.querySelectorAll(".figurestead-accessibility")];
    const immediateDuplicateHeadings = companions.flatMap((companion) => {
      const h2 = companion.querySelector(":scope > h2")?.textContent.trim();
      return [...companion.querySelectorAll(":scope > section > h3")]
        .filter((h3) => h3.textContent.trim() === h2).map(() => h2);
    });
    const hiddenInteractive = [...document.querySelectorAll(".figurestead-sr-only")].flatMap((companion) =>
      [...companion.querySelectorAll("a[href],button,input,select,textarea,summary,[tabindex]")]
        .filter((element) => element.tabIndex >= 0).map((element) => `${element.tagName}:${element.textContent.trim()}`),
    );
    const canvasAccessibility = [...document.querySelectorAll("canvas[data-scene-canvas]")].map((canvas) => ({
      sceneId: canvas.dataset.sceneCanvas,
      role: canvas.getAttribute("role"),
      labelledBy: canvas.getAttribute("aria-labelledby"),
      targetsExist: (canvas.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean).every((id) => Boolean(document.getElementById(id))),
    }));
    const rendered = study.rendered.map((item) => ({
      id: item.id,
      tier: item.scene.tier,
      renderer: item.scene.renderer,
      theme: item.scene.suggestedTheme.key,
      seed: item.scene.seed,
      fingerprint: item.canvas.closest(".specimen").dataset.evidenceFingerprint,
      state: item.instance.getState(),
      glyphCount: item.contract.style.glyphs.length,
      lineStyleCount: item.contract.style.lineStyles.length,
      seriesCount: item.scene.renderer === "line" ? item.scene.data.series.length : new Set(item.scene.data.series || []).size,
      observationCount: item.scene.data.values?.length ?? item.scene.data.x?.length ?? item.scene.data.dates?.length ?? null,
      groupOrder: item.scene.data.groups ?? null,
      provenanceKind: item.scene.provenance.kind,
    }));
    const categoricalItem = study.rendered.find((item) => item.id === "habitat_class_response");
    const categoricalFigure = document.querySelector('.specimen[data-scene-id="habitat_class_response"]');
    const categoricalCompanion = categoricalFigure?.querySelector(".figurestead-accessibility");
    const categoricalRows = categoricalCompanion ? [...categoricalCompanion.querySelectorAll("tbody tr")] : [];
    const categoricalAccessibility = categoricalCompanion ? {
      description: categoricalCompanion.textContent.trim(),
      rowCount: categoricalRows.length,
      groupCounts: Object.fromEntries([...new Set(categoricalRows.map((row) => row.cells[0]?.textContent.trim()))].map((group) => [
        group, categoricalRows.filter((row) => row.cells[0]?.textContent.trim() === group).length,
      ])),
      seriesLabels: [...new Set(categoricalRows.map((row) => row.cells[2]?.textContent.trim()))],
    } : null;
    const categoricalLayout = categoricalItem ? (() => {
      const resolved = categoricalItem.instance.getResolvedScene();
      const panel = resolved.panels[0];
      const context = categoricalItem.canvas.getContext("2d");
      context.save();
      context.font = `${panel.layout.font.axis}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      const slot = panel.axes.x.step();
      const labelMetrics = panel.axes.xTicks.map((tick) => ({
        label: tick.label,
        width: context.measureText(tick.label).width,
        fitWidth: slot * (panel.layout.text.rotateX ? 1.75 : 0.92),
      }));
      context.restore();
      const centers = panel.marks.filter((mark) => mark.kind === "point").map((mark) => ({
        group: mark.group, x: mark.geometry.cx, y: mark.geometry.cy,
      }));
      const originalAspectRatio = categoricalItem.canvas.style.aspectRatio;
      categoricalItem.canvas.style.aspectRatio = "116 / 70";
      categoricalItem.instance.resize();
      const compactBoundaryPanel = categoricalItem.instance.getResolvedScene().panels[0];
      const compactBoundary = {
        width: categoricalItem.instance.getResolvedScene().width,
        height: categoricalItem.instance.getResolvedScene().height,
        annotationGaps: compactBoundaryPanel.layout.annotationBounds.gaps,
      };
      if (originalAspectRatio) categoricalItem.canvas.style.aspectRatio = originalAspectRatio;
      else categoricalItem.canvas.style.removeProperty("aspect-ratio");
      categoricalItem.instance.resize();
      return {
        width: resolved.width, height: resolved.height,
        rotateX: panel.layout.text.rotateX,
        annotationBounds: panel.layout.annotationBounds,
        labels: labelMetrics.map((metric) => ({ ...metric, wouldEllipsize: metric.width > metric.fitWidth })),
        categoryCenters: Object.fromEntries(panel.axes.xTicks.map((tick) => [tick.label, panel.axes.x(tick.value) + panel.axes.x.bandwidth() / 2])),
        pointCentersMatchGroups: centers.every((point) => Math.abs(point.x - (panel.axes.x(point.group) + panel.axes.x.bandwidth() / 2 + (panel.marks.find((mark) => mark.kind === "point" && mark.group === point.group && mark.geometry.cx === point.x)?.xOffset ?? 0) * slot)) < 0.001),
        compactBoundary,
      };
    })() : null;
    const categoricalSvgConsistency = categoricalItem ? await (async () => {
      const { exportFigureSvg } = await import("/web/src/index.js");
      const svg = exportFigureSvg(categoricalItem.contract, { width: 1160, height: 700, registry: study.registry });
      const documentNode = new DOMParser().parseFromString(svg, "image/svg+xml");
      const svgMarkIds = [...documentNode.querySelectorAll("[data-mark-id]")].map((mark) => mark.getAttribute("data-mark-id")).sort();
      const sceneMarkIds = categoricalItem.terminalScene.panels[0].marks.map((mark) => mark.id).sort();
      return {
        categoryOrder: documentNode.querySelector('[data-panel-id="habitat_class_response"]')?.getAttribute("data-x-category-order"),
        fingerprint: documentNode.documentElement.getAttribute("data-evidence-fingerprint"),
        markIdsMatch: JSON.stringify(svgMarkIds) === JSON.stringify(sceneMarkIds),
        fullLabelsPresent: categoricalItem.scene.data.groups.every((group) => svg.includes(`>${group}</text>`)),
      };
    })() : null;
    return {
      mode: study.mode,
      innerWidth,
      clientWidth: document.documentElement.clientWidth,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      order: figures.map((figure) => figure.dataset.sceneId),
      sceneCount: figures.length,
      stressInMontage: figures.filter((figure) => figure.dataset.tier === "stress").map((figure) => figure.dataset.sceneId),
      immediateDuplicateHeadings,
      hiddenInteractive,
      hiddenTableCount: document.querySelectorAll(".figurestead-sr-only table").length,
      canvasAccessibility,
      rendered,
      detailsCount: document.querySelectorAll("details.scene-disclosure").length,
      sourceLinkCount: document.querySelectorAll('.scene-disclosure a[href$=".json"],.scene-disclosure a[href$=".csv"]').length,
      ready: document.documentElement.dataset.specimenReady,
      mediaReduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
      categoricalLayout,
      categoricalAccessibility,
      categoricalSvgConsistency,
    };
  });
  const pixelFingerprints = await page.locator("canvas[data-scene-canvas]").evaluateAll((canvases) => canvases.map((canvas) => {
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0x811c9dc5;
    for (const value of pixels) { hash ^= value; hash = Math.imul(hash, 0x01000193); }
    return { id: canvas.dataset.sceneCanvas, fingerprint: `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}@${canvas.width}x${canvas.height}` };
  }));
  structure.pixelHashes = Object.fromEntries(pixelFingerprints.map((item) => [item.id, item.fingerprint]));
  return structure;
}

function findingsFor(testCase) {
  const findings = [];
  const { pageKey, width, reducedMotion, structure, keyboard, runtimeErrors } = testCase;
  const expect = (condition, message) => { if (!condition) findings.push(message); };
  const expectedOrder = pageKey === "montage" ? showcaseOrder : [...showcaseOrder, ...candidateOrder, ...stressOrder];
  expect(runtimeErrors.length === 0, `runtime/console errors: ${runtimeErrors.join(" | ")}`);
  expect(structure.ready === "true", "study readiness signal missing");
  expect(structure.innerWidth === width, `viewport is ${structure.innerWidth}, expected ${width}`);
  expect(structure.horizontalOverflow === 0, `horizontal overflow is ${structure.horizontalOverflow}px`);
  expect(JSON.stringify(structure.order) === JSON.stringify(expectedOrder), "scene source order diverged from the frozen study order");
  expect(structure.sceneCount === expectedOrder.length, `rendered ${structure.sceneCount}, expected ${expectedOrder.length}`);
  if (pageKey === "montage") expect(structure.stressInMontage.length === 0, `stress scene entered montage: ${structure.stressInMontage.join(", ")}`);
  expect(structure.immediateDuplicateHeadings.length === 0, "single-panel accessibility companions contain duplicate immediate headings");
  expect(structure.hiddenInteractive.length === 0, "hidden accessibility companion contains focusable controls");
  expect(structure.hiddenTableCount === structure.sceneCount, "one or more real data-table companions are missing");
  expect(structure.canvasAccessibility.every((item) => item.role === "img" && item.labelledBy && item.targetsExist), "canvas accessibility association is incomplete");
  expect(structure.rendered.every((item) => item.state.progress === 1 && !item.state.playing), "a static figure is not settled");
  expect(structure.rendered.every((item) => item.state.reducedMotion === reducedMotion), "reduced-motion state disagrees with the test context");
  expect(structure.rendered.every((item) => item.glyphCount === 4), "marker vocabulary changed from four glyphs");
  expect(structure.rendered.every((item) => item.lineStyleCount === 4), "line-style cycle changed");
  expect(structure.rendered.every((item) => item.provenanceKind === "deterministic_synthetic"), "fixture provenance is not deterministic synthetic");
  expect(keyboard.reachedCount === keyboard.expectedCount, `keyboard traversal reached ${keyboard.reachedCount}/${keyboard.expectedCount} targets`);
  expect(keyboard.sequence[0]?.text.includes("Skip to"), "skip link is not first in keyboard order");
  expect(keyboard.allVisible, "a keyboard target has no visible area or is clipped");
  expect(keyboard.allOutlined, "a keyboard target lacks a visible outline");
  if (pageKey === "lab") {
    expect(structure.detailsCount === 13 && structure.sourceLinkCount === 26, "lab disclosures do not expose all JSON/CSV sources");
    const categorical = structure.rendered.find((item) => item.id === "habitat_class_response");
    expect(categorical?.tier === "showcase_candidate", "categorical fixture tier changed");
    expect(categorical?.theme === "slipware", "categorical fixture is not using the first-pass Slipware theme");
    expect(categorical?.seriesCount === 1 && categorical?.observationCount === 90, "categorical fixture is not one semantic series with 90 observations");
    expect(JSON.stringify(categorical?.groupOrder) === JSON.stringify([
      "headwater", "riffle", "deep pool", "side channel", "floodplain",
      "wet meadow", "tidal creek", "mudflat", "seagrass bed", "open estuary",
    ]), "categorical fixture full-name group order changed");
    expect(structure.categoricalLayout?.rotateX === true, "dense categorical labels did not enter the measured rotated-label layout");
    expect(structure.categoricalLayout?.annotationBounds?.gaps?.plotToXTicks > 0, "categorical plot and x ticks overlap");
    expect(structure.categoricalLayout?.annotationBounds?.gaps?.xTicksToTitle > 0, "categorical x ticks and x title overlap");
    expect(structure.categoricalLayout?.annotationBounds?.gaps?.xTitleToProvenance > 0, "categorical x title and provenance overlap");
    expect(structure.categoricalLayout?.annotationBounds?.gaps?.yTitleToTicks > 0, "categorical y title and ticks overlap");
    expect(structure.categoricalLayout?.pointCentersMatchGroups, "categorical observations are not centered on their assigned groups");
    expect(structure.categoricalLayout?.compactBoundary?.annotationGaps?.plotToXTicks > 0, "categorical compact-boundary regression: plot and rotated ticks overlap");
    expect(structure.categoricalAccessibility?.rowCount === 90, "categorical accessibility table does not expose 90 observations");
    expect(Object.keys(structure.categoricalAccessibility?.groupCounts ?? {}).length === 10
      && Object.values(structure.categoricalAccessibility?.groupCounts ?? {}).every((count) => count === 9), "categorical accessibility grouping is incorrect");
    expect(structure.categoricalAccessibility?.seriesLabels?.length === 1
      && structure.categoricalAccessibility.seriesLabels[0] === "Synthetic observations", "categorical accessibility series identity is incorrect");
    expect(structure.categoricalSvgConsistency?.markIdsMatch, "categorical Canvas/SVG terminal mark identities diverge");
    expect(structure.categoricalSvgConsistency?.fullLabelsPresent, "categorical SVG does not preserve the full category labels");
    expect(structure.categoricalSvgConsistency?.categoryOrder === categorical.groupOrder.join("|"), "categorical SVG order diverges from the Canvas contract");
    const gene = structure.rendered.find((item) => item.id === "gene_expression_recovery");
    const precision = structure.rendered.find((item) => item.id === "lab_precision");
    expect(gene?.seriesCount === 6 && gene?.glyphCount === 4, "six-series line stress boundary changed");
    expect(precision?.seriesCount === 6 && precision?.glyphCount === 4, "six-identity point stress boundary changed");
  }
  return findings;
}

async function captureStandardEvidence(browser, engineName) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.goto(`${baseUrl}index.html`, { waitUntil: "load" });
  await ready(page);
  await page.screenshot({ path: path.join(screenshotsRoot, `${engineName}-lab-1440-full.png`), fullPage: true });
  if (engineName === "chromium") {
    for (const id of [...showcaseOrder, ...candidateOrder, ...stressOrder]) {
      await page.locator(`canvas[data-scene-canvas="${id}"]`).screenshot({ path: path.join(individualRoot, `${id}.png`) });
    }
  }
  await context.close();

  const narrow = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });
  const narrowPage = await narrow.newPage();
  await narrowPage.goto(`${baseUrl}index.html`, { waitUntil: "load" });
  await ready(narrowPage);
  await narrowPage.screenshot({ path: path.join(screenshotsRoot, `${engineName}-lab-390-full.png`), fullPage: true });
  await narrow.close();

  const wide = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "no-preference" });
  const widePage = await wide.newPage();
  await widePage.goto(`${baseUrl}at-a-glance.html`, { waitUntil: "load" });
  await ready(widePage);
  await widePage.screenshot({ path: path.join(screenshotsRoot, `${engineName}-montage-1920x1080.png`), fullPage: false });
  await wide.close();

  const montageNarrow = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });
  const montageNarrowPage = await montageNarrow.newPage();
  await montageNarrowPage.goto(`${baseUrl}at-a-glance.html`, { waitUntil: "load" });
  await ready(montageNarrowPage);
  await montageNarrowPage.screenshot({ path: path.join(screenshotsRoot, `${engineName}-montage-390-full.png`), fullPage: true });
  await montageNarrow.close();

  const categoricalLab = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" });
  const categoricalLabPage = await categoricalLab.newPage();
  await categoricalLabPage.goto(`${baseUrl}index.html`, { waitUntil: "load" });
  await ready(categoricalLabPage);
  const categoricalFigure = categoricalLabPage.locator('.specimen[data-scene-id="habitat_class_response"]');
  await categoricalFigure.screenshot({ path: path.join(categoricalRoot, `${engineName}-full-specimen-lab-1440.png`) });
  await categoricalLab.close();

  const categoricalNarrow = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });
  const categoricalNarrowPage = await categoricalNarrow.newPage();
  await categoricalNarrowPage.goto(`${baseUrl}index.html`, { waitUntil: "load" });
  await ready(categoricalNarrowPage);
  await categoricalNarrowPage.locator('.specimen[data-scene-id="habitat_class_response"]').screenshot({ path: path.join(categoricalRoot, `${engineName}-narrow-390.png`) });
  await categoricalNarrow.close();

  const categoricalWide = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" });
  const categoricalWidePage = await categoricalWide.newPage();
  await categoricalWidePage.goto(`${baseUrl}index.html`, { waitUntil: "load" });
  await ready(categoricalWidePage);
  await categoricalWidePage.evaluate(() => {
    const figure = document.querySelector('.specimen[data-scene-id="habitat_class_response"]');
    const grid = figure.parentElement;
    grid.style.display = "block"; grid.style.width = "1160px"; figure.style.width = "1160px";
    window.__FIGURESTEAD_SPECIMEN_STUDY__.rendered.find((item) => item.id === "habitat_class_response").instance.resize();
  });
  await categoricalWidePage.waitForTimeout(100);
  await categoricalWidePage.locator('.specimen[data-scene-id="habitat_class_response"]').screenshot({ path: path.join(categoricalRoot, `${engineName}-normal-wide-1160.png`) });
  if (engineName === "chromium") {
    const svg = await categoricalWidePage.evaluate(async () => {
      const { exportFigureSvg } = await import("/web/src/index.js");
      const study = window.__FIGURESTEAD_SPECIMEN_STUDY__;
      const item = study.rendered.find((entry) => entry.id === "habitat_class_response");
      return exportFigureSvg(item.contract, { width: 1160, height: 700, registry: study.registry });
    });
    fs.writeFileSync(path.join(categoricalRoot, "habitat-class-response-1160.svg"), `${svg}\n`);
  }
  await categoricalWide.close();

  const categoricalMontage = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "no-preference" });
  const categoricalMontagePage = await categoricalMontage.newPage();
  await categoricalMontagePage.goto(`${baseUrl}index.html`, { waitUntil: "load" });
  await ready(categoricalMontagePage);
  await categoricalMontagePage.evaluate(() => {
    const cellWidth = (Math.min(1840, innerWidth - 72) - 17 * 3) / 4;
    const figure = document.querySelector('.specimen[data-scene-id="habitat_class_response"]');
    const canvas = figure.querySelector("canvas");
    const grid = figure.parentElement;
    grid.style.display = "block"; grid.style.width = `${cellWidth}px`; figure.style.width = `${cellWidth}px`;
    canvas.style.aspectRatio = "16 / 10.4";
    figure.querySelector("details").hidden = true;
    window.__FIGURESTEAD_SPECIMEN_STUDY__.rendered.find((item) => item.id === "habitat_class_response").instance.resize();
  });
  await categoricalMontagePage.waitForTimeout(100);
  await categoricalMontagePage.locator('.specimen[data-scene-id="habitat_class_response"] canvas').screenshot({ path: path.join(categoricalRoot, `${engineName}-montage-cell-1920.png`) });
  await categoricalMontage.close();
}

async function runEngine(engineName, browserType) {
  const executablePath = engineName === "firefox" ? installedFirefoxExecutable() : browserType.executablePath();
  const browser = await browserType.launch({ headless: true, executablePath });
  const report = {
    schemaVersion: "figurestead.specimen-browser-audit/1",
    engine: engineName,
    playwrightVersion: require("playwright/package.json").version,
    browserVersion: browser.version(),
    nodeVersion: process.version,
    executableSha256: fileHash(executablePath),
    cases: [],
  };
  try {
    for (const pageSpec of pages) {
      for (const width of widths) {
        for (const motionPreference of motionPreferences) {
          const reducedMotion = motionPreference === "reduce";
          const context = await browser.newContext({
            viewport: { width, height: width === 390 ? 844 : 1000 },
            reducedMotion: reducedMotion ? "reduce" : "no-preference",
          });
          const page = await context.newPage();
          const runtimeErrors = [];
          page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`); });
          page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
          await page.goto(`${baseUrl}${pageSpec.path}`, { waitUntil: "load" });
          await ready(page);
          const structure = await inspect(page);
          const keyboard = await keyboardAudit(page, pageSpec.key === "lab");
          const testCase = { pageKey: pageSpec.key, width, reducedMotion, runtimeErrors, structure, keyboard };
          testCase.findings = findingsFor(testCase);
          testCase.result = testCase.findings.length ? "FAIL" : "PASS";
          report.cases.push(testCase);
          await context.close();
        }
      }
    }
    for (const pageSpec of pages) {
      for (const width of widths) {
        const pair = report.cases.filter((item) => item.pageKey === pageSpec.key && item.width === width);
        const normal = pair.find((item) => !item.reducedMotion);
        const reduced = pair.find((item) => item.reducedMotion);
        if (JSON.stringify(normal.structure.pixelHashes) !== JSON.stringify(reduced.structure.pixelHashes)) {
          normal.findings.push("normal and reduced-motion terminal canvas pixels diverge"); normal.result = "FAIL";
          reduced.findings.push("normal and reduced-motion terminal canvas pixels diverge"); reduced.result = "FAIL";
        }
        if (JSON.stringify(normal.structure.rendered.map((item) => item.fingerprint)) !== JSON.stringify(reduced.structure.rendered.map((item) => item.fingerprint))) {
          normal.findings.push("normal and reduced-motion normalized fingerprints diverge"); normal.result = "FAIL";
          reduced.findings.push("normal and reduced-motion normalized fingerprints diverge"); reduced.result = "FAIL";
        }
      }
    }
    await captureStandardEvidence(browser, engineName);
  } finally {
    await browser.close();
  }
  report.result = report.cases.every((item) => item.result === "PASS") ? "PASS" : "FAIL";
  fs.writeFileSync(path.join(evidenceRoot, `${engineName}.json`), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

(async () => {
  const reports = [];
  for (const [name, browserType] of Object.entries(engines)) reports.push(await runEngine(name, browserType));
  const evidenceFiles = [...fs.readdirSync(screenshotsRoot).map((name) => path.join(screenshotsRoot, name)),
    ...fs.readdirSync(individualRoot).map((name) => path.join(individualRoot, name)),
    ...fs.readdirSync(categoricalRoot).map((name) => path.join(categoricalRoot, name))];
  const summary = {
    schemaVersion: "figurestead.specimen-study-verification/1",
    generatedAt: new Date().toISOString(),
    result: reports.every((report) => report.result === "PASS") ? "PASS" : "FAIL",
    engines: reports.map((report) => ({
      engine: report.engine, browserVersion: report.browserVersion, playwrightVersion: report.playwrightVersion,
      nodeVersion: report.nodeVersion, executableSha256: report.executableSha256,
      caseCount: report.cases.length, passCount: report.cases.filter((item) => item.result === "PASS").length,
    })),
    matrix: { pages: pages.map((item) => item.key), widths, motionPreferences },
    evidence: evidenceFiles.sort().map((file) => ({
      path: path.relative(studyRoot, file), bytes: fs.statSync(file).size, sha256: fileHash(file),
    })),
    alternateMontageRequired: false,
  };
  fs.writeFileSync(path.join(studyRoot, "audit", "corpus-v0.2-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.result !== "PASS") process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
