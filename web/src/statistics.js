export function linearFit(x, y) {
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) {
    throw new TypeError("linear_fit requires x and y arrays of equal length");
  }
  if (x.length < 2) throw new TypeError("linear_fit requires at least two finite observations");
  if (!x.every(Number.isFinite) || !y.every(Number.isFinite)) {
    throw new TypeError("linear_fit requires finite x and y values");
  }
  if (new Set(x).size < 2) throw new TypeError("linear_fit requires at least two distinct finite x values");

  const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
  const meanY = y.reduce((sum, value) => sum + value, 0) / y.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < x.length; index += 1) {
    const centeredX = x[index] - meanX;
    numerator += centeredX * (y[index] - meanY);
    denominator += centeredX * centeredX;
  }
  return { slope: numerator / denominator, intercept: meanY - (numerator / denominator) * meanX };
}
