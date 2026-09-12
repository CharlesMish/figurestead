"""Focused public audit regressions; independent reference fixture, no renderer presets in API."""
from pathlib import Path
from dataclasses import replace
import hashlib,importlib.util,json,math,sys,unittest
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'src'))
from figurestead import contrast_audit,rendered_series_audit
from figurestead.themes import get_theme
from figurestead.theme_io import ThemePackError
F=ROOT/'audit/rendered-contrast';DATA=json.loads((F/'expected.json').read_text())
class RenderedContrastTests(unittest.TestCase):
    def test_python_polyline_context_and_render_preservation(self):
        import io
        import matplotlib.pyplot as plt
        from matplotlib.colors import to_hex
        from figurestead import line,PlotSpec
        for key in json.loads((F/'static-expected.json').read_text())['python']:
            t=get_theme(key);fig,ax=plt.subplots(figsize=(3,2),dpi=100)
            try:
                line([0,1],[[i,i] for i in range(len(t.series))],theme=t,ax=ax,spec=PlotSpec(''))
                self.assertEqual(to_hex(ax.get_facecolor()).upper(),t.field.upper())
                for mark in ax.lines:self.assertEqual(mark.get_alpha(),.88);self.assertFalse(mark.get_path_effects())
                before=io.BytesIO();fig.savefig(before,format='png')
                rendered_series_audit(t,substrate=to_hex(ax.get_facecolor()),opacity=ax.lines[0].get_alpha(),compositing='srgb-source-over')
                after=io.BytesIO();fig.savefig(after,format='png');self.assertEqual(before.getvalue(),after.getvalue())
            finally:plt.close(fig)
    def test_independent_fixture_and_authored_inputs(self):
        spec=importlib.util.spec_from_file_location('reference',F/'reference.py');ref=importlib.util.module_from_spec(spec);spec.loader.exec_module(ref)
        actual=ref.fixture()
        self.assertEqual({k:v for k,v in actual.items() if k!='rows'}, {k:v for k,v in DATA.items() if k!='rows'})
        self.assertEqual(len(actual['rows']),len(DATA['rows']))
        for observed,expected in zip(actual['rows'],DATA['rows']):
            with self.subTest(theme=expected['theme'],context=expected['context'],series=expected['index']):
                self.assertEqual(observed.keys(),expected.keys())
                self.assertEqual({k:v for k,v in observed.items() if k not in ('effectiveColor','ratio')},
                                 {k:v for k,v in expected.items() if k not in ('effectiveColor','ratio')})
                # Only derived floats tolerate platform/libm last-bit differences; passes stays exact.
                self.assertEqual(len(observed['effectiveColor']),len(expected['effectiveColor']))
                for channel,want in zip(observed['effectiveColor'],expected['effectiveColor']):
                    self.assertAlmostEqual(channel,want,places=14)
                self.assertAlmostEqual(observed['ratio'],expected['ratio'],places=12)
        for i in DATA['inputs']:self.assertEqual(hashlib.sha256((ROOT/i['path']).read_bytes()).hexdigest(),i['sha256'])
    def test_all_six_themes_and_verified_opacity_variants(self):
        for expected in DATA['rows']:
            with self.subTest(theme=expected['theme'],context=expected['context'],series=expected['index']):
                t=get_theme(expected['theme']);r=rendered_series_audit(t,substrate=expected['substrate'],opacity=expected['opacity'],compositing='srgb-source-over')[expected['index']]
                self.assertEqual(r['passes'],expected['passes']);self.assertAlmostEqual(r['ratio'],expected['ratio'],places=12)
                for actual,want in zip(r['effectiveColor'],expected['effectiveColor']):self.assertAlmostEqual(actual,want,places=14)
                self.assertEqual(r['passes'],r['ratio']>=3);self.assertEqual(r['color'],expected['color']);self.assertEqual(r['token'],f"series[{expected['index']}]")
    def test_static_audit_unchanged_and_input_immutable(self):
        for key,expected in json.loads((F/'static-expected.json').read_text())['python'].items():
            t=get_theme(key);before=repr(t)
            self.assertEqual(contrast_audit(t),expected)
            rendered_series_audit(t,substrate=t.field,opacity=.88,compositing='srgb-source-over')
            self.assertEqual(repr(t),before);self.assertEqual(contrast_audit(t),expected)
    def test_known_miss_and_opaque_distinction(self):
        t=get_theme('slipware');self.assertFalse(any(r['token'].startswith('series[') for r in contrast_audit(t)))
        alpha=rendered_series_audit(t,substrate=t.panel,opacity=.78,compositing='srgb-source-over')
        opaque=rendered_series_audit(t,substrate=t.panel,opacity=1,compositing='srgb-source-over')
        self.assertEqual([i for i,r in enumerate(alpha) if not r['passes']],[3,4]);self.assertTrue(all(r['passes'] for r in opaque))
    def test_boundary_is_not_rounded_to_pass(self):
        t=get_theme('deep_observatory_sage_core');r=rendered_series_audit(t,substrate=t.field,opacity=.88,compositing='srgb-source-over')[2]
        self.assertEqual(round(r['ratio'],2),3);self.assertLess(r['ratio'],3);self.assertFalse(r['passes'])
        t=replace(t,series=('#000000',));boundary=1-(1.055*.3**(1/2.4)-.055)
        for alpha,passes in [(boundary-1e-8,False),(boundary+1e-8,True)]:
            r=rendered_series_audit(t,substrate='#FFFFFF',opacity=alpha,compositing='srgb-source-over')[0];self.assertEqual(r['passes'],passes)
    def test_opacity_endpoints(self):
        t=replace(get_theme('slipware'),series=('#000000',))
        for alpha,ratio in [(0,1),(1,21)]:self.assertEqual(rendered_series_audit(t,substrate='#FFFFFF',opacity=alpha,compositing='srgb-source-over')[0]['ratio'],ratio)
    def test_context_invalid_missing_unknown(self):
        t=get_theme('slipware');valid=dict(substrate=t.field,opacity=.88,compositing='srgb-source-over')
        for field,values in {'substrate':[None,'field','#fff','#12345678','#123456\n',3],'opacity':[True,None,'0.88',float('nan'),float('inf'),-.1,1.1],'compositing':[None,'linear-srgb','canvas']}.items():
            for value in values:
                with self.subTest(field=field,value=value),self.assertRaises((ValueError,TypeError)):
                    rendered_series_audit(t,**{**valid,field:value})
        for field in valid:
            args=valid.copy();args.pop(field)
            with self.assertRaises(TypeError):rendered_series_audit(t,**args)
        with self.assertRaises(TypeError):rendered_series_audit(t,**valid,renderer='python')
    def test_theme_level_edges_are_not_a_contrast_waiver(self):
        t=replace(get_theme('slipware'),series=('#FFFFFF',),series_edges=('#000000',))
        self.assertFalse(any(r['token'].startswith('series[') for r in contrast_audit(t)))
        with self.assertRaisesRegex(ThemePackError,'layered series edges'):
            rendered_series_audit(t,substrate='#FFFFFF',opacity=.78,compositing='srgb-source-over')
        plain=replace(t,series_edges=None)
        self.assertFalse(rendered_series_audit(plain,substrate='#FFFFFF',opacity=.78,compositing='srgb-source-over')[0]['passes'])
    def test_invalid_series(self):
        for series in [(),('red',),('#000000\n',)]:
            with self.assertRaises(ThemePackError):rendered_series_audit(replace(get_theme('slipware'),series=series),substrate='#FFFFFF',opacity=1,compositing='srgb-source-over')
if __name__=='__main__':unittest.main(verbosity=2)
