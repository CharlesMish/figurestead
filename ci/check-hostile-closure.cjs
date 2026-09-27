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
      const same=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(m+JSON.stringify({a,b}));};
      const c=lineIdentityContract(theme);c.style.directLabels=true;c.style.markerStride=4;
      c.style.series={C:{lineStyle:'dash'},E:{color:'#123456',glyph:'ring'},F:{color:'#123456',glyph:'ring'}};
      const row=key=>({key,label:key,y:[1,2,3]}), data=keys=>({...c.panels[0].data,series:keys.map(row)});
      c.panels[0].data=data(['A','B']);
      const canvas=document.createElement('canvas');canvas.style.cssText='width:1008px;height:624px';document.body.append(canvas);
      const f=api.createFigurestead(canvas,c,{autoplay:false,reducedMotion:true,dprCap:1});
      try {
        const registered=new Map();
        for(const keys of [['A','B'],['B','C'],['A','B','C'],['D','C'],['E','F'],['D','A','F']]) {
          f.setData(data(keys));const scene=f.getScene(),panel=f.getComposedScene().panels[0];
          for(const key of keys){if(!registered.has(key))registered.set(key,registered.size);const rank=registered.get(key),s=scene.seriesStyles[key];
            same(s.colorIndex,rank%theme.series.length,'rank color');
            same(s.glyph,['E','F'].includes(key)?'ring':['ring','square','triangle','diamond'][rank%4],'glyph');
            same(s.lineStyle,key==='C'?'dash':'solid','rhythm');
            for(const mark of panel.marks.filter(m=>m.series===key))same(mark.style,s,'body');
            same(panel.legend.find(e=>e.key===key).style,s,'legend');
            const plan=panel.directLabelPlan;
            if(plan?.status==='placed')for(const entry of plan.entries)if(entry.key===key)same(entry.marker.style.glyph,s.glyph,'direct marker');
          }
          const svg=api.resolvedSceneToSvg(f.getComposedScene());if(!svg.includes('<svg'))throw Error('SVG');
        }
        const reset=structuredClone(c);reset.panels[0].data=data(['F','A']);f.setConfig(reset);
        same(f.getScene().seriesStyles.F.colorIndex,0,'reset F');same(f.getScene().seriesStyles.A.colorIndex,1,'reset A');
        for(const occupied of [['B','C'],['A','C'],['A','B'],['B']]) {
          const strip=lineIdentityContract(theme),p=strip.panels[0];p.renderer='strip_summary';p.xScale={type:'band'};
          p.data={groups:['A','B','C'],group:occupied.flatMap(k=>[k,k]),values:occupied.flatMap(()=>[2,4]),series:occupied.flatMap(()=>['s','s']),seriesLabels:{s:'s'},summary:'median',revealOrder:'input'};
          f.setConfig(strip);same(f.getScene().panels[0].categories.x,['A','B','C'],'empty categories');
          same(f.getScene().panels[0].marks.filter(m=>m.kind==='median-rule').map(m=>[m.group,m.y]),occupied.map(k=>[k,3]),'occupied medians');
          if(/NaN|Infinity/.test(api.resolvedSceneToSvg(f.getComposedScene())))throw Error('nonfinite strip SVG');
          if(!canvas.toDataURL().startsWith('data:image/png'))throw Error('Canvas');
        }
        return {result:'PASS',hc1Updates:6,hc2EmptyGroups:4};
      } finally{f.destroy();canvas.remove();}
    });
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
