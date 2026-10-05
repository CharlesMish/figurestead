import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CORE_REGISTRY, compileTerminalScene, resolveTerminalScene } from '../src/index.js';
import { TEMPORAL_RENDERERS } from '../src/extensions/temporal/index.js';
import { resolveSceneFrame } from '../src/resolved-scene.js';
import { drawResolvedPanel } from '../src/canvas-scene.js';
import { MARK_KINDS } from '../src/scene-marks.js';
import { compileMotionPlan } from '../src/motion-plan.js';
import { resolvedSceneToSvg } from '../src/svg-export.js';

const theme = JSON.parse(fs.readFileSync('src/figurestead/themes/slipware.json', 'utf8')).themes.slipware;
const profile = { key: 'parity', name: 'Parity', marker: 'ring_core', markerSize: 42, markerAlpha: .84, edgeWidth: 1.05, coreFraction: .12, pointGlow: false, gridX: true, gridY: true, gridAlpha: .4, summaryGlow: false };
const contract = {
  schemaVersion: '0.4', rendererApiVersion: '1', theme, profile,
  timeline: { rainIn: [0, 0], marksEnter: [0, 1], summaryCompiles: [.8, 1], rainOut: [0, 0], settle: [.9, 1] },
  motion: { frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0, trailAlpha: 0, seed: 1, durationMs: 1 },
  style: { glyphs: ['ring'], lineStyles: ['solid'], series: {} },
  spec: { title: 'Mark parity', subtitle: '', xLabel: 'x', yLabel: 'y', signature: '', description: 'Renderer operation coverage' },
  layout: { type: 'grid', columns: 1, gap: 18, sharedX: false, sharedY: false },
  view: { profile: 'atlas', motion: 'semantic', ambient: 'none', strategy: 'auto' },
  panels: [{ id: 'panel', renderer: 'temporal_observations', spec: {}, xScale: { type: 'time' }, yScale: { type: 'linear' }, annotations: [], data: {
    dates: ['2025-01-02', '2025-02-02'], values: [2, 4], site: 'Station A',
    referenceBands: [{ type: 'reference_band', from: 1, to: 5, label: 'Project range', status: 'provisional_project_constant' }],
  } }],
};

// An instrumented CanvasRenderingContext2D: record geometry, paint state and
// active clips at the actual operation boundary, not merely helper presence.
function recordingContext() {
  const calls = [], stack = [];
  let path = [], clips = [], state = { globalAlpha: 1, fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1 };
  const target = {
    calls,
    save() { stack.push({ state: { ...state }, clips: [...clips] }); },
    restore() { ({ state, clips } = stack.pop()); },
    beginPath() { path = []; },
    moveTo(...args) { path.push(['moveTo', ...args]); },
    lineTo(...args) { path.push(['lineTo', ...args]); },
    bezierCurveTo(...args) { path.push(['bezierCurveTo', ...args]); },
    arc(...args) { path.push(['arc', ...args]); },
    rect(...args) { path.push(['rect', ...args]); },
    closePath() { path.push(['closePath']); },
    clip(...args) { clips.push({ path: structuredClone(path), args }); },
    setLineDash(value) { state.lineDash = value; },
    measureText(value) { return { width: String(value).length * 5 }; },
    translate() {}, rotate() {},
  };
  for (const method of ['stroke', 'fill', 'fillRect', 'strokeRect', 'fillText', 'strokeText']) {
    target[method] = (...args) => calls.push({ method, args, path: structuredClone(path), clips: structuredClone(clips), ...state });
  }
  return new Proxy(target, { get: (obj, key) => key in obj ? obj[key] : state[key], set: (obj, key, value) => { state[key] = value; return true; } });
}

const source = compileTerminalScene(contract, { registry: CORE_REGISTRY.with(...TEMPORAL_RENDERERS) });
const resolved = resolveTerminalScene(source, { width: 640, height: 480 });
const cases = [];
const test = (name, run) => cases.push({ name, run });
const color = '#185D84';
const style = { color, edge: color, glyph: 'ring', lineStyle: 'solid', lineWidth: 1.6 };
const segment = { x1: 180, y1: 190, x2: 240, y2: 220 };
const rectangle = { left: 180, top: 190, right: 240, bottom: 230, alpha: .68, fill: color };
const paintCalls = (ctx) => ctx.calls.filter(call => ['stroke', 'fill', 'fillRect', 'strokeRect'].includes(call.method));
const markCalls = (ctx) => paintCalls(ctx).filter(call => call.fillStyle === color || call.strokeStyle === color);
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

