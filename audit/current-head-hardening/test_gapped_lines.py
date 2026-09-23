"""Python-only missing-y contract: admission, actual strokes, identity and limits."""
from io import BytesIO
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'src'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.collections import PathCollection
import numpy as np
from figurestead import line, scatter, heatmap, histogram
from figurestead._line_identity import IdentityLine, finite_runs, line_marker_indices, marker_indices, visible_intervals

N = np.nan

class GappedLineTests(unittest.TestCase):
    def tearDown(self):
        plt.close('all')

    def snapshot(self, ax):
        return (tuple(ax.get_children()), tuple(ax.dataLim.bounds), ax.get_xlim(), ax.get_ylim(),
                ax.get_autoscalex_on(), ax.get_autoscaley_on(), ax.get_title(),
                ax.get_facecolor(), ax.figure.get_facecolor(), ax.get_position().bounds)

    def test_admission_and_transactionality(self):
        f, a = plt.subplots(); a.plot([-3, 7], [5, 9]); a.set(xlim=(-4,8), title='Keep')
        before = self.snapshot(a)
        invalid = ([N,N,N], [[1,2,3],[N,N,N]], [1,np.inf,2], [1,-np.inf,2],
                   [1,None,2], ['1','nan','2'], np.array([1,N,2],dtype=object),
                   np.ma.array([1,N,2],mask=False), [np.ma.array([1,2,3],mask=True)],
                   [[1,2],[1]], [], np.zeros((1,1,3)), [1,2])
        for y in invalid:
            for direct in (False, True):
                with self.subTest(y=y,direct=direct), patch('figurestead.plots.ensure_axes') as allocate:
                    with self.assertRaises(ValueError): line([0,1,2],y,ax=a,direct_labels=direct)
                    allocate.assert_not_called()
                self.assertEqual(self.snapshot(a),before)
        with self.assertRaisesRegex(ValueError,r'line.ys\[1\].*all-missing'):
            line([0,1],[[1,2],[N,N]],ax=a)
        for x in ([0,N,2],[0,np.inf,2]):
            with self.assertRaisesRegex(ValueError,'line.x'):line(x,[1,N,2],ax=a)
        with self.assertRaisesRegex(ValueError,'explicit presentation poses'):
            line([0,1,2],[1,N,2],pose='scientific',ax=a)
        self.assertEqual(self.snapshot(a),before)
        for func,args in [(scatter,([0,1],[1,N])),(histogram,([1,N],)),(heatmap,([[1,N]],))]:
            with self.assertRaises(ValueError):func(*args)

    def test_topology_and_actual_adjacent_strokes(self):
        cases = [([1,2,N,3,4],[(0,1),(3,4)]),([1,2,N,N,3,4],[(0,1),(4,5)]),
                 ([N,1,2],[(1,2)]),([1,2,N],[(0,1)]),([1,N,2,N,3],[]),
                 ([N,0,N],[]),([0],[]),([1,2,N,3,4,N,5,6],[(0,1),(3,4),(6,7)])]
        for y,pairs in cases:
            # Non-monotone authored x must not be sorted by the implementation.
            x = np.arange(len(y),dtype=float)[::-1]; x[::2] *= .8
            f,a=line(x,y,marker_stride=4); body=a.lines[0]; f.canvas.draw()
            captured=[]
            def collect(a,b,*args):
                captured.append((a.copy(),b.copy())); return iter([(0.,1.)])
            with patch('figurestead._line_identity.visible_intervals',side_effect=collect):
                body.draw(f.canvas.get_renderer())
            actual = [a.transData.inverted().transform([p,q]) for p,q in captured]
            self.assertEqual(len(actual),len(pairs))
            for drawn,(i,j) in zip(actual,pairs):
                np.testing.assert_allclose(drawn,[[x[i],y[i]],[x[j],y[j]]],atol=1e-12)
            np.testing.assert_array_equal(body.get_xdata(),x)
            np.testing.assert_array_equal(body.get_ydata(),y)
            self.assertEqual(len(a.lines),1)
            plt.close(f)

    def test_cadence_boundaries_and_independent_peers(self):
        rows = [[N,1,2,N,4,N,6,7,8,N], [0,1,N,3,4,5,N,7,N,9]]
        expected = {1:[[1,2,4,6,7,8],[0,1,3,4,5,7,9]],4:[[1,2,4,6,8],[0,1,3,4,5,7,9]],99:[[1,2,4,6,8],[0,1,3,5,7,9]]}
        for stride in (1,4,99):
            f,a=line(np.arange(10),rows,marker_stride=stride)
            for row,body,indices in zip(rows,a.lines,expected[stride]):
                np.testing.assert_array_equal(body.identity_points.get_offsets(),np.column_stack([np.arange(10),row])[indices])
                self.assertEqual(line_marker_indices(row,stride),indices)
            plt.close(f)
        for n in (1,2,10,29):
            for stride in (1,4,99):self.assertEqual(line_marker_indices(np.arange(n),stride),marker_indices(n,stride))

    def test_phase_restarts_only_at_gaps_and_edges_share_phase(self):
        from dataclasses import replace
        from figurestead import get_theme
        theme=replace(get_theme('lavender_fog_notebook'),series_edges=('#000000',)*3)
        for rhythm in ('solid','dash','dot','dash-dot'):
            f,a=line(np.arange(9),[0,0,0,N,N,0,0,0,0],marker_stride=4,theme=theme,
                     series_keys=['a'],line_styles={'a':rhythm})
            body=a.lines[0]; f.canvas.draw(); renderer=f.canvas.get_renderer()
            strokes=[]
            def record(proxy,renderer):
                strokes.append((proxy.get_xydata().copy(),proxy._unscaled_dash_pattern,list(proxy.get_path_effects())))
            with patch.object(Line2D,'draw',record):body.draw(renderer)
            vertices=body.get_transform().transform(body.get_xydata())
            centers=a.transData.transform(body.identity_points.get_offsets())
            size=renderer.points_to_pixels(np.sqrt(body.identity_points.get_sizes()[0]))
            clearance=renderer.points_to_pixels(body.get_linewidth()+body.identity_edge_width)/2
            offset,dashes=body._unscaled_dash_pattern
            expected=[]
            for start,stop in [(0,3),(5,9)]:
                travelled=0.
                for i in range(start,stop-1):
                    p,q=vertices[i:i+2];length=np.linalg.norm(q-p)
                    for lo,hi in visible_intervals(p,q,centers,body.identity_marker,size,clearance):
                        phase=(travelled+lo*length)/renderer.points_to_pixels(1)/body.get_linewidth()
                        expected.append((np.array([p+lo*(q-p),p+hi*(q-p)]),phase))
                    travelled+=length
            self.assertEqual(len(strokes),len(expected))
            for (xy,pattern,effects),(want,phase) in zip(strokes,expected):
                np.testing.assert_allclose(xy,want)
                self.assertEqual(effects,body.get_path_effects())
                if dashes is not None:
                    self.assertEqual(pattern[1],dashes)
                    self.assertAlmostEqual(pattern[0],(offset+phase)%sum(dashes))
            # Export exercises native Agg and SVG, including a second export DPI.
            for fmt in ('png','svg'):
                out=BytesIO();f.savefig(out,format=fmt,dpi=180);self.assertGreater(len(out.getvalue()),1000)
            plt.close(f)

    def test_native_rhythm_matches_independent_finite_run_draws(self):
        from types import MethodType
        for rhythm in ('solid','dash','dot','dash-dot'):
            f,a=line(np.arange(10),[0,1,1,N,N,0,1,1,0,N],marker_stride=4,
                     series_keys=['a'],line_styles={'a':rhythm})
            body=a.lines[0]
            def png():
                out=BytesIO();f.savefig(out,format='png');return out.getvalue()
            actual=png()
            # Independent reference: draw two wholly finite paths, each with
            # the original rhythm offset. Shared real marker centers preserve
            # the same own-marker clipping, with no invented bridging length.
            def separate_runs(original, renderer):
                for indices in ([0,1,2],[5,6,7,8]):
                    xy=original.get_xydata()[indices]
                    run=IdentityLine(xy[:,0],xy[:,1]);run.update_from(original)
                    run.set_figure(f)
                    for name in ('identity_points','identity_marker','identity_edge_width'):
                        setattr(run,name,getattr(original,name))
                    run.draw(renderer)
            body.draw=MethodType(separate_runs,body)
            self.assertEqual(actual,png())
            plt.close(f)

    def test_gap_native_pixels_singleton_and_no_background_knockout(self):
        f,a=line(np.arange(9),[0,0,0,N,N,0,N,0,0],marker_stride=4)
        a.set(xlim=(-1,9),ylim=(-1,1),facecolor='white');f.set_facecolor('white');a.set_axis_off()
        body=a.lines[0];a.axvline(5,color='#00ff00',linewidth=2,zorder=1)
        def image():f.canvas.draw();return np.asarray(f.canvas.buffer_rgba()).copy()
        body.set_visible(False);body.identity_points.set_visible(False);base=image()
        body.set_visible(True);body.identity_points.set_visible(True);actual=image()
        for x in (3.5,4.5,6):
            px,py=a.transData.transform((x,0));r,c=int(f.bbox.height-py),int(px)
            np.testing.assert_array_equal(actual[r-2:r+2,c-2:c+2],base[r-2:r+2,c-2:c+2])
        px,py=a.transData.transform((5,0));r,c=int(f.bbox.height-py),int(px)
        np.testing.assert_array_equal(actual[r,c],base[r,c]) # grid through singleton interior
        self.assertFalse(np.array_equal(actual[r-8:r+8,c-8:c+8],base[r-8:r+8,c-8:c+8]))
        px,py=a.transData.transform((1,0));r,c=int(f.bbox.height-py),int(px)
        self.assertFalse(np.array_equal(actual[r,c],base[r,c])) # unmarked finite stroke, no hole

    def test_legend_each_entry_and_carried_identity(self):
        rows=[[1,N,2,N,3],[1,2,N,3,4],[1,2,3,4,5]]
        for slots,keys,indices in [([0,1,2],['c','t','m'],[0,1,2]),([2,0],['m','c'],[2,0]),([0,0],['c','m'],[0,1])]:
            f,a=line(np.arange(5),[rows[i] for i in indices],labels=['same']*len(slots),
                     series_slots=slots,series_keys=keys,line_styles={'c':'dash','m':'dot'},marker_stride=4)
            f.canvas.draw()
            for body,handle,slot,key,idx in zip(a.lines,a.get_legend().legend_handles,slots,keys,indices):
                self.assertEqual(body.identity_marker,['o','s','^'][slot])
                self.assertEqual(body.get_linestyle(),{'c':'--','m':':'}.get(key,'-'))
                if idx==0:
                    self.assertIsInstance(handle,PathCollection)
                    np.testing.assert_array_equal(handle.get_paths()[0].vertices,body.identity_points.get_paths()[0].vertices)
                else:
                    self.assertIsInstance(handle,IdentityLine)
                    self.assertEqual(handle._dash_pattern,body._dash_pattern)
                    self.assertEqual(handle.identity_marker,body.identity_marker)
            plt.close(f)
        _,a=line([0],[[1],[2]])
        self.assertTrue(all(isinstance(h,IdentityLine) for h in a.get_legend().legend_handles))

    def test_finite_pair_domains_and_cadence_independence(self):
        cases=[([-100,1,2,100],[[N,2,N,N]],[1,2,1,2]),
               ([-100,1,2,100],[[N,2,N,N],[3,N,N,4]],[-100,2,100,4]),
               ([0,1,2,3,4],[[N,100,N,-20,N]],[1,-20,3,100]),
               ([0,1,2,3,4],[[0,100,0,0,N]],[0,0,3,100])]
        for x,ys,extent in cases:
            boxes=[]
            for stride in (1,4):
                f,a=line(x,ys,marker_stride=stride);f.canvas.draw()
                np.testing.assert_array_equal(a.dataLim.extents,extent)
                boxes.append((a.get_xlim(),a.get_ylim()));plt.close(f)
            self.assertEqual(boxes[0],boxes[1])

    def test_external_axes_preserve_artists_limits_and_relim(self):
        for explicit in (False,True):
            f,a=plt.subplots();old,=a.plot([-8,-7],[7,8]);a.set_autoscaley_on(False)
            if explicit:a.set_xlim(-10,10)
            flags=(a.get_autoscalex_on(),a.get_autoscaley_on());limits=(a.get_xlim(),a.get_ylim())
            line([-100,1,2,100],[N,2,30,N],ax=a,marker_stride=4)
            self.assertIs(a.lines[0],old)
            np.testing.assert_array_equal(a.dataLim.extents,[-8,2,2,30])
            self.assertEqual((a.get_autoscalex_on(),a.get_autoscaley_on()),flags)
            self.assertEqual(a.get_ylim(),limits[1])
            if explicit:self.assertEqual(a.get_xlim(),limits[0])
            a.relim();np.testing.assert_array_equal(a.dataLim.extents,[-8,2,2,30])
            np.testing.assert_array_equal(a.lines[1].get_ydata(),[N,2,30,N])

    def test_direct_fallback_before_allocation_and_export_lifecycle(self):
        for rows in ([[1,2,N,3,4],[2,3,4,5,6]],[[N,2,3,4,N],[1,N,3,N,5]]):
            for stride in (1,4):
                opts=dict(labels=['A','B'],theme='lavender_fog_notebook',marker_stride=stride)
                f,a=line(np.arange(5),rows,direct_labels=True,**opts)
                g,b=line(np.arange(5),rows,**opts);d=a._figurestead_direct_labels
                for width,dpi,fmt in [(8.4,120,'png'),(3,180,'png'),(8.4,120,'svg'),(8.4,120,'png')]:
                    outputs=[]
                    with matplotlib.rc_context({'svg.hashsalt':'gapped-test'}):
                        for fig in (f,g):
                            fig.set_size_inches(width,5.2);out=BytesIO()
                            fig.savefig(out,format=fmt,dpi=dpi,metadata={'Date':None} if fmt=='svg' else None)
                            outputs.append(out.getvalue())
                    self.assertEqual(outputs[0],outputs[1])
                    self.assertEqual(d.result,{'status':'fallback','reason':'missing-observations'})
                    self.assertEqual(d.artists,[]);self.assertTrue(a.get_legend().get_visible())
                    self.assertEqual(a.get_position().bounds,b.get_position().bounds)
                plt.close(f);plt.close(g)

if __name__=='__main__':unittest.main(verbosity=2)
