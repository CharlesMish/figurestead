// Direct native Canvas regressions; existing CI server, no qualification harness.
const engine = require('playwright')[process.env.FIGURESTEAD_BROWSER || 'chromium'];
const base = process.env.FIGURESTEAD_BASE_URL || 'http://127.0.0.1:4179/';
(async () => {
  const browser = await engine.launch({ headless: true, ...(process.env.FIGURESTEAD_BROWSER_EXECUTABLE ? { executablePath: process.env.FIGURESTEAD_BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    // Optional socket-free local development transport; product bytes unmodified.
    if (process.env.FIGURESTEAD_LOCAL_SOURCE_ROOT) {
      const fs = require('node:fs'), path = require('node:path'), root = fs.realpathSync(process.env.FIGURESTEAD_LOCAL_SOURCE_ROOT);
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        if (url.origin !== new URL(base).origin || !file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.realpathSync(file).startsWith(root + path.sep)) return route.abort();
        await route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'text/html' });
      });
    }
    await page.goto(new URL('ci/fixtures/readability-micro-polish.html', base).href);
    const result = await page.evaluate(async () => {
      const api=await import('/web/src/index.js');
      const {lineIdentityContract}=await import('/ci/fixtures/line-identity.js');
      const theme=(await(await fetch('/src/figurestead/themes/lavender_fog_notebook.json')).json()).themes.lavender_fog_notebook;
      const assert=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>assert(JSON.stringify(a)===JSON.stringify(b),m);
      const input=()=>{const c=lineIdentityContract(theme);c.style.directLabels=true;c.panels[0].data.yDomain=[0,6];for(const s of c.panels[0].data.series)s.y=[1,2,3];return c;};
      const create=(c,options={})=>{const canvas=document.createElement('canvas');canvas.style.cssText='width:760px;height:520px';document.body.append(canvas);const figure=api.createFigurestead(canvas,c,{autoplay:false,reducedMotion:true,dprCap:1,...options});return {figure,canvas};};
      const dispose=o=>{o.figure.destroy();o.canvas.remove();};
      const checks=[];
      for(const override of [{},{lineStyle:'dash'},{color:theme.series[2]},{glyph:'diamond',lineStyle:'dot',color:theme.series[1],edge:theme.label}]) {
        const c=input();c.style.series.S2=override;
        const o=create(c);
        try {
          const first=o.figure.getComposedScene();assert(first.directLabelPlan.status==='placed','initial placed');
          const styles=structuredClone(o.figure.getScene().seriesStyles),ranks=structuredClone(o.figure.getScene().directRanks);
          const validate=()=>{const r=o.figure.getComposedScene(),p=r.directLabelPlan;assert(p.status==='placed','update placed');
            for(const e of p.entries){const m=r.panels[0].marks.filter(m=>m.kind==='point'&&m.series===e.key).at(-1);same(e.marker.style,m.style,'body style');same(e.marker.style,styles[e.key],'retained style');assert(e.rank===ranks[e.key],'retained rank');assert(e.anchor===m.geometry.cy,'terminal height');assert(e.box.right<=760,'gutter inside');if(p.lineSamplesRequired)same(e.lineSample.style,r.panels[0].marks.find(m=>m.kind==='segment'&&m.series===e.key).style,'retained body sample style');}
            same(p.entries.map(e=>e.rank),p.entries.map(e=>e.rank).sort((a,b)=>a-b),'stable exact ties');
          };
          const data=c.panels[0].data,[a,b,d]=data.series;
          for(const rows of [[b,d],[d,b],[a,b,d]]){o.figure.setData({...data,series:rows});validate();}
          const png=o.canvas.toDataURL();const box=JSON.stringify(o.figure.getComposedScene().panels[0].layout.plot);
          o.figure.resize();assert(o.canvas.toDataURL()===png,'repeat resize no drift');assert(JSON.stringify(o.figure.getComposedScene().panels[0].layout.plot)===box,'box no drift');
          o.canvas.style.width='700px';o.figure.resize();assert(o.figure.getComposedScene().directLabelPlan.status==='placed','resize remeasure');
          o.canvas.style.width='760px';o.figure.resize();assert(o.canvas.toDataURL()===png,'resize round trip');
          const reset=input();reset.panels[0].data.series.reverse();o.figure.setConfig(reset);
          same(o.figure.getComposedScene().directLabelPlan.entries.map(e=>e.key),['S3','S2','S1'],'setConfig resets registration');
          checks.push('keyed '+JSON.stringify(override));
        } finally {dispose(o);}
      }
      const future=input();future.style.series.S4={lineStyle:'dash'};
      const q=create(future);
      try {
        const data=future.panels[0].data, s4={key:'S4',label:'future',y:[1,2,3]};
        q.figure.setData({...data,series:[data.series[1],s4]});
        const established=structuredClone(q.figure.getScene().seriesStyles.S4);
        assert(established.lineStyle==='dash','future override');
        assert(q.figure.getComposedScene().directLabelPlan.entries.find(e=>e.key==='S4').rank===3,'future registration');
        q.figure.setData({...data,series:[s4,data.series[1]]});
        same(q.figure.getScene().seriesStyles.S4,established,'future established identity');
        const e=q.figure.getComposedScene().directLabelPlan.entries.find(e=>e.key==='S4');
        same(e.marker.style,established,'future direct body identity');assert(e.rank===3,'future retained rank');
        checks.push('future key partial override and registration retention');
      } finally {dispose(q);}
      // Actual drawing invokes the same body helper for direct marker outlines.
      const c=input();c.panels[0].data.series[0].label='$A$ <&>';
      const o=create(c);
      try {
        const ctx=o.canvas.getContext('2d'),texts=[],strokes=[];
        const fill=ctx.fillText,stroke=ctx.stroke;
        ctx.fillText=function(text,x,y){if(new Error().stack.includes('drawDirectLabels'))texts.push({text,x,y,font:this.font});return fill.call(this,text,x,y);};
        ctx.stroke=function(...args){if(new Error().stack.includes('drawDirectLabels'))strokes.push({style:this.strokeStyle,width:this.lineWidth,alpha:this.globalAlpha,stack:new Error().stack});return stroke.apply(this,args);};
        o.figure.resize();const r=o.figure.getComposedScene(),p=r.directLabelPlan;
        assert(texts.length===3,'three literal labels drawn');for(const e of p.entries)assert(texts.some(t=>t.text===e.label&&t.x===e.textX&&t.y===e.textY),'actual text positions');
        assert(strokes.filter(s=>s.stack.includes('drawPoint')).length===3,'actual body marker helper reused');
        assert(strokes.every(s=>s.alpha===1),'full opacity');
        const svg=api.resolvedSceneToSvg(r,{idPrefix:'direct-test'}),doc=new DOMParser().parseFromString(svg,'image/svg+xml');assert(!doc.querySelector('parsererror'),'valid SVG');
        for(const e of p.entries)assert(doc.querySelector(`[data-mark-id="${e.marker.id}"]`),'SVG actual marker id');
        assert([...doc.querySelectorAll('text')].some(t=>t.textContent==='$A$ <&>'),'SVG literal text');
        const encoded='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg))),image=new Image();image.src=encoded;await image.decode();assert(image.width===760&&image.height===520,'native SVG decode');
        checks.push('native text, marker, composed SVG serialization/decode');
      } finally {dispose(o);}
      for(const [name,mutate,reason] of [
        ['ink',c=>{c.theme={...theme,label:theme.field,secondary:theme.field};},'ink-contrast'],
        ['text',c=>{c.panels[0].data.series[0].label='not\na line';},'unsupported-text'],
        ['capacity',c=>{c.panels[0].data.series[0].label='A'.repeat(200);},'horizontal-capacity'],
        ['marker',c=>{c.panels[0].data.xDomain=[0,2];},'terminal-marker-clipped'],
      ]) {
        const c=input();mutate(c);const ordinary=structuredClone(c);delete ordinary.style.directLabels;
        const a=create(c),b=create(ordinary);try {assert(a.figure.getComposedScene().directLabelPlan.reason===reason,name+' reason');assert(a.canvas.toDataURL()===b.canvas.toDataURL(),name+' fallback pixels');checks.push(name+' fallback');} finally {dispose(a);dispose(b);}
      }
      // Authored rhythm is sampled from body strokes; setConfig remains replacement.
      for(const key of ['S3','S1']) {
        const c=input();c.style.series[key]={lineStyle:'dash'};const o=create(c);
        try {
          const ctx=o.canvas.getContext('2d'),calls=[],stroke=ctx.stroke;
          ctx.stroke=function(...args){const stack=new Error().stack;if(stack.includes('drawDirectLabels'))calls.push({stack,dash:this.getLineDash(),color:this.strokeStyle,alpha:this.globalAlpha});return stroke.apply(this,args);};
          o.figure.resize();const r=o.figure.getComposedScene(),p=r.directLabelPlan;
          assert(p.status==='placed'&&p.lineSamplesRequired,'rhythm plan placed');
          const samples=calls.filter(s=>s.stack.includes('drawLine'));
          assert(samples.length===3,'all rows use body line helper');
          assert(samples.filter(s=>s.dash.join(',')==='7,4').length===1,'one actual dashed sample');
          assert(samples.every(s=>Math.abs(s.alpha-.78)<1e-6),'actual Canvas stroke opacity');
          for(const call of calls.filter(s=>!s.stack.includes('drawLine')&&!s.stack.includes('drawPoint'))){assert(call.dash.length===0&&call.alpha===1,'neutral solid leaders');}
          const svg=api.resolvedSceneToSvg(r),doc=new DOMParser().parseFromString(svg,'image/svg+xml');
          for(const e of p.entries){const path=doc.querySelector(`[data-mark-id="${e.lineSample.id}"]`);assert(path,'SVG same composed sample');assert(path.getAttribute('stroke-dasharray')===(e.key===key?'7 4':null),'SVG actual rhythm');}
          const png=o.canvas.toDataURL(),box=JSON.stringify(r.panels[0].layout.plot);
          o.canvas.style.width='490px';o.figure.resize();
          // Force the same documented capacity case using measured long labels.
          const crowded=structuredClone(c);for(const row of crowded.panels[0].data.series)row.label='Long authored series name';
          o.figure.setConfig(crowded);assert(o.figure.getComposedScene().directLabelPlan.reason==='horizontal-capacity','sample capacity fallback');
          const plain=structuredClone(crowded);plain.style.directLabels=false;const b=create(plain);b.canvas.style.width='490px';b.figure.resize();
          assert(o.canvas.toDataURL()===b.canvas.toDataURL(),'rhythm fallback ordinary pixels');dispose(b);
          o.canvas.style.width='760px';o.figure.setConfig(c);o.figure.resize();assert(o.canvas.toDataURL()===png,'place fallback place pixels');assert(JSON.stringify(o.figure.getComposedScene().panels[0].layout.plot)===box,'no allocation accumulation');
          const full=structuredClone(c);full.style.series[key]={...o.figure.getScene().seriesStyles[key],color:theme.series[0]};o.figure.setConfig(full);
          assert(o.figure.getScene().seriesStyles[key].lineStyle==='dash','complete replacement retains rhythm');
          const partial=structuredClone(c);partial.style.series[key]={color:theme.series[0]};o.figure.setConfig(partial);
          assert(o.figure.getScene().seriesStyles[key].lineStyle==='solid','replacement omission restores default');
          assert(!o.figure.getComposedScene().directLabelPlan.lineSamplesRequired,'solid replacement compact control');
          checks.push('rhythm samples, capacity lifecycle, replacement '+key);
        } finally {dispose(o);}
      }
      const moving=input();moving.view.motion='semantic';moving.view.strategy='auto';const plain=structuredClone(moving);delete plain.style.directLabels;
      const a=create(moving,{reducedMotion:false}),b=create(plain,{reducedMotion:false});
      try{assert(a.canvas.toDataURL()===b.canvas.toDataURL(),'transitional ordinary pixels');a.figure.setReducedMotion(true);assert(a.figure.getComposedScene().directLabelPlan.status==='placed','settled plan');checks.push('motion ordinary fallback / settled placement');}finally{dispose(a);dispose(b);}
      return {result:'PASS',checks};
    });
    console.log(JSON.stringify(result));
  } finally {await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
