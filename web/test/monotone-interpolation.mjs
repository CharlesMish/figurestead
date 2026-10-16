import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyScientificPose, compileTerminalScene, resolveTerminalScene, exportFigureSvg, validateEvidenceCoverage } from '../src/index.js';
import { lineIdentityContract } from '../../ci/fixtures/line-identity.js';
import { cubicShape, monotoneCases } from '../../ci/fixtures/monotone-interpolation.js';

const theme = JSON.parse(fs.readFileSync('src/figurestead/themes/lavender_fog_notebook.json')).themes.lavender_fog_notebook;
const source = ({x, y}) => {
  const c = lineIdentityContract(theme);
  c.panels[0].data = {x, revealOrder: 'x', series: [{key: 'S1', label: 'Observed', y}]};
  c.panels[0].encoding.interpolation = 'monotone';
  return c;
};
const segments = panel => panel.marks.filter(m => m.kind === 'segment');
const resolve = c => resolveTerminalScene(compileTerminalScene(c), {width: 760, height: 520});
let intervals = 0;
for (const fixture of monotoneCases) {
  const c = source(fixture), terminal = compileTerminalScene(c), panel = resolve(c).panels[0];
  assert.deepEqual(terminal.panels[0].marks.filter(m => m.kind === 'point').map(m => [m.x, m.y]), fixture.x.map((x,i) => [x, fixture.y[i]]));
  const marks = segments(panel), shapes = marks.map(m => cubicShape(m.geometry));
  for (const shape of shapes) {
    assert.ok(shape.contained && shape.monotone, JSON.stringify({fixture, shape}));
    intervals++;
  }
  for (let i=0; i<shapes.length-1; i++) {
    assert.ok(Math.abs(shapes[i].endDerivative - shapes[i+1].startDerivative) < 1e-8);
    if ((fixture.y[i+1]-fixture.y[i])*(fixture.y[i+2]-fixture.y[i+1]) < 0) assert.ok(Math.abs(shapes[i].endDerivative) < 1e-8);
  }
  const svg = exportFigureSvg(c, {width:760,height:520});
  for (const mark of marks) assert.ok(svg.includes(`data-mark-id="${mark.id}"`));
}
// Linear defaults and the existing nonincreasing-x fallback are not reinterpreted.
for (const x of [[0, 0, 1], [2, 1, 0]]) {
  const c = source({x,y:[0,10,9]}); c.panels[0].data.revealOrder = 'random';
  assert.ok(segments(resolve(c).panels[0]).every(m => m.geometry.c1x == null));
}
const linear = source(monotoneCases[0]); linear.panels[0].encoding.interpolation = 'linear';
assert.ok(segments(resolve(linear).panels[0]).every(m => m.geometry.c1x == null));
const posed = applyScientificPose(linear);
assert.equal(posed.panels[0].encoding.interpolation, 'monotone');
assert.equal(linear.panels[0].encoding.interpolation, 'linear');
assert.ok(segments(resolve(posed).panels[0]).every(m => cubicShape(m.geometry).contained));

// Cadence/rhythm must not change the curve or its cumulative length. This tests
// actual shared resolved geometry; native phase tests cover Canvas and SVG ink.
let configurations = 0;
for (const width of [640,1008]) {
  let expected;
  for (const stride of [1,4]) for (const lineStyle of ['solid','dash','dot','dash-dot']) {
    const c = source(monotoneCases[1]);
    c.style.markerStride = stride; c.style.series.S1 = {lineStyle};
    c.panels[0].yScale = {type:'linear',domain:[0,10]};
    const terminal = compileTerminalScene(c), panel = resolveTerminalScene(terminal,{width,height:520}).panels[0];
    assert.equal(validateEvidenceCoverage(terminal.panels).clean,true);
    const actual = segments(panel).map(m => ({geometry:m.geometry,pathDistance:m.pathDistance}));
    expected ??= actual; assert.deepEqual(actual,expected);
    for (const mark of segments(panel)) {
      const shape = cubicShape(mark.geometry);
      assert.ok(shape.contained && shape.monotone);
      assert.equal(mark.style.lineStyle,lineStyle);
    }
    const points = panel.marks.filter(m => m.kind === 'point');
    assert.deepEqual(points.map(m=>m.x),stride===1?[0,1,2,3]:[0,3]);
    configurations++;
  }
}
const invalid = source(monotoneCases[0]);invalid.panels[0].yScale={type:'linear',domain:[0,9]};
assert.throws(()=>compileTerminalScene(invalid),/outside|contain/);
console.log(JSON.stringify({suite:'monotone-interpolation',fixtures:monotoneCases.length,analyticIntervals:intervals,cadenceRhythmConfigurations:configurations,result:'PASS'}));
