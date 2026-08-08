export const PAPER_SIZE_PRESETS = Object.freeze({ "paper-single": 89, "paper-double": 183 });
const MM_PER_INCH = 25.4, CSS_DPI = 96, PT_PER_INCH = 72;

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be a positive finite number`);
  return value;
}

export function resolveExportSize(options = {}) {
  const presetWidth = options.paperSize == null ? null : PAPER_SIZE_PRESETS[options.paperSize];
  if (options.paperSize != null && presetWidth == null) throw new TypeError(`paperSize must be ${Object.keys(PAPER_SIZE_PRESETS).join(" or ")}`);
  const widthMm = options.physicalWidthMm == null ? presetWidth : positive(options.physicalWidthMm, "physicalWidthMm");
  const width = positive(options.width ?? (widthMm ? Math.round(widthMm * CSS_DPI / MM_PER_INCH) : 960), "width");
  const height = positive(options.height ?? Math.max(240, Math.round(width * 0.625)), "height");
  if (!widthMm) return Object.freeze({ width, height, physical: null, widthAttribute: width, heightAttribute: height });
  const heightMm = widthMm * height / width;
  return Object.freeze({
    width, height, widthAttribute: `${rounded(widthMm)}mm`, heightAttribute: `${rounded(heightMm)}mm`,
    physical: Object.freeze({ preset: options.paperSize ?? "custom", widthMm: rounded(widthMm), heightMm: rounded(heightMm), minLabelPt: positive(options.minLabelPt ?? 6, "minLabelPt") }),
  });
}

const rounded = (value) => Number(value.toFixed(3));

export function auditPhysicalTypography(composed, physical) {
  if (!physical) return null;
  const scale = physical.widthMm / composed.width * PT_PER_INCH / MM_PER_INCH;
  const labels = composed.panels.flatMap((panel) => [
    [panel.id, "axis", panel.layout.font.axis], [panel.id, "legend", panel.layout.font.legend],
    [panel.id, "title", panel.layout.font.title], [panel.id, "subtitle", panel.layout.font.subtitle],
  ]).map(([panelId, role, units]) => ({ panelId, role, points: rounded(units * scale) }));
  const minimum = Math.min(...labels.map((item) => item.points));
  return Object.freeze({ clean: minimum >= physical.minLabelPt, minimumPt: minimum, requiredPt: physical.minLabelPt, labels: Object.freeze(labels) });
}
