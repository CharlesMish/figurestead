import {
  MARK_KINDS, assertMarkKind, compileTerminalScene, partitionPanelMarks,
  resolveTerminalScene, validateEvidenceCoverage,
  type Mark, type MarkKind, type MarkStyle, type PointMark, type RendererMark,
  type ResolvedMark, type TerminalScene, type ResolvedScene, type ComposedScene,
  type FiguresteadContract,
} from "@figurestead/web";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type ExactKindInventory = Assert<Equal<MarkKind, typeof MARK_KINDS[number]>>;
const kindTuple: typeof MARK_KINDS = [
  "point", "segment", "summary-line", "bar", "cell", "interval",
  "median-rule", "connector", "reference-band", "baseline-rule", "row-band",
  "rug", "temporal-bar", "renderer-mark",
];
// @ts-expect-error Runtime MARK_KINDS is frozen and declared readonly.
MARK_KINDS.push("point");
// @ts-expect-error Misspelled kinds are not accepted as semantic marks.
const invalidKind: MarkKind = "medain-rule";

const style: MarkStyle = { color: "#123456", edge: null, lineStyle: "solid" };
const everyKind: { [K in MarkKind]: Extract<Mark, { kind: K }> } = {
  point: { id: "p", kind: "point", series: "a", x: 1, y: 2, style },
  segment: { id: "s", kind: "segment", series: "a", from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, interpolation: "linear", style },
  "summary-line": { id: "fit", kind: "summary-line", role: "model", slope: 2, intercept: 1, style },
  bar: { id: "b", kind: "bar", series: "a", category: "site", value: 3, missing: false, orientation: "vertical", layer: 0, seriesIndex: 0, categoryIndex: 0, style },
  cell: { id: "c", kind: "cell", xCategory: "a", yCategory: "b", value: null, status: "missing", label: "", diagonalMode: "context", style: { ...style, low: "#FFFFFF", high: "#000000" } },
  interval: { id: "i", kind: "interval", category: "a", low: 1, high: 3, style },
  "median-rule": { id: "m", kind: "median-rule", group: "a", y: 2, xOffset1: -.22, xOffset2: .22, style },
  connector: { id: "co", kind: "connector", x1: 1, x2: 3, yCategory: "a", delta: 2, endpointALabel: "Before", endpointBLabel: "After", style },
  "reference-band": { id: "ref", kind: "reference-band", from: 1, to: 3, label: "Reference", status: "provisional", style },
  "baseline-rule": { id: "base", kind: "baseline-rule", x: 0, label: "Baseline", style },
  "row-band": { id: "row", kind: "row-band", categoryFrom: "a", categoryTo: "b", style },
  rug: { id: "r", kind: "rug", series: "a", x: 123456, yCategory: "site", date: "2025-01-01", style },
  "temporal-bar": { id: "tb", kind: "temporal-bar", year: 2025, xFrom: 1, xTo: 2, value: 3, maximum: 4, observationCount: 15, style },
  "renderer-mark": { id: "custom", kind: "renderer-mark", series: "instrument", evidence: { customPayload: ["opaque", 1], units: "m" }, style: null },
};

// Both categorical point forms are emitted/consumed by the shipped adapters.
const strip: PointMark = { id: "strip", kind: "point", series: "a", group: "Site A", xOffset: .12, y: 7, style };
const paired: PointMark = { id: "paired", kind: "point", series: "a", x: 3, yCategory: "Site A", style };
const customPoint: RendererMark = { id: "custom-p", kind: "renderer-mark", series: "a", evidence: { x: 1, y: 2 }, style: null };
// @ts-expect-error A point still requires both coordinate dimensions.
const missingPointY: Mark = { id: "bad-p", kind: "point", series: "a", x: 1, style };
// @ts-expect-error Required segment endpoint cannot be omitted.
const missingSegmentEnd: Mark = { id: "bad-s", kind: "segment", series: "a", from: { x: 1, y: 2 }, interpolation: "linear", style };
// @ts-expect-error Renderer fallback evidence is explicit, not an arbitrary kind.
const missingCustomEvidence: Mark = { id: "bad-r", kind: "renderer-mark", series: "a", style: null };
// @ts-expect-error Numeric coordinates are not coerced from strings by this type.
const invalidCoordinate: Mark = { id: "bad-x", kind: "point", series: "a", x: "1", y: 2, style };

function inspect(mark: Mark): string {
  switch (mark.kind) {
    case "point": return mark.y?.toFixed(1) ?? String(mark.yCategory);
    case "segment": return mark.from.x.toFixed(1);
    case "summary-line": return mark.slope.toFixed(1);
    case "bar": return String(mark.value);
    case "cell": return mark.style.low;
    case "interval": return mark.high.toFixed(1);
    case "median-rule": return mark.xOffset1.toFixed(1);
    case "connector": return mark.endpointALabel;
    case "reference-band": return mark.label;
    case "baseline-rule": return mark.x.toFixed(1);
    case "row-band": return String(mark.categoryTo);
    case "rug": return String(mark.yCategory);
    case "temporal-bar": return mark.maximum.toFixed(1);
    case "renderer-mark": return String(mark.evidence.customPayload);
    default: {
      const exhausted: never = mark;
      return exhausted;
    }
  }
}

declare const candidate: unknown;
assertMarkKind(candidate, "candidate");
const knownKind: MarkKind = candidate.kind;
// @ts-expect-error Discriminator validation does not assert the rest of a Mark.
const falselyValidated: Mark = candidate;

declare const terminal: TerminalScene;
declare const resolved: ResolvedScene;
declare const composed: ComposedScene;
terminal.panels[0].marks.map(inspect);
resolved.panels[0].marks.map(inspect);
composed.panels[0].marks.map(inspect);
const partition = partitionPanelMarks(resolved.panels[0].marks);
const resolvedMark: ResolvedMark = partition.data[0];
if (resolvedMark.kind === "point" && resolvedMark.geometry) resolvedMark.geometry.cx.toFixed(1);
if (resolvedMark.kind === "interval" && resolvedMark.geometry) {
  resolvedMark.geometry.cap.toFixed(1);
  // @ts-expect-error Kind narrowing yields interval rather than point geometry.
  resolvedMark.geometry.cx;
}
// @ts-expect-error Scene arrays are readonly, matching frozen compiled scenes.
terminal.panels[0].marks.push(everyKind.point);
const coverage = validateEvidenceCoverage(terminal.panels);
coverage.complete.valueOf();
coverage.uncheckedMarks.forEach((item) => {
  const reason: "custom-renderer-evidence" = item.reason;
  void reason;
});
declare const contract: FiguresteadContract;
resolveTerminalScene(compileTerminalScene(contract)).panels[0].marks.map(inspect);

// Numeric finiteness and canonical color syntax deliberately remain runtime
// constraints; the TypeScript contract cannot establish those properties.
const runtimeOnly: Mark = { id: "validation", kind: "point", series: "a", x: Number.NaN, y: Infinity, style: { color: "runtime validates this" } };
void [kindTuple, invalidKind, everyKind, strip, paired, customPoint, missingPointY,
  missingSegmentEnd, missingCustomEvidence, invalidCoordinate, knownKind,
  falselyValidated, runtimeOnly];
export type { ExactKindInventory };
