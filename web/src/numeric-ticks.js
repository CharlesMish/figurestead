import { FiguresteadConfigError } from "./schema.js";

// UTC ISO text can wrap at its date/time boundary without dropping any
// component. Joining the painted lines reproduces the resolved label exactly.
export function numericTickLines(tick, type) {
  const split = type === "time" ? tick.label.indexOf("T") : -1;
  return split < 0 ? [tick.label] : [tick.label.slice(0, split + 1), tick.label.slice(split + 1)];
}

export function numericTickMetric(tick, type, measure) {
  const lines = numericTickLines(tick, type), metrics = lines.map(measure);
  const lineHeight = Math.max(...metrics.map(m => Math.max(m.height, (m.fontAscent ?? m.ascent) + (m.fontDescent ?? m.descent))));
  return { lines, metrics, width: Math.max(...metrics.map(m => m.width)),
    height: lines.length === 1 ? metrics[0].height : lineHeight * lines.length,
    ascent: metrics[0].ascent, lineHeight };
}

function capacity(panelId, axis) {
  throw new FiguresteadConfigError(`insufficient ${axis} numeric tick space; enlarge the figure to preserve complete tick labels`, `panels.${panelId}.layout`);
}

// Resolve after the final layout/header/direct-label allocation. Numeric text
// never enters either painter's categorical/legend abbreviation machinery.
export function resolveNumericTickDisplays(axes, layout, panelId, measure) {
  const { rect, scale } = layout, outer = Math.max(2, 4 * scale), gap = 2 * scale;
  const resolve = (axis) => {
    const type = axes[`${axis}Type`], ticks = axes[`${axis}Ticks`];
    if (type === "band") return ticks;
    const result = ticks.map(tick => {
      const m = numericTickMetric(tick, type, measure), anchor = axes[axis](tick.value);
      let align = axis === "x" ? "middle" : "end";
      const x = axis === "x" ? anchor : axes.plot.left - (layout.numericTickGap ?? 7) * scale;
      if (axis === "x") {
        if (x - m.width / 2 < rect.left + outer) align = "start";
        else if (x + m.width / 2 > rect.right - outer) align = "end";
      }
      const lines = m.lines.map((text, i) => {
        const metric = m.metrics[i], shift = align === "middle" ? metric.width / 2 : align === "end" ? metric.width : 0;
        const y = axis === "x" ? layout.text.xTickY + i * m.lineHeight : anchor + (i - (m.lines.length - 1) / 2) * m.lineHeight;
        return { text, x, y, svgY: axis === "x" ? layout.text.xTickBaselineY + i * m.lineHeight : y,
          bounds: { left: x - shift - (metric.left ?? 0), right: x - shift + (metric.right ?? metric.width),
            top: axis === "x" ? y : y - m.lineHeight / 2,
            bottom: axis === "x" ? y + m.lineHeight : y + m.lineHeight / 2 } };
      });
      const bounds = { left: Math.min(...lines.map(l => l.bounds.left)), right: Math.max(...lines.map(l => l.bounds.right)),
        top: Math.min(...lines.map(l => l.bounds.top)), bottom: Math.max(...lines.map(l => l.bounds.bottom)) };
      if (bounds.left < rect.left || bounds.right > rect.right) return capacity(panelId, axis);
      if (m.lines.length > 1 && (bounds.top < rect.top || bounds.bottom > rect.bottom)) return capacity(panelId, axis);
      return { ...tick, numericDisplay: { lines, align, bounds } };
    });
    // Repeated coordinates from the separately deferred generator defect are
    // deliberately not deduplicated or reinterpreted by this formatting pass.
    const ordered = [...result].sort((a, b) => axes[axis](a.value) - axes[axis](b.value));
    for (let i = 1; i < ordered.length; i++) {
      const a = ordered[i - 1], b = ordered[i];
      if (a.value === b.value) continue;
      if (axis === "x" && a.numericDisplay.bounds.right + gap > b.numericDisplay.bounds.left) return capacity(panelId, axis);
      // One-line y labels keep the existing vertical layout contract. Extra UTC
      // lines must not introduce new collisions on that axis.
      if (axis === "y" && (a.numericDisplay.lines.length > 1 || b.numericDisplay.lines.length > 1)
          && a.numericDisplay.bounds.bottom + gap > b.numericDisplay.bounds.top) return capacity(panelId, axis);
    }
    return result;
  };
  return { ...axes, xTicks: resolve("x"), yTicks: resolve("y") };
}


export function paintNumericTick(context, tick, axis) {
  const { lines, align } = tick.numericDisplay;
  context.textAlign = align === "start" ? "left" : align === "end" ? "right" : "center";
  context.textBaseline = axis === "x" ? "top" : "middle";
  for (const line of lines) context.fillText(line.text, line.x, line.y);
}
