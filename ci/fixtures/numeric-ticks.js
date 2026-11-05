import { lineIdentityContract } from "./line-identity.js";
const t = Date.UTC(2024, 2, 1);
export const NUMERIC_TICK_CASES = Object.freeze([
  { name: "ordinary", domain: [0, 10] },
  { name: "negative", domain: [-1075, -1025] },
  { name: "zero-crossing", domain: [-.004, .004] },
  { name: "scientific", domain: [.0001025, .0001075] },
  { name: "years", domain: [2000, 2020] },
  { name: "counts", domain: [1025, 1075] },
  { name: "fractional", domain: [.01, .02] },
  { name: "intraday", type: "time", domain: [t, t + 21600000] },
  { name: "midnight", type: "time", domain: [t - 7200000, t + 7200000] },
  { name: "year-boundary", type: "time", domain: [Date.UTC(2023, 11, 31, 22), Date.UTC(2024, 0, 1, 2)] },
  { name: "multiple-years", type: "time", domain: [Date.UTC(2023, 0, 1), Date.UTC(2025, 2, 15)] },
]);
export function numericTickContract(theme, fixture, axis = "x", profile = "atlas") {
  const c = lineIdentityContract(theme), p = c.panels[0];
  c.view.profile = profile;
  c.spec.title = p.spec.title = "Truthful axis ticks";
  c.spec.signature = "figurestead";
  p[`${axis}Scale`] = { type: fixture.type ?? "linear", domain: fixture.domain };
  p.data = { x: axis === "x" ? [...fixture.domain] : [0, 1], revealOrder: "x",
    series: [{ key: "A", label: "A", y: axis === "y" ? [...fixture.domain] : [0, 1] }] };
  return c;
}
