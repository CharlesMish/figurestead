import assert from "node:assert/strict";
import fs from "node:fs";
import { compileTerminalScene, resolveTerminalScene, resolveSceneFrame, exportFigureSvg } from "../src/index.js";
import { composeResolvedScene } from "../src/composition.js";
import { resolveSeriesStyles } from "../src/series-style.js";
import { markMotionState } from "../src/motion-plan.js";
import { lineMarkerGeometry } from "../src/line-identity.js";
import { lineIdentityContract } from "../../ci/fixtures/line-identity.js";

const theme = JSON.parse(fs.readFileSync("src/figurestead/themes/lavender_fog_notebook.json")).themes.lavender_fog_notebook;
const input = lineIdentityContract(theme);
const scene = compileTerminalScene(input);
assert.deepEqual(Object.values(scene.seriesStyles).map(s => s.glyph), ["ring", "square", "triangle"]);
assert.deepEqual(Object.values(scene.seriesStyles).map(s => s.lineStyle), ["solid", "solid", "solid"]);
assert.equal(new Set(Object.values(scene.seriesStyles).map(s => s.lineWidth)).size, 1);
const dashed = structuredClone(input); dashed.style.series.S1 = { lineStyle: "dash" };
assert.equal(compileTerminalScene(dashed).seriesStyles.S1.glyph, "ring");
assert.equal(compileTerminalScene(dashed).seriesStyles.S1.lineStyle, "dash");
const filtered = structuredClone(input);
filtered.style.series = structuredClone(scene.seriesStyles);
filtered.panels[0].data.series = [input.panels[0].data.series[2], input.panels[0].data.series[1]];
const surviving = resolveSeriesStyles(filtered);
assert.deepEqual(surviving.S2, scene.seriesStyles.S2);
assert.deepEqual(surviving.S3, scene.seriesStyles.S3);
const panel = composeResolvedScene(resolveTerminalScene(scene, { width: 760, height: 520 })).panels[0];
for (const mark of panel.marks.filter(m => m.kind === "point")) {
  const expected = lineMarkerGeometry(mark.style, panel.layout.scale, panel.presentation.markerScale);
  assert.equal(mark.geometry.radius, expected.radius);
  assert.equal(mark.geometry.outlineWidth, expected.outlineWidth);
  assert.equal(mark.lineIdentity, true);
  assert.deepEqual(panel.legend.find(l => l.key === mark.series).style, mark.style);
}
assert.ok(panel.layout.legend.entries.every(e => e.markerX < e.textX && e.textAnchor === "start"));
const entries = panel.layout.legend.entries;
const maxRadius = Math.max(...panel.marks.filter(m => m.lineIdentity).map(m => m.geometry.radius + m.geometry.outlineWidth / 2));
for (let i = 1; i < entries.length; i++) assert.ok(entries[i].y - entries[i - 1].y > 2 * maxRadius);
const svg = exportFigureSvg(input, { width: 760, height: 520 });
assert.match(svg, /mask-type="luminance"/);
assert.match(svg, /data-layer="legend"[^]*-legend-0/);
assert.match(svg, /fill="black" stroke="none"/);
assert.match(exportFigureSvg(dashed), /stroke-dasharray="7 4"/);
console.log(JSON.stringify({ suite: "line-identity", result: "PASS", checks: ["identities", "solid-equal-width", "independent-rhythm", "keyed-filter-reorder", "body-legend-geometry", "sample-before-label", "own-line-svg-mask"] }));