function fixtureScene(marks) {
  // These resolved-scene fixtures cover supported low-level marks used by
  // optional renderers; they do not claim every renderer is publicly registered.
  return { ...resolved, panels: [{ ...resolved.panels[0], renderer: 'scatter', marks,
    legend: [], meta: {}, composedAnnotations: [] }] };
}
function runCanvas(scene, progress = 1) {
  const ctx = recordingContext();
  drawResolvedPanel(ctx, resolveSceneFrame(scene, progress), 0);
  return ctx;
}
function svgMark(svg, id) {
  const needle = `data-mark-id="${id}"`, at = svg.indexOf(needle);
  assert.notEqual(at, -1, `SVG must contain ${id}`);
  const start = svg.lastIndexOf('<', at), headEnd = svg.indexOf('>', at);
  return svg.startsWith('<g ', start) ? svg.slice(start, svg.indexOf('</g>', headEnd) + 4) : svg.slice(start, headEnd + 1);
}
function assertClipped(calls, panel) {
  const p = panel.evidenceFrame ?? panel.axes.plot ?? panel.layout.plot;
  for (const call of calls) assert.ok(call.clips.some(clip => clip.path.some(path =>
    JSON.stringify(path) === JSON.stringify(['rect', p.left, p.top, p.right - p.left, p.bottom - p.top]))),
  'mark paint must remain inside the evidence-frame clip');
}
function checkRectangle(mark, calls, svg) {
  const g = mark.geometry;
  assert.ok(calls.some(call => call.method === 'fillRect' && JSON.stringify(call.args) ===
    JSON.stringify([g.left, g.top, g.right - g.left, g.bottom - g.top])));
  for (const [attr, value] of Object.entries({ x: g.left, y: g.top, width: g.right - g.left, height: g.bottom - g.top })) {
    assert.ok(svg.includes(`${attr}="${value}"`), `SVG rectangle ${attr}`);
  }
}
function checkPath(calls, points, svg, path) {
  assert.ok(calls.some(call => call.method === 'stroke' && points.every(point =>
    call.path.some(value => JSON.stringify(value) === JSON.stringify(point)))));
  assert.ok(svg.includes(`d="${path}"`));
}

const fixtures = {
  point: { geometry: { cx: 210, cy: 210, radius: 4 }, check(mark, calls, svg) {
    assert.ok(calls.some(call => call.path.some(path => path[0] === 'arc' && path[1] === 210 && path[2] === 210 && path[3] === 4)));
    assert.match(svg, /<circle /); assert.match(svg, /cx="210" cy="210" r="4"/);
  } },
  segment: { geometry: segment },
  'summary-line': { geometry: segment },
  'median-rule': { geometry: segment },
  bar: { geometry: rectangle, orientation: 'vertical', check: checkRectangle },
  cell: { geometry: rectangle, status: 'observed', label: '', check: checkRectangle },
  interval: { geometry: { x1: 180, x2: 240, y: 210, cap: 4 }, check(mark, calls, svg) {
    checkPath(calls, [['moveTo', 180, 210], ['lineTo', 240, 210], ['moveTo', 180, 206], ['lineTo', 180, 214]], svg, 'M 180 210 L 240 210');
    assert.match(svg, /M 180 206 L 180 214 M 240 206 L 240 214/);
  } },
  connector: { geometry: { x1: 180, x2: 240, y: 210 }, delta: 2, endpointALabel: 'A', endpointBLabel: 'B', check(mark, calls, svg) {
    checkPath(calls, [['moveTo', 180, 210], ['lineTo', 240, 210]], svg, 'M 180 210 L 240 210');
  } },
  'reference-band': { geometry: rectangle, from: 1, to: 5, label: 'Range', status: 'provisional_project_constant', check: checkRectangle },
  'baseline-rule': { geometry: { x: 210, top: 190, bottom: 230 }, label: 'Baseline', check(mark, calls, svg) {
    checkPath(calls, [['moveTo', 210, 190], ['lineTo', 210, 230]], svg, 'M 210 190 L 210 230');
  } },
  'row-band': { geometry: rectangle, check: checkRectangle },
  rug: { geometry: { x: 210, y: 210, halfHeight: 5 }, check(mark, calls, svg) {
    checkPath(calls, [['moveTo', 210, 205], ['lineTo', 210, 215]], svg, 'M 210 205 L 210 215');
  } },
  'temporal-bar': { geometry: { ...rectangle, labelX: 210, labelY: 185 }, value: 4, check: checkRectangle },
};

