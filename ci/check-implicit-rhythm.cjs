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
      const api = await import('/web/src/index.js');
      const { drawResolvedPanel } = await import('/web/src/canvas-scene.js');
      const { lineIdentityContract } = await import('/ci/fixtures/line-identity.js');
      const theme = (await (await fetch('/src/figurestead/themes/lavender_fog_notebook.json')).json()).themes.lavender_fog_notebook;
      const same = (a,b,message) => { if(JSON.stringify(a)!==JSON.stringify(b)) throw Error(message); };
      const patterns = {solid:[],dash:[7,4],dot:[2,4],'dash-dot':[8,3,2,3]};
      const results=[];
      for(const count of [3,4,5,6,13,17]) for(const explicit of [false,true]) {
        const c=lineIdentityContract(theme);
        delete c.style.lineStyles;
        if(explicit) {
          c.style.lineStyles=['solid','dash','dot','dash-dot'];
          c.style.series={S1:{lineStyle:'dash-dot'},S5:{color:'#123456'},S9:{lineStyle:'dash'}};
        } else c.style.series={S5:{color:'#123456'}};
        c.panels[0].data.series=Array.from({length:count},(_,i)=>({key:`S${i+1}`,label:`S${i+1}`,y:[i+1,i+1.1,i+1]}));
        c.panels[0].data.xDomain=[-1,3];c.panels[0].data.yDomain=[0,count+2];
        const canvas=document.createElement('canvas');canvas.style.cssText='width:1000px;height:700px';document.body.append(canvas);
        const f=api.createFigurestead(canvas,c,{autoplay:false,reducedMotion:true,dprCap:1});
        try {
          const initial=structuredClone(f.getScene().seriesStyles), data=c.panels[0].data;
          const check = () => {
            const frame=api.resolveSceneFrame(f.getComposedScene(),1),panel=frame.panels[0],ctx=canvas.getContext('2d');
            const svg=new DOMParser().parseFromString(api.resolvedSceneToSvg(f.getComposedScene()),'image/svg+xml');
            for(const [key,style] of Object.entries(f.getScene().seriesStyles)) {
              same(style,initial[key],'retained keyed style');
              same(panel.legend.find(e=>e.key===key).style,style,'legend resolved style');
              const marks=panel.marks.filter(m=>m.series===key);
              for(const mark of marks) same(mark.style,style,'body resolved style');
              const segment=marks.find(m=>m.kind==='segment');
              const node=svg.querySelector(`[data-mark-id="${segment.id}"]`);
              const expected=patterns[style.lineStyle].join(' ');
              if((node.getAttribute('stroke-dasharray')||'')!==expected)throw Error('SVG body rhythm');
              const legendIndex=panel.legend.findIndex(e=>e.key===key);
              const legendStroke=svg.querySelector(`[data-layer="legend"] path[data-mark-id="${panel.id}-legend-${legendIndex}"][stroke-linecap]`);
              if(!legendStroke || (legendStroke.getAttribute('stroke-dasharray')||'')!==expected)throw Error('SVG legend rhythm');
              // Observe real Canvas stroke calls for body and legend independently.
              for(const legendOnly of [false,true]) {
                const calls=[],stroke=ctx.stroke;
                ctx.stroke=function(...args){if(this.strokeStyle.toLowerCase()===style.color.toLowerCase())calls.push(this.getLineDash());return stroke.apply(this,args);};
                try {drawResolvedPanel(ctx,{...frame,panels:[{...panel,
                  marks:legendOnly?[]:marks.filter(m=>m.kind==='segment'),
                  legend:legendOnly?panel.legend.filter(e=>e.key===key):[],
                  composedAnnotations:[]}]},0);} finally {ctx.stroke=stroke;}
                if(!calls.some(p=>JSON.stringify(p)===JSON.stringify(patterns[style.lineStyle])))throw Error('Canvas body/legend rhythm '+JSON.stringify({key,legendOnly,style,calls}));
                if(style.lineStyle==='solid' && calls.some(p=>p.length))throw Error('implicit Canvas dash');
              }
            }
          };
          Object.entries(initial).forEach(([key,style],i)=>{
            const expected=c.style.series[key]?.lineStyle ?? (explicit?c.style.lineStyles[Math.floor(i/4)%4]:'solid');
            same(style.lineStyle,expected,'authored/default allocation');
            same(style.glyph,['ring','square','triangle','diamond'][i%4],'glyph');
          });
          check();
          f.setData({...data,series:data.series.filter((_,i)=>i%2===0).reverse()});check();
          f.setData({...data,series:[...data.series].reverse()});check();
          f.setData(data);check();
          const replace=structuredClone(c);f.setConfig(replace);
          same(f.getScene().seriesStyles,initial,'complete replacement');
          delete replace.style.lineStyles;replace.style.series={S1:{color:'#123456'}};f.setConfig(replace);
          for(const style of Object.values(f.getScene().seriesStyles))same(style.lineStyle,'solid','replacement omission resets rhythm');
          results.push({count,explicit,bodyLegendCanvasSvg:true,keyedUpdates:true,replacement:true});
        } finally {f.destroy();canvas.remove();}
      }
      return {result:'PASS',cases:results};
    });
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
