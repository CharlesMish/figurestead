import { FiguresteadConfigError } from "./schema.js";

const finite = (value) => typeof value === "number" && Number.isFinite(value);

function numericCoordinate(axis, value, path, values) {
  if (finite(value)) values.push({ axis, value, path });
}

function timeCoordinate(axis, value, path, values) {
  const parsed = finite(value) ? value : Date.parse(value);
  if (Number.isFinite(parsed)) values.push({ axis, value: parsed, path });
}

function coordinate(axis, value, path, panel, values) {
  if (panel.scales?.[axis]?.type === "time") timeCoordinate(axis, value, path, values);
  else numericCoordinate(axis, value, path, values);
}

function markCoordinates(panel, mark) {
  const values = [], base = `panels.${panel.id}.marks.${mark.id}`;
  if (mark.kind === "point") {
    coordinate("x", mark.x, `${base}.x`, panel, values);
    coordinate("y", mark.y, `${base}.y`, panel, values);
  } else if (mark.kind === "bar") {
    const axis = mark.orientation === "horizontal" ? "x" : "y";
    numericCoordinate(axis, 0, `${base}.baseline`, values);
    if (!mark.missing) numericCoordinate(axis, mark.value, `${base}.value`, values);
  } else if (mark.kind === "interval") {
    numericCoordinate("x", mark.low, `${base}.low`, values);
    numericCoordinate("x", mark.high, `${base}.high`, values);
    numericCoordinate("x", mark.observed, `${base}.observed`, values);
  } else if (mark.kind === "connector") {
    numericCoordinate("x", mark.x1, `${base}.x1`, values);
    numericCoordinate("x", mark.x2, `${base}.x2`, values);
  } else if (mark.kind === "reference-band") {
    numericCoordinate("y", mark.from, `${base}.from`, values);
    numericCoordinate("y", mark.to, `${base}.to`, values);
  } else if (mark.kind === "baseline-rule") {
    numericCoordinate("x", mark.x, `${base}.x`, values);
  } else if (mark.kind === "rug") {
    coordinate("x", mark.x, `${base}.x`, panel, values);
  } else if (mark.kind === "temporal-bar") {
    coordinate("x", mark.xFrom, `${base}.xFrom`, panel, values);
    coordinate("x", mark.xTo, `${base}.xTo`, panel, values);
  } else if (mark.kind === "median-rule") {
    numericCoordinate("y", mark.y, `${base}.y`, values);
  }
  // Segments repeat validated point evidence. Summary/model geometry and curve
  // control points are renderer output and may honestly require clipping.
  return values;
}

function normalizedDomain(panel, axis) {
  const value = panel.domain?.[axis];
  if (!Array.isArray(value) || value.length !== 2) return null;
  if (panel.scales?.[axis]?.type !== "time") return value;
  return value.map((item) => finite(item) ? item : Date.parse(item));
}

export function validateEvidenceCoverage(panels) {
  const findings = [];
  panels.forEach((panel) => {
    panel.marks.forEach((mark) => markCoordinates(panel, mark).forEach((item) => {
      const domain = normalizedDomain(panel, item.axis);
      if (!domain || !domain.every(Number.isFinite)) return;
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
  return Object.freeze({ clean: true, checkedPanels: panels.length, findings: Object.freeze(findings) });
}
