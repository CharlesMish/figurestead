import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileFigureModel } from '../src/terminal-scene.js';
import { lineIdentityContract } from '../../ci/fixtures/line-identity.js';
const theme=JSON.parse(fs.readFileSync('src/figurestead/themes/lavender_fog_notebook.json')).themes.lavender_fog_notebook;
const make=keys=>{const c=lineIdentityContract(theme);c.panels[0].data.series=keys.map((key,i)=>({key,label:key,y:[i+1,i+1,i+1]}));return c;};
let ranks=[], expected=new Map();
for(const keys of [['A','B'],['B','C'],['A','B','C'],['D','C'],['E','F'],['D','A','F']]){
 const c=make(keys);c.style.series={C:{lineStyle:'dash'},E:{color:'#123456',glyph:'ring'},F:{color:'#123456',glyph:'ring'}};
 const m=compileFigureModel(c,{styleRanks:ranks});ranks=m.styleRanks;
 for(const key of keys){if(!expected.has(key))expected.set(key,expected.size);const rank=expected.get(key),s=m.scene.seriesStyles[key];
  assert.equal(new Map(ranks).get(key),rank);assert.equal(s.colorIndex,rank%theme.series.length);
  assert.equal(s.glyph,['E','F'].includes(key)?'ring':['ring','square','triangle','diamond'][rank%4]);
  assert.equal(s.color,['E','F'].includes(key)?'#123456':theme.series[rank%theme.series.length]);
  assert.equal(s.lineStyle,key==='C'?'dash':'solid');
 }
}
assert.deepEqual(compileFigureModel(make(['F','A'])).styleRanks,[['F',0],['A',1]]);
console.log('hostile HC1 registration: PASS');

const {resolveTerminalScene,resolvedSceneToSvg}=await import('../src/index.js');
const {composeResolvedScene}=await import('../src/composition.js');
const finite=value=>{if(typeof value==='number')assert.ok(Number.isFinite(value));else if(value && typeof value==='object')Object.values(value).forEach(finite);};
for(const occupied of [['B','C'],['A','C'],['A','B'],['B']]){
 const c=make(['s']);const p=c.panels[0];p.renderer='strip_summary';p.xScale={type:'band'};
 p.data={groups:['A','B','C'],group:occupied.flatMap(k=>[k,k]),values:occupied.flatMap(()=>[2,4]),series:occupied.flatMap(()=>['s','s']),seriesLabels:{s:'s'},summary:'median',revealOrder:'input'};
 const m=compileFigureModel(c),panel=m.scene.panels[0];
 assert.deepEqual(panel.categories.x,['A','B','C']);
 assert.deepEqual(panel.marks.filter(m=>m.kind==='median-rule').map(m=>[m.group,m.y]),occupied.map(k=>[k,3]));
 finite(m.scene);const composed=composeResolvedScene(resolveTerminalScene(m.scene,{width:760,height:520}));finite(composed);
 assert.doesNotMatch(resolvedSceneToSvg(composed),/NaN|Infinity/);
}
console.log('hostile HC2 empty groups: 4 PASS');

const {LINE_RENDERER}=await import('../src/core-renderers.js');
for(const n of [1,3])for(const points of [1,2]){
 const c=make(Array.from({length:n},(_,i)=>`s${i}`));c.panels[0].data.x=c.panels[0].data.x.slice(0,points);
 c.panels[0].data.series.forEach(s=>s.y=s.y.slice(0,points));c.style.series={s0:{lineStyle:'dash'}};
 const m=compileFigureModel(c),p=m.scene.panels[0];
 assert.equal(p.marks.filter(m=>m.kind==='segment').length,n*(points-1));
 assert.ok(p.legend.every(e=>points===1?e.lineSample===false:e.lineSample===undefined));
 const svg=resolvedSceneToSvg(composeResolvedScene(resolveTerminalScene(m.scene,{width:760,height:520})));
 assert.equal((svg.match(/-legend-\d+"[^>]*stroke-linecap/g)||[]).length,points===1?0:n);
 const summary=LINE_RENDERER.describe(m.preparedPanels[0].contract).summary;
 assert.match(summary,points===1?/point-only series/:/connected series/);
}
console.log('hostile HC3 topology: 4 PASS');

const {encodeIdComponent}=await import('../src/semantic-id.js');
const ids=['A B','A/B','A-B','A~20B','λ','safe_1.x','\ud800'];
assert.deepEqual(ids.map(encodeIdComponent),['A~20B','A~2FB','A-B','A~7E20B','~CE~BB','safe_1.x','~uD800']);
const {evidenceFingerprint}=await import('../src/terminal-scene.js');
for(const keys of [ids,['mzq0kr','1bf3idp']]){
 const c=make(keys);if(keys===ids){c.panels[0].id='P A';const second=structuredClone(c.panels[0]);second.id='P/A';c.panels.push(second);}
 const m=compileFigureModel(c), marks=m.scene.panels.flatMap(p=>p.marks);
 assert.equal(new Set(marks.map(m=>m.id)).size,marks.length);
 assert.equal(evidenceFingerprint(m.scene),evidenceFingerprint(compileFigureModel(c).scene));
 const svg=resolvedSceneToSvg(composeResolvedScene(resolveTerminalScene(m.scene,{width:1008,height:624})));
 const resources=[...svg.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(resources).size,resources.length);
 for(const ref of svg.matchAll(/url\(#([^)]*)\)/g))assert.ok(resources.includes(ref[1]));
 if(keys!==ids)assert.match(svg,/65d1ead2-identity~1/,'real FNV collision gets a distinct resource');
}
console.log('hostile HC4 encoding/resources: 2 contracts + 7 encodings PASS');
for(const keys of [['treatment','treatment','control'],['z','a','z']])for(const renderer of ['scatter','strip_summary']){
 const c=make(['s']),p=c.panels[0],order=[...new Set(keys)];p.renderer=renderer;
 const common={series:keys,seriesLabels:Object.fromEntries(order.map(k=>[k,k]))};
 if(renderer==='scatter')p.data={...common,x:[0,1,2],y:[1,2,3],revealOrder:'input'};
 else{p.xScale={type:'band'};p.data={...common,groups:['G'],group:['G','G','G'],values:[1,2,3],summary:'median',revealOrder:'input'};}
 const m=compileFigureModel(c);assert.deepEqual(m.scene.panels[0].legend.map(e=>e.key),order);
 order.forEach((key,i)=>assert.equal(m.scene.seriesStyles[key].color,theme.series[i]));
}
console.log('hostile HC5 browser category comparison: 4 PASS');
