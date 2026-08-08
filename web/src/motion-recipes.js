import { cloneValue } from "./schema.js";

export const MOTION_RECIPE_VERSION = "figurestead.motion-recipe/1";
const MOTION_VALUES = new Set(["none", "semantic", "legacy"]);
const AMBIENT_VALUES = new Set(["none", "matrix"]);
const STRATEGY_VALUES = new Set(["auto", "none", "reveal", "points_then_connect", "bar_grow", "matrix_illuminate"]);

export const MOTION_RECIPES = Object.freeze({
  static: Object.freeze({ key: "static", name: "Static", motion: "none", ambient: "none", strategy: "none", durationMs: 1, lightingPeak: 0 }),
  restrained: Object.freeze({ key: "restrained", name: "Restrained", motion: "semantic", ambient: "none", strategy: "auto", durationMs: 1800, lightingPeak: 0.035 }),
  expressive: Object.freeze({ key: "expressive", name: "Expressive", motion: "semantic", ambient: "none", strategy: "auto", durationMs: 2800, lightingPeak: 0.075 }),
  matrix_origin: Object.freeze({ key: "matrix_origin", name: "Matrix origin", motion: "semantic", ambient: "matrix", strategy: "auto", durationMs: 3200, lightingPeak: 0.08 }),
});

export function resolveMotionRecipe(value = "restrained") {
  const recipe = typeof value === "string" ? MOTION_RECIPES[value] : value;
  if (!recipe || typeof recipe !== "object") throw new TypeError(`unknown motion recipe; choose ${Object.keys(MOTION_RECIPES).join(", ")}`);
  for (const key of ["key", "motion", "ambient", "strategy"]) if (typeof recipe[key] !== "string" || !recipe[key]) throw new TypeError(`motion recipe ${key} must be a non-empty string`);
  if (!MOTION_VALUES.has(recipe.motion)) throw new TypeError(`motion recipe motion must be one of ${[...MOTION_VALUES].join(", ")}`);
  if (!AMBIENT_VALUES.has(recipe.ambient)) throw new TypeError(`motion recipe ambient must be one of ${[...AMBIENT_VALUES].join(", ")}`);
  if (!STRATEGY_VALUES.has(recipe.strategy)) throw new TypeError(`motion recipe strategy is unsupported`);
  if (!Number.isFinite(recipe.durationMs) || recipe.durationMs <= 0) throw new TypeError("motion recipe durationMs must be a positive finite number");
  if (!Number.isFinite(recipe.lightingPeak) || recipe.lightingPeak < 0 || recipe.lightingPeak > 1) throw new TypeError("motion recipe lightingPeak must be between 0 and 1");
  return Object.freeze({ ...recipe });
}

export function applyMotionRecipe(input, recipe = "restrained") {
  const result = cloneValue(input), value = resolveMotionRecipe(recipe);
  if (!result || typeof result !== "object" || !result.motion || typeof result.motion !== "object" || Array.isArray(result.motion)) {
    throw new TypeError("applyMotionRecipe requires a Figurestead contract with a motion object");
  }
  result.view = { ...(result.view ?? {}), motion: value.motion, ambient: value.ambient, strategy: value.strategy };
  result.motion = {
    ...result.motion,
    durationMs: value.durationMs,
    lightingPeak: value.lightingPeak,
  };
  return result;
}
