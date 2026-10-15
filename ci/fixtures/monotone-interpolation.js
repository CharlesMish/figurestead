// Regression oracle: analyze the cubic itself, independently of tangent construction.
export const monotoneCases = [
  { x: [0, 1, 2], y: [0, 10, 9] },
  { x: [0, 1, 2, 3], y: [0, 10, 9, 0] },
  { x: [0, 1, 2], y: [10, 0, 1] },
  { x: [0, 1, 2, 3], y: [0, 9, 10, 0] },
  { x: [0, 1, 2, 3], y: [0, 10, 10, 9] },
  { x: [0, 1, 2, 3], y: [0, 1, 5, 6] },
  { x: [0, 1, 2, 3], y: [9, 8, 4, 0] },
  { x: [0, .01, 2, 2.1], y: [0, 10, 9, 0] },
  { x: [0, .01, 2, 2.1], y: [0, 1, 3, 10] },
  { x: [0, 1, 2, 3, 4, 5], y: [.1, .9, 1, .95, 1, .98] },
  { x: [0, 2], y: [1, 4] },
  { x: [1], y: [3] },
];

export function cubicShape(g) {
  const a = -g.y1 + 3*g.c1y - 3*g.c2y + g.y2;
  const b = 3*g.y1 - 6*g.c1y + 3*g.c2y;
  const c = -3*g.y1 + 3*g.c1y;
  const tolerance = 1e-9 * Math.max(1, Math.abs(g.y1), Math.abs(g.y2));
  const roots = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) roots.push(-c/(2*b));
  } else {
    const discriminant = 4*b*b - 12*a*c;
    if (discriminant >= 0) roots.push((-2*b + Math.sqrt(discriminant))/(6*a), (-2*b - Math.sqrt(discriminant))/(6*a));
  }
  const ts = [0, 1, ...roots.filter(t => t > 0 && t < 1)];
  const values = ts.map(t => ((a*t + b)*t + c)*t + g.y1);
  const derivativeTs = [0, 1];
  if (a && -b/(3*a) > 0 && -b/(3*a) < 1) derivativeTs.push(-b/(3*a));
  const derivatives = derivativeTs.map(t => (3*a*t + 2*b)*t + c);
  const sign = Math.sign(g.y2 - g.y1);
  return {
    min: Math.min(...values), max: Math.max(...values), tolerance,
    contained: Math.min(...values) >= Math.min(g.y1, g.y2) - tolerance && Math.max(...values) <= Math.max(g.y1, g.y2) + tolerance,
    monotone: sign ? derivatives.every(v => sign*v >= -tolerance) : derivatives.every(v => Math.abs(v) <= tolerance),
    startDerivative: c/(g.x2-g.x1), endDerivative: (3*a+2*b+c)/(g.x2-g.x1),
  };
}
