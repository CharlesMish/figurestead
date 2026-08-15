import {
  FiguresteadConfigError,
  createFigurestead,
  type CreateFiguresteadOptions,
  type FiguresteadState,
} from "@figurestead/web";
import { lineContract } from "./shared.js";

// @valid-case controller options and methods
const options: CreateFiguresteadOptions = {
  reducedMotion: null,
  accessibility: { visible: false, table: true },
  autoplay: false,
  dprCap: 2,
  onProgress(progress) { progress.toFixed(2); },
  onState(state) { state.toUpperCase(); },
  onError(error, context) { String(error); context.phase; context.progress.toFixed(2); },
};
declare const canvas: HTMLCanvasElement;
const figure = createFigurestead(canvas, lineContract, options);
figure.play();
figure.pause();
figure.replay();
figure.setReducedMotion(true);
figure.setConfig(lineContract);
figure.setData(lineContract.panels[0].data);
figure.resize();
figure.getScene();
figure.getResolvedScene();
figure.getComposedScene();
figure.getFinalCoordinates();
const state: FiguresteadState = figure.getState();
state.runtimeFailed;
figure.destroy();

const error = new FiguresteadConfigError("bad value", "config.panels[0]");
error.path.toUpperCase();
