export function lineIdentityContract(theme) {
  return {
    schemaVersion: "0.4", rendererApiVersion: "1", theme,
    profile: { key: "identity", name: "Identity", marker: "ring_core", markerSize: 42, markerAlpha: .84, edgeWidth: 1.05, coreFraction: .12, pointGlow: false, gridX: true, gridY: true, gridAlpha: .4, summaryGlow: false },
    timeline: { rainIn: [0, 0], marksEnter: [0, 1], summaryCompiles: [.8, 1], rainOut: [0, 0], settle: [.9, 1] },
    motion: { frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0, trailAlpha: 0, seed: 1, durationMs: 1 },
    style: { glyphs: ["ring", "square", "triangle", "diamond"], lineStyles: ["solid", "dash", "dot", "dash-dot"], series: {} },
    spec: { title: "Line identity", xLabel: "x", yLabel: "y", signature: "figurestead" },
    layout: { type: "grid", columns: 1, gap: 18, sharedX: false, sharedY: false },
    view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
    panels: [{ id: "line", renderer: "line", spec: { title: "Line identity" },
      xScale: { type: "linear" }, yScale: { type: "linear" }, annotations: [], encoding: { interpolation: "linear" },
      data: { x: [0, 1, 2], revealOrder: "x", series: [
        { key: "S1", label: "S1", y: [1, 1, 1] },
        { key: "S2", label: "S2", y: [2, 2, 2] },
        { key: "S3", label: "S3", y: [3, 3, 3] },
      ] } }],
  };
}
