import type {
  FiguresteadContract,
  FiguresteadMotion,
  FiguresteadProfile,
  FiguresteadStyle,
  FiguresteadTheme,
  FiguresteadTimeline,
} from "@figurestead/web";

export const theme: FiguresteadTheme = {
  key: "consumer",
  name: "Consumer",
  field: "#E0D3C4",
  panel: "#FAF5EE",
  grid: "#DCD1C2",
  spine: "#6E6055",
  label: "#2B2320",
  secondary: "#6B5D53",
  faint: "#9C8F84",
  primary: "#1B4C8A",
  summaryCore: "#0E0A08",
  warm: "#B4552A",
  series: ["#1B4C8A", "#143F33", "#0E766E"],
};

export const profile: FiguresteadProfile = {
  key: "consumer",
  name: "Consumer",
  marker: "ring_core",
  markerSize: 42,
  markerAlpha: 0.84,
  edgeWidth: 1.05,
  coreFraction: 0.12,
  pointGlow: false,
  gridX: true,
  gridY: true,
  gridAlpha: 0.4,
  summaryGlow: false,
};

export const timeline: FiguresteadTimeline = {
  rainIn: [0, 0],
  marksEnter: [0, 1],
  summaryCompiles: [0.8, 1],
  rainOut: [0, 0],
  settle: [0.9, 1],
};

export const motion: FiguresteadMotion = {
  frames: 1,
  fps: 1,
  rainStreams: 0,
  rainGlyphs: 0,
  lightingPeak: 0,
  trailAlpha: 0,
  seed: 1,
  durationMs: 1,
};

export const style: FiguresteadStyle = {
  glyphs: ["ring", "square", "triangle", "diamond"],
  lineStyles: ["solid", "dash", "dot", "dash-dot"],
  series: {},
};

export const lineContract = {
  schemaVersion: "0.4",
  rendererApiVersion: "1",
  theme,
  profile,
  timeline,
  motion,
  style,
  spec: { title: "Packed TypeScript first success", xLabel: "observation", yLabel: "response" },
  layout: { type: "grid", columns: 1, gap: 18, sharedX: false, sharedY: false },
  view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
  panels: [{
    id: "line",
    renderer: "line",
    spec: { title: "Packed TypeScript first success", xLabel: "observation", yLabel: "response" },
    xScale: { type: "linear" },
    yScale: { type: "linear" },
    annotations: [],
    encoding: { interpolation: "linear" },
    presentation: { panelSurface: true, frame: true, legend: "none", lineWidth: 2, markerScale: 1 },
    data: { x: [0, 1, 2], revealOrder: "x", series: [{ key: "series-1", label: "Series 1", y: [0, 1, 0] }] },
  }],
} satisfies FiguresteadContract;
