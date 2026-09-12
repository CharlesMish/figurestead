import { renderedSeriesAudit, type FiguresteadTheme, type SeriesRenderContext, type RenderedSeriesContrast } from '@figurestead/web';
declare const theme: FiguresteadTheme;
const context: SeriesRenderContext = { substrate: '#FFFFFF', opacity: 0.78, compositing: 'srgb-source-over' };
// @valid-case rendered series measurement uses an explicit context
const rows: RenderedSeriesContrast[] = renderedSeriesAudit(theme, context);
const passed: boolean = rows[0].passes;
// @negative-case missing rendering facts
// @ts-expect-error All rendering facts are required.
renderedSeriesAudit(theme, { opacity: 1 });
// @negative-case invalid compositing rule
// @ts-expect-error Renderer names are not compositing rules.
renderedSeriesAudit(theme, { substrate: '#FFFFFF', opacity: 1, compositing: 'canvas' });
// @negative-case unknown context field
// @ts-expect-error An unrecognized context field must not imply a renderer preset.
renderedSeriesAudit(theme, { ...context, renderer: 'SVG' });
void passed;
