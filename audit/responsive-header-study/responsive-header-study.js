import {
  createFigurestead,
  loadThemePack,
  resolveTheme,
} from "../../web/src/index.js";

const query = new URLSearchParams(location.search);
const width = Number(query.get("width") || 362);
if (![320, 362, 390].includes(width)) throw new Error(`unsupported study width ${width}`);

const baseHeight = Math.round(width * 196 / 362);
const titleText = "Storm response across five watershed sites";
const subtitleText = "Five synthetic site responses after one rainfall pulse";
const candidatePlotFloor = 72;
const multiPanelReferenceFloor = 120;
const policyNames = {
  A: "A · title-only wrap",
  B: "B · grow canvas",
  C: "C · plot-floor guard",
};
const themeSpecs = [
  ["slipware", "Slipware"],
  ["deep_observatory_sage_core", "Deep Observatory"],
];

const [watershed, ...themePacks] = await Promise.all([
  fetch("../../specimen-study/corpus-v0.2/scenes/watershed_storm_response.json").then((response) => response.json()),
  ...themeSpecs.map(([key]) => loadThemePack(`../../src/figurestead/themes/${key}.json`)),
]);
const themes = Object.fromEntries(themeSpecs.map(([key], index) => [key, resolveTheme(themePacks[index], key)]));

const profile = Object.freeze({ key: "deep_scope", name: "Deep Scope", marker: "ring_core", markerSize: 42, markerAlpha: 0.84, edgeWidth: 1.05, coreFraction: 0.12, pointGlow: false, gridX: true, gridY: true, gridAlpha: 0.42, rainDensity: 0, rainAlpha: 0, summaryGlow: false });
const timeline = Object.freeze({ rainIn: [0.04, 0.14], marksEnter: [0.08, 0.70], summaryCompiles: [0.68, 0.86], rainOut: [0.72, 0.90], settle: [0.90, 1] });
const motion = Object.freeze({ frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0, trailAlpha: 0, seed: 2409, durationMs: 1 });
const style = Object.freeze({ glyphs: ["ring", "square", "triangle", "diamond"], lineStyles: ["solid", "dash", "dot", "dash-dot"], series: {} });

function contractFor(theme) {
  return {
    schemaVersion: "0.4", rendererApiVersion: "1", theme, profile, timeline, motion, style,
    spec: { title: titleText, subtitle: subtitleText, xLabel: watershed.suggestedSpec.xLabel, yLabel: watershed.suggestedSpec.yLabel, note: watershed.suggestedSpec.note, signature: "figurestead · deterministic synthetic fixture", description: watershed.communicationQuestion },
    layout: { type: "grid", columns: 1, gap: 18, sharedX: false, sharedY: false },
    view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
    panels: [{
      id: watershed.sceneId, renderer: "line",
      spec: { title: titleText, subtitle: subtitleText, xLabel: watershed.suggestedSpec.xLabel, yLabel: watershed.suggestedSpec.yLabel, note: watershed.suggestedSpec.note, description: watershed.communicationQuestion },
      ...watershed.suggestedScales, annotations: [], encoding: { interpolation: "linear" },
      presentation: { panelSurface: true, frame: true, legend: "auto", lineWidth: 1.65, markerScale: 0.86 },
      data: watershed.data,
    }],
  };
}

const round = (value) => Number(value.toFixed(3));
const roundRect = (rect) => Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, round(value)]));

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
  if (!complete) lines[lines.length - 1] = ellipsis(context, `${lines[lines.length - 1]} ${words.slice(cursor).join(" ")}`, maxWidth).text;
  return { lines, complete };
}

function lineBounds(context, text, baseline, x) {
  const metric = context.measureText(text);
  const ascent = metric.actualBoundingBoxAscent || Number.parseFloat(context.font) * 0.78;
  const descent = metric.actualBoundingBoxDescent || Number.parseFloat(context.font) * 0.22;
  return {
    text,
    baseline: round(baseline),
    bounds: roundRect({ left: x, right: x + metric.width, top: baseline - ascent, bottom: baseline + descent }),
  };
}

function setLineDash(context, style) {
  context.setLineDash(style === "dash" ? [5, 3] : style === "dot" ? [1.2, 2.5] : style === "dash-dot" ? [5, 2.5, 1.2, 2.5] : []);
}

