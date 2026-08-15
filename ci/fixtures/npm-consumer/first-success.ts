import { createFigurestead, validateContract } from "@figurestead/web";
import { lineContract } from "./shared.js";

// @valid-case accepted browser first success
validateContract(lineContract);
declare const canvas: HTMLCanvasElement;
const figure = createFigurestead(canvas, lineContract, { autoplay: false, reducedMotion: true });
figure.resize();
figure.getState().renderers.join(", ");
