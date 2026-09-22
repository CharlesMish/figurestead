import assert from 'node:assert/strict';
import fs from 'node:fs';
import {solveDirectLabels} from '../src/direct-labels.js';
import {compileTerminalScene} from '../src/terminal-scene.js';
import {resolveTerminalScene,resolveSceneFrame} from '../src/resolved-scene.js';
import {composeResolvedScene} from '../src/composition.js';
import {resolvedSceneToSvg,sceneToSvg} from '../src/svg-export.js';
import {lineIdentityContract} from '../../ci/fixtures/line-identity.js';
const theme=JSON.parse(fs.readFileSync(new URL('../../src/figurestead/themes/lavender_fog_notebook.json',import.meta.url))).themes.lavender_fog_notebook;
const metric=t=>({width:t.length*6,ascent:8,descent:2,left:1,right:t.length*6-1}); // Explicit synthetic measurement input, not a production text estimate.
function input(){const c=lineIdentityContract(theme);c.style.directLabels=true;return c;}
function resolved(c,measure=metric){return composeResolvedScene(resolveTerminalScene(compileTerminalScene(c),{width:760,height:520,measureText:measure}));}
let checks=0;function test(name,fn){fn();checks++;console.log('PASS: '+name);}
test('shared hand-derived solver vectors',()=>{
 for(const v of JSON.parse(fs.readFileSync(new URL('../../audit/direct-labels/solver-cases.json',import.meta.url)))) {
  const r=solveDirectLabels(v.anchors.map((anchor,i)=>({anchor,rank:v.ranks[i]})),v.lo,v.hi,v.height,v.gap);
  assert.deepEqual(r?.map(e=>e.center)??null,v.centers,v.name);if(v.order)assert.deepEqual(r.map(e=>e.rank),v.order);
 }
});
test('disabled exact ordinary scene and SVG',()=>{const c=input();delete c.style.directLabels;const a=resolved(c);c.style.directLabels=false;assert.equal(JSON.stringify(resolved(c)),JSON.stringify(a));assert.equal(resolvedSceneToSvg(a),resolvedSceneToSvg(resolved(c)));});
test('actual body identity and ink boxes; shared SVG plan',()=>{
 const r=resolved(input()),p=r.directLabelPlan;assert.equal(p.status,'placed');
 for(const e of p.entries){const point=r.panels[0].marks.filter(m=>m.kind==='point'&&m.series===e.key).at(-1);assert.deepEqual(e.marker.style,point.style);assert.equal(e.marker.geometry.radius,point.geometry.radius);assert.equal(e.marker.geometry.outlineWidth,point.geometry.outlineWidth);assert(e.box.right<=760);assert.equal(e.anchor,point.geometry.cy);if(e.key==='S3')assert.equal(e.half,point.geometry.radius+Math.sqrt(5)*point.geometry.outlineWidth/2);}
 for(let i=1;i<p.entries.length;i++)assert(p.entries[i].box.top>=p.entries[i-1].box.bottom+4);
 assert(resolvedSceneToSvg(r).includes('/direct-label'));assert(!sceneToSvg(compileTerminalScene(input())).includes('/direct-label'));
 assert.equal(resolveSceneFrame(r,.5).panels[0].directLabelPlan,undefined);assert.deepEqual(resolveSceneFrame(r,.5).panels[0].layout,r.fallbackScene.panels[0].layout);
});
function fallback(change,reason,measure=metric){const c=input();change(c);const r=resolved(c,measure);assert.equal(r.directLabelPlan.reason,reason);const ordinary=structuredClone(c);delete ordinary.style.directLabels;const b=resolved(ordinary,measure);assert.deepEqual(r.panels[0].layout,b.panels[0].layout);assert.deepEqual(r.panels[0].marks,b.panels[0].marks);}
test('ordinary evidence coverage errors are unchanged with opt-in',()=>{
 for(const domain of [{xDomain:[0,1.8]},{yDomain:[0,2.5]},{xDomain:[.5,2.5]}]) {
  const errors=[];
  for(const enabled of [false,true]) {
   const c=input();c.style.directLabels=enabled;for(const row of c.panels[0].data.series)row.y=[1,1.5,3];Object.assign(c.panels[0].data,domain);
   let measured=false;
   try {resolved(c,()=>{measured=true;throw Error('must not reach planner');});assert.fail('must reject');}
   catch(e){assert.equal(e.name,'FiguresteadConfigError');assert(e.message.includes('clipping may not hide evidence'));errors.push([e.name,e.message,e.path]);}
   assert.equal(measured,false);
  }
  assert.deepEqual(errors[0],errors[1]);
 }
});
test('admitted terminal center with clipped ink falls back',()=>{fallback(c=>c.panels[0].data.xDomain=[0,2],'terminal-marker-clipped');});
test('structural path, count and text eligibility',()=>{
 fallback(c=>c.panels[0].data.x=[0,0,2],'unsupported-geometry');fallback(c=>{c.panels[0].data.x=[0,2,1];c.panels[0].data.revealOrder='random';},'unsupported-geometry');
 fallback(c=>c.panels[0].encoding.interpolation='monotone','unsupported-geometry');fallback(c=>c.panels[0].data.series.pop()&&c.panels[0].data.series.pop(),'unsupported-series-count');
 for(const label of ['',' ','A\nB','A\tB','A\rB','é'])fallback(c=>c.panels[0].data.series[0].label=label,'unsupported-text');
 const c=input();c.panels[0].data.series[0].label='$x$ <&>';assert(resolvedSceneToSvg(resolved(c)).includes('$x$ &lt;&amp;&gt;'));
});
test('capacity, missing measurement, annotations and forbidden legend',()=>{
 fallback(c=>c.panels[0].data.series[0].label='X'.repeat(100),'horizontal-capacity');fallback(()=>{},'vertical-capacity',t=>t.startsWith('S')?{width:20,left:0,right:20,ascent:200,descent:10}:metric(t));
 fallback(()=>{},'unsupported-layout',null);
 fallback(c=>c.panels[0].annotations=[{type:'focus',label:'annotation',x:1,y:1}],'unsupported-layout');
 const c=input();c.panels[0].presentation={legend:'none'};assert.throws(()=>resolved(c),/fallback/);
});
test('leader threshold and contrast, stable tied rank, cap',()=>{
 const c=input();c.panels[0].data.yDomain=[0,6];for(const s of c.panels[0].data.series)s.y=[1,2,3];const r=resolved(c),p=r.directLabelPlan;
 assert.deepEqual(p.entries.map(e=>e.rank),[0,1,2]);assert(p.entries[0].leader);assert.equal(p.entries[1].leader,null);assert(p.entries[2].leader);
 for(const e of p.entries.filter(e=>e.leader)){assert(e.leader.x2<e.box.left);assert.equal(e.leader.y1,e.anchor);assert.equal(e.leader.color,theme.secondary);}
 const width=r.fallbackScene.panels[0].layout.plot.right-r.fallbackScene.panels[0].layout.plot.left;assert(p.shrink<=width*.25);
 fallback(c=>c.theme={...theme,secondary:theme.field,label:theme.field},'ink-contrast');
});
test('measured overhang, actual-context leader fallback and invalid options',()=>{
 const c=input();c.panels[0].data.yDomain=[0,6];for(const row of c.panels[0].data.series)row.y=[1,2,3];
 c.theme={...theme,secondary:theme.field};const r=resolved(c);assert.equal(r.directLabelPlan.entries[0].leader.color,theme.label);
 c.theme={...c.theme,panel:theme.label};assert.equal(resolved(c).directLabelPlan.reason,'ink-contrast');
 const wide=resolved(input(),t=>t.startsWith('S')?{width:30,left:5,right:35,ascent:8,descent:4}:metric(t));
 for(const e of wide.directLabelPlan.entries){assert(e.textX-e.text.left>=e.box.left);assert(e.textX+e.text.right<=e.box.right);}
 for(const directLabels of ['yes',1,{}]){const b=input();b.style.directLabels=directLabels;assert.throws(()=>resolved(b),/must be boolean/);}
 fallback(()=>{},'unsupported-layout',t=>t.startsWith('S')?{width:20}:metric(t));
 fallback(c=>{c.panels.push({...structuredClone(c.panels[0]),id:'second'});},'unsupported-layout');
});
test('orthogonal rhythms activate actual stroke samples on every row',()=>{
 for(const [key,rhythm] of [['S3','dash'],['S1','dash'],['S3','dot'],['S3','dash-dot']]){
  const c=input();c.style.series[key]={lineStyle:rhythm};const r=resolved(c),p=r.directLabelPlan;
  assert.equal(p.status,'placed');assert.equal(p.lineSamplesRequired,true);assert.equal(p.sampleWidth,32);
  for(const e of p.entries){
   const body=r.panels[0].marks.find(m=>m.kind==='segment'&&m.series===e.key);
   assert.deepEqual(e.lineSample.style,body.style);assert.equal(e.lineSample.geometry.x2-e.lineSample.geometry.x1,32);
   assert.equal(e.marker.style.glyph,{S1:'ring',S2:'square',S3:'triangle'}[e.key]);
   assert(e.lineSample.geometry.x1>=e.box.left);if(e.leader)assert(e.leader.x2<e.box.left);
  }
  const svg=resolvedSceneToSvg(r);for(const e of p.entries)assert(svg.includes(e.lineSample.id));
  c.style.directLabels=false;const ordinary=resolved(c);
  for(const item of ordinary.panels[0].legend)assert.equal(item.style.lineStyle,ordinary.panels[0].marks.find(m=>m.kind==='segment'&&m.series===item.key).style.lineStyle);
 }
 const control=resolved(input()).directLabelPlan;assert(!control.lineSamplesRequired);assert(control.entries.every(e=>!e.lineSample));
});
test('sample width participates in atomic capacity failure',()=>{
 const c=input();c.style.series.S3={lineStyle:'dash'};for(const s of c.panels[0].data.series)s.label='Long authored series name';
 const r=composeResolvedScene(resolveTerminalScene(compileTerminalScene(c),{width:520,height:520,measureText:metric}));
 assert.equal(r.directLabelPlan.reason,'horizontal-capacity');assert.equal(r.directLabelPlan.lineSamplesRequired,true);
 delete c.style.directLabels;const b=composeResolvedScene(resolveTerminalScene(compileTerminalScene(c),{width:520,height:520,measureText:metric}));
 assert.deepEqual(r.panels[0].layout,b.panels[0].layout);assert.deepEqual(r.panels[0].marks,b.panels[0].marks);
});

