# Same series, two label treatments

Presentation can move series identification beside the traces while the underlying color/marker series identity remains the same. Both examples use Lavender Fog Notebook and exactly the same three synthetic series. Unsupported or insufficient layouts fall back atomically to the ordinary legend.

Python (install `figurestead==0.9.0a2` when available, or the retained candidate wheel):

```sh
python python.py --output ./output
```

The equivalent calls are `make_figure(direct_labels=False)` and `make_figure(direct_labels=True)`. Both save at 1008 × 624 pixels (8.4 × 5.2 inches, 120 dpi); no output-size change is used to make labels fit.

Browser: copy this folder outside the checkout, install `@figurestead/web@0.9.0-alpha.3` when available (or its retained tarball), then run with Vite:

```sh
npm install @figurestead/web@0.9.0-alpha.3
npm install --save-dev vite
npx vite --host 127.0.0.1
```

The checkbox switches `makeContract(false)` / `makeContract(true)` using `setConfig`; only `style.directLabels` changes. Canvas stays 760 × 520 CSS pixels. The example is settled, and its authored series ordering is fixed. `setConfig` is replacement behavior; supported data-only updates use `setData` when carrying established keys.

No added static image is necessary: the executable toggle shows the single intended comparison directly, alongside equivalent Python calls. This is a product example, not a new qualification specimen or an extension of the reference-theme designation. See [the bounded direct-label contract](https://github.com/CharlesMish/figurestead/blob/main/docs/direct-series-labels.md).
