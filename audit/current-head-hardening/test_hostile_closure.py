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

if __name__=='__main__': unittest.main()
