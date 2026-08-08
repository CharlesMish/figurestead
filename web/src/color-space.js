const HEX = /^#([0-9a-f]{6})$/i;
const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));

export function hexToSrgb(value) {
  const match = HEX.exec(value);
  if (!match) throw new TypeError(`expected #RRGGBB, received ${value}`);
  return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255);
}

export function srgbToHex(rgb) {
  return `#${rgb.map((value) => Math.round(clamp(value) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

const toLinear = (value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const toSrgb = (value) => value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

export function srgbToOklab(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToSrgb({ L, a, b }) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function hexToOklab(value) { return srgbToOklab(hexToSrgb(value)); }

export function oklabToOklch({ L, a, b }) {
  const C = Math.hypot(a, b);
  return { L, C, h: C < 1e-9 ? 0 : (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
}

export function oklchToOklab({ L, C, h }) {
  const angle = h * Math.PI / 180;
  return { L, a: C * Math.cos(angle), b: C * Math.sin(angle) };
}

export function hexToOklch(value) { return oklabToOklch(hexToOklab(value)); }

function inGamut(rgb) { return rgb.every((value) => Number.isFinite(value) && value >= -1e-7 && value <= 1 + 1e-7); }

export function oklchToHex(value) {
  let candidate = { L: clamp(value.L), C: Math.max(0, value.C), h: value.h };
  let rgb = oklabToSrgb(oklchToOklab(candidate));
  if (!inGamut(rgb)) {
    let low = 0, high = candidate.C;
    for (let index = 0; index < 24; index += 1) {
      const mid = (low + high) / 2;
      const attempt = oklabToSrgb(oklchToOklab({ ...candidate, C: mid }));
      if (inGamut(attempt)) low = mid; else high = mid;
    }
    candidate = { ...candidate, C: low };
    rgb = oklabToSrgb(oklchToOklab(candidate));
  }
  return { hex: srgbToHex(rgb), oklch: candidate };
}

export function relativeLuminance(value) {
  const [r, g, b] = hexToSrgb(value).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function colorContrast(left, right) {
  const values = [relativeLuminance(left), relativeLuminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

export function oklabDistance(left, right) {
  return Math.hypot(left.L - right.L, left.a - right.a, left.b - right.b);
}

export function resolveContrastColor(source, surface, minimum, options = {}) {
  const authoredLab = hexToOklab(source), authored = oklabToOklch(authoredLab);
  const originalContrast = colorContrast(source, surface);
  if (originalContrast >= minimum) return {
    source: source.toUpperCase(), color: source.toUpperCase(), contrast: originalContrast,
    identityDelta: 0, lightnessDelta: 0, chromaReduction: 0, hueDelta: 0, changed: false,
  };
  const chromaCap = options.chromaCap ?? 0.22;
  const C = Math.min(authored.C, chromaCap);
  let winner = null;
  for (let step = 0; step <= 1000; step += 1) {
    const L = step / 1000, converted = oklchToHex({ L, C, h: authored.h });
    const contrast = colorContrast(converted.hex, surface);
    if (contrast + 1e-9 < minimum) continue;
    const lab = hexToOklab(converted.hex), distance = oklabDistance(authoredLab, lab);
    if (!winner || distance < winner.identityDelta - 1e-9 || (Math.abs(distance - winner.identityDelta) < 1e-9 && converted.hex < winner.color)) {
      const resolvedLch = hexToOklch(converted.hex);
      const hueDistance = Math.abs(authored.h - resolvedLch.h);
      winner = {
        source: source.toUpperCase(), color: converted.hex, contrast, identityDelta: distance,
        lightnessDelta: resolvedLch.L - authored.L,
        chromaReduction: Math.max(0, authored.C - resolvedLch.C),
        hueDelta: Math.min(hueDistance, 360 - hueDistance), changed: converted.hex !== source.toUpperCase(),
      };
    }
  }
  if (!winner) throw new TypeError(`no in-gamut paper color can meet contrast ${minimum} against ${surface}`);
  return winner;
}
