const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { chromium, firefox } = require("playwright");

const repositoryRoot = path.resolve(__dirname, "../..");
const projectRoot = path.join(repositoryRoot, "technical-showcase");
const checkOnly = process.env.FIGURESTEAD_AUDIT_MODE === "check";
const auditOutputRoot = process.env.FIGURESTEAD_AUDIT_OUTPUT_ROOT;
const evidenceRoot = auditOutputRoot
  ? path.join(path.resolve(auditOutputRoot), "technical-showcase")
  : path.join(projectRoot, "evidence");
const screenshotRoot = path.join(evidenceRoot, "screenshots");
const frameRoot = path.join(evidenceRoot, "motion-frames");
const baseUrl = process.env.FIGURESTEAD_TECHNICAL_URL || "http://127.0.0.1:4177/technical-showcase/";
const widths = [390, 1440];
const motionPreferences = ["no-preference", "reduce"];

fs.mkdirSync(screenshotRoot, { recursive: true });
fs.mkdirSync(frameRoot, { recursive: true });

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function activeElementState() {
  const element = document.activeElement;
  const style = getComputedStyle(element);
  const intersect = (left, right) => ({
    left: Math.max(left.left, right.left), top: Math.max(left.top, right.top),
    right: Math.min(left.right, right.right), bottom: Math.min(left.bottom, right.bottom),
  });
  const elementRect = element?.getBoundingClientRect?.() ?? { left: 0, top: 0, right: 0, bottom: 0 };
  let visibleRect = elementRect;
  const clippedAncestors = [];
  if (["absolute", "fixed"].includes(style.position)
    && (elementRect.right <= 0 || elementRect.bottom <= 0 || elementRect.left >= window.innerWidth || elementRect.top >= window.innerHeight)) {
    visibleRect = { left: 0, top: 0, right: 0, bottom: 0 }; clippedAncestors.push(`${element.tagName.toLowerCase()}:offscreen-positioned`);
  }
  for (let ancestor = element?.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const ancestorStyle = getComputedStyle(ancestor), rect = ancestor.getBoundingClientRect();
    if (ancestorStyle.display === "none" || ancestorStyle.visibility === "hidden" || Number(ancestorStyle.opacity) === 0) {
      visibleRect = { left: 0, top: 0, right: 0, bottom: 0 }; clippedAncestors.push(`${ancestor.tagName.toLowerCase()}:not-rendered`); break;
    }
    const clip = ancestorStyle.clip;
    if (clip && clip !== "auto" && /^rect\(\s*0(?:px)?[, ]+0(?:px)?[, ]+0(?:px)?[, ]+0(?:px)?\s*\)$/.test(clip)) {
      visibleRect = { left: 0, top: 0, right: 0, bottom: 0 }; clippedAncestors.push(`${ancestor.tagName.toLowerCase()}:zero-clip`); break;
    }
    if (["absolute", "fixed"].includes(ancestorStyle.position)
      && (rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight)) {
      visibleRect = { left: 0, top: 0, right: 0, bottom: 0 }; clippedAncestors.push(`${ancestor.tagName.toLowerCase()}:offscreen-positioned`); break;
    }
    if ([ancestorStyle.overflow, ancestorStyle.overflowX, ancestorStyle.overflowY].some((value) => ["hidden", "clip"].includes(value))) {
      visibleRect = intersect(visibleRect, rect);
      if (visibleRect.right <= visibleRect.left || visibleRect.bottom <= visibleRect.top) clippedAncestors.push(`${ancestor.tagName.toLowerCase()}:overflow-clip`);
    }
  }
  const visibleWidth = Math.max(0, visibleRect.right - visibleRect.left), visibleHeight = Math.max(0, visibleRect.bottom - visibleRect.top);
  return {
    tag: element?.tagName?.toLowerCase() || null,
    id: element?.id || null,
    type: element?.type || null,
    value: element?.value || null,
    href: element?.getAttribute?.("href") || null,
    text: (element?.textContent || element?.getAttribute?.("aria-label") || "").trim(),
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    visibleArea: visibleWidth * visibleHeight,
    clippedAncestors,
  };
}