test('vocabulary coverage is exhaustive and custom placeholder is explicit', () => {
  assert.deepEqual([...Object.keys(fixtures), 'renderer-mark'].sort(), [...MARK_KINDS].sort());
});
for (const [kind, fixture] of Object.entries(fixtures)) test(`${kind} paints Canvas geometry and SVG shape`, () => {
  const { check, ...data } = fixture;
  const mark = { id: `fixture/${kind}`, kind, style, ...data };
  const scene = fixtureScene([mark]);
  const calls = markCalls(runCanvas(scene));
  assert.ok(calls.length, `${kind} must produce actual Canvas paint`);
  assertClipped(calls, scene.panels[0]);
  const svg = svgMark(resolvedSceneToSvg(scene), mark.id);
  if (check) check(mark, calls, svg);
  else checkPath(calls, [['moveTo', 180, 190], ['lineTo', 240, 220]], svg, 'M 180 190 L 240 220');
});

test('real temporal_observations contract paints band and boundary at terminal and intermediate frames', () => {
  const band = resolved.panels[0].marks.find(mark => mark.kind === 'reference-band');
  const g = band.geometry;
  for (const progress of [.5, 1]) {
    const frame = resolveSceneFrame(resolved, progress), ctx = recordingContext();
    drawResolvedPanel(ctx, frame, 0);
    const fills = ctx.calls.filter(call => call.method === 'fillRect' && call.fillStyle === band.style.color &&
      JSON.stringify(call.args) === JSON.stringify([g.left, g.top, g.right - g.left, g.bottom - g.top]));
    assert.equal(fills.length, 1, 'reference band must paint full rectangle, not merely a legend swatch');
    const opacity = frame.panels[0].marks.find(mark => mark.id === band.id).motion.opacity;
    assert.ok(opacity > 0); approx(fills[0].globalAlpha, .1 * opacity);
    const boundary = ctx.calls.find(call => call.method === 'stroke' && call.strokeStyle === band.style.color &&
      JSON.stringify(call.path) === JSON.stringify([['moveTo', g.left, g.bottom], ['lineTo', g.right, g.bottom]]));
    assert.ok(boundary); approx(boundary.globalAlpha, .45 * opacity);
    assertClipped([...fills, boundary], resolved.panels[0]);
    const pointCall = ctx.calls.findIndex(call => call.method === 'stroke' && call.path.some(item => item[0] === 'arc'));
    assert.ok(ctx.calls.indexOf(fills[0]) < pointCall, 'reference fill must precede observations');
  }
  const svg = resolvedSceneToSvg(resolved), fragment = svgMark(svg, band.id);
  assert.match(fragment, /fill-opacity="0.1"/); assert.match(fragment, /stroke-opacity="0.45"/);
  assert.ok(svg.indexOf(`data-mark-id="${band.id}"`) < svg.indexOf(`data-mark-id="${resolved.panels[0].marks.find(mark => mark.kind === 'point').id}"`));
  const hidden = runCanvas(resolved, 0);
  assert.equal(hidden.calls.filter(call => call.method === 'fillRect' && JSON.stringify(call.args) ===
    JSON.stringify([g.left, g.top, g.right - g.left, g.bottom - g.top])).length, 0);
});

