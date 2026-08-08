import { cloneValue, FiguresteadConfigError } from "./schema.js";

export const APPLICATION_PROFILE_VERSION = "figurestead.application-profile/1";

const BUILT_INS = {
  paper: {
    key: "paper", name: "Paper", surface: "neutral", density: "compact",
    typography: "publication", legend: "outside", ambient: "none", motion: "none",
    lineWidth: 1.55, markerScale: 0.92, panelSurface: false, frame: false,
  },
  atlas: {
    key: "atlas", name: "Atlas", surface: "themed", density: "balanced",
    typography: "scientific", legend: "auto", ambient: "none", motion: "semantic",
    lineWidth: 2.15, markerScale: 1.12, panelSurface: true, frame: true,
  },
  talk: {
    key: "talk", name: "Talk", surface: "themed", density: "open",
    typography: "display", legend: "auto", ambient: "none", motion: "semantic",
    lineWidth: 2.75, markerScale: 1.34, panelSurface: true, frame: true,
  },
};

export const APPLICATION_PROFILES = Object.freeze(Object.fromEntries(
  Object.entries(BUILT_INS).map(([key, value]) => [key, Object.freeze(value)]),
));

export function resolveApplicationProfile(value = "atlas") {
  const source = typeof value === "string" ? APPLICATION_PROFILES[value] : value;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new FiguresteadConfigError(`unknown application profile; choose ${Object.keys(APPLICATION_PROFILES).join(", ")}`, "config.view.profile");
  }
  const key = source.key;
  if (!APPLICATION_PROFILES[key] && typeof value === "string") {
    throw new FiguresteadConfigError(`unknown application profile; choose ${Object.keys(APPLICATION_PROFILES).join(", ")}`, "config.view.profile");
  }
  for (const token of ["key", "name", "surface", "density", "typography", "legend", "ambient", "motion"]) {
    if (typeof source[token] !== "string" || !source[token]) throw new FiguresteadConfigError("must be a non-empty string", `config.view.profile.${token}`);
  }
  for (const token of ["lineWidth", "markerScale"]) {
    if (!Number.isFinite(source[token]) || source[token] <= 0) throw new FiguresteadConfigError("must be a positive number", `config.view.profile.${token}`);
  }
  for (const token of ["panelSurface", "frame"]) {
    if (typeof source[token] !== "boolean") throw new FiguresteadConfigError("must be boolean", `config.view.profile.${token}`);
  }
  return Object.freeze(cloneValue(source));
}

export function applyApplicationProfile(input, profile = "atlas", options = {}) {
  const result = cloneValue(input), resolved = resolveApplicationProfile(profile);
  const previous = resolveApplicationProfile(result.view?.profile ?? "atlas");
  const previousPresentation = {
    panelSurface: previous.panelSurface, frame: previous.frame,
    legend: previous.legend === "outside" ? "outside-right" : previous.legend === "auto" ? "auto" : "bottom-right",
    lineWidth: previous.lineWidth, markerScale: previous.markerScale,
  };
  const motion = options.motion ?? resolved.motion;
  const ambient = options.ambient ?? resolved.ambient;
  result.view = {
    profile: resolved.key,
    motion,
    ambient,
    strategy: options.strategy ?? (motion === "semantic" ? "auto" : "none"),
  };
  result.panels = result.panels.map((panel) => {
    const overrides = Object.fromEntries(Object.entries(panel.presentation ?? {}).filter(([key, value]) => previousPresentation[key] !== value));
    return { ...panel, presentation: {
      panelSurface: resolved.panelSurface,
      frame: resolved.frame,
      legend: options.legend ?? (resolved.legend === "outside" ? "outside-right" : resolved.legend === "auto" ? "auto" : "bottom-right"),
      lineWidth: resolved.lineWidth,
      markerScale: resolved.markerScale,
      ...overrides,
    } };
  });
  return result;
}