async function waitForShowcase(page) {
  await page.waitForFunction(() => (
    document.documentElement.dataset.showcaseReady === "true"
    && Boolean(window.__technicalShowcaseAudit)
    && document.querySelector("#terminal-proof")?.dataset.pixelMatch
  ));
}

async function inspectStructure(page) {
  return page.evaluate(() => {
    const audit = window.__technicalShowcaseAudit;
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((heading) => ({
      level: Number(heading.tagName.slice(1)), text: heading.textContent.trim(),
    }));
    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
    const paper = [...document.querySelectorAll(".paper-pair figure")].map((figure) => ({
      width: figure.getBoundingClientRect().width,
      top: figure.getBoundingClientRect().top,
      captionTop: figure.querySelector("figcaption").getBoundingClientRect().top,
      caption: figure.querySelector("figcaption").textContent.trim(),
    }));
    const reportPanels = [...document.querySelectorAll(".report-panel")].map((panel) => ({
      top: panel.getBoundingClientRect().top, left: panel.getBoundingClientRect().left,
    }));
    const cvdFigures = [...document.querySelectorAll(".cvd-grid figure")].map((figure) => ({
      top: figure.getBoundingClientRect().top, left: figure.getBoundingClientRect().left,
    }));
    const terminal = document.querySelector("#terminal-proof");
    const originalFingerprint = audit.canvasPixelFingerprint(document.querySelector("#cvd-original"));
    const cvdFingerprints = Object.fromEntries(
      ["protanomaly", "deuteranomaly", "tritanomalyApproximation"].map((key) => {
        const id = key === "tritanomalyApproximation" ? "cvd-tritanomaly-approximation" : `cvd-${key}`;
        return [key, document.querySelector(`#${id}`).dataset.pixelFingerprint];
      }),
    );
    const companions = [...document.querySelectorAll(".figurestead-accessibility")];
    const immediateDuplicateCompanionHeadings = companions.flatMap((companion) => {
      const contractHeading = companion.querySelector(":scope > h2")?.textContent.trim();
      return [...companion.querySelectorAll(":scope > section > h3")]
        .filter((heading) => heading.textContent.trim() === contractHeading)
        .map(() => contractHeading);
    });
    const hiddenCompanionInteractive = [...document.querySelectorAll(".figurestead-sr-only")].flatMap((companion) =>
      [...companion.querySelectorAll("a[href],button,input,select,textarea,summary,[tabindex]")]
        .filter((element) => element.tabIndex >= 0)
        .map((element) => `${element.tagName.toLowerCase()}:${element.textContent.trim()}`),
    );
    const expectedReportStyles = audit.resolvedReportStyles;
    const expectedDash = { solid: "", dash: "7 4", dot: "2 4", "dash-dot": "8 3 2 3" };
    const reportKey = [...document.querySelectorAll(".report-key-item")].map((item) => {
      const line = item.querySelector("line"), marker = item.querySelector("[data-glyph]");
      const expected = expectedReportStyles[item.dataset.series];
      const expectedRgb = `rgb(${Number.parseInt(expected.color.slice(1, 3), 16)}, ${Number.parseInt(expected.color.slice(3, 5), 16)}, ${Number.parseInt(expected.color.slice(5, 7), 16)})`;
      return {
        series: item.dataset.series,
        rendered: { color: line.getAttribute("stroke"), computedLineColor: getComputedStyle(line).stroke, computedMarkerColor: getComputedStyle(marker).stroke, glyph: marker.dataset.glyph, lineStyle: line.dataset.lineStyle, strokeDasharray: line.getAttribute("stroke-dasharray") },
        expected: { color: expected.color, glyph: expected.glyph, lineStyle: expected.lineStyle },
        matches: line.getAttribute("stroke").toLowerCase() === expected.color.toLowerCase()
          && marker.getAttribute("stroke").toLowerCase() === expected.color.toLowerCase()
          && getComputedStyle(line).stroke === expectedRgb && getComputedStyle(marker).stroke === expectedRgb
          && marker.dataset.glyph === expected.glyph && line.dataset.lineStyle === expected.lineStyle
          && line.getAttribute("stroke-dasharray") === expectedDash[expected.lineStyle],
      };
    });
    const semanticGroups = [".report-key", ".cvd-grid", ".paper-pair"].map((selector) => {
      const element = document.querySelector(selector);
      return { selector, role: element.getAttribute("role"), labelledBy: element.getAttribute("aria-labelledby") };
    });
    const probeHost = document.createElement("div"), probeCanvas = document.createElement("canvas");
    probeHost.hidden = true; probeHost.append(probeCanvas); document.body.append(probeHost);
    const visibleModeFigure = audit.createFigurestead(probeCanvas, audit.denseLineBase, { autoplay: false, accessibility: { visible: true, table: true } });
    const visibleModeCompanion = probeCanvas.nextElementSibling;
    const visibleModeProbe = {
      hasVisibleClass: visibleModeCompanion.classList.contains("figurestead-accessibility") && !visibleModeCompanion.classList.contains("figurestead-sr-only"),
      disclosureCount: visibleModeCompanion.querySelectorAll("details > summary").length,
      focusableDisclosureCount: [...visibleModeCompanion.querySelectorAll("summary")].filter((summary) => summary.tabIndex >= 0).length,
    };
    visibleModeFigure.destroy(); probeHost.remove();
    const allElements = [...document.querySelectorAll("*")];
    return {
      title: document.title,
      language: document.documentElement.lang,
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      pageHeight: document.documentElement.scrollHeight,
      headings,
      headingJumps: headings.slice(1).filter((heading, index) => heading.level > headings[index].level + 1),
      duplicateIds: [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))],
      selectedRecipe: document.querySelector('input[name="motion-recipe"]:checked')?.value,
      recipes: [...document.querySelectorAll('input[name="motion-recipe"]')].map((input) => input.value),
      mainAction: document.querySelector("#motion-action").textContent.trim(),
      fingerprintMatch: terminal.dataset.fingerprintMatch === "true",
      pixelMatch: terminal.dataset.pixelMatch === "true",
      terminalText: terminal.textContent.trim(),
      terminalPixelFingerprints: JSON.parse(terminal.dataset.pixelFingerprints),
      terminalNormalizedFingerprints: audit.terminalFingerprints,
      autoplay: audit.autoplay,
      initialStates: {
        main: audit.motionFigure.getState(),
        line: audit.reportLineFigure.getState(),
        scatter: audit.reportScatterFigure.getState(),
        strip: audit.reportStripFigure.getState(),
        coverage: audit.reportCoverageFigure.getState(),
      },
      dataCounts: {
        lineSeries: audit.denseLineBase.panels[0].data.series.length,
        lineIntervals: audit.denseLineBase.panels[0].data.x.length,
        scatterObservations: audit.scatterBase.panels[0].data.x.length,
        stripObservations: audit.stripBase.panels[0].data.values.length,
        coverageObservations: audit.coverageBase.panels[0].data.dates.length,
      },
      rendererFamilies: [
        audit.denseLineBase.panels[0].renderer,
        audit.scatterBase.panels[0].renderer,
        audit.stripBase.panels[0].renderer,
        audit.coverageBase.panels[0].renderer,
      ],
      reportPanels,
      cvdFigures,
      paper,
      paperWidthRatio: paper[1].width / paper[0].width,
      paperCaptionBaselineDelta: Math.abs(paper[1].captionTop - paper[0].captionTop),
      cvdFingerprints: { original: originalFingerprint, ...cvdFingerprints },
      cvdMethod: audit.cvdMethod,
      cvdVisibleTerminology: document.querySelector("#perceptual-stress").textContent.trim(),
      immediateDuplicateCompanionHeadings,
      hiddenCompanionInteractive,
      hiddenCompanionTableCount: document.querySelectorAll(".figurestead-sr-only table").length,
      reportKey,
      coverageLabels: audit.coverageBase.panels[0].data.siteOrder,
      semanticGroups,
      visibleModeProbe,
      definitionTop: document.querySelector(".product-definition").getBoundingClientRect().top,
      ledeTop: document.querySelector(".lede").getBoundingClientRect().top,
      focusableCount: document.querySelectorAll('a[href],button,input:not([type="hidden"]),summary,[tabindex]:not([tabindex="-1"])').length,
      paperSources: [...document.querySelectorAll(".paper-pair figure")].map((figure) => ({
        served: figure.querySelector("img").getAttribute("src"), canonical: figure.querySelector("a").getAttribute("href"),
        naturalWidth: figure.querySelector("img").naturalWidth, naturalHeight: figure.querySelector("img").naturalHeight,
      })),
      imageFailures: [...document.images].filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.src),
      bannedText: ["matrix_origin", "playground", "composer", "quireline"].filter((term) => document.body.textContent.toLowerCase().includes(term)),
      presentationViolations: allElements.filter((element) => {
        const style = getComputedStyle(element);
        return style.boxShadow !== "none" || style.backgroundImage !== "none";
      }).map((element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}`).slice(0, 20),
      publicNavigationCount: document.querySelectorAll("nav").length,
    };
  });
}

async function inspectKeyboard(page) {
  await page.reload({ waitUntil: "load" });
  await waitForShowcase(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const sequence = [];
  let firstSignature = null, completedCycle = false;
  for (let index = 0; index < 40; index += 1) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(50);
    const active = await page.evaluate(activeElementState);
    if (active.tag === "body") continue;
    const signature = [active.tag, active.id, active.value, active.href, active.text].join("|");
    if (firstSignature == null) firstSignature = signature;
    else if (signature === firstSignature || signature === [sequence.at(-1)?.tag, sequence.at(-1)?.id, sequence.at(-1)?.value, sequence.at(-1)?.href, sequence.at(-1)?.text].join("|")) { completedCycle = true; break; }
    sequence.push(active);
  }
  await page.locator('input[value="restrained"]').focus();
  await page.keyboard.press("ArrowLeft");
  const arrowLeft = await page.evaluate(activeElementState);
  await page.keyboard.press("ArrowRight");
  const arrowRight = await page.evaluate(activeElementState);
  return { sequence, completedCycle, arrowLeft, arrowRight };
}

async function inspectMotion(page, reducedMotion) {
  await page.reload({ waitUntil: "load" });
  await waitForShowcase(page);
  const initial = await page.evaluate(() => ({
    selected: document.querySelector('input[name="motion-recipe"]:checked').value,
    action: document.querySelector("#motion-action").textContent.trim(),
    main: window.__technicalShowcaseAudit.motionFigure.getState(),
  }));
  await page.locator("#motion-action").click();
  const restrainedStarted = await page.evaluate(() => window.__technicalShowcaseAudit.motionFigure.getState());
  await page.waitForFunction(() => window.__technicalShowcaseAudit.motionFigure.getState().progress >= 1);
  const restrainedSettled = await page.evaluate(() => ({
    state: window.__technicalShowcaseAudit.motionFigure.getState(),
    action: document.querySelector("#motion-action").textContent.trim(),
    pixels: window.__technicalShowcaseAudit.canvasPixelFingerprint(document.querySelector("#motion-canvas")),
  }));
  await page.getByLabel("Static", { exact: true }).check();
  const staticState = await page.evaluate(() => ({
    state: window.__technicalShowcaseAudit.motionFigure.getState(),
    action: document.querySelector("#motion-action").textContent.trim(),
    disabled: document.querySelector("#motion-action").disabled,
    pixels: window.__technicalShowcaseAudit.canvasPixelFingerprint(document.querySelector("#motion-canvas")),
  }));
  await page.getByLabel("Expressive", { exact: true }).check();
  const expressiveReady = await page.locator("#motion-action").textContent();
  await page.locator("#motion-action").click();
  const expressiveStarted = await page.evaluate(() => window.__technicalShowcaseAudit.motionFigure.getState());
  await page.waitForFunction(() => window.__technicalShowcaseAudit.motionFigure.getState().progress >= 1);
  const expressiveSettled = await page.evaluate(() => ({
    state: window.__technicalShowcaseAudit.motionFigure.getState(),
    action: document.querySelector("#motion-action").textContent.trim(),
    pixels: window.__technicalShowcaseAudit.canvasPixelFingerprint(document.querySelector("#motion-canvas")),
  }));
  await page.locator("#report-line-action").click();
  await page.locator("#report-coverage-action").click();
  const localStarted = await page.evaluate(() => ({
    line: window.__technicalShowcaseAudit.reportLineFigure.getState(),
    coverage: window.__technicalShowcaseAudit.reportCoverageFigure.getState(),
  }));
  await page.waitForFunction(() => (
    window.__technicalShowcaseAudit.reportLineFigure.getState().progress >= 1
    && window.__technicalShowcaseAudit.reportCoverageFigure.getState().progress >= 1
  ));
  const localSettled = await page.evaluate(() => ({
    line: window.__technicalShowcaseAudit.reportLineFigure.getState(),
    coverage: window.__technicalShowcaseAudit.reportCoverageFigure.getState(),
    lineAction: document.querySelector("#report-line-action").textContent.trim(),
    coverageAction: document.querySelector("#report-coverage-action").textContent.trim(),
  }));
  return { reducedMotion, initial, restrainedStarted, restrainedSettled, staticState, expressiveReady: expressiveReady.trim(), expressiveStarted, expressiveSettled, localStarted, localSettled };
}

function findingsFor(testCase) {
  const findings = [];
  const { structure, keyboard, motion, width, reducedMotion } = testCase;
  const expect = (condition, message) => { if (!condition) findings.push(message); };
  expect(structure.title === "Figurestead — local V2 Technical Showcase", "unexpected document title");
  expect(structure.language === "en", "document language is not English");
  expect(structure.innerWidth === width, `viewport width is ${structure.innerWidth}, expected ${width}`);
  expect(structure.horizontalOverflow === 0, `horizontal overflow is ${structure.horizontalOverflow}px`);
  expect(structure.headingJumps.length === 0, "heading hierarchy contains a level jump");
  expect(structure.duplicateIds.length === 0, "duplicate IDs found");
  expect(structure.definitionTop < structure.ledeTop, "concrete product definition does not precede the abstract lede");
  expect(structure.selectedRecipe === "restrained", "restrained motion is not the default");
  expect(structure.mainAction === "Play restrained motion", "default Play control is not explicit");
  expect(JSON.stringify(structure.recipes) === JSON.stringify(["static", "restrained", "expressive"]), "motion recipe set changed");
  expect(structure.fingerprintMatch && structure.pixelMatch, "terminal evidence is not invariant across recipes");
  expect(new Set(Object.values(structure.terminalNormalizedFingerprints)).size === 1, "normalized terminal fingerprints diverge across recipes");
  expect(structure.autoplay === false, "autoplay is enabled");
  expect(Object.values(structure.initialStates).every((state) => state.playing === false), "a figure started playing without input");
  expect(structure.dataCounts.lineSeries === 5 && structure.dataCounts.lineIntervals === 18, "dense line is not five series × eighteen intervals");
  expect(structure.dataCounts.scatterObservations === 30 && structure.dataCounts.stripObservations === 30 && structure.dataCounts.coverageObservations === 30, "multi-panel report observation counts changed");
  expect(JSON.stringify(structure.rendererFamilies) === JSON.stringify(["line", "scatter", "strip_summary", "temporal_coverage"]), "report renderer families changed");
  expect(structure.bannedText.length === 0, `out-of-scope concept appears: ${structure.bannedText.join(", ")}`);
  expect(structure.publicNavigationCount === 0, "public-style navigation was added");
  expect(structure.presentationViolations.length === 0, `shadow or gradient found on ${structure.presentationViolations.join(", ")}`);
  expect(structure.paper.length === 2 && Math.abs(structure.paperWidthRatio - 183 / 89) < 0.02, `paper width ratio is ${structure.paperWidthRatio}`);
  expect(structure.imageFailures.length === 0, "a paper image failed to load");
  expect(structure.paperSources.every((source) => source.served.includes("/site/assets/web/evidence-paper-") && source.canonical.includes("/site/assets/evidence-paper-")), "paper evidence does not pair optimized delivery with canonical inspection");
  expect(new Set(Object.values(structure.cvdFingerprints)).size === 4, "CVD plate does not contain four distinct pixel results");
  expect(structure.cvdMethod.model.includes("Machado") && structure.cvdMethod.severity === 1 && structure.cvdMethod.colorSpace.includes("linear-light sRGB"), "CVD method metadata changed");
  expect(!/protanopia|deuteranopia|tritanopia/i.test(structure.cvdVisibleTerminology), "categorical CVD terminology overstates the severity-model evidence");
  expect(structure.cvdMethod.conditions.tritanomalyApproximation.includes("approximation"), "tritanomaly approximation is not explicit in implementation metadata");
  expect(structure.immediateDuplicateCompanionHeadings.length === 0, `duplicate companion headings remain: ${structure.immediateDuplicateCompanionHeadings.join(", ")}`);
  expect(structure.hiddenCompanionInteractive.length === 0, `hidden companion contains interactive controls: ${structure.hiddenCompanionInteractive.join(", ")}`);
  expect(structure.hiddenCompanionTableCount > 0, "hidden accessibility data tables were removed");
  expect(structure.visibleModeProbe.hasVisibleClass && structure.visibleModeProbe.disclosureCount > 0 && structure.visibleModeProbe.disclosureCount === structure.visibleModeProbe.focusableDisclosureCount, "visible accessibility mode lost its interactive data disclosure");
  expect(structure.reportKey.length === 5 && structure.reportKey.every((item) => item.matches), "rendered report key diverges from resolved Figurestead series styles");
  expect(structure.reportKey[4]?.expected.glyph === "ring" && structure.reportKey[4]?.expected.lineStyle === "dash", "fifth line identity no longer uses the existing ring-plus-dash recovery");
  expect(JSON.stringify(structure.coverageLabels) === JSON.stringify(["HW", "FT", "AF", "UR", "ES"]), `panel D site labels are not stable short codes: ${structure.coverageLabels.join(", ")}`);
  expect(structure.semanticGroups.every((group) => group.role === "group" && group.labelledBy), "a showcase comparison structure lacks exposed group semantics");
  if (width === 1440) {
    expect(structure.reportPanels[0].top === structure.reportPanels[1].top && structure.reportPanels[2].top === structure.reportPanels[3].top, "wide report is not a 2×2 plate");
    expect(structure.cvdFigures[0].top === structure.cvdFigures[1].top && structure.cvdFigures[2].top === structure.cvdFigures[3].top, "wide CVD plate is not 2×2");
  } else {
    expect(structure.reportPanels.every((panel, index, array) => index === 0 || panel.top > array[index - 1].top), "narrow report order is not linear");
    expect(structure.cvdFigures.every((figure, index, array) => index === 0 || figure.top > array[index - 1].top), "narrow CVD order is not linear");
  }
  const focusedIds = keyboard.sequence.map((item) => item.id);
  expect(keyboard.completedCycle, "keyboard traversal did not complete a full focus cycle");
  expect(keyboard.sequence[0]?.text === "Skip to technical showcase", "skip link is not first in keyboard order");
  expect(focusedIds.includes("motion-action") && focusedIds.includes("report-line-action") && focusedIds.includes("report-coverage-action"), "one or more motion controls are not keyboard reachable");
  expect(keyboard.sequence.some((item) => item.href?.includes("doi.org")) && keyboard.sequence.some((item) => item.href?.includes("colour.readthedocs.io")), "method source links are not keyboard reachable");
  expect(keyboard.sequence.filter((item) => item.href?.includes("evidence-paper-")).length === 2, "canonical paper links are not keyboard reachable");
  expect(keyboard.sequence.every((item) => item.outlineStyle !== "none" && item.outlineWidth !== "0px" && item.visibleArea > 0 && item.clippedAncestors.length === 0), "a keyboard target lacks genuinely visible focus or is clipped/offscreen");
  expect(keyboard.arrowLeft.value === "static" && keyboard.arrowRight.value === "restrained", "radio keyboard arrow navigation failed");
  expect(motion.initial.selected === "restrained" && motion.initial.action === "Play restrained motion", "motion interaction did not begin from restrained default");
  expect(motion.restrainedSettled.state.progress === 1 && motion.restrainedSettled.state.playing === false, "restrained motion did not settle");
  expect(motion.restrainedSettled.action === "Replay restrained motion", "restrained Replay label missing");
  expect(motion.staticState.disabled && motion.staticState.action === "Static terminal state", "static treatment is not explicit and disabled");
  expect(motion.expressiveReady === "Play expressive motion", "expressive Play label missing");
  expect(motion.expressiveSettled.state.progress === 1, "expressive motion did not settle");
  expect(new Set([motion.restrainedSettled.pixels, motion.staticState.pixels, motion.expressiveSettled.pixels]).size === 1, "static, restrained, and expressive rendered terminal pixels diverge");
  expect(motion.localSettled.line.progress === 1 && motion.localSettled.coverage.progress === 1, "local report motion did not settle");
  expect(motion.localSettled.lineAction.startsWith("Replay") && motion.localSettled.coverageAction.startsWith("Replay"), "local Replay labels missing");
  if (reducedMotion) {
    expect(motion.restrainedStarted.reducedMotion && !motion.restrainedStarted.playing && motion.restrainedStarted.progress === 1, "reduced motion did not immediately settle restrained motion");
    expect(motion.expressiveStarted.reducedMotion && !motion.expressiveStarted.playing && motion.expressiveStarted.progress === 1, "reduced motion did not immediately settle expressive motion");
    expect(!motion.localStarted.line.playing && !motion.localStarted.coverage.playing, "reduced motion did not suppress local playback");
  } else {
    expect(motion.restrainedStarted.playing && !motion.restrainedStarted.reducedMotion, "restrained motion did not start after Play");
    expect(motion.expressiveStarted.playing && !motion.expressiveStarted.reducedMotion, "expressive motion did not start after Play");
    expect(motion.localStarted.line.playing && motion.localStarted.coverage.playing, "local motion did not start after Play");
  }
  return findings;
}

function installedFirefoxExecutable() {
  if (process.env.FIGURESTEAD_FIREFOX_EXECUTABLE) return process.env.FIGURESTEAD_FIREFOX_EXECUTABLE;
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  const candidates = (fs.existsSync(cache) ? fs.readdirSync(cache) : []).filter((name) => name.startsWith("firefox-")).sort().reverse()
    .map((name) => path.join(cache, name, "firefox", "Nightly.app", "Contents", "MacOS", "firefox"));
  return candidates.find((candidate) => fs.existsSync(candidate)) || firefox.executablePath();
}

async function captureMotionFrames(page) {
  await page.reload({ waitUntil: "load" });
  await waitForShowcase(page);
  await page.locator("#motion-action").click();
  const frames = [];
  for (const [index, threshold] of [0, 0.25, 0.5, 0.75, 1].entries()) {
    if (threshold > 0) await page.waitForFunction((target) => window.__technicalShowcaseAudit.motionFigure.getState().progress >= target, threshold);
    const state = await page.evaluate(() => window.__technicalShowcaseAudit.motionFigure.getState());
    const file = path.join(frameRoot, `chromium-restrained-${String(index).padStart(2, "0")}.png`);
    await page.locator("#motion-canvas").screenshot({ path: file });
    frames.push({ index, requestedProgress: threshold, observedProgress: state.progress, state, file: path.relative(projectRoot, file), sha256: sha256(file) });
  }
  fs.writeFileSync(path.join(frameRoot, "sequence.json"), `${JSON.stringify({
    gate: "recorded restrained-motion sequence",
    recipe: "restrained", deterministicSeed: 2409, autoplay: false,
    interpretation: "Requested thresholds are observed on a free-running animation clock; intermediate frame hashes document this run and are not machine-independent deterministic proof.",
    terminalFrameIsInvariant: frames.at(-1)?.state.progress === 1,
    frames,
  }, null, 2)}\n`);
  return frames;
}

async function runEngine(engineName, browserType) {
  const executablePath = engineName === "firefox" ? installedFirefoxExecutable() : browserType.executablePath();
  const browser = await browserType.launch({ headless: true, executablePath });
  const report = {
    schemaVersion: "figurestead.technical-showcase-local-verification/2",
    generatedAt: new Date().toISOString(), baseUrl, engine: engineName,
    playwrightVersion: require("playwright/package.json").version,
    browserVersion: browser.version(), nodeVersion: process.version,
    executableSha256: sha256(executablePath), cases: [],
  };
  try {
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
        await page.goto(`${baseUrl}?engine=${engineName}&width=${width}&motion=${motionPreference}`, { waitUntil: "load" });
        await waitForShowcase(page);
        await page.locator("#paper-size").scrollIntoViewIfNeeded();
        await page.waitForFunction(() => [...document.querySelectorAll(".paper-pair img")].every((image) => image.complete && image.naturalWidth > 0));
        await page.evaluate(() => window.scrollTo(0, 0));
        const structure = await inspectStructure(page);
        if (!checkOnly && !reducedMotion) {
          await page.screenshot({ path: path.join(screenshotRoot, `${engineName}-${width}-full.png`), fullPage: true });
          if (width === 1440) {
            await page.locator("#evidence-motion").screenshot({ path: path.join(screenshotRoot, `${engineName}-motion-close.png`) });
            await page.locator("#paper-size").screenshot({ path: path.join(screenshotRoot, `${engineName}-paper-close.png`) });
            await page.locator("#perceptual-stress").screenshot({ path: path.join(screenshotRoot, `${engineName}-cvd-plate.png`) });
          }
        }
        const keyboard = await inspectKeyboard(page);
        const motion = await inspectMotion(page, reducedMotion);
        const testCase = { width, motionPreference, reducedMotion, structure, keyboard, motion, runtimeErrors };
        testCase.findings = [...runtimeErrors, ...findingsFor(testCase)];
        testCase.status = testCase.findings.length ? "FAIL" : "PASS";
        report.cases.push(testCase);
        if (!checkOnly && engineName === "chromium" && width === 1440 && !reducedMotion) report.motionFrames = await captureMotionFrames(page);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  report.caseCount = report.cases.length;
  report.findingCount = report.cases.reduce((sum, testCase) => sum + testCase.findings.length, 0);
  report.status = report.findingCount === 0 ? "PASS" : "FAIL";
  fs.writeFileSync(path.join(evidenceRoot, `${engineName}.json`), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

(async () => {
  const reports = [];
  for (const [engineName, browserType] of [["chromium", chromium], ["firefox", firefox]]) reports.push(await runEngine(engineName, browserType));
  const summary = {
    schemaVersion: "figurestead.technical-showcase-local-verification-summary/2",
    generatedAt: new Date().toISOString(), baseUrl, deployed: false, publicNavigationChanged: false,
    engines: reports.map((report) => ({ engine: report.engine, status: report.status, caseCount: report.caseCount, findingCount: report.findingCount })),
  };
  summary.mode = checkOnly ? "check" : "evidence";
  summary.expectedCaseCount = 8;
  summary.executedCaseCount = summary.engines.reduce((total, engine) => total + engine.caseCount, 0);
  summary.status = summary.engines.length === 2
    && summary.executedCaseCount === summary.expectedCaseCount
    && summary.engines.every((engine) => engine.status === "PASS" && engine.caseCount === 4)
    ? "PASS" : "FAIL";
  fs.writeFileSync(path.join(evidenceRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.status !== "PASS") process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
