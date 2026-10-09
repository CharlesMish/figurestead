// Visible reference-band regression on native Canvas and native SVG decoding.
// Run in the Chromium and Firefox CI jobs via FIGURESTEAD_BROWSER.
const browserName = process.env.FIGURESTEAD_BROWSER || 'chromium';
const engine = require('playwright')[browserName];
const base = process.env.FIGURESTEAD_BASE_URL || 'http://127.0.0.1:4179/';

(async () => {
  const browser = await engine.launch({ headless: true, ...(process.env.FIGURESTEAD_BROWSER_EXECUTABLE ? { executablePath: process.env.FIGURESTEAD_BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    // Match the other browser gates' optional socket-free local transport.
    if (process.env.FIGURESTEAD_LOCAL_SOURCE_ROOT) {
      const fs = require('node:fs'), path = require('node:path'), root = fs.realpathSync(process.env.FIGURESTEAD_LOCAL_SOURCE_ROOT);
      await page.route('**/*', async route => {
        const url = new URL(route.request().url()), file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        if (url.origin !== new URL(base).origin || !file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.realpathSync(file).startsWith(root + path.sep)) return route.abort();
        await route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'text/html' });
      });
    }
    await page.goto(new URL('ci/fixtures/readability-micro-polish.html', base).href);
    const result = await page.evaluate(async () => {
      const api = await import('/web/src/index.js');
      const { TEMPORAL_RENDERERS } = await import('/web/src/extensions/temporal/index.js');
      const { drawResolvedPanel } = await import('/web/src/canvas-scene.js');
      const theme = (await (await fetch('/src/figurestead/themes/lavender_fog_notebook.json')).json()).themes.lavender_fog_notebook;
      const assert = (value, message) => { if (!value) throw Error(message); };
      const width = 640, height = 480;
      const contract = {
        schemaVersion: '0.4', rendererApiVersion: '1', theme,
        profile: { key: 'band-pixels', name: 'Band pixels', marker: 'ring_core', markerSize: 42, markerAlpha: .84, edgeWidth: 1.05, coreFraction: .12, pointGlow: false, gridX: true, gridY: true, gridAlpha: .4, summaryGlow: false },
        timeline: { rainIn: [0, 0], marksEnter: [0, 1], summaryCompiles: [.8, 1], rainOut: [0, 0], settle: [.9, 1] },
        motion: { frames: 1, fps: 1, rainStreams: 0, rainGlyphs: 0, lightingPeak: 0, trailAlpha: 0, seed: 1, durationMs: 1 },
        style: { glyphs: ['ring'], lineStyles: ['solid'], series: {} },
        spec: { title: 'Temporal reference context', subtitle: '', xLabel: 'Date', yLabel: 'Observed value', signature: '', description: 'Synthetic band-rendering regression data' },
        layout: { type: 'grid', columns: 1, gap: 18, sharedX: false, sharedY: false },
        view: { profile: 'atlas', motion: 'semantic', ambient: 'none', strategy: 'auto' },
        panels: [{ id: 'observations', renderer: 'temporal_observations', spec: {},
          xScale: { type: 'time', domain: ['2025-01-01', '2025-01-11'] },
          yScale: { type: 'linear', domain: [0, 10] }, annotations: [],
          data: { dates: ['2025-01-02', '2025-01-04', '2025-01-07', '2025-01-10'], values: [2, 8, 2, 8], site: 'Station A',
            referenceBands: [{ type: 'reference_band', from: 4, to: 6, label: 'Project range', status: 'provisional_project_constant' }] } }],
      };
      const source = api.compileTerminalScene(contract, { registry: api.CORE_REGISTRY.with(...TEMPORAL_RENDERERS) });
      const composed = api.composeResolvedScene(api.resolveTerminalScene(source, { width, height }));
      const panel = composed.panels[0], band = panel.marks.find(mark => mark.kind === 'reference-band');
      assert(band, 'real temporal contract must compile a reference band');
      const g = band.geometry, plot = panel.axes.plot ?? panel.layout.plot;
      assert(g.right > g.left && g.bottom - g.top > 20, 'reference band must have a measurable interior');

      // Use multiple real image pixels, separated from grid lines, edges, and
      // observations. Both renders retain all other scene content unchanged.
      const clear = (x, y) => x > plot.left + 6 && x < plot.right - 6 && y > plot.top + 6 && y < plot.bottom - 6 &&
        panel.axes.xTicks.every(tick => Math.abs(x - panel.axes.x(tick.value)) > 5) &&
        panel.axes.yTicks.every(tick => Math.abs(y - panel.axes.y(tick.value)) > 5) &&
        panel.marks.filter(mark => mark.kind === 'point').every(mark => Math.hypot(x - mark.geometry.cx, y - mark.geometry.cy) > 15);
      const samples = [];
      for (const xf of [.17, .33, .57, .79]) for (const yf of [.22, .41, .64, .78]) {
        const x = Math.floor(g.left + (g.right - g.left) * xf), y = Math.floor(g.top + (g.bottom - g.top) * yf);
        if (clear(x, y)) samples.push({ x, y });
      }
      const outside = [];
      for (const xf of [.17, .33, .57, .79]) for (const y of [Math.floor(g.top - 12), Math.ceil(g.bottom + 12)]) {
        const x = Math.floor(g.left + (g.right - g.left) * xf);
        if (clear(x, y)) outside.push({ x, y });
      }
      assert(samples.length >= 4 && outside.length >= 2, 'fixture must provide clear interior and exterior samples');
      const canvas = () => {
        const element = document.createElement('canvas'); element.width = width; element.height = height;
        return element;
      };
      const renderCanvas = frame => {
        const element = canvas(), context = element.getContext('2d');
        context.fillStyle = theme.field; context.fillRect(0, 0, width, height);
        drawResolvedPanel(context, frame, 0);
        return context.getImageData(0, 0, width, height).data;
      };
      const pixel = (data, { x, y }) => [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];
      const compare = (actual, baseline, label) => {
        const deltas = samples.map(point => {
          const a = pixel(actual, point), b = pixel(baseline, point);
          assert(a[3] === 255 && b[3] === 255, `${label}: opaque sample background`);
          return Math.max(...a.slice(0, 3).map((channel, index) => Math.abs(channel - b[index])));
        });
        assert(deltas.every(delta => delta >= 2), `${label}: missing visible band interior ${JSON.stringify(deltas)}`);
        for (const point of outside) assert(JSON.stringify(pixel(actual, point)) === JSON.stringify(pixel(baseline, point)), `${label}: band changes pixels beyond its bounds`);
        return { interiorSamples: samples.length, outsideSamples: outside.length, minRgbDelta: Math.min(...deltas), maxRgbDelta: Math.max(...deltas) };
      };
      const frames = [];
      for (const progress of [.5, 1]) {
        const frame = api.resolveSceneFrame(composed, progress);
        const baseline = { ...frame, panels: [{ ...frame.panels[0], marks: frame.panels[0].marks.filter(mark => mark.id !== band.id) }] };
        frames.push({ progress, ...compare(renderCanvas(frame), renderCanvas(baseline), `Canvas progress=${progress}`) });
      }

      // Validate the exported reference layer and decode the actual SVG in the
      // browser. Compare it only with its own band-removed export; whole SVG
      // and Canvas pixel equality is neither asserted nor implied.
      const svg = api.resolvedSceneToSvg(composed);
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      assert(!doc.querySelector('parsererror'), 'exported SVG must parse');
      const node = [...doc.querySelectorAll('[data-mark-id]')].find(item => item.getAttribute('data-mark-id') === band.id);
      assert(node && node.closest('[data-layer="reference"]'), 'exported band must belong to reference layer');
      const rect = node.querySelector('rect');
      assert(rect, 'reference group must contain a painted rectangle');
      for (const [name, expected] of Object.entries({ x: g.left, y: g.top, width: g.right - g.left, height: g.bottom - g.top })) {
        assert(Math.abs(Number(rect.getAttribute(name)) - expected) < 1e-7, `SVG reference ${name} disagrees with resolved band`);
      }
      assert(Number(rect.getAttribute('fill-opacity')) > 0, 'SVG band must have positive opacity');
      assert(doc.querySelector('[data-layer="data"] [data-mark-id]'), 'export must retain observation marks');
      node.remove();
      const baselineSvg = new XMLSerializer().serializeToString(doc);
      const rasterize = async text => {
        const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
        try {
          const image = new Image(); image.src = url; await image.decode();
          assert(image.naturalWidth === width && image.naturalHeight === height, 'native SVG decode must preserve dimensions');
          const element = canvas(), context = element.getContext('2d'); context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, width, height).data;
        } finally { URL.revokeObjectURL(url); }
      };
      const svgPixels = compare(await rasterize(svg), await rasterize(baselineSvg), 'terminal SVG');
      return { result: 'PASS', suite: 'band-rendering', renderer: 'temporal_observations', dimensions: { width, height }, frames, svg: { referenceGroupBounds: true, ...svgPixels } };
    });
    console.log(JSON.stringify({ browser: browserName, ...result }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
