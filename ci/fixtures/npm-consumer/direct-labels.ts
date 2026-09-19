import type { FiguresteadStyle } from '@figurestead/web';
// @valid-case explicit opt-in, disabled treatment and truthful measured geometry
const enabled: FiguresteadStyle = { glyphs: ['ring', 'square'], lineStyles: ['solid'], series: {}, directLabels: true };
const disabled: FiguresteadStyle = { glyphs: ['ring', 'square'], lineStyles: ['solid'], series: {}, directLabels: false };
// @negative-case no string-valued direct-label mode
// @ts-expect-error directLabels is boolean, not a mode string.
const invalid: FiguresteadStyle = { glyphs: ['ring', 'square'], lineStyles: ['solid'], series: {}, directLabels: 'yes' };
void [enabled, disabled, invalid];

import { resolveTerminalScene } from '@figurestead/web';
const options: NonNullable<Parameters<typeof resolveTerminalScene>[1]> = {measureText: () => ({width: 20, ascent: 8, descent: 2, left: 1, right: 19})};
void options;
