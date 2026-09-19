import { createFigurestead } from "@figurestead/web";
import { makeContract } from "./contract.js";
const figure = createFigurestead(document.querySelector("canvas"), makeContract(false),
  { autoplay: false, reducedMotion: true });
document.querySelector("input").addEventListener("change", event => {
  figure.setConfig(makeContract(event.target.checked));
});
