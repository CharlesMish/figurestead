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
      const same = (a, b, label) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(label + ': ' + JSON.stringify({ a, b })); };
      const keyedCases = [];
      const baseStyle = api.compileTerminalScene(lineIdentityContract(theme)).seriesStyles.S2;
      const overrides = [
        ['none', null], ['empty', {}], ['dash-only', { lineStyle: 'dash' }],
        ['color-only', { color: '#334455' }],
        ['complete', { ...baseStyle, color: '#334455', edge: '#aabbcc', glyph: 'diamond', lineStyle: 'dot', lineWidth: 3 }],
      ];
      for (const stride of [1, 4]) for (const [name, override] of overrides) {
        const input = lineIdentityContract({ ...theme, seriesEdges: theme.series.map(() => '#223344') });
        input.style.markerStride = stride;
        if (override !== null) input.style.series.S2 = override;
        // Fixed domains make actual Canvas body pixels comparable after filtering.
        input.panels[0].data.xDomain = [0, 2]; input.panels[0].data.yDomain = [0, 4];
        // An override for a not-yet-seen key must survive until its first encounter.
        input.style.series.S4 = { lineStyle: 'dash' };
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'width:760px;height:520px'; document.body.append(canvas);
        const figure = api.createFigurestead(canvas, input, { autoplay: false, reducedMotion: true, dprCap: 1 });
        try {
          const established = structuredClone(figure.getScene().seriesStyles), pixels = new Map(), stages = [];
          const check = (stage, keys) => {
            const panel = figure.getComposedScene().panels[0], ctx = canvas.getContext('2d');
            same(Object.keys(figure.getScene().seriesStyles), keys, `${name} ${stage}: active keys`);
            for (const key of keys) {
              const expected = established[key];
              same(figure.getScene().seriesStyles[key], expected, `${name} ${stage}: ${key} complete style`);
              const marks = panel.marks.filter(mark => mark.series === key);
              for (const mark of marks) same(mark.style, expected, `${name} ${stage}: ${key} body style`);
              same(panel.legend.find(item => item.key === key).style, expected, `${name} ${stage}: ${key} legend style`);
              const point = marks.filter(mark => mark.kind === 'point')[1];
              const { cx, cy } = point.geometry;
              const patch = [...ctx.getImageData(Math.floor(cx) - 13, Math.floor(cy) - 13, 27, 27).data];
              if (pixels.has(key)) same(patch, pixels.get(key), `${name} ${stage}: ${key} Canvas body identity`);
              else pixels.set(key, patch);
            }
            stages.push(stage);
          };
          if (name === 'dash-only') {
            same(established.S2.glyph, 'square', 'dash override retains square');
            same(established.S2.color, theme.series[1], 'dash override retains color');
            same(established.S2.colorIndex, 1, 'dash override retains slot');
            same(established.S2.lineStyle, 'dash', 'dash override changes only rhythm');
          }
          const data = input.panels[0].data, [s1, s2, s3] = data.series;
          check('initial', ['S1', 'S2', 'S3']);
          for (const [stage, series] of [
            ['filter', [s2, s3]], ['reorder', [s3, s2]], ['restore', [s1, s2, s3]],
          ]) {
            figure.setData({ ...data, series }); check(stage, series.map(item => item.key));
          }
          const s4 = { key: 'S4', label: 'New key', y: [3.5, 3.5, 3.5] };
          const firstEncounter = { ...data, series: [s3, s4, s2] };
          const freshInput = structuredClone(input); freshInput.panels[0].data = firstEncounter;
          // Genuinely new keys retain the existing positional first-encounter rule.
          established.S4 = api.compileTerminalScene(freshInput).seriesStyles.S4;
          figure.setData(firstEncounter); check('new-key', ['S3', 'S4', 'S2']);
          figure.setData({ ...data, series: [s4, s2] }); check('new-key-reorder', ['S4', 'S2']);
          figure.setData(data); check('new-key-hidden', ['S1', 'S2', 'S3']);
          figure.setData({ ...data, series: [s4, s1] }); check('new-key-restored', ['S4', 'S1']);

          // setConfig deliberately replaces the contract, including retained identities.
          const replacement = structuredClone(input);
          replacement.style.series = {}; replacement.panels[0].data.series = [s3, s2, s1];
          figure.setConfig(replacement);
          same(figure.getScene().seriesStyles, api.compileTerminalScene(replacement).seriesStyles, `${name}: setConfig replacement`);
          same(figure.getScene().seriesStyles.S3.glyph, 'ring', `${name}: setConfig establishes new first slot`);
          const resetStyles = structuredClone(figure.getScene().seriesStyles);
          figure.setData(data);
          for (const key of ['S1', 'S2', 'S3']) same(figure.getScene().seriesStyles[key], resetStyles[key], `${name}: setData retains replacement identity`);
          keyedCases.push({ name, stride, stages, setConfigReplacement: true });
        } finally { figure.destroy(); canvas.remove(); }
      }
      const cadenceChecks = [];
      for (const glyph of ['ring', 'square', 'triangle']) {
        const c=lineIdentityContract(theme);c.style.markerStride=4;c.style.series.S1={glyph};
        c.panels[0].data.x=Array.from({length:10},(_,i)=>i);
        c.panels[0].data.series.forEach((row,i)=>row.y=Array(10).fill(i+1));
        c.panels[0].data.xDomain=[-1,10];c.panels[0].data.yDomain=[0,4];
        const canvas=document.createElement('canvas');canvas.style.cssText='width:760px;height:520px';document.body.append(canvas);
        const f=api.createFigurestead(canvas,c,{autoplay:false,reducedMotion:true,dprCap:1});
        try {
          const frame=api.resolveSceneFrame(f.getComposedScene(),1),p=frame.panels[0],ctx=canvas.getContext('2d');
          const own=p.marks.filter(m=>m.series==='S1');
          same(own.filter(m=>m.kind==='point').map(m=>Number(m.id.split('/').at(-1))),[0,4,8,9],'native selected indices');
          if(own.filter(m=>m.kind==='segment').length!==9)throw Error('segments removed');
          const doc=new DOMParser().parseFromString(api.resolvedSceneToSvg(f.getComposedScene()),'image/svg+xml');
          for(let i=0;i<10;i++)if(!!doc.querySelector(`[data-mark-id="line/point/S1/${i}"]`)!==[0,4,8,9].includes(i))throw Error('SVG/Canvas marker plan mismatch');
          for(const index of [2,4]) for(const under of ['background','grid','other-series']) {
            const cx=p.axes.x(index),cy=p.axes.y(1);
            const extra=under==='other-series'?[{...own.find(m=>m.kind==='segment'),id:'crossing',series:'unrelated',style:{...own[0].style,color:'#0000ff'},geometry:{x1:cx,y1:cy-25,x2:cx,y2:cy+25}}]:[];
            const testPanel={...p,legend:[],composedAnnotations:[],axes:{...p.axes,xTicks:under==='grid'?[{value:index,label:String(index)}]:[],yTicks:[]}};
            const testFrame={...frame,theme:{...frame.theme,grid:'#00ff00'},profile:{...frame.profile,gridX:true,gridY:false,gridAlpha:1}};
            const draw=marks=>{ctx.clearRect(0,0,760,520);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,760,520);drawResolvedPanel(ctx,{...testFrame,panels:[{...testPanel,marks}]},0);return [...ctx.getImageData(Math.floor(cx),Math.floor(cy),1,1).data];};
            const baseline=draw(extra),actual=draw([...own,...extra]);
            if(index===4)same(actual,baseline,'selected marker preserves '+under);
            // At unmarked samples compare with a deliberately hole-free owning
            // line: unrelated content keeps ordinary ordering and compositing.
            else same(actual,draw([...own.filter(m=>m.kind!=='point'),...extra]),'unmarked sample has no hole '+under);
          }
          cadenceChecks.push({glyph,indices:[0,4,8,9],segments:9,svgAgreement:true});
        } finally {f.destroy();canvas.remove();}
      }
      const input = lineIdentityContract(theme), canvas = document.createElement('canvas');
      canvas.style.cssText = 'width:760px;height:520px'; document.body.append(canvas);
      const figure = api.createFigurestead(canvas, input, { autoplay: false, reducedMotion: true, dprCap: 1 });
      const observations = [];
      try {
        const styles = figure.getScene().seriesStyles;
        figure.setData({ ...input.panels[0].data, series: [input.panels[0].data.series[2], input.panels[0].data.series[1]] });
        same(figure.getScene().seriesStyles.S2, styles.S2, 'filtered S2');
        same(figure.getScene().seriesStyles.S3, styles.S3, 'reordered S3');
        figure.setData(input.panels[0].data);
        same(figure.getScene().seriesStyles, styles, 'restored keys');
        const frame = api.resolveSceneFrame(figure.getComposedScene(), 1), panel = frame.panels[0], ctx = canvas.getContext('2d');
        for (const glyph of ['ring', 'square', 'triangle']) for (const under of ['background', 'grid', 'other-series']) {
          const own = panel.marks.filter(m => m.series === 'S1').map(m => ({ ...m, style: { ...m.style, glyph } }));
          const point = own.filter(m => m.kind === 'point')[1], { cx, cy } = point.geometry;
          const extra = under === 'other-series' ? [{ ...own.find(m => m.kind === 'segment'), id: 'crossing', series: 'unrelated', style: { ...styles.S2, color: '#0000ff' }, geometry: { x1: cx, y1: cy - 25, x2: cx, y2: cy + 25 } }] : [];
          const p = { ...panel, legend: [], composedAnnotations: [], axes: { ...panel.axes, xTicks: under === 'grid' ? [{ value: 1, label: '1' }] : [], yTicks: [] } };
          const testFrame = { ...frame, theme: { ...frame.theme, grid: '#00ff00' }, profile: { ...frame.profile, gridX: true, gridY: false, gridAlpha: 1 } };
          const draw = marks => {
            ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            drawResolvedPanel(ctx, { ...testFrame, panels: [{ ...p, marks }] }, 0);
            return [...ctx.getImageData(Math.floor(cx), Math.floor(cy), 1, 1).data];
          };
          const baseline = draw(extra), actual = draw([...own, ...extra]);
          same(actual, baseline, `${glyph} ${under}: marker center preserves underlying pixels`);
          if (under === 'background') {
            const unmasked = draw(own.map(m => ({ ...m, lineIdentity: false })));
            if (JSON.stringify(unmasked) === JSON.stringify(baseline)) throw Error('negative control did not detect bisecting line');
          }
          observations.push({ glyph, under, actual, baseline });
        }
        return { result: 'PASS', observations, stableKeyChecks: 3, keyedCases, cadenceChecks };
      } finally { figure.destroy(); canvas.remove(); }
    });
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
