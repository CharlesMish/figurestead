import {
  applyMotionRecipe,
  CORE_REGISTRY,
  createFigurestead,
  loadThemePack,
  resolveTheme,
  validateContract,
} from "../../web/src/index.js";
import { TEMPORAL_RENDERERS } from "../../web/src/extensions/temporal/index.js";

const query = new URLSearchParams(location.search);
const width = Number(query.get("width") || 362);
if (![320, 362, 390].includes(width)) throw new Error(`unsupported study width ${width}`);

const FIXTURES = Object.freeze([
  "watershed_storm_response",
  "circadian_phase_shift",
  "instrument_calibration",
  "paired_seasonal_distributions",
  "field_sampling_coverage",
]);
const WIDTHS = Object.freeze([320, 362, 390]);
const FLOOR_CANDIDATES = Object.freeze([60, 72, 120]);
const NATURAL_ASPECT = Object.freeze({ width: 116, height: 70, authority: "specimen-study/specimen-study.css .specimen canvas" });
const policyNames = Object.freeze({ B: "B · height negotiation", C: "C · fixed-height fallback" });
const profile = Object.freeze({ key: "deep_scope", name: "Deep Scope", marker: "ring_core", markerSize: 42, markerAlpha: 0.84, edgeWidth: 1.05, coreFraction: 0.12, pointGlow: false, gridX: true, gridY: true, gridAlpha: 0.42, rainDensity: 0, rainAlpha: 0, summaryGlow: false });
const timeline = Object.freeze({ rainIn: [0.04, 0.14], marksEnter: [0.08, 0.70], summaryCompiles: [0.68, 0.86], rainOut: [0.72, 0.90], settle: [0.90, 1] });
const defaultMotion = Object.freeze({ frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0, trailAlpha: 0, seed: 2409, durationMs: 1 });
const style = Object.freeze({ glyphs: ["ring", "square", "triangle", "diamond"], lineStyles: ["solid", "dash", "dot", "dash-dot"], series: {} });
const registry = CORE_REGISTRY.with(...TEMPORAL_RENDERERS);

// Human inspection of the renderer-specific evidence, not a computed adequacy
// score. The reasons are deliberately tied to visible scientific encodings.
const READABILITY = Object.freeze({
  watershed_storm_response: {
    320: ["usable", "curves, markers, ticks, and five-entry legend remain distinguishable, but peak separation is compact"],
    362: ["comfortable", "curve peaks, crossings, redundant identities, ticks, and legend read without crowding"],
    390: ["comfortable", "curve separation and peak timing remain clear with an uncongested legend"],
  },
  circadian_phase_shift: {
    320: ["usable", "crossings and four series identities remain visible, with limited vertical separation around convergence"],
    362: ["comfortable", "crossing order, phase offsets, ticks, and legend remain readily distinguishable"],
    390: ["comfortable", "phase offsets and crossing-series structure have clear vertical breathing room"],
  },
  instrument_calibration: {
    320: ["usable", "points and fitted lines remain separable; the four-entry legend is the primary burden"],
    362: ["comfortable", "point clouds, fitted lines, axes, and legend remain distinct"],
    390: ["comfortable", "fit geometry and point separation are immediately inspectable"],
  },
  paired_seasonal_distributions: {
    320: ["marginal", "individual observations and medians survive, but grouped marks and categorical labels are tightly compressed"],
    362: ["usable", "groups, observations, medians, and season labels remain inspectable with modest crowding"],
    390: ["comfortable", "paired groups, individual marks, medians, and labels separate clearly"],
  },
  field_sampling_coverage: {
    320: ["not defensible", "six row identities, rug marks, annual bars, and date structure compete in too little vertical space"],
    362: ["marginal", "row identity and visits survive, but rug rows and annual summary remain compressed"],
    390: ["usable", "rows, visit marks, annual counts, and date-axis structure are distinguishable, though still dense"],
  },
});

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return response.json();
};
const round = (value) => Number(value.toFixed(3));
const roundRect = (rect) => Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, round(value)]));
const naturalHeight = (candidateWidth) => Math.round(candidateWidth * NATURAL_ASPECT.height / NATURAL_ASPECT.width);

