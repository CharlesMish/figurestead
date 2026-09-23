// Native regression for geometric dash continuity, including SVG rasterization.
const fs = require('node:fs'), path = require('node:path');
const engine = require('playwright')[process.env.FIGURESTEAD_BROWSER || 'chromium'];
const base = process.env.FIGURESTEAD_BASE_URL || 'http://127.0.0.1:4179/';
(async () => {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
    if (process.env.FIGURESTEAD_LOCAL_SOURCE_ROOT) {
      const root = fs.realpathSync(process.env.FIGURESTEAD_LOCAL_SOURCE_ROOT);
      await page.route('**/*', async route => {
        const url = new URL(route.request().url()), file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
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
      const failures = [], comparisons = [], images = {}, controls = {}, check = (ok, label) => { if (!ok) failures.push(label); };
      const contract = (n, rhythm, stride = 1) => {
        const c = lineIdentityContract(theme);
        c.style.markerStride = stride; c.style.series.S1 = { lineStyle: rhythm };
        c.panels[0].data = { x: Array.from({length:n}, (_,i) => i/(n-1)), xDomain:[-.05,1.05], yDomain:[0,2], series:[{key:'S1',label:'Trace',y:Array(n).fill(1)}] };
        c.spec.title = c.panels[0].spec.title = 'Authored line rhythm';
        c.profile.gridX = false; c.profile.gridY = false;
        return c;
      };
      const resolve = c => api.composeResolvedScene(api.resolveTerminalScene(api.compileTerminalScene(c), {width:760,height:520}));
      const render = async (c, surface, markers = false, resetPhase = false) => {
        const r = resolve(c), p = r.panels[0];
        const marks = p.marks.filter(m => markers || m.kind !== 'point').map(m => resetPhase ? {...m,pathDistance:0} : m);
        const s = {...r,panels:[{...p,marks,legend:[],presentation:{...p.presentation,legend:'none'}}]};
        const canvas = document.createElement('canvas'); canvas.width=760;canvas.height=520;
        const ctx = canvas.getContext('2d');
        let svg;
        if (surface === 'Canvas') drawResolvedPanel(ctx,api.resolveSceneFrame(s,1),0);
        else {
          svg = api.resolvedSceneToSvg(s,{idPrefix:'phase'});
          const image = new Image();image.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));await image.decode();ctx.drawImage(image,0,0);
        }
        const a=p.axes.x(0),b=p.axes.x(1), y=p.axes.y(1), data=ctx.getImageData(0,0,760,520).data;
        // Canvas diagnostic has a transparent substrate; SVG has its field fill.
        const substrate = surface==='Canvas' ? [0,0,0,0] : data.slice((Math.floor(y-15)*760+Math.floor(a+10))*4,(Math.floor(y-15)*760+Math.floor(a+10))*4+4);
        const ink=[];
        for(let x=Math.ceil(a)+3;x<Math.floor(b)-3;x++) {
          const offset=(Math.floor(y)*760+x)*4;
          ink.push({x,on:surface==='Canvas'?data[offset+3]>70:Math.max(...[0,1,2].map(i=>Math.abs(data[offset+i]-substrate[i])))>35});
        }
        // A display image uses the unmodified theme field behind the diagnostic.
        ctx.globalCompositeOperation='destination-over';ctx.fillStyle=theme.field;ctx.fillRect(0,0,760,520);
        return {ink,png:canvas.toDataURL(),svg,marks,p};
      };
      for(const surface of ['Canvas','SVG']) for(const rhythm of ['dash','dot','dash-dot','solid']) {
        const two=await render(contract(2,rhythm),surface),dense=await render(contract(401,rhythm),surface);
        const disagreement=two.ink.filter((v,i)=>v.on!==dense.ink[i].on).length;
        comparisons.push({surface,rhythm,pixels:two.ink.length,disagreement,twoInk:two.ink.filter(v=>v.on).length,denseInk:dense.ink.filter(v=>v.on).length});
        // At most ordinary boundary rasterization differences; never dense solidification.
        check(disagreement <= Math.ceil(two.ink.length*.025),`${surface} ${rhythm}: subdivision changed rhythm (${disagreement})`);
        if(['dash','dot'].includes(rhythm)) {
          images[`${surface}-${rhythm}-dense`]={png:dense.png,svg:dense.svg};
          if(rhythm==='dash')images[`${surface}-dash-two`]={png:two.png,svg:two.svg};
        }
        if(rhythm!=='solid') {
          const reset=await render(contract(401,rhythm),surface,false,true);
          check(reset.ink.filter((v,i)=>v.on!==two.ink[i].on).length>two.ink.length*.08,`${surface} ${rhythm}: reset-phase negative control`);
        }
      }
      // Cadence changes only holes/markers, never underlying rhythm. Compare
      // each with its hole-free counterpart outside the actual marker ink.
      for(const surface of ['Canvas','SVG']) for(const stride of [1,4]) {
        const c=contract(29,'dash',stride),marked=await render(c,surface,true),bare=await render(c,surface);
        let checked=0,different=0;
        for(let i=0;i<marked.ink.length;i++) {
          const x=marked.ink[i].x;
          if(marked.marks.some(m=>m.kind==='point'&&Math.abs(m.geometry.cx-x)<m.geometry.radius+m.geometry.outlineWidth+2))continue;
          checked++;if(marked.ink[i].on!==bare.ink[i].on)different++;
        }
        check(checked>100&&different===0,`${surface} stride ${stride}: phase outside holes ${different}/${checked}`);
        comparisons.push({surface,stride,outsideHoles:checked,disagreement:different});
        images[`${surface}-cadence-${stride}`]={png:marked.png,svg:marked.svg};
      }
      // Inspect actual native strokes, including both edge/body, at intermediate
      // reveal. Distance must come from complete geometry, never visible length.
      const moving=contract(10,'dash',4);moving.view.motion='semantic';moving.view.strategy='auto';moving.style.series.S1.edge='#223344';
      const r=resolve(moving), motion=[];
      for(const progress of [.25,.6,.8,1]) {
        const frame=api.resolveSceneFrame(r,progress),p=frame.panels[0],canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
        canvas.width=760;canvas.height=520;
        const calls=[],stroke=ctx.stroke;
        ctx.stroke=function(...args){if(new Error().stack.includes('strokeSegment'))calls.push({offset:this.lineDashOffset,dash:this.getLineDash(),alpha:this.globalAlpha});return stroke.apply(this,args);};
        drawResolvedPanel(ctx,{...frame,panels:[{...p,legend:[],presentation:{...p.presentation,legend:'none'}}]},0);
        const segments=p.marks.filter(m=>m.kind==='segment'&&m.motion.opacity>0);
        check(calls.length===segments.length*2,`motion ${progress}: edge/body stroke count`);
        segments.forEach((m,i)=>{for(const call of calls.slice(i*2,i*2+2))check(Math.abs(call.offset-m.pathDistance)<1e-4&&JSON.stringify(call.dash)==='[7,4]',`motion ${progress}: resolved phase`);});
        motion.push({progress,segments:segments.length,offsets:calls.map(c=>c.offset)});
      }
      // Production monotone geometry also reaches native Canvas/SVG with the
      // resolved cumulative length (unit tests independently integrate it).
      const curved=contract(6,'dash',4);curved.panels[0].encoding.interpolation='monotone';
      curved.panels[0].data.series[0].y=[.2,1.8,.4,1.6,.5,1.5];
      const cr=resolve(curved),cf=api.resolveSceneFrame(cr,1),cc=document.createElement('canvas');
      cc.width=760;cc.height=520;const cx=cc.getContext('2d'),offsets=[],stroke=cx.stroke;
      cx.stroke=function(...args){if(new Error().stack.includes('strokeSegment'))offsets.push(this.lineDashOffset);return stroke.apply(this,args);};
      drawResolvedPanel(cx,{...cf,panels:[{...cf.panels[0],legend:[],presentation:{...cf.panels[0].presentation,legend:'none'}}]},0);
      const cm=cr.panels[0].marks.filter(m=>m.kind==='segment');
      check(offsets.length===cm.length&&cm.every((m,i)=>Math.abs(m.pathDistance-offsets[i])<1e-4),'native monotone phase');
      const cdoc=new DOMParser().parseFromString(api.resolvedSceneToSvg(cr),'image/svg+xml');
      check(cm.every(m=>Number(cdoc.querySelector(`[data-mark-id="${m.id}"]`).getAttribute('stroke-dashoffset')??0)===(m.pathDistance??0)),'SVG monotone phase');
      // Byte controls use complete product figures, including legends/direct
      // labels. Comparing these with the baseline is an external review check.
      for(const stride of [1,4])for(const direct of [false,true]) {
        const c=lineIdentityContract(theme);c.style.markerStride=stride;c.style.directLabels=direct;
        c.panels[0].data.yDomain=[0,6];c.panels[0].data.series.forEach(s=>s.y=[1,2,3]);
        const canvas=document.createElement('canvas');canvas.style.cssText='width:760px;height:520px';document.body.append(canvas);
        const f=api.createFigurestead(canvas,c,{autoplay:false,reducedMotion:true,dprCap:1});
        try {controls[`solid-${stride}-${direct?'direct':'legend'}`]={png:canvas.toDataURL(),svg:api.resolvedSceneToSvg(f.getComposedScene())};}
        finally {f.destroy();canvas.remove();}
      }
      return {comparisons,motion,curve:{offsets},failures,images,controls};
    });
    const crypto=require('node:crypto');
    result.controls=Object.fromEntries(Object.entries(result.controls).map(([name,a])=>[name,{png:crypto.createHash('sha256').update(Buffer.from(a.png.split(',')[1],'base64')).digest('hex'),svg:crypto.createHash('sha256').update(a.svg).digest('hex')}]));
    if(process.env.FIGURESTEAD_PHASE_OUTPUT) {
      const dir=process.env.FIGURESTEAD_PHASE_OUTPUT;fs.mkdirSync(dir,{recursive:true});
      for(const [name,asset] of Object.entries(result.images)) {
        fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(asset.png.split(',')[1],'base64'));
        if(asset.svg)fs.writeFileSync(path.join(dir,name+'.svg'),asset.svg);
      }
      fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({...result,images:Object.keys(result.images)},null,2)+'\n');
    }
    delete result.images;console.log(JSON.stringify({suite:'line-rhythm-phase',browser:browser.version(),...result}));
    if(result.failures.length)throw Error(result.failures.join('\n'));
  } finally {await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
