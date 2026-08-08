export function drawRule(context, { x1, y1, x2, y2, color, alpha = 0.7, width = 1, dash = [] }) {
  context.save(); context.strokeStyle = color; context.globalAlpha = alpha; context.lineWidth = width; context.setLineDash?.(dash);
  context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke(); context.restore();
}

export function drawBand(context, { left, top, right, bottom, color, alpha = 0.08 }) {
  context.save(); context.fillStyle = color; context.globalAlpha = alpha; context.fillRect(left, top, right - left, bottom - top); context.restore();
}

export function drawBar(context, { left, top, right, bottom, color, alpha = 0.55, stroke = null, lineWidth = 1 }) {
  const width = Math.max(0, right - left), height = Math.max(0, bottom - top);
  context.save(); context.fillStyle = color; context.globalAlpha = alpha; context.fillRect(left, top, width, height);
  if (stroke) { context.strokeStyle = stroke; context.lineWidth = lineWidth; context.strokeRect(left, top, width, height); }
  context.restore();
}

export function drawInterval(context, { x1, x2, y, color, alpha = 0.7, width = 1.4, cap = 0 }) {
  drawRule(context, { x1, y1: y, x2, y2: y, color, alpha, width });
  if (cap > 0) { drawRule(context, { x1, y1: y - cap, x2: x1, y2: y + cap, color, alpha, width }); drawRule(context, { x1: x2, y1: y - cap, x2, y2: y + cap, color, alpha, width }); }
}

export function drawCell(context, { left, top, right, bottom, color, alpha = 1, stroke = null }) {
  drawBar(context, { left, top, right, bottom, color, alpha, stroke, lineWidth: 0.5 });
}
