// Actual browser renderer facts and audit integration; uses the existing CI server.
const { chromium, firefox } = require('playwright');
const baseUrl=process.env.FIGURESTEAD_BASE_URL||'http://127.0.0.1:4179/';
(async()=>{
 for(const [engine,type] of Object.entries({chromium,firefox})){
  const browser=await type.launch({headless:true});
  try{const page=await browser.newPage({viewport:{width:900,height:600},deviceScaleFactor:1,reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto(new URL('ci/fixtures/readability-micro-polish.html',baseUrl).href);
 const result=await page.evaluate(async()=>{
  const api=await import('/web/src/index.js');const expected=(await(await fetch('/audit/rendered-contrast/expected.json')).json()).rows;const keys=['deep_observatory_sage_core','lavender_fog_notebook','midnight_transit_signal_slate','registration_ink','slipware','ultraviolet_laboratory'];let rows=[],png=null,representativeSvg=null;
  for(const requestedPanel of [true,false]) for(const key of keys){const theme=(await(await fetch(`/src/figurestead/themes/${key}.json`)).json()).themes[key];let calls=[];const origStroke=CanvasRenderingContext2D.prototype.stroke,origFill=CanvasRenderingContext2D.prototype.fillRect;
   CanvasRenderingContext2D.prototype.stroke=function(...a){calls.push({operation:'stroke',color:this.strokeStyle,alpha:this.globalAlpha,width:this.lineWidth});return origStroke.apply(this,a);};
   CanvasRenderingContext2D.prototype.fillRect=function(...a){calls.push({operation:'fillRect',color:this.fillStyle,alpha:this.globalAlpha,rect:a});return origFill.apply(this,a);};
   const canvas=document.createElement('canvas');canvas.style.width='800px';canvas.style.height='500px';document.body.append(canvas);let instance;
   try{
    const contract={schemaVersion:'0.4',rendererApiVersion:'1',theme,profile:{key:'readability',name:'Readability',marker:'ring_core',markerSize:42,markerAlpha:.84,edgeWidth:1.05,coreFraction:.12,pointGlow:false,gridX:true,gridY:true,gridAlpha:.4,summaryGlow:false},timeline:{rainIn:[0,0],marksEnter:[0,1],summaryCompiles:[.8,1],rainOut:[0,0],settle:[.9,1]},motion:{frames:1,fps:1,rainStreams:0,rainGlyphs:0,lightingPeak:0,trailAlpha:0,seed:1,durationMs:1},style:{glyphs:['ring','square','triangle','diamond'],lineStyles:['solid'],series:{}},spec:{title:key,subtitle:'Actual terminal line marks; no theme recoloring',xLabel:'observation',yLabel:'series',signature:'figurestead direct verification',description:'Independent substrate and opacity measurement'},layout:{type:'grid',columns:1,gap:18,sharedX:false,sharedY:false},view:{profile:'atlas',motion:'none',ambient:'none',strategy:'none'},panels:[{id:'line',renderer:'line',presentation:{panelSurface:requestedPanel,frame:false},spec:{title:key},xScale:{type:'linear'},yScale:{type:'linear'},annotations:[],encoding:{interpolation:'linear'},data:{x:[0,1],revealOrder:'x',series:theme.series.map((c,i)=>({key:`s${i}`,label:`series ${i}`,y:[i,i]}))}}]};
    instance=api.createFigurestead(canvas,contract,{autoplay:false,reducedMotion:true,dprCap:1});const scene=instance.getScene(),resolved=instance.getResolvedScene(),panel=resolved.panels[0];const svg=api.exportFigureSvg(contract,{width:800,height:500});const doc=new DOMParser().parseFromString(svg,'image/svg+xml');const ctx=canvas.getContext('2d');let marks=[];
    for(const m of panel.marks.filter(m=>m.kind==='segment')){const g=m.geometry;const x=Math.round(g.x1+.43*(g.x2-g.x1)),y=Math.round(g.y1);const pixels=[];for(let dy=-2;dy<=2;dy++)pixels.push({xy:[x,y+dy],rgba:[...ctx.getImageData(x,y+dy,1,1).data]});const svgNode=[...doc.querySelectorAll('[data-mark-id]')].find(e=>e.getAttribute('data-mark-id')===m.id);marks.push({id:m.id,style:m.style,motion:m.motion,geometry:g,pixels,svgAttributes:svgNode?Object.fromEntries([...svgNode.attributes].map(a=>[a.name,a.value])):null});}
    if(marks.length!==theme.series.length)throw Error('missing observed segments');
    const lineCalls=marks.map(m=>calls.find(c=>c.operation==='stroke'&&c.color.toUpperCase()===m.style.color.toUpperCase()&&Math.abs(c.width-m.style.lineWidth)<1e-6));
    if(lineCalls.some(c=>!c))throw Error('missing actual line stroke');const observedAlpha=lineCalls[0].alpha;
    if(![.78,Math.fround(.78)].includes(observedAlpha)||lineCalls.some(c=>c.alpha!==observedAlpha))throw Error('unrecognized or nonuniform line opacity '+JSON.stringify(lineCalls));
    const canvasContext=observedAlpha===.78?(requestedPanel?'canvas-line-segment-panel':'canvas-line-segment-field'):(requestedPanel?'canvas-line-segment-panel-f32-opacity':'canvas-line-segment-field-f32-opacity');
    const before=canvas.toDataURL();
    for(const [name,substrate,opacity] of [[canvasContext,requestedPanel?scene.theme.panel:scene.theme.field,observedAlpha],[requestedPanel?'svg-line-segment-panel':'svg-line-segment-field',requestedPanel?scene.theme.panel:scene.theme.field,1]]){
     const audited=api.renderedSeriesAudit(scene.theme,{substrate,opacity,compositing:'srgb-source-over'});const wanted=expected.filter(e=>e.theme===key&&e.context===name);
     if(wanted.length!==audited.length||audited.some((r,i)=>r.passes!==wanted[i].passes||Math.abs(r.ratio-wanted[i].ratio)>1e-12))throw Error('rendered audit/reference disagreement '+key+'/'+name);
    }
    if(canvas.toDataURL()!==before||api.exportFigureSvg(contract,{width:800,height:500})!==svg)throw Error('audit changed rendered bytes');
    if(panel.presentation.panelSurface!==requestedPanel||scene.theme.field!==theme.field||scene.theme.panel!==theme.panel)throw Error('unexpected surface resolution');
    for(const m of marks){if(m.style.edge)throw Error('unexpected layered edge');const attrs=m.svgAttributes;if(!attrs||Number(attrs['stroke-opacity']??attrs.opacity??1)!==1)throw Error('SVG no longer opaque');}
    rows.push({theme:key,observedAlpha,canvasContext,requestedPanel,field:theme.field,panel:theme.panel,series:theme.series,actualTheme:scene.theme,renderedAudit:api.renderedSeriesAudit?api.renderedSeriesAudit(scene.theme,{substrate:requestedPanel?scene.theme.panel:scene.theme.field,opacity:observedAlpha,compositing:'srgb-source-over'}):null,pngBytes:canvas.toDataURL('image/png'),svgBytes:svg,presentation:panel.presentation,marks,calls,audit:api.contrastAudit(scene.theme),rawThemeAudit:api.contrastAudit(theme),canvasDimensions:[canvas.width,canvas.height]});
    if(key==='slipware'&&!requestedPanel){png=canvas.toDataURL('image/png');representativeSvg=svg;}
   }finally{CanvasRenderingContext2D.prototype.stroke=origStroke;CanvasRenderingContext2D.prototype.fillRect=origFill;instance?.destroy();canvas.remove();}
  }return {rows,png,representativeSvg};
 });
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({suite:'rendered-series-browser',engine,contexts:result.rows.length,marks:result.rows.map(r=>r.marks.length),observedAlphas:[...new Set(result.rows.map(r=>r.observedAlpha))],result:'PASS'}));
 }finally{await browser.close();}
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
