import { deriveSeed, mulberry32 } from "./random.js";
import { smooth } from "./marks.js";
import { windowProgress } from "./schema.js";

const GLYPHS = [..."0123456789ABCDEFXYZ<>[]{}+=αβ∑∫≈"];

export function prepareAtmosphere(motion) {
  const random = mulberry32(deriveSeed(motion.seed, "atmosphere"));
  return Array.from({ length: motion.rainStreams }, () => ({
    x: 0.02 + random() * 0.96,
    phase: random() * 1.45,
    speed: 0.48 + random() * 0.47,
    spacing: 0.045 + random() * 0.033,
    base: 0.065 + random() * 0.065,
    glyphs: Array.from({ length: motion.rainGlyphs }, () => GLYPHS[Math.floor(random() * GLYPHS.length)]),
  }));
}

export function atmosphereState(progress, timeline, reducedMotion = false) {
  if (reducedMotion || progress >= 1) return { rainEnvelope: 0, lightEnvelope: 0 };
  const rise = smooth(windowProgress(progress, timeline.rainIn));
  const fall = 1 - smooth(windowProgress(progress, timeline.rainOut));
  const rainEnvelope = rise * fall;
  const mark = Math.sin(Math.PI * windowProgress(progress, timeline.marksEnter)) ** 2;
  return { rainEnvelope, lightEnvelope: 0.72 * rainEnvelope + 0.28 * mark };
}

export function drawAtmosphere(context, { config, layout, streams, progress, reducedMotion }) {
  const state = atmosphereState(progress, config.timeline, reducedMotion);
  if (state.rainEnvelope < 0.001 && state.lightEnvelope < 0.001) return;
  const { plot } = layout;
  context.save();
  context.beginPath();
  context.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
  context.clip();

  if (state.lightEnvelope > 0.001) {
    streams.forEach((stream) => {
      const x = plot.left + stream.x * (plot.right - plot.left);
      const radius = Math.max(24, 55 * layout.scale);
      const gradient = context.createLinearGradient(x - radius, 0, x + radius, 0);
      gradient.addColorStop(0, "transparent");
      gradient.addColorStop(0.5, config.theme.primary);
      gradient.addColorStop(1, "transparent");
      context.globalAlpha = config.motion.lightingPeak * state.lightEnvelope * 0.22;
      context.fillStyle = gradient;
      context.fillRect(x - radius, plot.top, radius * 2, plot.bottom - plot.top);
    });
  }

  context.font = `${Math.max(8, 10 * layout.scale)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  streams.forEach((stream) => {
    const head = 1.18 - ((stream.phase + progress * stream.speed * 2.25) % 1.42);
    stream.glyphs.forEach((glyph, index) => {
      const normalizedY = head + index * stream.spacing;
      if (normalizedY < 0 || normalizedY > 1) return;
      const fade = Math.max(0.04, 1 - index / stream.glyphs.length);
      context.globalAlpha = stream.base * fade * state.rainEnvelope;
      context.fillStyle = index === 0 ? config.theme.summaryCore : config.theme.primary;
      context.fillText(
        glyph,
        plot.left + stream.x * (plot.right - plot.left),
        plot.bottom - normalizedY * (plot.bottom - plot.top),
      );
    });
  });
  context.restore();
  context.globalAlpha = 1;
}
