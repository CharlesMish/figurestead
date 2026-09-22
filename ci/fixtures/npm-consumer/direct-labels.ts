import type { FiguresteadStyle } from '@figurestead/web';
// @valid-case explicit opt-in, disabled treatment and truthful measured geometry
const enabled: FiguresteadStyle = { glyphs: ['ring', 'square'], lineStyles: ['solid'], series: {}, directLabels: true, markerStride: 4 };
const disabled: FiguresteadStyle = { glyphs: ['ring', 'square'], lineStyles: ['solid'], series: {}, directLabels: false };
// @negative-case no string-valued direct-label mode
// @ts-expect-error directLabels is boolean, not a mode string.
const invalid: FiguresteadStyle = { glyphs: ['ring', 'square'], lineStyles: ['solid'], series: {}, directLabels: 'yes' };
void [enabled, disabled, invalid];

import { resolveTerminalScene } from '@figurestead/web';
const options: NonNullable<Parameters<typeof resolveTerminalScene>[1]> = {measureText: () => ({width: 20, ascent: 8, descent: 2, left: 1, right: 19})};
void options;

// @negative-case no string-valued marker stride
// Stride magnitude/integrality is validated at runtime; strings are never coerced.
// @ts-expect-error markerStride requires a number.
const invalidCadence: FiguresteadStyle = { ...enabled, markerStride: '4' };
void invalidCadence;
