const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export const MIN_CANVAS_WIDTH = 320;
export const MIN_CANVAS_HEIGHT = 240;

export function deriveLayout(width, height) {
  const scale = clamp(Math.min(width / 1160, height / 700), 0.55, 1.35);
  const narrow = width <= 480;
  const left = clamp(width * 0.083, 54, 100);
  const right = clamp(width * 0.035, 22, 44);
  const top = clamp(height * 0.154, 72, 112);
  const bottom = clamp(height * 0.137, 58, 98);
  return {
    width,
    height,
    scale,
    plot: { left, right: width - right, top, bottom: height - bottom },
    font: {
      title: clamp(19 * scale, 13, 22),
      subtitle: clamp(12.5 * scale, 9, 14),
      axis: clamp(12 * scale, narrow ? 10 : 9, 13),
      legend: clamp(11.5 * scale, narrow ? 9.5 : 8.5, 13),
      signature: clamp(10 * scale, narrow ? 8 : 7.5, 11),
    },
    provenance: { left, right: width - right, y: height - clamp(12 * scale, 10, 16) },
  };
}

export function resizeCanvas(canvas, { dprCap = 2, layoutFactory = deriveLayout } = {}) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width || canvas.clientWidth || MIN_CANVAS_WIDTH);
  const height = Math.max(1, rect.height || canvas.clientHeight || width * 700 / 1160);
  const dpr = Math.min(dprCap, globalThis.devicePixelRatio || 1);
  const backingWidth = Math.max(1, Math.round(width * dpr));
  const backingHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, layout: layoutFactory(width, height), dpr };
}
