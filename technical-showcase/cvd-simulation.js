// Machado, Oliveira & Fernandes (2009/2010), severity-1 anomaly matrices.
// Operates on linear-light sRGB values; alpha is preserved.
export const MACHADO_SEVERITY_1 = Object.freeze({
  protanomaly: Object.freeze([
    Object.freeze([0.152286, 1.052583, -0.204868]),
    Object.freeze([0.114503, 0.786281, 0.099216]),
    Object.freeze([-0.003882, -0.048116, 1.051998]),
  ]),
  deuteranomaly: Object.freeze([
    Object.freeze([0.367322, 0.860646, -0.227968]),
    Object.freeze([0.280085, 0.672501, 0.047413]),
    Object.freeze([-0.011820, 0.042940, 0.968881]),
  ]),
  tritanomalyApproximation: Object.freeze([
    Object.freeze([1.255528, -0.076749, -0.178779]),
    Object.freeze([-0.078411, 0.930809, 0.147602]),
    Object.freeze([0.004733, 0.691367, 0.303900]),
  ]),
});

const clamp01 = (value) => Math.max(0, Math.min(1, value));
export const srgbToLinear = (value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
export const linearToSrgb = (value) => value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;

export function simulateLinearRgb(rgb, matrix) {
  return matrix.map((row) => clamp01(row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]));
}

export function simulateSrgb(rgb, matrix) {
  const linear = rgb.map(srgbToLinear);
  return simulateLinearRgb(linear, matrix).map((value) => clamp01(linearToSrgb(value)));
}

export function simulateImageData(source, matrix) {
  const output = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
  for (let index = 0; index < output.data.length; index += 4) {
    const transformed = simulateSrgb([
      output.data[index] / 255,
      output.data[index + 1] / 255,
      output.data[index + 2] / 255,
    ], matrix);
    output.data[index] = Math.round(transformed[0] * 255);
    output.data[index + 1] = Math.round(transformed[1] * 255);
    output.data[index + 2] = Math.round(transformed[2] * 255);
  }
  return output;
}

export function renderCvdSimulation(sourceCanvas, targetCanvas, matrix) {
  targetCanvas.width = sourceCanvas.width;
  targetCanvas.height = sourceCanvas.height;
  const source = sourceCanvas.getContext("2d").getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  targetCanvas.getContext("2d").putImageData(simulateImageData(source, matrix), 0, 0);
}
