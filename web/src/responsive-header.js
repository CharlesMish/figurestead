import { resolveTerminalScene } from "./resolved-scene.js";

export const RESPONSIVE_HEADER_MAX_WIDTH = 480;

const FONT_STACK = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";
const finitePositive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;

function metric(measureText, text, fontSize, style) {
  return measureText?.(String(text), fontSize, style) ?? { width: String(text).length * fontSize * 0.602 };
}

function ellipsis(text, maximumWidth, measure) {
  const source = String(text).trim();
  if (measure(source).width <= maximumWidth) return { lines: [source], complete: true };
  let candidate = source;
  while (candidate && measure(`${candidate}…`).width > maximumWidth) candidate = candidate.slice(0, -1).trimEnd();
  return { lines: [`${candidate}…`], complete: false };
}

function wrap(text, maximumWidth, maximumLines, measure) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], complete: true };
  const lines = [];
  let cursor = 0;
  while (cursor < words.length && lines.length < maximumLines) {
    let line = words[cursor++];
    while (cursor < words.length && measure(`${line} ${words[cursor]}`).width <= maximumWidth) line += ` ${words[cursor++]}`;
    lines.push(line);
  }
  const complete = cursor === words.length;
  if (!complete) lines[lines.length - 1] = ellipsis(`${lines.at(-1)} ${words.slice(cursor).join(" ")}`, maximumWidth, measure).lines[0];
  return { lines, complete };
}

function shiftRect(value, delta) {
  if (!value) return value;
  return { ...value, top: value.top + delta, bottom: value.bottom + delta };
}

function shiftLayout(source, height, delta) {
  const text = { ...(source.text ?? {}) };
  for (const key of ["xLabelY", "xLabelBaselineY", "xTickY", "xTickBaselineY"]) if (typeof text[key] === "number") text[key] += delta;
  const annotationBounds = source.annotationBounds ? {
    ...source.annotationBounds,
    plot: shiftRect(source.annotationBounds.plot, delta),
    xTicks: shiftRect(source.annotationBounds.xTicks, delta),
    xTitle: shiftRect(source.annotationBounds.xTitle, delta),
    provenance: shiftRect(source.annotationBounds.provenance, delta),
    yTicks: shiftRect(source.annotationBounds.yTicks, delta),
    yTitle: shiftRect(source.annotationBounds.yTitle, delta),
  } : null;
  return {
    ...source,
    height,
    rect: { ...source.rect, bottom: source.rect.bottom + delta },
    plot: shiftRect(source.plot, delta),
    text,
    provenance: source.provenance ? { ...source.provenance, y: source.provenance.y + delta } : null,
    legend: source.legend ? { ...source.legend, top: source.legend.top + delta, bottom: source.legend.bottom + delta } : null,
    annotationBounds,
  };
}

function headerPlan(panel, measureText, availableExtra, negotiated) {
  const { layout, spec } = panel;
  const maximumWidth = Math.max(1, layout.plot.right - layout.plot.left);
  const titleMeasure = (text) => metric(measureText, text, layout.font.title, "500");
  const subtitleMeasure = (text) => metric(measureText, text, layout.font.subtitle, "italic");
  const desiredTitle = wrap(spec.title || panel.renderer, maximumWidth, 2, titleMeasure);
  const desiredSubtitle = spec.subtitle ? wrap(spec.subtitle, maximumWidth, 2, subtitleMeasure) : { lines: [], complete: true };
  const titleLineHeight = layout.font.title * 1.22;
  const subtitleLineHeight = layout.font.subtitle * 1.35;
  const desiredExtra = (desiredTitle.lines.length - 1) * titleLineHeight + Math.max(0, desiredSubtitle.lines.length - 1) * subtitleLineHeight;
  const titleBaseline = layout.text?.titleY ?? Math.max(layout.font.title + 8, layout.plot.top * 0.52);
  const baseSubtitleBaseline = layout.text?.subtitleY ?? Math.max(layout.font.title + layout.font.subtitle + 14, layout.plot.top * 0.73);
  let title = desiredTitle;
  let subtitle = desiredSubtitle;
  let policy = negotiated && availableExtra + 0.01 >= desiredExtra ? "B" : "C";
  if (policy === "C") {
    subtitle = spec.subtitle ? ellipsis(spec.subtitle, maximumWidth, subtitleMeasure) : { lines: [], complete: true };
    if (title.lines.length > 1) {
      const subtitleBaseline = baseSubtitleBaseline + titleLineHeight;
      const subtitleDescent = layout.font.subtitle * 0.22;
      if (subtitle.lines.length && subtitleBaseline + subtitleDescent > layout.plot.top + availableExtra) title = ellipsis(spec.title || panel.renderer, maximumWidth, titleMeasure);
    }
  }
  const subtitleBaseline = baseSubtitleBaseline + Math.max(0, title.lines.length - 1) * titleLineHeight;
  return {
    policy,
    desiredExtra,
    title: { ...title, lineHeight: titleLineHeight, baselines: title.lines.map((_, index) => titleBaseline + index * titleLineHeight) },
    subtitle: { ...subtitle, lineHeight: subtitleLineHeight, baselines: subtitle.lines.map((_, index) => subtitleBaseline + index * subtitleLineHeight) },
  };
}

