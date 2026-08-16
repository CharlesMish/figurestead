import { colorContrast, hexToOklab, resolveContrastColor } from "./color-space.js";
import { resolveScreenTheme } from "./screen-legibility.js";

export const PAPER_PROFILE_VERSION = "figurestead.paper-profile/1";
export const PAPER_FLOORS = Object.freeze({ text: 4.5, evidence: 3, thinEvidenceTarget: 4, pairwiseLightness: 0.1, identityWarning: 0.12 });
export const PAPER_SURFACE = Object.freeze({
  field: "#FFFFFF", panel: "#FBFBF8", grid: "#D9DEDA", spine: "#66736D",
  label: "#17211D", secondary: "#4C5C55", faint: "#727E79",
});

const rounded = (value) => Number(value.toFixed(3));

function resolveRole(source, role, surface, minimum, report) {
  const result = resolveContrastColor(source[role], surface, minimum);
  report.resolutions.push({ token: role, ...result, contrast: rounded(result.contrast), identityDelta: rounded(result.identityDelta), lightnessDelta: rounded(result.lightnessDelta), chromaReduction: rounded(result.chromaReduction), hueDelta: rounded(result.hueDelta) });
  if (result.identityDelta > PAPER_FLOORS.identityWarning) report.findings.push({ level: "warning", code: "palette-identity-loss", token: role, delta: rounded(result.identityDelta) });
  return result.color;
}

export function auditPaperTheme(theme, seriesStyles = null) {
  const findings = [], checks = [];
  for (const token of ["label", "secondary"]) {
    const ratio = colorContrast(theme[token], theme.panel); checks.push({ token, surface: "panel", ratio: rounded(ratio), minimum: PAPER_FLOORS.text });
    if (ratio < PAPER_FLOORS.text) findings.push({ level: "error", code: "contrast", token, surface: "panel", ratio: rounded(ratio), minimum: PAPER_FLOORS.text });
  }
  for (const token of ["primary", "summaryCore", "warm"]) {
    const ratio = colorContrast(theme[token], theme.panel); checks.push({ token, surface: "panel", ratio: rounded(ratio), minimum: PAPER_FLOORS.evidence });
    if (ratio < PAPER_FLOORS.evidence) findings.push({ level: "error", code: "contrast", token, surface: "panel", ratio: rounded(ratio), minimum: PAPER_FLOORS.evidence });
    else if (ratio < PAPER_FLOORS.thinEvidenceTarget) findings.push({ level: "warning", code: "thin-evidence-contrast", token, ratio: rounded(ratio), target: PAPER_FLOORS.thinEvidenceTarget });
  }
  theme.series.forEach((color, index) => {
    const ratio = colorContrast(color, theme.panel); checks.push({ token: `series[${index}]`, surface: "panel", ratio: rounded(ratio), minimum: PAPER_FLOORS.evidence });
    if (ratio < PAPER_FLOORS.evidence) findings.push({ level: "error", code: "contrast", token: `series[${index}]`, surface: "panel", ratio: rounded(ratio), minimum: PAPER_FLOORS.evidence });
  });
  const activeIndexes = seriesStyles
    ? [...new Set(Object.values(seriesStyles).map((item) => item.colorIndex))].sort((a, b) => a - b)
    : theme.series.map((_, index) => index);
  for (let aIndex = 0; aIndex < activeIndexes.length; aIndex += 1) for (let bIndex = aIndex + 1; bIndex < activeIndexes.length; bIndex += 1) {
    const left = activeIndexes[aIndex], right = activeIndexes[bIndex];
    const a = hexToOklab(theme.series[left]), b = hexToOklab(theme.series[right]), deltaL = Math.abs(a.L - b.L);
    const leftStyle = seriesStyles ? Object.values(seriesStyles).find((item) => item.colorIndex === left) : null;
    const rightStyle = seriesStyles ? Object.values(seriesStyles).find((item) => item.colorIndex === right) : null;
    const redundant = Boolean(leftStyle && rightStyle && (leftStyle.glyph !== rightStyle.glyph || leftStyle.lineStyle !== rightStyle.lineStyle || leftStyle.hatch !== rightStyle.hatch));
    if (deltaL < PAPER_FLOORS.pairwiseLightness && !redundant) findings.push({ level: "warning", code: "pairwise-lightness", series: [left, right], deltaL: rounded(deltaL), redundant: false });
  }
  return Object.freeze({ schemaVersion: PAPER_PROFILE_VERSION, clean: findings.every((item) => item.level !== "error"), checks: Object.freeze(checks), findings: Object.freeze(findings) });
}

export function resolvePaperTheme(source) {
  const report = { schemaVersion: PAPER_PROFILE_VERSION, resolutions: [], findings: [] };
  const theme = {
    ...source, ...PAPER_SURFACE, mode: "paper",
    key: source.key.endsWith("-paper") ? source.key : `${source.key}-paper`,
    name: source.name.endsWith(" · Paper") ? source.name : `${source.name} · Paper`,
  };
  theme.primary = resolveRole(source, "primary", theme.panel, PAPER_FLOORS.thinEvidenceTarget, report);
  theme.summaryCore = resolveRole(source, "summaryCore", theme.panel, PAPER_FLOORS.thinEvidenceTarget, report);
  theme.warm = resolveRole(source, "warm", theme.panel, PAPER_FLOORS.evidence, report);
  theme.series = source.series.map((color, index) => {
    const result = resolveContrastColor(color, theme.panel, PAPER_FLOORS.evidence);
    report.resolutions.push({ token: `series[${index}]`, ...result, contrast: rounded(result.contrast), identityDelta: rounded(result.identityDelta), lightnessDelta: rounded(result.lightnessDelta), chromaReduction: rounded(result.chromaReduction), hueDelta: rounded(result.hueDelta) });
    if (result.identityDelta > PAPER_FLOORS.identityWarning) report.findings.push({ level: "warning", code: "palette-identity-loss", token: `series[${index}]`, delta: rounded(result.identityDelta) });
    return result.color;
  });
  if (source.primaryEdge) theme.primaryEdge = resolveContrastColor(source.primaryEdge, theme.panel, PAPER_FLOORS.evidence).color;
  if (source.summaryEdge) theme.summaryEdge = resolveContrastColor(source.summaryEdge, theme.panel, PAPER_FLOORS.evidence).color;
  theme.seriesEdges = (source.seriesEdges ?? theme.series.map(() => PAPER_SURFACE.label)).map((color) => resolveContrastColor(color, theme.panel, PAPER_FLOORS.evidence).color);
  const audit = auditPaperTheme(theme);
  report.findings.push(...audit.findings);
  return Object.freeze({ theme: Object.freeze(theme), report: Object.freeze({ ...report, audit, clean: audit.clean }) });
}

export function themeResolutionForProfile(source, profile = "atlas") {
  const key = typeof profile === "string" ? profile : profile?.key;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  if (key !== "paper") {
    if (source.mode === "paper") return Object.freeze({ theme: clone(source), report: null });
    return resolveScreenTheme(clone(source));
  }
  if (source.mode === "paper") return Object.freeze({ theme: clone(source), report: auditPaperTheme(source) });
  return resolvePaperTheme(source);
}
