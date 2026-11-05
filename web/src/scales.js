export function linearScale(domain, range) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

export function parseTime(value, path = "time value") {
  const milliseconds = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new TypeError(`${path} must be an ISO date, Date, or finite epoch milliseconds`);
  return milliseconds;
}

export function timeScale(domain, range) {
  return linearScale(domain.map((value, index) => parseTime(value, `time domain[${index}]`)), range);
}

export function bandScale(domain, range, { padding = 0.12 } = {}) {
  const keys = domain.map(String), [r0, r1] = range, count = Math.max(1, keys.length);
  const step = (r1 - r0) / count, bandwidth = step * (1 - padding);
  const offset = (step - bandwidth) / 2, lookup = new Map(keys.map((key, index) => [key, r0 + index * step + offset]));
  const scale = (value) => lookup.get(String(value));
  scale.bandwidth = () => bandwidth; scale.step = () => step; scale.domain = () => [...keys];
  return scale;
}

export function timeTicks(domain, count = 6) {
  const numeric = domain.map((value, index) => parseTime(value, `time domain[${index}]`));
  return ticks(numeric, count);
}

// Internal axis helpers keep public time APIs unchanged. Precision is selected
// for the tick interval, then checked against the actual instant/value: merely
// producing distinct strings is not enough to identify scientific coordinates.
function tickSpacing(values) {
  const ordered = [...new Set(values)].sort((a, b) => a - b);
  return ordered.slice(1).reduce((step, value, i) => Math.min(step, value - ordered[i]), Infinity);
}

export function formatTimeTicks(values, domain = null) {
  const numeric = values.map(value => parseTime(value));
  const spacing = tickSpacing(numeric);
  const interval = Number.isFinite(spacing) ? spacing
    : domain ? Math.abs(parseTime(domain[1]) - parseTime(domain[0])) : Infinity;
  const day = 86400000;
  const first = interval >= 365 * day ? 0 : interval >= 28 * day ? 1 : interval >= day ? 2
    : interval >= 60000 ? 3 : interval >= 1000 ? 4 : 5;
  const iso = numeric.map(value => new Date(value).toISOString());
  const candidates = [
    text => text.split("T")[0].slice(0, -6),
    text => text.split("T")[0].slice(0, -3),
    text => text.split("T")[0],
    text => text.replace(/:\d{2}\.\d{3}Z$/, "Z"),
    text => text.replace(/\.\d{3}Z$/, "Z"),
    text => text,
  ];
  for (let precision = first; precision < candidates.length; precision++) {
    const labels = iso.map(candidates[precision]);
    if (labels.every((label, i) => Date.parse(label) === numeric[i])) return labels;
  }
  // Date has millisecond precision. This retains the prior Date interpretation
  // for fractional milliseconds; the independent tick-generator issue is not
  // repaired, deduplicated, or hidden here.
  return iso;
}

export function formatTimeTick(value, domain = null) {
  return formatTimeTicks([value], domain)[0];
}

export function extent(values, padding = 0.08, floor = null) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum || Math.max(Math.abs(maximum), 1);
  let low = minimum - span * padding;
  const high = maximum + span * padding;
  if (floor !== null) low = Math.min(floor, low);
  return [low, high];
}

export function ticks(domain, count = 6) {
  const [start, end] = domain;
  if (count < 2) return [start];
  const raw = (end - start) / (count - 1);
  const power = 10 ** Math.floor(Math.log10(Math.abs(raw) || 1));
  const normalized = raw / power;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power;
  const first = Math.ceil(start / step) * step;
  const result = [];
  for (let value = first; value <= end + step * 1e-9; value += step) result.push(Number(value.toPrecision(12)));
  return result.length >= 2 ? result : [start, end];
}

function legacyTick(value) {
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) return value.toExponential(1);
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(2)).toString();
}

export function formatNumericTicks(values) {
  const previous = values.map(legacyTick);
  if (previous.every((label, i) => Number(label) === values[i])) return previous;
  const spacing = tickSpacing(values), magnitude = Math.max(...values.map(Math.abs));
  const first = Number.isFinite(spacing) && spacing > 0 && magnitude > 0
    ? Math.max(1, Math.min(17, Math.floor(Math.log10(magnitude)) - Math.floor(Math.log10(spacing)) + 1)) : 1;
  for (let precision = first; precision <= 17; precision++) {
    const labels = values.map(value => {
      const rounded = Number(value.toPrecision(precision));
      const plain = String(rounded), exponential = rounded.toExponential();
      return plain.length <= exponential.length ? plain : exponential;
    });
    if (labels.every((label, i) => Number(label) === values[i])) return labels;
  }
  return values.map(String);
}

export function formatTick(value) {
  return formatNumericTicks([value])[0];
}
