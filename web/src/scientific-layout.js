const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

const DEFAULT_FONT_WIDTH = 0.602;

function fallbackMetric(text, fontSize) {
  return {
    width: String(text).length * fontSize * DEFAULT_FONT_WIDTH,
    ascent: fontSize * 0.78,
    descent: fontSize * 0.22,
  };
}

function normalizedMetric(measureText, text, fontSize) {
  const measured = measureText?.(String(text), fontSize) ?? fallbackMetric(text, fontSize);
  const ascent = measured.ascent ?? measured.actualBoundingBoxAscent ?? fontSize * 0.78;
  const descent = measured.descent ?? measured.actualBoundingBoxDescent ?? fontSize * 0.22;
  return { width: measured.width, ascent, descent, height: ascent + descent };
}

function annotationGaps(scale) {
  return {
    outer: clamp(7 * scale, 4, 10),
    plotTick: clamp(7 * scale, 4, 9),
    tickTitle: clamp(7 * scale, 4, 9),
    titleFooter: clamp(8 * scale, 5, 10),
    yTitleTick: clamp(8 * scale, 5, 10),
  };
}

function xTickDepth(axes, plot, metric) {
  const slot = axes.x.step?.() ?? Math.max(40, (plot.right - plot.left) / Math.max(1, axes.xTicks.length));
  const metrics = axes.xTicks.map((tick) => metric(tick.label));
  const rotate = axes.xType === "band" && metrics.some((value) => value.width > slot * 0.92);
  const depth = metrics.length
    ? Math.max(...metrics.map((value) => rotate ? (value.width + value.height) / Math.sqrt(2) : value.height))
    : 0;
  return { rotate, depth, metrics };
}

/**
 * Internal annotation layout pass. It deliberately consumes resolved tick strings
 * rather than guessing from canvas size. No contract or renderer API is exposed.
 */
export function refineScientificLayout(source, panel, axes, options = {}) {
  const layout = {
    ...source,
    rect: { ...source.rect }, plot: { ...source.plot }, font: { ...source.font },
    text: { ...(source.text ?? {}) }, provenance: source.provenance ? { ...source.provenance } : null,
    legend: source.legend ? { ...source.legend } : null,
  };
  const { rect, font, scale } = layout, gaps = annotationGaps(scale);
  const axisMetric = (text) => normalizedMetric(options.measureText, text, font.axis);
  const signatureMetric = (text) => normalizedMetric(options.measureText, text, font.signature);
  const xTitleMetric = panel.spec.xLabel ? axisMetric(panel.spec.xLabel) : null;
  const yTitleMetric = panel.spec.yLabel ? axisMetric(panel.spec.yLabel) : null;
  const footerMetric = panel.spec.signature ? signatureMetric(panel.spec.signature) : null;
  const hasLocalFooter = Boolean(
    footerMetric && options.themeMode !== "paper" && (layout.panelIndex ?? 0) === 0
    && (!layout.provenance || layout.provenance.y <= rect.bottom)
  );

  const provisionalPlot = { ...layout.plot };
  const xTick = xTickDepth(axes, provisionalPlot, axisMetric);
  const yTickMetrics = axes.yTicks.map((tick) => axisMetric(tick.label));
  const yTickWidth = yTickMetrics.length ? Math.max(...yTickMetrics.map((value) => value.width)) : 0;

  let cursorBottom = rect.bottom - gaps.outer;
  let provenance = null;
  if (hasLocalFooter) {
    const baseline = cursorBottom - footerMetric.descent;
    provenance = {
      left: 0, right: rect.right - gaps.outer, y: baseline,
      bounds: { left: 0, right: 0, top: baseline - footerMetric.ascent, bottom: baseline + footerMetric.descent },
    };
    cursorBottom = provenance.bounds.top - gaps.titleFooter;
  }
  let xTitle = null;
  if (xTitleMetric) {
    xTitle = { left: 0, right: 0, top: cursorBottom - xTitleMetric.height, bottom: cursorBottom };
    cursorBottom = xTitle.top - gaps.tickTitle;
  }
  const xTicks = {
    left: 0, right: 0,
    top: cursorBottom - xTick.depth,
    bottom: cursorBottom,
  };
  const requestedPlotBottom = xTicks.top - gaps.plotTick;
  const availablePlotHeight = Math.max(0, requestedPlotBottom - layout.plot.top);
  const minimumPlotHeight = Math.min(120, availablePlotHeight);
  layout.plot.bottom = Math.max(layout.plot.top + minimumPlotHeight, requestedPlotBottom);

  const yTitleThickness = yTitleMetric?.height ?? 0;
  const requestedPlotLeft = rect.left + gaps.outer + yTitleThickness
    + (yTitleMetric && yTickWidth ? gaps.yTitleTick : 0) + yTickWidth + gaps.plotTick;
  layout.plot.left = Math.min(layout.plot.right - 160, requestedPlotLeft);

  const xCenter = (layout.plot.left + layout.plot.right) / 2;
  xTicks.left = layout.plot.left; xTicks.right = layout.plot.right;
  if (xTitle) {
    xTitle.left = xCenter - xTitleMetric.width / 2;
    xTitle.right = xCenter + xTitleMetric.width / 2;
    layout.text.xLabelY = xTitle.bottom;
    layout.text.xLabelBaselineY = xTitle.top + xTitleMetric.ascent;
  }
  layout.text.xTickY = xTicks.top;
  layout.text.xTickBaselineY = xTicks.top + (xTick.metrics[0]?.ascent ?? font.axis * 0.78);
  layout.text.rotateX = xTick.rotate;

  const yTicks = {
    left: layout.plot.left - gaps.plotTick - yTickWidth,
    right: layout.plot.left - gaps.plotTick,
    top: layout.plot.top, bottom: layout.plot.bottom,
  };
  let yTitle = null;
  if (yTitleMetric) {
    const right = yTicks.left - (yTickWidth ? gaps.yTitleTick : 0);
    yTitle = { left: right - yTitleMetric.height, right, top: layout.plot.top, bottom: layout.plot.bottom };
    layout.text.yLabelX = yTitle.left;
  }

  if (provenance) {
    provenance.left = layout.plot.left;
    provenance.bounds.left = provenance.left;
    provenance.bounds.right = provenance.left + footerMetric.width;
    layout.provenance = { left: provenance.left, right: provenance.right, y: provenance.y };
  } else if (layout.provenance?.y <= rect.bottom) {
    layout.provenance = null;
  }
  if (layout.legend) {
    layout.legend = layout.legend.outside
      ? { ...layout.legend, top: layout.plot.top, bottom: layout.plot.bottom }
      : { ...layout.legend, left: layout.plot.left, right: layout.plot.right, top: layout.plot.top, bottom: layout.plot.bottom };
  }

  layout.annotationBounds = {
    plot: { ...layout.plot }, xTicks, xTitle, provenance: provenance?.bounds ?? null, yTicks, yTitle,
    gaps: {
      plotToXTicks: xTicks.top - layout.plot.bottom,
      xTicksToTitle: xTitle ? xTitle.top - xTicks.bottom : null,
      xTitleToProvenance: xTitle && provenance ? provenance.bounds.top - xTitle.bottom : null,
      xTicksToProvenance: !xTitle && provenance ? provenance.bounds.top - xTicks.bottom : null,
      yTitleToTicks: yTitle ? yTicks.left - yTitle.right : null,
      yTicksToPlot: layout.plot.left - yTicks.right,
    },
    rotateX: xTick.rotate,
  };
  return layout;
}
