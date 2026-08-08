import { applyApplicationProfile, resolveApplicationProfile } from "./application-profiles.js";
import { cloneValue } from "./schema.js";
import { applyTheme, resolvePalette, resolveTheme, themeForProfile } from "./theme-pack.js";

export const APPEARANCE_VERSION = "figurestead.appearance/1";

/**
 * Resolve profile and palette/theme choices as one deliberate application step.
 * Scientific data, encodings, domains, notes, and ordering are never rewritten.
 */
export function composeAppearance(input, options = {}) {
  const profile = resolveApplicationProfile(options.profile ?? input.view?.profile ?? "atlas");
  let result = cloneValue(input);
  if (options.palettePack) {
    if (!options.paletteKey) throw new TypeError("composeAppearance requires paletteKey with palettePack");
    result = applyTheme(result, resolvePalette(options.palettePack, options.paletteKey, { mode: options.mode ?? profile.key }).theme);
  } else if (options.themePack) {
    if (!options.themeKey) throw new TypeError("composeAppearance requires themeKey with themePack");
    result = applyTheme(result, resolveTheme(options.themePack, options.themeKey));
  } else if (options.theme) {
    result = applyTheme(result, options.theme);
  }
  result.theme = themeForProfile(result.theme, profile);
  return applyApplicationProfile(result, profile, options);
}