const scenes = Object.fromEntries(await Promise.all(FIXTURES.map(async (id) => [id, await fetchJson(`../../specimen-study/corpus-v0.2/scenes/${id}.json`)])));
const themeKeys = [...new Set(FIXTURES.map((id) => scenes[id].suggestedTheme.key))];
const themes = Object.fromEntries(await Promise.all(themeKeys.map(async (key) => {
  const pack = await loadThemePack(`../../src/figurestead/themes/${key}.json`);
  return [key, resolveTheme(pack, key)];
})));

function contractFor(scene) {
  const panel = {
    id: scene.sceneId,
    renderer: scene.renderer,
    spec: { title: scene.title, subtitle: scene.subtitle, xLabel: scene.suggestedSpec.xLabel, yLabel: scene.suggestedSpec.yLabel, note: scene.suggestedSpec.note, description: scene.communicationQuestion },
    ...scene.suggestedScales,
    annotations: scene.renderer === "temporal_observations" ? scene.data.referenceBands : [],
    encoding: { interpolation: "linear" },
    presentation: { panelSurface: true, frame: true, legend: "auto", lineWidth: 1.65, markerScale: 0.86 },
    data: scene.data,
  };
  const authored = {
    schemaVersion: "0.4", rendererApiVersion: "1", theme: themes[scene.suggestedTheme.key], profile, timeline,
    motion: { ...defaultMotion, seed: scene.seed }, style,
    spec: { title: scene.title, subtitle: scene.subtitle, xLabel: scene.suggestedSpec.xLabel, yLabel: scene.suggestedSpec.yLabel, note: scene.suggestedSpec.note, signature: "figurestead · deterministic synthetic fixture", description: scene.communicationQuestion },
    layout: { type: "grid", columns: 1, gap: 18, sharedX: false, sharedY: false },
    view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
    panels: [panel],
  };
  return applyMotionRecipe(validateContract(authored, registry), "static");
}

function dataCount(scene) {
  if (scene.renderer === "line") return scene.data.series.reduce((sum, item) => sum + item.y.length, 0);
  if (scene.renderer === "scatter") return scene.data.x.length;
  if (scene.renderer === "strip_summary") return scene.data.values.length;
  if (scene.renderer.startsWith("temporal_")) return scene.data.dates.length;
  return 0;
}

function ellipsis(context, text, maxWidth) {
  if (context.measureText(text).width <= maxWidth) return { text, complete: true };
  let candidate = text;
  while (candidate && context.measureText(`${candidate}…`).width > maxWidth) candidate = candidate.slice(0, -1).trimEnd();
  return { text: `${candidate}…`, complete: false };
}

function wrap(context, text, maxWidth, maxLines) {
  const words = text.split(/\s+/), lines = [];
  let cursor = 0;
  while (cursor < words.length && lines.length < maxLines) {
    let line = words[cursor++];
    while (cursor < words.length && context.measureText(`${line} ${words[cursor]}`).width <= maxWidth) line += ` ${words[cursor++]}`;
    lines.push(line);
  }
  const complete = cursor === words.length;
  if (!complete) lines[lines.length - 1] = ellipsis(context, `${lines.at(-1)} ${words.slice(cursor).join(" ")}`, maxWidth).text;
  return { lines, complete };
}

function lineBounds(context, text, baseline, x) {
  const metric = context.measureText(text);
  const size = Number.parseFloat(context.font);
  const ascent = metric.actualBoundingBoxAscent || size * 0.78;
  const descent = metric.actualBoundingBoxDescent || size * 0.22;
  return { text, baseline: round(baseline), bounds: roundRect({ left: x, right: x + metric.width, top: baseline - ascent, bottom: baseline + descent }) };
}

