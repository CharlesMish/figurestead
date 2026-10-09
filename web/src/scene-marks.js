import { FiguresteadConfigError } from "./schema.js";

/** The complete vocabulary of terminal and resolved scene marks. */
export const MARK_KINDS = Object.freeze([
  "point", "segment", "summary-line", "bar", "cell", "interval",
  "median-rule", "connector", "reference-band", "baseline-rule", "row-band",
  "rug", "temporal-bar", "renderer-mark",
]);

const knownKinds = new Set(MARK_KINDS);

/**
 * Check the discriminator only. Coordinate/data validation remains authoritative
 * in the renderer and contract validators; this does not assert a full Mark.
 * @template T
 * @param {T} mark
 * @param {string} [path]
 * @returns {asserts mark is T & { kind: import("../types/index.js").MarkKind }}
 */
export function assertMarkKind(mark, path = "mark") {
  const kind = mark && typeof mark === "object" && "kind" in mark ? mark.kind : undefined;
  if (typeof kind !== "string" || !knownKinds.has(kind)) {
    throw new FiguresteadConfigError(`unknown scene mark kind ${String(kind)}`, `${path}.kind`);
  }
}
