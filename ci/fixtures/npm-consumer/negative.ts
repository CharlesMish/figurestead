import { createFigurestead, type CreateFiguresteadOptions, type FiguresteadContract } from "@figurestead/web";
import { lineContract } from "./shared.js";

// @negative-case missing required contract structure
// @ts-expect-error FiguresteadContract requires the full normalized contract structure.
const missingStructure: FiguresteadContract = { schemaVersion: "0.4" };
void missingStructure;

// @negative-case invalid renderer discriminator
const badRenderer: FiguresteadContract = {
  ...lineContract,
  panels: [{
    // @ts-expect-error unknown_renderer is not a core renderer discriminator.
    renderer: "unknown_renderer",
    data: { x: [0], series: [{ key: "a", y: [1] }] },
  }],
};
void badRenderer;

declare const canvas: HTMLCanvasElement;

// @negative-case incorrectly shaped controller option
// @ts-expect-error reducedMotion is boolean or null.
createFigurestead(canvas, lineContract, { reducedMotion: "yes" });

// @negative-case wrong callback signature
const badOptions: CreateFiguresteadOptions = {
  // @ts-expect-error runtime errors are unknown until narrowed by the host.
  onError(error: string) { error.toUpperCase(); },
};
void badOptions;

// @negative-case invalid obvious field type
const badData: FiguresteadContract = {
  ...lineContract,
  panels: [{ renderer: "line", data: {
    // @ts-expect-error line x values are numbers.
    x: ["zero", "one"],
    series: [{ key: "a", y: [0, 1] }],
  } }],
};
void badData;