test('row-band resolves a supported category scene and paints through reveal motion', () => {
  const panel = { ...source.panels[0], renderer: 'reference_improvement',
    scales: { x: { type: 'linear' }, y: { type: 'band' } },
    categories: { x: null, y: ['A', 'B', 'C'] }, domain: { x: [0, 10], y: ['A', 'B', 'C'] },
    marks: [{ id: 'rows/band', kind: 'row-band', categoryFrom: 'A', categoryTo: 'B', style },
            { id: 'rows/point', kind: 'point', x: 5, yCategory: 'A', style: { ...style, color: '#991122' } }],
    meta: {}, legend: [],
  };
  const scene = { ...source, panels: [panel] };
  scene.motionPlan = compileMotionPlan(scene, { motion: 'semantic', strategy: 'reveal' });
  const rowResolved = resolveTerminalScene(scene, { width: 640, height: 480 });
  const row = rowResolved.panels[0].marks[0], g = row.geometry, axes = rowResolved.panels[0].axes;
  assert.equal(g.top, axes.y('A')); assert.equal(g.bottom, axes.y('B') + axes.y.bandwidth());
  const svg = svgMark(resolvedSceneToSvg(rowResolved), row.id);
  assert.match(svg, /fill-opacity="0.28"/);
  for (const progress of [.5, 1]) {
    const ctx = runCanvas(rowResolved, progress), calls = markCalls(ctx);
    checkRectangle(row, calls, svg); assertClipped(calls, rowResolved.panels[0]);
    const opacity = resolveSceneFrame(rowResolved, progress).panels[0].marks[0].motion.opacity;
    approx(calls.find(call => call.method === 'fillRect').globalAlpha, .28 * opacity);
  }
});

test('unknown kinds fail before null-geometry and hidden-motion skipping', () => {
  for (const geometry of [null, { cx: 210, cy: 210, radius: 4 }]) {
    for (const opacity of [0, 1]) {
      const mark = { id: 'bad', kind: 'invented-kind', geometry, style };
      const scene = fixtureScene([{ id: 'valid', kind: 'point', style, geometry: fixtures.point.geometry }, mark]);
      // Frame resolution already rejects unknown kinds. Inject after that
      // boundary to independently exercise the public drawing entry point.
      const frame = resolveSceneFrame(fixtureScene([scene.panels[0].marks[0]]), 1);
      frame.panels[0].marks.push({ ...mark, motion: { opacity } });
      const ctx = recordingContext();
      assert.throws(() => drawResolvedPanel(ctx, frame, 0), error => error.name === 'FiguresteadConfigError' &&
        error.path === 'frame.panels[0].marks[1].kind');
      assert.equal(ctx.calls.length, 0, 'kind preflight precedes all Canvas painting');
      assert.throws(() => resolvedSceneToSvg(scene), error => error.name === 'FiguresteadConfigError' &&
        error.path === 'scene.panels[0].marks[1].kind');
    }
  }
});

test('renderer-mark is an explicitly unsupported built-in paint placeholder', () => {
  for (const geometry of [null, { cx: 210, cy: 210, radius: 4 }]) {
    for (const opacity of [0, 1]) {
      const scene = fixtureScene([{ id: 'custom', kind: 'renderer-mark', geometry, style }]);
      const frame = resolveSceneFrame(scene, 1);
      frame.panels[0].marks[0].motion.opacity = opacity;
      assert.throws(() => drawResolvedPanel(recordingContext(), frame, 0), error => error.name === 'FiguresteadConfigError' &&
        /custom renderer draw function/.test(error.message));
      assert.throws(() => resolvedSceneToSvg(scene), error => error.name === 'FiguresteadConfigError' &&
        /custom renderer/.test(error.message) && /unsupported/.test(error.message));
    }
  }
});

for (const { name, run } of cases) { try { run(); } catch (error) { error.message = `${name}: ${error.message}`; throw error; } }
console.log(JSON.stringify({ suite: 'mark-rendering-parity', result: 'PASS', cases: cases.length,
  builtInPaintingKinds: Object.keys(fixtures).length, placeholderKinds: 1,
  checks: ['geometry', 'clipping', 'reference-before-data', 'terminal-and-intermediate-band-paint', 'unknown-hidden-null-rejection'] }));
