// The two-category Python-exported strip fixture from the accepted Round2 probe.
export const LONG_CATEGORIES = [
  "Baseline Cohort A — Hyperglycemic Arm (Week 0-52)",
  "Follow-up Cohort B — Normoglycemic Arm (Week 53-104)",
];

export function categoryTickContract(theme, groups = LONG_CATEGORIES) {
  return {
    schemaVersion: "0.4", rendererApiVersion: "1", theme,
    profile: { key: "monograph", name: "Monograph", marker: "filled", markerSize: 25, markerAlpha: .7, edgeWidth: 0, coreFraction: 0, pointGlow: false, gridX: false, gridY: true, gridAlpha: .24, summaryGlow: false },
    timeline: { rainIn: [.06, .22], marksEnter: [.18, .72], summaryCompiles: [.68, .84], rainOut: [.7, .92], settle: [.88, 1] },
    motion: { frames: 72, fps: 12, rainStreams: 14, rainGlyphs: 6, lightingPeak: .105, trailAlpha: .17, seed: 73, durationMs: 6000 },
    spec: { title: "Long category ticks", xLabel: "Cohort", yLabel: "Response", signature: "figurestead" },
    layout: { type: "grid", columns: 1, gap: 22, sharedX: false, sharedY: false },
    panels: [{ id: "panel-1", renderer: "strip_summary", spec: {}, xScale: { type: "band" }, yScale: { type: "linear" }, annotations: [], encoding: { interpolation: "linear" },
      data: { groups, group: [groups[0], groups[0], groups[1], groups[1], groups[1]], values: [1, 2, 3, 4, 5], summary: "median" },
      presentation: { panelSurface: false, frame: false, legend: "outside-right", lineWidth: 1.55, markerScale: .92 },
    }],
    view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
  };
}