function drawEvidence(context, terminal, plot, theme) {
  const panel = terminal.panels[0], [x0, x1] = panel.domain.x, [y0, y1] = panel.domain.y;
  const x = (value) => plot.left + (value - x0) / (x1 - x0) * (plot.right - plot.left);
  const y = (value) => plot.bottom - (value - y0) / (y1 - y0) * (plot.bottom - plot.top);
  context.fillStyle = theme.panel;
  context.fillRect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
  context.strokeStyle = theme.grid;
  context.globalAlpha = 0.45;
  context.lineWidth = 0.7;
  for (let index = 1; index < 4; index += 1) {
    const px = plot.left + (plot.right - plot.left) * index / 4;
    const py = plot.top + (plot.bottom - plot.top) * index / 4;
    context.beginPath(); context.moveTo(px, plot.top); context.lineTo(px, plot.bottom); context.stroke();
    context.beginPath(); context.moveTo(plot.left, py); context.lineTo(plot.right, py); context.stroke();
  }
  context.globalAlpha = 1;
  context.save();
  context.beginPath(); context.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top); context.clip();
  for (const mark of panel.marks.filter((item) => item.kind === "segment")) {
    context.strokeStyle = mark.style.color; context.lineWidth = 1.5; setLineDash(context, mark.style.lineStyle);
    context.beginPath(); context.moveTo(x(mark.from.x), y(mark.from.y)); context.lineTo(x(mark.to.x), y(mark.to.y)); context.stroke();
  }
  context.setLineDash([]);
  for (const mark of panel.marks.filter((item) => item.kind === "point")) {
    context.strokeStyle = mark.style.color; context.lineWidth = 1;
    context.beginPath(); context.arc(x(mark.x), y(mark.y), 1.6, 0, Math.PI * 2); context.stroke();
  }
  context.restore();
  context.strokeStyle = theme.spine; context.lineWidth = 0.7; context.strokeRect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
}

function policyGeometry(policy, base, context) {
  const availableWidth = base.plot.right - base.plot.left;
  context.font = `500 ${base.font.title}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const titleMax = policy === "C" ? 2 : 2;
  let title = wrap(context, titleText, availableWidth, titleMax);
  context.font = `italic ${base.font.subtitle}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  let subtitle = policy === "B" ? wrap(context, subtitleText, availableWidth, 2) : { lines: [ellipsis(context, subtitleText, availableWidth).text], complete: context.measureText(subtitleText).width <= availableWidth };
  const titleLineHeight = base.font.title * 1.22, subtitleLineHeight = base.font.subtitle * 1.35;
  let extraHeader = (title.lines.length - 1) * titleLineHeight + (policy === "B" ? (subtitle.lines.length - 1) * subtitleLineHeight : 0);
  if (policy === "C") {
    const wrappedPlotHeight = base.plot.bottom - (base.plot.top + extraHeader);
    if (wrappedPlotHeight < candidatePlotFloor) {
      context.font = `500 ${base.font.title}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const oneTitle = ellipsis(context, titleText, availableWidth);
      context.font = `italic ${base.font.subtitle}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const oneSubtitle = ellipsis(context, subtitleText, availableWidth);
      title = { lines: [oneTitle.text], complete: oneTitle.complete };
      subtitle = { lines: [oneSubtitle.text], complete: oneSubtitle.complete };
      extraHeader = 0;
    }
  }
  const canvasHeight = policy === "B" ? base.height + extraHeader : base.height;
  const plot = policy === "B"
    ? { ...base.plot, top: base.plot.top + extraHeader, bottom: base.plot.bottom + extraHeader }
    : { ...base.plot, top: base.plot.top + extraHeader };
  return { title, subtitle, titleLineHeight, subtitleLineHeight, extraHeader, canvasHeight, plot };
}

