import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileTerminalScene, resolveTerminalScene, exportFigureSvg, resolvedSceneToSvg, validateContract } from '../src/index.js';
import { composeResolvedScene } from '../src/composition.js';
import { resolveSeriesStyles, GLYPH_CYCLE, HATCH_CYCLE, LINE_STYLE_CYCLE } from '../src/series-style.js';
import { lineIdentityContract } from '../../ci/fixtures/line-identity.js';
const theme=JSON.parse(fs.readFileSync('src/figurestead/themes/lavender_fog_notebook.json')).themes.lavender_fog_notebook;
function contract(n) {
 const c=lineIdentityContract(theme);delete c.style.lineStyles;
 c.panels[0].data.series=Array.from({length:n},(_,i)=>({key:`S${i+1}`,label:`S${i+1}`,y:[i+1,i+1.1,i+1]}));
 return c;
}
const rows=[];
for(const n of [3,4,5,6,13,17]) {
 const c=contract(n), normalized=validateContract(c);
 assert.deepEqual(normalized.style.lineStyles,['solid']);
 const direct=resolveSeriesStyles(c),scene=compileTerminalScene(c);
 const former=structuredClone(c);former.style.lineStyles=[...LINE_STYLE_CYCLE];
 const formerStyles=compileTerminalScene(former).seriesStyles;
 const panel=composeResolvedScene(resolveTerminalScene(scene,{width:760,height:520})).panels[0];
 Object.entries(scene.seriesStyles).forEach(([key,s],i)=>{
  assert.equal(s.lineStyle,'solid');assert.equal(direct[key].lineStyle,'solid');
  assert.equal(s.glyph,GLYPH_CYCLE[i%4]);assert.equal(s.color,theme.series[i%theme.series.length]);
  assert.equal(s.hatch,HATCH_CYCLE[i%4]);
  assert.deepEqual({...s,lineStyle:null},{...formerStyles[key],lineStyle:null},'only implicit rhythm changes');
  for(const mark of panel.marks.filter(m=>m.series===key))assert.deepEqual(mark.style,s);
  assert.deepEqual(panel.legend.find(e=>e.key===key).style,s);
 });
 assert.doesNotMatch(exportFigureSvg(c),/stroke-dasharray/);
 const explicit=structuredClone(c);explicit.style.lineStyles=['solid'];
 assert.equal(exportFigureSvg(c),exportFigureSvg(explicit));
 rows.push({series:n,styles:Object.values(scene.seriesStyles).map(({color,glyph,lineStyle,hatch,lineWidth})=>({color,glyph,lineStyle,hatch,lineWidth}))});
}
const withoutStyle=contract(17);delete withoutStyle.style;
assert.deepEqual(validateContract(withoutStyle).style.lineStyles,['solid']);
assert.ok(Object.values(compileTerminalScene(withoutStyle).seriesStyles).every(s=>s.lineStyle==='solid'));
for(const cycle of [undefined,['dash'],['solid','dash','dot','dash-dot']]) {
 const c=contract(17);if(cycle)c.style.lineStyles=cycle;
 c.style.series={S1:{lineStyle:'dash'},S2:{lineStyle:'dot'},S3:{lineStyle:'dash-dot'},S5:{color:'#123456'},S9:{lineStyle:'dash'}};
 const scene=compileTerminalScene(c);
 assert.equal(scene.seriesStyles.S1.lineStyle,'dash');assert.equal(scene.seriesStyles.S2.lineStyle,'dot');assert.equal(scene.seriesStyles.S3.lineStyle,'dash-dot');
 assert.equal(scene.seriesStyles.S5.lineStyle,cycle ? cycle[Math.floor(4/4)%cycle.length] : 'solid');
 assert.equal(scene.seriesStyles.S9.lineStyle,'dash');
 const plain=contract(17);if(cycle)plain.style.lineStyles=cycle;
 Object.values(compileTerminalScene(plain).seriesStyles).forEach((s,i)=>assert.equal(s.lineStyle,cycle ? cycle[Math.floor(i/4)%cycle.length] : 'solid'));
 const svg=exportFigureSvg(c);
 for(const value of ['7 4','2 4','8 3 2 3'])assert.ok(svg.includes(`stroke-dasharray="${value}"`));
}
assert.deepEqual(LINE_STYLE_CYCLE,['solid','dash','dot','dash-dot'],'existing exported explicit cycle is retained');
for(const value of [[],['invalid'],false,'dash']) {
 const c=contract(5);c.style.lineStyles=value;assert.throws(()=>compileTerminalScene(c),/config.style.lineStyles/);
}
// Non-line point and summary rendering must not acquire meaning from unused
// series rhythm metadata. Explicit family-owned summary strokes remain solid.
for(const renderer of ['scatter','strip_summary']) {
 const c=contract(17), p=c.panels[0],keys=p.data.series.map(s=>s.key);
 p.renderer=renderer;
 const common={series:keys,seriesLabels:Object.fromEntries(keys.map(k=>[k,k]))};
 if(renderer==='scatter')p.data={...common,x:keys.map((_,i)=>i),y:keys.map((_,i)=>i%4),summary:'linear_fit',revealOrder:'x'};
 else {p.xScale={type:'band'};p.data={...common,groups:['A','B'],group:keys.map((_,i)=>i%2?'B':'A'),values:keys.map((_,i)=>i%4),summary:'median',revealOrder:'input'};}
 const oldStyle=structuredClone(c);oldStyle.style.lineStyles=[...LINE_STYLE_CYCLE];
 // Compare rendering without source-contract fingerprint metadata, which
 // correctly differs for an explicitly authored array.
 const render=value=>resolvedSceneToSvg(composeResolvedScene(resolveTerminalScene(compileTerminalScene(value),{width:760,height:520})));
 assert.equal(render(c),render(oldStyle),`${renderer}: unused rhythm must not change output`);
}
console.log(JSON.stringify({suite:'implicit-rhythm',result:'PASS',allocation:rows}));
