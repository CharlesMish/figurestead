import { deriveLayout } from "./layout.js";

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

const MINIMUM_PLOT_WIDTH = 160;
const MINIMUM_PLOT_HEIGHT = 120;

function deriveMultiPanelLayout(width, height, contract, columns, scale, outer, headerHeight, narrow, provenanceHeight) {
  const rows = Math.ceil(contract.panels.length / columns);
  const gap = clamp(contract.layout.gap * scale, narrow ? 8 : 10, narrow ? 20 : 38);
  const contentTop = headerHeight;
  const contentBottom = height - clamp(18 * scale, 10, 24) - provenanceHeight;
  const availableWidth = width - outer * 2 - gap * (columns - 1);
  const availableHeight = contentBottom - contentTop - gap * (rows - 1);
  const cellWidth = availableWidth / columns;
  const cellHeight = availableHeight / rows;
  const panels = contract.panels.map((_, index) => {
    const column = index % columns, row = Math.floor(index / columns);
    const rect = {
      left: outer + column * (cellWidth + gap),
      top: contentTop + row * (cellHeight + gap),
      right: outer + column * (cellWidth + gap) + cellWidth,
      bottom: contentTop + row * (cellHeight + gap) + cellHeight,
    };
    const leftPad = clamp(cellWidth * 0.105, 48, 82), rightPad = clamp(cellWidth * 0.035, 16, 34);
    const topPad = clamp(cellHeight * 0.16, 42, 68), bottomPad = clamp(cellHeight * 0.15, 42, 68);
    return {
      width, height, scale, rect, panelIndex: index,
      plot: { left: rect.left + leftPad, right: rect.right - rightPad, top: rect.top + topPad, bottom: rect.bottom - bottomPad },
      text: { titleY: rect.top + clamp(19 * scale, 14, 24), subtitleY: rect.top + clamp(37 * scale, 28, 46), xLabelY: rect.bottom - 7 * scale, yLabelX: rect.left + 12 * scale },
      font: { title: clamp(14 * scale, 11, 17), subtitle: clamp(10 * scale, 8, 12), axis: clamp(10.5 * scale, narrow ? 10 : 8, 12), legend: clamp(9.5 * scale, narrow ? 9.5 : 8, 11), signature: clamp(8.5 * scale, narrow ? 8 : 7, 10) },
      provenance: provenanceHeight ? { left: outer, right: width - outer, y: height - clamp(8 * scale, 7, 12) } : null,
    };
  });
  return {
    width, height, scale, panels,
    plot: { left: outer, right: width - outer, top: contentTop, bottom: contentBottom },
    header: { left: outer, titleY: clamp(30 * scale, 22, 38), subtitleY: clamp(53 * scale, 42, 66) },
    font: { title: clamp(19 * scale, 14, 23), subtitle: clamp(11.5 * scale, 9, 14), axis: clamp(10.5 * scale, narrow ? 10 : 8, 12), legend: clamp(10 * scale, narrow ? 9.5 : 8, 12), signature: clamp(9 * scale, narrow ? 8 : 7, 10) },
    provenance: provenanceHeight ? { left: outer, right: width - outer, y: height - clamp(8 * scale, 7, 12) } : null,
  };
}

function hasSafePanelPlots(layout) {
  return layout.panels.every((panel) =>
    panel.plot.right - panel.plot.left >= MINIMUM_PLOT_WIDTH
    && panel.plot.bottom - panel.plot.top >= MINIMUM_PLOT_HEIGHT);
}

export function deriveFigureLayout(width, height, contract) {
  if (!contract || contract.panels.length === 1) {
    const single = deriveLayout(width, height);
    single.panels = [{ ...single, rect: { left: 0, top: 0, right: width, bottom: height }, panelIndex: 0 }];
    single.header = null;
    return single;
  }
  const scale = clamp(Math.min(width / 1160, height / 700), 0.55, 1.35);
  const narrow = width <= 480 && height >= width * 1.5;
  const outer = clamp(width * 0.035, 16, 42);
  const headerHeight = narrow ? clamp(height * 0.085, 52, 68) : clamp(height * 0.13, 70, 108);
  const provenanceHeight = contract.theme?.mode === "paper" || !contract.spec?.signature ? 0 : clamp(18 * scale, 14, 22);
  const requestedColumns = Math.min(contract.layout.columns, contract.panels.length);
  const legacyLayout = deriveMultiPanelLayout(width, height, contract, requestedColumns, scale, outer, headerHeight, narrow, provenanceHeight);
  if (hasSafePanelPlots(legacyLayout)) return legacyLayout;
  for (let columns = requestedColumns - 1; columns >= 1; columns -= 1) {
    const candidate = deriveMultiPanelLayout(width, height, contract, columns, scale, outer, headerHeight, narrow, provenanceHeight);
    if (hasSafePanelPlots(candidate)) return candidate;
  }
  return legacyLayout;
}
