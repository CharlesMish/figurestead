import {
  MACHADO_SEVERITY_1,
  simulateSrgb,
} from "../../technical-showcase/cvd-simulation.js";

const samples = Object.freeze({
  black: [0, 0, 0],
  white: [1, 1, 1],
  red: [1, 0, 0],
  green: [0, 1, 0],
  blue: [0, 0, 1],
  figure_teal: [0.11372549019607843, 0.40784313725490196, 0.43137254901960786],
  figure_rust: [0.6901960784313725, 0.30980392156862746, 0.17254901960784313],
  mixed_midpoint: [0.27, 0.51, 0.73],
});

const simulations = Object.fromEntries(
  Object.entries(MACHADO_SEVERITY_1).map(([kind, matrix]) => [
    kind,
    Object.fromEntries(
      Object.entries(samples).map(([name, rgb]) => [name, simulateSrgb(rgb, matrix)]),
    ),
  ]),
);

process.stdout.write(`${JSON.stringify({ matrices: MACHADO_SEVERITY_1, samples, simulations }, null, 2)}\n`);
