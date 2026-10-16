// Display-only precision. Preserve distinct facts within a summary, and mark
// rounding explicitly; neither admitted values nor raw table cells are changed.
export function formatFactualValues(values) {
  let precision = 6;
  const compact = (value) => String(Number(value.toPrecision(precision)));
  while (precision < 17) {
    const owners = new Map();
    if (values.every((value) => {
      const text = compact(value);
      if (owners.has(text) && owners.get(text) !== value) return false;
      owners.set(text, value);
      return true;
    })) break;
    precision += 1;
  }
  return values.map((value) => {
    const text = compact(value);
    return Number(text) === value ? text : `approximately ${text}`;
  });
}

export function observedRanges(points) {
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  const [x0, x1, y0, y1] = formatFactualValues([
    Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys),
  ]);
  return `Observed x range ${x0} to ${x1}; observed y range ${y0} to ${y1}.`;
}

// Authored text is context, never an override of current computed facts.
// Notes here are descriptive metadata, not a promise of a painted footer.
export function figureDescription(scene) {
  const parts = [scene.spec.subtitle];
  if (scene.spec.description) parts.push(`Authored context: ${scene.spec.description}`);
  const notes = new Set([scene.spec.note].filter(Boolean));
  for (const panel of scene.panels) {
    if (panel.factualSummary) parts.push(`${scene.panels.length > 1 ? `${panel.spec.title || panel.renderer}: ` : ""}${panel.factualSummary}`);
    if (panel.spec.description && panel.spec.description !== scene.spec.description) parts.push(`Authored panel context: ${panel.spec.description}`);
    for (const note of panel.notes ?? []) if (note) notes.add(note);
  }
  parts.push(...[...notes].map((note) => `Source note: ${note}`));
  return parts.filter(Boolean).join(" ") || "Scientific figure";
}
