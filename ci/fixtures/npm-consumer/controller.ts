import {
  FiguresteadConfigError,
  createFigurestead,
  type CreateFiguresteadOptions,
  type FiguresteadHeightNegotiationAdapter,
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
  onError(error, context) {
    String(error);
    if (context.phase === "draw") context.progress.toFixed(2);
    else context.operation.toUpperCase();
  },
};

// @valid-case mount-scoped host-height negotiation
const heightNegotiation: FiguresteadHeightNegotiationAdapter = {
  getBaselineHeight({ canvas: target, width, currentHeight }) {
    target.nodeName; width.toFixed(1); currentHeight.toFixed(1);
    return 196;
  },
  requestPreferredHeight({ preferredHeight, baselineHeight, width, signal }) {
    preferredHeight.toFixed(1); baselineHeight.toFixed(1); width.toFixed(1); signal.aborted;
  },
};
options.heightNegotiation = heightNegotiation;

// @negative-case incomplete height negotiation adapter
// @ts-expect-error requestPreferredHeight is required
options.heightNegotiation = { getBaselineHeight: () => 196 };
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
