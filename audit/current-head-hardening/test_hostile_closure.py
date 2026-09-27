"""Focused hostile pre-alpha reproductions."""
from pathlib import Path
import sys, unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'src'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PathCollection
import numpy as np
from figurestead import line
from figurestead._line_identity import IdentityLine

class HostileClosureTests(unittest.TestCase):
    def tearDown(self): plt.close('all')

    def test_finite_one_point_legends(self):
        for n in (1,3):
            f,a=line([0],[[i] for i in range(n)],labels=[f'S{i}' for i in range(n)])
            f.canvas.draw()
            self.assertEqual(len(a.lines),n)
            if n == 1:
                self.assertIsNone(a.get_legend())  # Existing single-series default.
                from figurestead._line_identity import IdentityLegend
                a.legend(handler_map={IdentityLine: IdentityLegend()})
            self.assertTrue(all(isinstance(h,PathCollection) for h in a.get_legend().legend_handles))
            self.assertTrue(all(len(b.identity_points.get_offsets())==1 for b in a.lines))

    def test_connected_and_isolated_legends(self):
        for ys in ([[1,2],[2,3]],[[1,2,3],[1,np.nan,3]]):
            f,a=line(range(len(ys[0])),ys,labels=['A','B'],series_keys=['a','b'],line_styles={'a':'dash'})
            f.canvas.draw();handles=a.get_legend().legend_handles
            self.assertIsInstance(handles[0],IdentityLine)
            self.assertEqual(handles[0].get_linestyle(),'--')
            self.assertIsInstance(handles[1],PathCollection if len(ys[0])==3 else IdentityLine)

    def test_semantic_component_encoding(self):
        from figurestead.scene import _id_component, _id
        values=['A B','A/B','A-B','A~20B','λ','safe_1.x','\ud800']
        expected=['A~20B','A~2FB','A-B','A~7E20B','~CE~BB','safe_1.x','~uD800']
        self.assertEqual([_id_component(v) for v in values],expected)
        self.assertEqual(len({_id('P A','point',v,0) for v in values}),len(values))
        self.assertNotEqual(_id('P A','point','x',0),_id('P/A','point','x',0))

    def scene_contract(self, count=9):
        return {'theme':{'series':['#123456','#654321']},'panels':[{'id':'line','renderer':'line',
            'data':{'x':[0,1],'series':[{'key':f's{i}','y':[i,i+1]} for i in range(count)]}}]}

    def test_auxiliary_finite_boundary(self):
        from copy import deepcopy
        from figurestead import compile_terminal_scene
        for renderer in ('line','scatter'):
            for field in ('x','y'):
                for value in (np.nan,np.inf,-np.inf):
                    c=self.scene_contract(1);p=c['panels'][0];p['renderer']=renderer
                    if renderer=='scatter':p['data']={'x':[0,1],'y':[2,3],'series':['s','s']}
                    row=p['data'] if field=='x' or renderer=='scatter' else p['data']['series'][0]
                    row[field][1]=value
                    with self.assertRaisesRegex(ValueError,'finite numeric coordinates'):
                        compile_terminal_scene(c)
        c=self.scene_contract();before=deepcopy(c);compile_terminal_scene(c);self.assertEqual(c,before)

    def test_auxiliary_glyph_blocks_overrides(self):
        from figurestead import compile_terminal_scene
        rhythms=['solid','dash','dot','dash-dot']
        for glyphs in (['square','ring'],['triangle','square','ring'],['ring','square','triangle','diamond']):
            c=self.scene_contract(13);override={'glyph':'diamond','lineStyle':'dash-dot','color':'#abcdef','edge':'#123456','lineWidth':3,'hatch':'diag'}
            c['style']={'glyphs':glyphs,'lineStyles':rhythms,'series':{'s1':override}}
            styles=compile_terminal_scene(c)['seriesStyles']
            for i,style in enumerate(styles.values()):
                self.assertEqual(style['glyph'],override['glyph'] if i==1 else glyphs[i%len(glyphs)])
                self.assertEqual(style['lineStyle'],override['lineStyle'] if i==1 else rhythms[(i//len(glyphs))%4])
            for k,v in override.items():self.assertEqual(styles['s1'][k],v)
        for glyphs in ([],['hexagon']):
            c=self.scene_contract();c['style']={'glyphs':glyphs}
            with self.assertRaisesRegex(ValueError,'style.glyphs'):compile_terminal_scene(c)

    def test_first_appearance_colors_and_family_markers(self):
        from figurestead import scatter, strip_summary
        from matplotlib.colors import to_hex
        from figurestead.core import resolve
        theme,_=resolve('lavender_fog_notebook','deep_scope')
        for keys in (['treatment','treatment','control'],['z','a','z'],[2,2,1]):
            order=list(dict.fromkeys(keys))
            for family in ('scatter','strip'):
                f,a=(scatter([0,1,2],[1,2,3],series=keys,theme=theme) if family=='scatter' else strip_summary(['A']*3,[1,2,3],series=keys,theme=theme))
                labeled=[c for c in a.collections if c.get_label() in list(map(str,order))]
                self.assertEqual([c.get_label() for c in labeled],list(map(str,order)))
                self.assertEqual([t.get_text() for t in a.get_legend().get_texts()],list(map(str,order)))
                for i,c in enumerate(labeled):
                    self.assertEqual(to_hex(c.get_edgecolors()[0]),theme.series[i].lower())
                    np.testing.assert_array_equal(c.get_paths()[0].vertices,labeled[0].get_paths()[0].vertices)

    def test_category_admission_and_empty_strip_summary(self):
        from figurestead import scatter, strip_summary
        invalid=(np.array([1,'x'],dtype=object),[np.nan,1],np.ma.array([1,2],mask=False))
        for keys in invalid:
            with self.assertRaises(ValueError):scatter([0,1],[1,2],series=keys)
            with self.assertRaises(ValueError):strip_summary(['A','B'],[1,2],series=keys)
        for order in (['empty','B'],['B','empty'],['first','B','last']):
            f,a=strip_summary(['B','B'],[2,4],order=order)
            self.assertEqual([t.get_text() for t in a.get_xticklabels()],order)
            self.assertTrue(all(np.isfinite(b.get_ydata()).all() for b in a.lines))

if __name__=='__main__': unittest.main()
