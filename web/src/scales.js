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

export function formatTimeTick(value, domain = null) {
  const date = new Date(parseTime(value));
  const span = domain ? Math.abs(parseTime(domain[1]) - parseTime(domain[0])) : 0;
  const options = span > 1000 * 60 * 60 * 24 * 730 ? { year: "numeric" }
    : span > 1000 * 60 * 60 * 24 * 60 ? { month: "short", year: "2-digit" }
      : { month: "short", day: "numeric" };
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(date);
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

export function formatTick(value) {
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) return value.toExponential(1);
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(2)).toString();
}