test('sparse cadence retains terminal identity, rhythm plans and fallback',()=>{
 for(const rhythm of [null,'dash','dot','dash-dot']) {
  const c=input();c.style.markerStride=4;if(rhythm)c.style.series.S3={lineStyle:rhythm};
  c.panels[0].data.x=Array.from({length:10},(_,i)=>i);
  for(const s of c.panels[0].data.series)s.y=Array(10).fill(s.y[0]);
  const r=resolved(c),p=r.directLabelPlan;assert.equal(p.status,'placed');assert.equal(!!p.lineSamplesRequired,!!rhythm);
  const full=structuredClone(c);delete full.style.markerStride;assert.deepEqual(p,resolved(full).directLabelPlan);
  for(const e of p.entries){const point=r.panels[0].marks.filter(m=>m.kind==='point'&&m.series===e.key).at(-1);assert(point.id.endsWith('/9'));assert.deepEqual(e.marker.style,point.style);if(rhythm)assert.deepEqual(e.lineSample.style,point.style);}
  for(const s of c.panels[0].data.series)s.label='Long series name '.repeat(20);
  const fail=resolved(c);assert.equal(fail.directLabelPlan.reason,'horizontal-capacity');
  c.style.directLabels=false;assert.deepEqual(fail.panels[0].layout,resolved(c).panels[0].layout);assert.deepEqual(fail.panels[0].marks,resolved(c).panels[0].marks);
 }
});
console.log(JSON.stringify({suite:'direct-labels',checks,result:'PASS'}));
