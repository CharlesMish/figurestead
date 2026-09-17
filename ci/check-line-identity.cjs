// Direct native Canvas regressions; existing CI server, no qualification harness.
const { chromium } = require('playwright');
const base = process.env.FIGURESTEAD_BASE_URL || 'http://127.0.0.1:4179/';
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.FIGURESTEAD_BROWSER_EXECUTABLE ? { executablePath: process.env.FIGURESTEAD_BROWSER_EXECUTABLE } : {}) });
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
      const input = lineIdentityContract(theme), canvas = document.createElement('canvas');
      canvas.style.cssText = 'width:760px;height:520px'; document.body.append(canvas);
      const figure = api.createFigurestead(canvas, input, { autoplay: false, reducedMotion: true, dprCap: 1 });
      const same = (a, b, label) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(label + ': ' + JSON.stringify({ a, b })); };
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
        return { result: 'PASS', observations, stableKeyChecks: 3 };
      } finally { figure.destroy(); canvas.remove(); }
    });
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
