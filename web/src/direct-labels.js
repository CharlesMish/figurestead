// Internal screen-down PAVA planner. No renderer presets or detached glyph cycle.
export const DIRECT_FONT = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";
export function solveDirectLabels(entries, lo, hi, height, gap = 4) {
  const ordered = [...entries].sort((a,b)=>a.anchor-b.anchor || a.rank-b.rank);
  const s=height+gap, low=lo+height/2, high=hi-height/2-(ordered.length-1)*s;
  if (!ordered.length || high<low) return null;
  const blocks=[];
  ordered.forEach((e,i)=>{blocks.push({sum:e.anchor-i*s,n:1});
    while(blocks.length>1 && blocks.at(-2).sum/blocks.at(-2).n>blocks.at(-1).sum/blocks.at(-1).n) {
      const b=blocks.pop();blocks.at(-1).sum+=b.sum;blocks.at(-1).n+=b.n;
    }
  });
  const z=blocks.flatMap(b=>Array(b.n).fill(Math.min(high,Math.max(low,b.sum/b.n))));
  return ordered.map((e,i)=>({...e,center:z[i]+i*s}));
}
export function literalLabel(t) {return typeof t==='string' && !!t.trim() && /^[\x20-\x7e]+$/.test(t);}
function contrast(a,b) {
  const lum=c=>{const v=c.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
  const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
const fail=reason=>({status:'fallback',reason});
export function planDirectLabels(scene, resolved, measure) {
  if(resolved.panels.length!==1) return fail('unsupported-layout');
  const p=resolved.panels[0], input=p.directLabelsInput, plot=p.axes.plot??p.layout.plot;
  if(!input || p.renderer!=='line') return fail('unsupported-geometry');
  const data=input.data;
  if(data.series.length<2 || data.series.length>3) return fail('unsupported-series-count');
  if(p.scales.x.type!=='linear'||p.scales.y.type!=='linear'||p.encoding.interpolation!=='linear'
    ||input.pose || data.x.length<2 || data.x.some((x,i)=>!Number.isFinite(x)||(i>0&&x<=data.x[i-1]))
    ||p.domain.x[0]>=p.domain.x[1]||p.domain.y[0]>=p.domain.y[1]) return fail('unsupported-geometry');
  if(!data.series.every(s=>literalLabel(s.label)))return fail('unsupported-text');
  if(p.annotations.length || !measure || p.layout.headerText || resolved.width<=480) return fail('unsupported-layout');
  const entries=[];let markerHalf=0,textWidth=0,height=0;
  for(const s of data.series) {
    const x=data.x.at(-1),y=s.y.at(-1);
    // Ordinary compileFigureModel evidence coverage has already admitted all observations.
    const points=p.marks.filter(m=>m.kind==='point'&&m.series===s.key), point=points.at(-1);
    if(!point?.lineIdentity || point.x!==x || point.y!==y || !['ring','square','triangle','diamond'].includes(point.style.glyph))return fail('unsupported-geometry');
    // Native Canvas/SVG polygon strokes use miter joins. Include their tips,
    // not just radius + half-width (triangle apex extends sqrt(5) half-widths).
    const join = point.style.glyph==='triangle' ? Math.sqrt(5) : point.style.glyph==='diamond' ? Math.SQRT2 : 1;
    const g=point.geometry,half=g.radius+join*(g.outlineWidth+(point.style.edge?1.3:0))/2;
    if(g.cx-half<plot.left||g.cx+half>plot.right||g.cy-half<plot.top||g.cy+half>plot.bottom)return fail('terminal-marker-clipped');
    let t;
    try { t=measure(s.label,p.layout.font.legend,'normal'); } catch { return fail('unsupported-layout'); }
    if(!t || !['width','ascent','descent','left','right'].every(k=>Number.isFinite(t[k])) || t.ascent+t.descent<=0)return fail('unsupported-layout');
    const inks=[point.style.color,point.style.edge,scene.theme.label].filter(Boolean);
    if(inks.some(c=>!/^#[0-9a-f]{6}$/i.test(c))) return fail('unsupported-geometry');
    if(inks.some(c=>contrast(c,scene.theme.field)<3))return fail('ink-contrast');
    entries.push({key:s.key,label:s.label,anchor:g.cy,rank:input.ranks[s.key],point,text:t,half});
    markerHalf=Math.max(markerHalf,half);textWidth=Math.max(textWidth,t.left+t.right,t.width);height=Math.max(height,t.ascent+t.descent,half*2);
  }
  const H=height+4,required=12+markerHalf*2+6+textWidth+4;
  const right=p.layout.rect.right-2,shrink=Math.max(0,required-(right-plot.right));
  if(shrink>.25*(plot.right-plot.left)||plot.right-shrink-plot.left<160)return fail('horizontal-capacity');
  const planned=solveDirectLabels(entries,plot.top,plot.bottom,H);
  if(!planned)return fail('vertical-capacity');
  const newRight=plot.right-shrink, markerX=newRight+12+markerHalf+2,textX=markerX+markerHalf+6;
  const substrates=[scene.theme.field,p.presentation.panelSurface?scene.theme.panel:scene.theme.field];
  const leaderColor=[scene.theme.secondary,scene.theme.label].find(c=>substrates.every(b=>contrast(c,b)>=3));
  const output=[];
  for(const e of planned) {
    const anchorX=plot.left+(e.point.geometry.cx-plot.left)*(newRight-plot.left)/(plot.right-plot.left);
    if(anchorX+e.half>newRight || anchorX-e.half<plot.left)return fail('terminal-marker-clipped');
    const moved=Math.abs(e.center-e.anchor)>.75;
    if(moved&&!leaderColor)return fail('ink-contrast');
    output.push({...e,markerX,textX:textX+e.text.left,textY:e.center+(e.text.ascent-e.text.descent)/2,
      marker:{...e.point,id:e.point.id+'/direct-label',geometry:{...e.point.geometry,cx:markerX,cy:e.center}},
      leader:moved?{x1:anchorX+markerHalf+2,y1:e.anchor,x2:markerX-markerHalf-3,y2:e.center,color:leaderColor}:null,
      box:{left:markerX-markerHalf-2,top:e.center-H/2,right:textX+textWidth+2,bottom:e.center+H/2}});
  }
  return {status:'placed',reason:null,entries:output,shrink,plot:{...plot,right:newRight},height:H,font:p.layout.font.legend};
}