function headerGeometry(policy, scene, layout, context) {
  const availableWidth = layout.plot.right - layout.plot.left;
  const titleLineHeight = layout.font.title * 1.22;
  const subtitleLineHeight = layout.font.subtitle * 1.35;
  const titleBaseline = layout.text?.titleY ?? Math.max(layout.font.title + 8, layout.plot.top * 0.52);
  const baseSubtitleBaseline = layout.text?.subtitleY ?? Math.max(layout.font.title + layout.font.subtitle + 14, layout.plot.top * 0.73);
  context.font = `500 ${layout.font.title}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  let title = wrap(context, scene.title, availableWidth, 2);
  context.font = `italic ${layout.font.subtitle}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  let subtitle = policy === "B" ? wrap(context, scene.subtitle, availableWidth, 2) : { lines: [ellipsis(context, scene.subtitle, availableWidth).text], complete: context.measureText(scene.subtitle).width <= availableWidth };
  if (policy === "C" && title.lines.length > 1) {
    const candidateSubtitleBaseline = baseSubtitleBaseline + titleLineHeight;
    const candidateBottom = lineBounds(context, subtitle.lines[0], candidateSubtitleBaseline, layout.plot.left).bounds.bottom;
    if (candidateBottom > layout.plot.top) {
      context.font = `500 ${layout.font.title}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const one = ellipsis(context, scene.title, availableWidth);
      title = { lines: [one.text], complete: one.complete };
    }
  }
  const extraHeight = policy === "B"
    ? (title.lines.length - 1) * titleLineHeight + (subtitle.lines.length - 1) * subtitleLineHeight
    : 0;
  const subtitleBaseline = baseSubtitleBaseline + (title.lines.length - 1) * titleLineHeight;
  return { title, subtitle, titleLineHeight, subtitleLineHeight, titleBaseline, subtitleBaseline, extraHeight };
}

function paintHeader(context, terminal, layout, header) {
  const titleRecords = [], subtitleRecords = [];
  context.save(); context.textAlign = "left"; context.textBaseline = "alphabetic";
  context.fillStyle = terminal.theme.primary;
  context.font = `500 ${layout.font.title}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  header.title.lines.forEach((line, index) => {
    const baseline = header.titleBaseline + index * header.titleLineHeight;
    if (terminal.theme.primaryEdge) { context.strokeStyle = terminal.theme.primaryEdge; context.lineWidth = Math.max(1, 1.5 * layout.scale); context.strokeText(line, layout.plot.left, baseline); }
    context.fillText(line, layout.plot.left, baseline);
    titleRecords.push(lineBounds(context, line, baseline, layout.plot.left));
  });
  context.fillStyle = terminal.theme.secondary;
  context.font = `italic ${layout.font.subtitle}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  header.subtitle.lines.forEach((line, index) => {
    const baseline = header.subtitleBaseline + index * header.subtitleLineHeight;
    context.fillText(line, layout.plot.left, baseline);
    subtitleRecords.push(lineBounds(context, line, baseline, layout.plot.left));
  });
  context.restore();
  return { titleRecords, subtitleRecords };
}

function cloneCard(card, focusWidth) {
  const result = card.cloneNode(true), source = card.querySelector("canvas"), target = result.querySelector("canvas");
  target.getContext("2d").drawImage(source, 0, 0);
  result.style.setProperty("--focus-width", `${focusWidth}px`);
  result.style.width = `${focusWidth + 30}px`;
  return result;
}

function makeVariant(scene, source, terminal, resolved, policy) {
  const layout = resolved.panels[0].layout;
  const scratch = document.createElement("canvas").getContext("2d");
  const header = headerGeometry(policy, scene, layout, scratch);
  const canvasHeight = policy === "B" ? Math.ceil(source.height + header.extraHeight) : source.height;
  const plot = policy === "B"
    ? { ...layout.plot, top: layout.plot.top + header.extraHeight, bottom: layout.plot.bottom + header.extraHeight }
    : { ...layout.plot };
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = canvasHeight;
  canvas.style.width = `${width}px`; canvas.style.height = `${canvasHeight}px`;
  const context = canvas.getContext("2d");
  context.fillStyle = terminal.theme.field; context.fillRect(0, 0, canvas.width, canvas.height);
  const copyTop = Math.max(0, Math.floor(layout.plot.top - Math.max(8, 10 * layout.scale)));
  if (policy === "B") context.drawImage(source, 0, copyTop, source.width, source.height - copyTop, 0, copyTop + header.extraHeight, source.width, source.height - copyTop);
  else {
    context.drawImage(source, 0, 0);
    context.fillStyle = terminal.theme.field; context.fillRect(0, 0, canvas.width, copyTop);
  }
  const { titleRecords, subtitleRecords } = paintHeader(context, terminal, layout, header);
  const finalHeaderBottom = subtitleRecords.at(-1).bounds.bottom;
  const [classification, rationale] = READABILITY[scene.sceneId][width];
  const card = document.createElement("figure"); card.className = "study-card"; card.dataset.scene = scene.sceneId; card.dataset.policy = policy; card.style.width = `${width + 22}px`;
  const descriptionId = `full-${scene.sceneId}-${policy}-${width}`; card.setAttribute("aria-describedby", descriptionId);
  const cardHeader = document.createElement("header");
  const heading = document.createElement("h2"); heading.textContent = `${scene.title} · ${policyNames[policy]}`;
  const label = document.createElement("span"); label.textContent = `${scene.renderer} · ${scene.suggestedTheme.name}`;
  cardHeader.append(heading, label);
  const caption = document.createElement("figcaption");
  caption.textContent = `${canvas.width}×${canvas.height} · plot ${round(plot.bottom - plot.top)} px · ${classification} · title/subtitle ${titleRecords.length}/${subtitleRecords.length}`;
  const full = document.createElement("p"); full.id = descriptionId; full.className = "visually-hidden"; full.textContent = `Complete title: ${scene.title}. Complete subtitle: ${scene.subtitle}.`;
  card.append(cardHeader, canvas, caption, full);
  const markCount = terminal.panels[0].marks.length;
  const metric = {
    specimen: scene.sceneId,
    renderer: scene.renderer,
    theme: scene.suggestedTheme.key,
    themeName: scene.suggestedTheme.name,
    width,
    policy,
    policyLabel: policyNames[policy],
    productionPolicyImplemented: false,
    baselineCanvas: { width: source.width, height: source.height, aspectAuthority: NATURAL_ASPECT.authority },
    policyCanvas: { width: canvas.width, height: canvas.height },
    addedHeight: round(canvas.height - source.height),
    addedHeightPercentage: round((canvas.height - source.height) / source.height * 100),
    measuredAdditionalHeaderHeight: round(header.extraHeight),
    scale: round(layout.scale),
    title: { lineCount: titleRecords.length, complete: header.title.complete, lines: titleRecords },
    subtitle: { lineCount: subtitleRecords.length, complete: header.subtitle.complete, lines: subtitleRecords },
    accessibility: { titleComplete: full.textContent.includes(scene.title), subtitleComplete: full.textContent.includes(scene.subtitle) },
    headerHeight: round(finalHeaderBottom - titleRecords[0].bounds.top),
    headerToPlotClearance: round(plot.top - finalHeaderBottom),
    baselinePlot: roundRect(layout.plot),
    policyPlot: roundRect(plot),
    baselinePlotHeight: round(layout.plot.bottom - layout.plot.top),
    policyPlotHeight: round(plot.bottom - plot.top),
    candidateFloors: {
      none: { role: "protect existing baseline geometry", baselinePreserved: true },
      ...Object.fromEntries(FLOOR_CANDIDATES.map((floor) => [String(floor), { role: floor === 120 ? "multi-panel reference only" : "study candidate", baselineSatisfies: layout.plot.bottom - layout.plot.top >= floor }])),
    },
    counts: { dataBefore: dataCount(scene), dataAfter: dataCount(scene), marksBefore: markCount, marksAfter: markCount, xTicks: resolved.panels[0].axes.xTicks.length, yTicks: resolved.panels[0].axes.yTicks.length, legendEntries: resolved.panels[0].legend.length },
    plotReadability: { classification, rationale, basis: "human renderer-specific inspection; not a numeric adequacy score" },
    overlap: finalHeaderBottom > plot.top,
    clipping: false,
  };
  return { card, metric };
}

function negotiatedHeightFor(scene, candidateWidth, context) {
  const baselineHeight = naturalHeight(candidateWidth), contract = contractFor(scene);
  const source = document.createElement("canvas"); source.className = "production-source"; source.width = candidateWidth; source.height = baselineHeight; source.style.width = `${candidateWidth}px`; source.style.height = `${baselineHeight}px`; document.body.append(source);
  const instance = createFigurestead(source, contract, { autoplay: false, reducedMotion: true, dprCap: 1, registry });
  instance.resize();
  const layout = instance.getResolvedScene().panels[0].layout;
  const result = Math.ceil(baselineHeight + headerGeometry("B", scene, layout, context).extraHeight);
  instance.destroy(); source.remove();
  return result;
}

async function resizeStabilityFor(scene) {
  const probe = document.createElement("div"); probe.className = "resize-probe"; document.body.append(probe);
  const context = document.createElement("canvas").getContext("2d");
  const expected = Object.fromEntries(WIDTHS.map((candidateWidth) => [candidateWidth, negotiatedHeightFor(scene, candidateWidth, context)]));
  let callbacks = 0;
  const observer = new ResizeObserver((entries) => {
    callbacks += 1;
    const currentWidth = Math.round(entries[0].contentRect.width);
    const next = expected[currentWidth];
    if (next && Math.round(entries[0].contentRect.height) !== next) probe.style.height = `${next}px`;
  });
  observer.observe(probe);
  const sequences = [[390, 362, 320], [320, 362, 390], [390, 362, 320, 362, 390]];
  const records = [];
  for (const sequence of sequences) {
    const observed = [];
    for (const candidateWidth of sequence) {
      const before = callbacks;
      probe.style.width = `${candidateWidth}px`; probe.style.height = `${naturalHeight(candidateWidth)}px`;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      observed.push({ width: candidateWidth, expectedHeight: expected[candidateWidth], observedHeight: Math.round(probe.getBoundingClientRect().height), callbacks: callbacks - before });
    }
    records.push({ requestedWidths: sequence, observed });
  }
  observer.disconnect(); probe.remove();
  const everyExact = records.every((record) => record.observed.every((item) => item.expectedHeight === item.observedHeight));
  const repeat = records[2].observed;
  return {
    specimen: scene.sceneId,
    expectedHeights: expected,
    sequences: records,
    deterministic: everyExact,
    reversible: repeat[0].observedHeight === repeat.at(-1).observedHeight && repeat[1].observedHeight === repeat[3].observedHeight,
    noAccumulation: everyExact,
    noOscillation: records.every((record) => record.observed.every((item) => item.callbacks <= 3)),
    monotonicByWidth: expected[320] <= expected[362] && expected[362] <= expected[390],
    statefulMemoryRequired: false,
  };
}

document.querySelector("#study-width").textContent = `${width} CSS px · natural baseline ${width}×${naturalHeight(width)} from the accepted specimen-lab aspect ratio`;
const grid = document.querySelector(".study-grid"), focusGrid = document.querySelector(".focus-grid"), metrics = [], cardIndex = new Map();
for (const id of FIXTURES) {
  const scene = scenes[id], baseHeight = naturalHeight(width), contract = contractFor(scene);
  const source = document.createElement("canvas"); source.className = "production-source"; source.width = width; source.height = baseHeight; source.style.width = `${width}px`; source.style.height = `${baseHeight}px`; document.body.append(source);
  const instance = createFigurestead(source, contract, { autoplay: false, reducedMotion: true, dprCap: 1, registry });
  instance.resize();
  const terminal = instance.getScene(), resolved = instance.getResolvedScene();
  for (const policy of ["B", "C"]) {
    const variant = makeVariant(scene, source, terminal, resolved, policy);
    grid.append(variant.card); metrics.push(variant.metric); cardIndex.set(`${id}:${policy}`, variant.card);
  }
  instance.destroy(); source.remove();
}

const maxGrowth = metrics.filter((item) => item.policy === "B").sort((left, right) => right.addedHeightPercentage - left.addedHeightPercentage)[0];
const focusIds = [...new Set([maxGrowth.specimen, ...metrics.filter((item) => item.policy === "C" && ["marginal", "not defensible"].includes(item.plotReadability.classification)).map((item) => item.specimen)])];
for (const id of focusIds) for (const policy of ["B", "C"]) focusGrid.append(cloneCard(cardIndex.get(`${id}:${policy}`), Math.round(width * 1.25)));
const resizeStability = await Promise.all(FIXTURES.map((id) => resizeStabilityFor(scenes[id])));

window.__FIGURESTEAD_CROSS_HEADER_STUDY__ = Object.freeze({
  schemaVersion: "figurestead.responsive-header-cross-renderer-study/1",
  studyOnly: true,
  productionWrappingImplemented: false,
  productionHeightNegotiationImplemented: false,
  width,
  naturalBaseline: { height: naturalHeight(width), aspect: NATURAL_ASPECT },
  fixtureOrder: FIXTURES,
  policies: ["B", "C"],
  historicalPolicyA: "retained in audit/responsive-header-study; omitted from primary comparison",
  floorCandidates: FLOOR_CANDIDATES,
  metrics,
  focusSpecimens: focusIds,
  resizeStability,
});
document.documentElement.dataset.studyReady = "true";
