import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileTerminalScene, resolveTerminalScene, resolveSceneFrame, exportFigureSvg } from '../src/index.js';
import { linePathLength } from '../src/line-path.js';
import { lineIdentityContract } from '../../ci/fixtures/line-identity.js';

const theme=JSON.parse(fs.readFileSync('src/figurestead/themes/lavender_fog_notebook.json')).themes.lavender_fog_notebook;
const input=(n,rhythm='dash',stride=1)=>{
  const c=lineIdentityContract(theme);c.style.markerStride=stride;
  c.panels[0].data.x=Array.from({length:n},(_,i)=>i/(n-1));
  c.panels[0].data.xDomain=[-.05,1.05];c.panels[0].data.yDomain=[0,4];
  c.panels[0].data.series.forEach((s,j)=>{s.y=Array(n).fill(j+1);c.style.series[s.key]={lineStyle:rhythm};});
  return c;
};
const resolve=c=>resolveTerminalScene(compileTerminalScene(c),{width:760,height:520});
const segments=r=>r.panels[0].marks.filter(m=>m.kind==='segment');
const near=(a,b,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);

for(const rhythm of ['solid','dash','dot','dash-dot']) {
  const two=resolve(input(2,rhythm)),dense=resolve(input(401,rhythm));
  for(const key of ['S1','S2','S3']) {
    const whole=segments(two).find(m=>m.series===key),pieces=segments(dense).filter(m=>m.series===key);
    for(const m of pieces)near(m.pathDistance,Math.hypot(m.geometry.x1-whole.geometry.x1,m.geometry.y1-whole.geometry.y1));
    near(pieces.at(-1).pathDistance+linePathLength(pieces.at(-1).geometry),linePathLength(whole.geometry));
  }
  for(const stride of [1,4,999]) {
    const c=input(401,rhythm,stride),r=resolve(c);
    assert.deepEqual(segments(r),segments(dense),'cadence cannot alter geometry, style, or phase');
    const svgInput=input(29,rhythm,stride), svgResolved=resolve(svgInput);
    const svg=exportFigureSvg(svgInput,{width:760,height:520});
    for(const m of segments(svgResolved)) {
      const tag=svg.match(new RegExp(`<path data-mark-id="${m.id}"[^>]+>`))[0];
      if(rhythm!=='solid'&&m.pathDistance)assert.ok(tag.includes(`stroke-dashoffset="${m.pathDistance}"`));
      else assert.ok(!tag.includes('stroke-dashoffset'),'solid/sample-start serialization unchanged');
    }
  }
}
// Authored travel, including backwards x and coincident vertices; no sorting,
// index-based distance, sanitized-ID lookup, or straight start-to-end shortcut.
const c=input(5);c.panels[0].data.x=[0,.8,.8,.2,1];c.panels[0].data.revealOrder='random';
c.panels[0].data.series.forEach((s,i)=>{s.key=['A B','A/B','C'][i];s.y=[1,2,2,1.5,2.5];c.style.series[s.key]={lineStyle:'dash'};});
const r=resolve(c);
for(const key of ['A B','A/B','C']) {
  let distance=0;
  for(const m of segments(r).filter(m=>m.series===key)){near(m.pathDistance,distance);distance+=linePathLength(m.geometry);}
}
// Full path distances survive intermediate animation; motion itself is unchanged
// by sparse marker selection even for colliding sanitized identifiers.
c.view.motion='semantic';c.view.strategy='auto';
for(const progress of [.25,.6,.8,1]) {
  const full=resolveSceneFrame(resolve(c),progress);
  const sparse=structuredClone(c);sparse.style.markerStride=4;
  assert.deepEqual(segments(resolveSceneFrame(resolve(sparse),progress)),segments(full));
  assert.deepEqual(segments(full).map(m=>m.pathDistance),segments(r).map(m=>m.pathDistance));
}
const retained=compileTerminalScene(c).seriesStyles;
const reordered=structuredClone(c);reordered.style.series=retained;
reordered.panels[0].data.series=[c.panels[0].data.series[1],c.panels[0].data.series[0]];
for(const key of ['A B','A/B']) {
  const strip=m=>({geometry:m.geometry,pathDistance:m.pathDistance,style:m.style});
  assert.deepEqual(segments(resolve(reordered)).filter(m=>m.series===key).map(strip),segments(r).filter(m=>m.series===key).map(strip));
}
// Independent numerical integration of cubic speed (composite Simpson) checks
// production monotone path lengths, rather than comparing the helper to itself.
function integrate(g) {
  const n=20000,speed=t=>Math.hypot(...['x','y'].map(k=>3*((1-t)**2*(g['c1'+k]-g[k+'1'])+2*(1-t)*t*(g['c2'+k]-g['c1'+k])+t*t*(g[k+'2']-g['c2'+k]))));
  let sum=speed(0)+speed(1);for(let i=1;i<n;i++)sum+=(i%2?4:2)*speed(i/n);return sum/(3*n);
}
const curved=input(6);curved.panels[0].encoding.interpolation='monotone';
curved.panels[0].data.series.forEach(s=>{s.y=[.5,3.5,1,3,1.5,2.8];});
const cr=resolve(curved);
const filteredCurve=structuredClone(curved);filteredCurve.style.series=compileTerminalScene(curved).seriesStyles;
filteredCurve.panels[0].data.series=curved.panels[0].data.series.slice(1).reverse();
for(const key of ['S2','S3'])assert.deepEqual(segments(resolve(filteredCurve)).filter(m=>m.series===key).map(m=>m.pathDistance),segments(cr).filter(m=>m.series===key).map(m=>m.pathDistance),'curve phase cannot depend on other traces');
let path=0,chords=0;
for(const m of segments(cr).filter(m=>m.series==='S1')) {
  near(m.pathDistance,path,.001);path+=integrate(m.geometry);chords+=Math.hypot(m.geometry.x2-m.geometry.x1,m.geometry.y2-m.geometry.y1);
}
assert.ok(path-chords>10,'fixture must exercise real curvature');
const last=segments(cr).filter(m=>m.series==='S1').at(-1);near(last.pathDistance+linePathLength(last.geometry),path,.001);
console.log(JSON.stringify({suite:'line-rhythm-phase',result:'PASS',checks:['subdivision','all-rhythms','cadence','SVG-offsets','backtracking-coincident','collision-keys','motion','filter-reorder','monotone-integration'],curveLength:path,chordLength:chords}));