export function fixedResponsiveHeader(panel, measureText) {
  return headerPlan(panel, measureText, 0, false);
}

/** Internal live-Canvas layout policy. Fixed SVG serialization reuses only the C text plan. */
export function resolveResponsiveCanvasScene(scene, options = {}) {
  const width = options.width;
  const height = options.height;
  const baselineHeight = finitePositive(options.baselineHeight) ? options.baselineHeight : null;
  const compactSingle = width <= RESPONSIVE_HEADER_MAX_WIDTH && scene.panels.length === 1 && scene.theme.mode !== "paper";
  if (!compactSingle) {
    const layoutHeight = baselineHeight != null && height >= baselineHeight ? baselineHeight : height;
    const baseline = resolveTerminalScene(scene, { width, height: layoutHeight, measureText: options.measureText });
    const rootLayout = layoutHeight === height ? null : {
      ...baseline.layout,
      height,
      panels: baseline.panels.map((panel) => panel.layout),
    };
    const resolved = rootLayout
      ? resolveTerminalScene(scene, { width, height, measureText: options.measureText, layout: rootLayout, refineLayout: false })
      : baseline;
    return { resolved, preferredHeight: baselineHeight, baselineHeight, header: null };
  }

  const layoutHeight = baselineHeight ?? height;
  const baseline = resolveTerminalScene(scene, { width, height: layoutHeight, measureText: options.measureText });
  const availableExtra = baselineHeight ? Math.max(0, height - baselineHeight) : 0;
  const desiredPlan = headerPlan(baseline.panels[0], options.measureText, availableExtra, baselineHeight != null);
  const preferredHeight = baselineHeight == null ? null : baselineHeight + Math.ceil(desiredPlan.desiredExtra);
  // A host may clamp below its own intrinsic baseline. In that degraded case the
  // fixed-height C policy must resolve against the real canvas, rather than let
  // baseline geometry extend beyond the available field.
  const belowBaseline = baselineHeight != null && height < baselineHeight;
  const renderedBase = belowBaseline
    ? resolveTerminalScene(scene, { width, height, measureText: options.measureText })
    : baseline;
  const delta = baselineHeight == null || belowBaseline ? 0 : Math.max(0, height - baselineHeight);
  const panelLayout = shiftLayout(renderedBase.panels[0].layout, height, delta);
  const plan = headerPlan({ ...renderedBase.panels[0], layout: panelLayout }, options.measureText, delta, baselineHeight != null && !belowBaseline);
  panelLayout.headerText = Object.freeze({
    policy: plan.policy,
    baselineHeight,
    preferredHeight,
    appliedExtra: delta,
    desiredExtra: desiredPlan.desiredExtra,
    title: plan.title,
    subtitle: plan.subtitle,
  });
  const rootLayout = {
    ...renderedBase.layout,
    height,
    plot: shiftRect(renderedBase.layout.plot, delta),
    provenance: renderedBase.layout.provenance ? { ...renderedBase.layout.provenance, y: renderedBase.layout.provenance.y + delta } : null,
    panels: [panelLayout],
  };
  const resolved = resolveTerminalScene(scene, { width, height, measureText: options.measureText, layout: rootLayout, refineLayout: false });
  return { resolved, preferredHeight, baselineHeight, header: resolved.panels[0].layout.headerText };
}
