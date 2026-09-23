// Display-space length of the full resolved segment, before reveal or masks.
// Cubic chord/control-polygon bounds converge under de Casteljau subdivision.
// Split the error budget with each half; cap recursion for bounded work.
export function linePathLength(g, tolerance = 0.001) {
  if (g.c1x == null) return Math.hypot(g.x2 - g.x1, g.y2 - g.y1);
  const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  function length(a, b, c, d, budget, depth) {
    const chord = distance(a, d), polygon = distance(a, b) + distance(b, c) + distance(c, d);
    if (polygon - chord <= 2 * budget || depth === 16) return (polygon + chord) / 2;
    const ab = midpoint(a, b), bc = midpoint(b, c), cd = midpoint(c, d);
    const abc = midpoint(ab, bc), bcd = midpoint(bc, cd), middle = midpoint(abc, bcd);
    return length(a, ab, abc, middle, budget / 2, depth + 1)
      + length(middle, bcd, cd, d, budget / 2, depth + 1);
  }
  return length([g.x1, g.y1], [g.c1x, g.c1y], [g.c2x, g.c2y], [g.x2, g.y2], tolerance, 0);
}
