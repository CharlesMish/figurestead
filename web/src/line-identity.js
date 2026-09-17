// Line-only prominence. Glyph identity/rhythm still come from series-style.js.
// Units are CSS px; the same resolved geometry feeds Canvas and SVG.
export function lineMarkerGeometry(style, scale = 1, markerScale = 1) {
  const shapeScale = style.glyph === "square" ? 0.9 : style.glyph === "triangle" ? 1.1 : 1;
  return { radius: 4.1 * Math.max(1, scale) * markerScale * shapeScale,
    outlineWidth: 2 * Math.max(1, scale) };
}

// Append, don't begin: also used inside an own-line-only clipping path.
export function appendMarkerPath(context, glyph, x, y, radius) {
  if (glyph === "square") context.rect(x - radius, y - radius, radius * 2, radius * 2);
  else if (glyph === "triangle") { context.moveTo(x, y - radius); context.lineTo(x + radius, y + radius); context.lineTo(x - radius, y + radius); context.closePath(); }
  else if (glyph === "diamond") { context.moveTo(x, y - radius); context.lineTo(x + radius, y); context.lineTo(x, y + radius); context.lineTo(x - radius, y); context.closePath(); }
  else { context.moveTo(x + radius, y); context.arc(x, y, radius, 0, Math.PI * 2); }
}

export function clipOwnLine(context, markers, plot) {
  // Intersect individual complements: overlapping markers remain a union of holes.
  // A single even-odd path containing every marker would incorrectly XOR overlaps.
  for (const mark of markers) {
    const m = mark.motion, g = mark.geometry;
    if (m.opacity <= 0) continue;
    context.beginPath();
    context.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top);
    appendMarkerPath(context, mark.style.glyph, g.cx + m.translateX, g.cy + m.translateY,
      g.radius * Math.min(m.scaleX, m.scaleY));
    context.clip("evenodd");
  }
}