// Cadence resolves presentation markers once, without reducing evidence/segments.
const cadence = (n, stride) => {
  const c = lineIdentityContract(theme);
  if (stride !== undefined) c.style.markerStride = stride;
  c.panels[0].data.x = Array.from({length:n}, (_,i) => i);
  c.panels[0].data.series.forEach((s,i) => { s.y = Array(n).fill(i+1); });
  return c;
};
const compose = c => composeResolvedScene(resolveTerminalScene(compileTerminalScene(c), {width:760,height:520}));
for (const [n,stride,indices] of [[29,4,[0,4,8,12,16,20,24,28]],[10,4,[0,4,8,9]],[1,4,[0]],[2,4,[0,1]],[5,99,[0,4]],[4,1,[0,1,2,3]]]) {
  const c=cadence(n,stride), ordinary=compose(cadence(n)), scene=compileTerminalScene(c), sparse=compose(c);
  // All evidence remains available to validation, even where glyphs are omitted.
  assert.equal(scene.panels[0].marks.filter(m=>m.kind==='point').length,n*3);
  for (const key of ['S1','S2','S3']) {
    const marks=sparse.panels[0].marks.filter(m=>m.series===key);
    assert.deepEqual(marks.filter(m=>m.kind==='point').map(m=>Number(m.id.split('/').at(-1))),indices);
    assert.deepEqual(marks.filter(m=>m.kind==='segment'),ordinary.panels[0].marks.filter(m=>m.kind==='segment'&&m.series===key));
    assert.deepEqual(sparse.panels[0].legend,ordinary.panels[0].legend);
  }
  const svg=exportFigureSvg(c, {width:760,height:520});
  assert.equal((svg.match(/data-mark-id="line\/point\//g)??[]).length,indices.length*3);
  for(const mask of svg.matchAll(/<mask [^]*?<\/mask>/g)) {
    const holes=(mask[0].match(/fill="black"/g)??[]).length;
    // Body masks use only selected points; each legend mask uses one sample.
    assert.ok(holes===indices.length || holes===1);
  }
}
assert.deepEqual(compileTerminalScene(cadence(10,1)),compileTerminalScene(cadence(10)));
assert.equal(exportFigureSvg(cadence(10,1)),exportFigureSvg(cadence(10)));
for(const stride of [0,-1,true,false,1.5,'4',null,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) {
  assert.throws(()=>compileTerminalScene(cadence(10,stride)),/markerStride.*positive safe integer/);
}
// Hidden observations still fail ordinary evidence coverage; repeated/nonmonotone
// x is not sorted/deduplicated by cadence, and monotone controls use all points.
const outside=cadence(10,4);outside.panels[0].data.yDomain=[0,4];outside.panels[0].data.series[0].y[2]=20;
assert.throws(()=>compileTerminalScene(outside),/clipping may not hide evidence/);
for(const x of [[0,3,2,2,4],[0,.1,1,7,9]]) {
  const c=cadence(5,4);c.panels[0].data.x=x;c.panels[0].data.revealOrder="random";
  const p=compose(c).panels[0];
  assert.deepEqual(p.marks.filter(m=>m.kind==='segment'&&m.series==='S1').map(m=>[m.from.x,m.to.x]),x.slice(1).map((v,i)=>[x[i],v]));
}
const curve=cadence(10,4);curve.panels[0].encoding.interpolation='monotone';
curve.panels[0].data.series.forEach(s=>{s.y=s.y.map((v,i)=>v+Math.sin(i));});
const fullCurve=structuredClone(curve);delete fullCurve.style.markerStride;
assert.deepEqual(compose(curve).panels[0].marks.filter(m=>m.kind==='segment'),compose(fullCurve).panels[0].marks.filter(m=>m.kind==='segment'));
console.log(JSON.stringify({suite:'marker-cadence',result:'PASS',checks:['indices','full-evidence','unchanged-segments-controls','marker-only-masks','legend','stride-1-exact-control','validation','authored-order']}));

const moving=cadence(10,4);moving.view.motion='semantic';moving.view.strategy='auto';
const denseMoving=structuredClone(moving);delete denseMoving.style.markerStride;
for(const progress of [0,.25,.75,1]) {
  const segments=c=>resolveSceneFrame(compose(c),progress).panels[0].marks.filter(m=>m.kind==='segment');
  assert.deepEqual(segments(moving),segments(denseMoving),'cadence must not retime or reshape segments');
}

// MC1: distinct valid authored keys may share sanitized output IDs. Scheduling
// must use original numeric position, never an ID-keyed map (or display order).
const collision=cadence(10);
collision.panels[0].data.series.forEach((s,i)=>{s.key=['A B','A/B','C'][i];});
collision.view.motion='semantic';collision.view.strategy='auto';
const originalMarks=compileTerminalScene(collision).panels[0].marks;
assert.equal(originalMarks[10].id,originalMarks[29].id,'fixture must collide');
const collisionResults=[];
for(const stride of [undefined,1,4]) {
  const c=structuredClone(collision);if(stride!==undefined)c.style.markerStride=stride;
  const r=compose(c);
  const expected=originalMarks.map((mark,order)=>({mark,order})).filter(({mark})=>
    mark.kind!=='point'||stride!==4||[0,4,8,9].includes(mark.x));
  assert.deepEqual(r.panels[0].marks.map(m=>m.motionOrder),expected.map(e=>e.order));
  assert.equal(r.panels[0].marks.filter(m=>m.kind==='point').length,stride===4?12:30);
  for(const progress of [.25,.6,.8]) {
    const marks=resolveSceneFrame(r,progress).panels[0].marks;
    assert.equal(marks.length,expected.length);
    marks.forEach((mark,i)=>{
      const source=expected[i];
      assert.equal(mark.series,source.mark.series);
      assert.deepEqual(mark.motion,markMotionState(source.mark,source.order,originalMarks.length,progress,'points_then_connect'),
        `${stride??'omitted'} ${progress}: original order ${source.order}`);
    });
    if(progress===.6) {
      const first=marks.find(m=>m.kind==='segment'&&m.series==='A B');
      const later=marks.find(m=>m.kind==='segment'&&m.series==='A/B');
      // Golden values independently reproduced against exact pre-cadence main.
      assert.equal(first.motion.opacity,0.17264050491210844);
      assert.equal(first.motion.clip,0.17264050491210844);
      assert.equal(later.motion.opacity,0.047064432452701845);
      assert.equal(later.motion.clip,0.047064432452701845);
      collisionResults.push({stride:stride??'omitted',first:first.motion,later:later.motion});
    }
  }
}
console.log(JSON.stringify({suite:'MC1-motion-order-collision',result:'PASS',progress:[.25,.6,.8],cases:collisionResults}));
