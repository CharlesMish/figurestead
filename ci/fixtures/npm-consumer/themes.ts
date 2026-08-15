import { applyTheme, resolveTheme, validateThemePack } from "@figurestead/web";
import slipwarePack from "@figurestead/web/themes/slipware" with { type: "json" };
import { lineContract } from "./shared.js";

// @valid-case packaged curated theme
const pack = validateThemePack(slipwarePack);
const theme = resolveTheme(pack, "slipware");
const themed = applyTheme(lineContract, theme);
themed.theme.name.toUpperCase();
