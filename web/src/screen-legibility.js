import { resolveContrastColor } from "./color-space.js";

export const SCREEN_LEGIBILITY_VERSION = "figurestead.screen-legibility/1";

// Figurestead project floors for browser-rendered evidence. These are not
// assertions of conformance with an external accessibility standard.
export const SCREEN_PROJECT_LEGIBILITY_FLOORS = Object.freeze({
  provenanceContrast: 3.4,
  compactProvenancePx: 9,
});

export function resolveScreenTheme(source) {
  const resolution = resolveContrastColor(
    source.faint,
    source.field,
    SCREEN_PROJECT_LEGIBILITY_FLOORS.provenanceContrast,
  );
  const theme = { ...source, faint: resolution.color };
  return Object.freeze({
    theme: Object.freeze(theme),
    report: Object.freeze({
      schemaVersion: SCREEN_LEGIBILITY_VERSION,
      policy: "Figurestead screen/project legibility floor",
      token: "faint",
      surface: "field",
      minimum: SCREEN_PROJECT_LEGIBILITY_FLOORS.provenanceContrast,
      resolution: Object.freeze({ ...resolution }),
    }),
  });
}