function drawVariant(base, policy, themeName, themeKey, terminal) {
  const scratch = document.createElement("canvas").getContext("2d");
  const geometry = policyGeometry(policy, base, scratch);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = Math.ceil(geometry.canvasHeight);
  canvas.style.width = `${width}px`; canvas.style.height = `${Math.ceil(geometry.canvasHeight)}px`;
  const context = canvas.getContext("2d");
  context.fillStyle = terminal.theme.field; context.fillRect(0, 0, canvas.width, canvas.height);
  drawEvidence(context, terminal, geometry.plot, terminal.theme);

  const titleBaseline = Math.max(base.font.title + 8, base.plot.top * 0.52);
  const subtitleBaseline = Math.max(base.font.title + base.font.subtitle + 14, base.plot.top * 0.73)
    + (geometry.title.lines.length - 1) * geometry.titleLineHeight;
  const titleRecords = [], subtitleRecords = [];
  context.textAlign = "left"; context.textBaseline = "alphabetic";
  context.fillStyle = terminal.theme.primary;
  context.font = `500 ${base.font.title}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  geometry.title.lines.forEach((line, index) => {
    const baseline = titleBaseline + index * geometry.titleLineHeight;
    context.fillText(line, base.plot.left, baseline);
    titleRecords.push(lineBounds(context, line, baseline, base.plot.left));
  });
  context.fillStyle = terminal.theme.secondary;
  context.font = `italic ${base.font.subtitle}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  geometry.subtitle.lines.forEach((line, index) => {
    const baseline = subtitleBaseline + index * geometry.subtitleLineHeight;
    context.fillText(line, base.plot.left, baseline);
    subtitleRecords.push(lineBounds(context, line, baseline, base.plot.left));
  });
  context.fillStyle = terminal.theme.faint;
  context.font = `${base.font.signature}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  context.fillText("figurestead · study-only synthetic fixture", base.plot.left, canvas.height - 8);

  const finalHeaderBottom = subtitleRecords.at(-1).bounds.bottom;
  const card = document.createElement("figure");
  card.className = "study-card";
  const descriptionId = `full-${themeKey}-${policy}-${width}`;
  card.setAttribute("aria-describedby", descriptionId);
  const header = document.createElement("header");
  const heading = document.createElement("h2"); heading.textContent = policyNames[policy];
  const label = document.createElement("span"); label.textContent = themeName;
  header.append(heading, label);
  const caption = document.createElement("figcaption");
  caption.textContent = `${canvas.width}×${canvas.height} · plot ${round(geometry.plot.bottom - geometry.plot.top)} px · ${geometry.title.lines.length}/${geometry.subtitle.lines.length} visual lines`;
  const full = document.createElement("p");
  full.id = descriptionId; full.className = "visually-hidden";
  full.textContent = `Complete title: ${titleText}. Complete subtitle: ${subtitleText}.`;
  card.append(header, canvas, caption, full);

  return {
    card,
    metric: {
      width,
      theme: themeKey,
      themeName,
      policy,
      policyLabel: policyNames[policy],
      canvas: { width: canvas.width, height: canvas.height },
      scale: round(base.scale),
      title: { lineCount: titleRecords.length, lines: titleRecords, complete: geometry.title.complete },
      subtitle: { lineCount: subtitleRecords.length, lines: subtitleRecords, complete: geometry.subtitle.complete },
      headerHeight: round(finalHeaderBottom - titleRecords[0].bounds.top),
      plot: roundRect(geometry.plot),
      plotHeight: round(geometry.plot.bottom - geometry.plot.top),
      preWrapPlot: roundRect(base.plot),
      preWrapPlotHeight: round(base.plot.bottom - base.plot.top),
      headerToPlotClearance: round(geometry.plot.top - finalHeaderBottom),
      visualTextComplete: geometry.title.complete && geometry.subtitle.complete,
      accessibilityTextComplete: full.textContent.includes(titleText) && full.textContent.includes(subtitleText),
      candidatePlotFloor,
      candidateFloorClear: geometry.plot.bottom - geometry.plot.top >= candidatePlotFloor,
      multiPanelReferenceFloor,
      multiPanelReferenceClear: geometry.plot.bottom - geometry.plot.top >= multiPanelReferenceFloor,
      extraHeaderHeight: round(geometry.extraHeader),
      productionWrapping: false,
    },
  };
}

document.querySelector("#study-width").textContent = `${width} px comparison · base canvas ${width}×${baseHeight}`;
const grid = document.querySelector(".study-grid"), metrics = [];
for (const [themeKey, themeName] of themeSpecs) {
  const source = document.createElement("canvas");
  source.className = "production-source";
  source.style.width = `${width}px`; source.style.height = `${baseHeight}px`;
  document.body.append(source);
  const instance = createFigurestead(source, contractFor(themes[themeKey]), { autoplay: false, reducedMotion: true, dprCap: 1 });
  const resolved = instance.getResolvedScene(), terminal = instance.getScene(), layout = resolved.panels[0].layout;
  const base = { width, height: baseHeight, scale: layout.scale, plot: { ...layout.plot }, font: { ...layout.font } };
  for (const policy of ["A", "B", "C"]) {
    const variant = drawVariant(base, policy, themeName, themeKey, terminal);
    grid.append(variant.card); metrics.push(variant.metric);
  }
  instance.destroy(); source.remove();
}

window.__FIGURESTEAD_HEADER_STUDY__ = Object.freeze({
  schemaVersion: "figurestead.responsive-header-study/1",
  studyOnly: true,
  width,
  baseHeight,
  sourceFixture: "specimen-study/corpus-v0.2/scenes/watershed_storm_response.json",
  fullText: { title: titleText, subtitle: subtitleText },
  metrics,
});
document.documentElement.dataset.studyReady = "true";
