import { FiguresteadConfigError } from "./schema.js";
import { assertMarkKind } from "./scene-marks.js";

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const timestamp = (value) => finite(value) ? value : value instanceof Date ? value.getTime()
  : typeof value === "string" ? Date.parse(value) : NaN;

function numericCoordinate(axis, value, path, values) {
  if (!finite(value)) throw new FiguresteadConfigError("evidence coordinate must be a finite number", path);
  values.push({ axis, value, path });
}

function timeCoordinate(axis, value, path, values) {
  const parsed = timestamp(value);
  if (!Number.isFinite(parsed)) throw new FiguresteadConfigError("evidence coordinate must be a finite timestamp, valid Date or date string", path);
  values.push({ axis, value: parsed, path });
}

function coordinate(axis, value, path, panel, values) {
  if (panel.scales?.[axis]?.type === "band") {
    const categories = panel.categories?.[axis];
    if (value == null || !Array.isArray(categories) || !categories.some((item) => String(item) === String(value))) {
      throw new FiguresteadConfigError(`evidence category ${String(value)} falls outside ${axis} categories; clipping may not hide evidence`, path);
    }
  } else if (panel.scales?.[axis]?.type === "time") timeCoordinate(axis, value, path, values);
  else numericCoordinate(axis, value, path, values);
}

function pointCoordinates(panel, point, base, values, optional = false) {
  const xKey = panel.scales?.x?.type === "band" && point.group != null ? "group" : "x";
  const yKey = panel.scales?.y?.type === "band" && point.yCategory != null ? "yCategory" : "y";
  let checked = 0;
  for (const [axis, key] of [["x", xKey], ["y", yKey]]) {
    if (optional && !Object.hasOwn(point, key)) continue;
    coordinate(axis, point[key], `${base}.${key}`, panel, values);
    checked += 1;
  }
  return checked === 2;
}

function markCoordinates(panel, mark, uncheckedMarks, path) {
  assertMarkKind(mark, path);
  const values = [], base = `panels.${panel.id}.marks.${mark.id}`;
  if (mark.kind === "point") {
    pointCoordinates(panel, mark, base, values);
  } else if (mark.kind === "segment") {
    // Endpoints are evidence even when a caller provides a scene directly.
    // Derived curve control points may honestly extend beyond the data frame.
    pointCoordinates(panel, mark.from ?? {}, `${base}.from`, values);
    pointCoordinates(panel, mark.to ?? {}, `${base}.to`, values);
  } else if (mark.kind === "summary-line") {
    // Model predictions are not observations and may legitimately be clipped.
    for (const key of ["slope", "intercept"]) {
      if (!finite(mark[key])) throw new FiguresteadConfigError("model coefficient must be finite", `${base}.${key}`);
    }
  } else if (mark.kind === "bar") {
    const axis = mark.orientation === "horizontal" ? "x" : "y";
    coordinate(axis === "x" ? "y" : "x", mark.category, `${base}.category`, panel, values);
    numericCoordinate(axis, 0, `${base}.baseline`, values);
    if (!mark.missing) numericCoordinate(axis, mark.value, `${base}.value`, values);
  } else if (mark.kind === "cell") {
    coordinate("x", mark.xCategory, `${base}.xCategory`, panel, values);
    coordinate("y", mark.yCategory, `${base}.yCategory`, panel, values);
  } else if (mark.kind === "renderer-mark") {
    // A registered custom renderer owns arbitrary prepared data and drawing.
    // Inspect its conventional point coordinates when present, but never claim
    // complete coverage for opaque evidence that the shared checker cannot read.
    const evidence = mark.evidence;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)
        || !pointCoordinates(panel, evidence, `${base}.evidence`, values, true)) {
      uncheckedMarks.push(Object.freeze({ panelId: panel.id, markId: mark.id, reason: "custom-renderer-evidence" }));
    }
  } else if (mark.kind === "interval") {
    coordinate("y", mark.category, `${base}.category`, panel, values);
    numericCoordinate("x", mark.low, `${base}.low`, values);
    numericCoordinate("x", mark.high, `${base}.high`, values);
    if (mark.observed != null) numericCoordinate("x", mark.observed, `${base}.observed`, values);
  } else if (mark.kind === "connector") {
    coordinate("y", mark.yCategory, `${base}.yCategory`, panel, values);
    numericCoordinate("x", mark.x1, `${base}.x1`, values);
    numericCoordinate("x", mark.x2, `${base}.x2`, values);
  } else if (mark.kind === "reference-band") {
    numericCoordinate("y", mark.from, `${base}.from`, values);
    numericCoordinate("y", mark.to, `${base}.to`, values);
  } else if (mark.kind === "baseline-rule") {
    numericCoordinate("x", mark.x, `${base}.x`, values);
  } else if (mark.kind === "row-band") {
    coordinate("y", mark.categoryFrom, `${base}.categoryFrom`, panel, values);
    coordinate("y", mark.categoryTo, `${base}.categoryTo`, panel, values);
  } else if (mark.kind === "rug") {
    coordinate("x", mark.x, `${base}.x`, panel, values);
    coordinate("y", mark.yCategory, `${base}.yCategory`, panel, values);
  } else if (mark.kind === "temporal-bar") {
    coordinate("x", mark.xFrom, `${base}.xFrom`, panel, values);
    coordinate("x", mark.xTo, `${base}.xTo`, panel, values);
  } else if (mark.kind === "median-rule") {
    coordinate("x", mark.group, `${base}.group`, panel, values);
    numericCoordinate("y", mark.y, `${base}.y`, values);
  } else {
    throw new FiguresteadConfigError(`scene mark kind ${mark.kind} has no evidence coverage policy`, `${path}.kind`);
  }
  return values;
}

function normalizedDomain(panel, axis) {
  const value = panel.domain?.[axis];
  if (!Array.isArray(value) || value.length !== 2) return null;
  if (panel.scales?.[axis]?.type !== "time") return value;
  return value.map(timestamp);
}

export function validateEvidenceCoverage(panels) {
  const findings = [], uncheckedMarks = [];
  panels.forEach((panel, panelIndex) => {
    panel.marks.forEach((mark, markIndex) => markCoordinates(panel, mark, uncheckedMarks,
      `panels[${panelIndex}].marks[${markIndex}]`).forEach((item) => {
      const domain = normalizedDomain(panel, item.axis);
      if (!domain || !domain.every(Number.isFinite)) {
        throw new FiguresteadConfigError(`evidence coverage requires a finite ${item.axis} domain`, `panels.${panel.id}.domain.${item.axis}`);
      }
      if (item.value < domain[0] || item.value > domain[1]) findings.push({
        panelId: panel.id, markId: mark.id, axis: item.axis, value: item.value,
        domain: [...domain], path: item.path,
      });
    }));
  });
  if (findings.length) {
    const first = findings[0];
    throw new FiguresteadConfigError(
      `evidence value ${first.value} falls outside ${first.axis} domain [${first.domain.join(", ")}]; clipping may not hide evidence`,
      first.path,
    );
  }
  const complete = uncheckedMarks.length === 0;
  return Object.freeze({ clean: complete, complete, checkedPanels: panels.length,
    findings: Object.freeze(findings), uncheckedMarks: Object.freeze(uncheckedMarks) });
}
