import { validateContract, type FiguresteadContract } from "@figurestead/web";
import { lineContract, motion, profile, style, theme, timeline } from "./shared.js";

// @valid-case line contract
validateContract(lineContract);

// @valid-case scatter contract with linear fit
const scatter = {
  ...lineContract,
  panels: [{
    id: "scatter",
    renderer: "scatter",
    spec: { title: "Scatter", xLabel: "x", yLabel: "y" },
    data: { x: [0, 1, 2], y: [0, 2, 3], series: ["a", "a", "b"], seriesLabels: { a: "A", b: "B" }, summary: "linear_fit" },
  }],
} satisfies FiguresteadContract;
validateContract(scatter);

// @valid-case strip-summary contract
const strip = {
  schemaVersion: "0.4",
  rendererApiVersion: "1",
  theme,
  profile,
  timeline,
  motion,
  style,
  spec: { title: "Strip summary" },
  layout: { type: "grid", columns: 1, gap: 18, sharedX: false, sharedY: false },
  view: { profile: "atlas", motion: "none", ambient: "none", strategy: "none" },
  panels: [{ renderer: "strip_summary", data: { groups: ["a", "b"], values: [1, 2, 3], group: ["a", "a", "b"], summary: "median" } }],
} satisfies FiguresteadContract;
validateContract(strip);
