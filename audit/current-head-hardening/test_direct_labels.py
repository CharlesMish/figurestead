"""Bounded direct-label contracts; real Agg measurements, no rendering harness."""
import io,json,sys,unittest,warnings
import xml.etree.ElementTree as ET
from matplotlib.collections import PathCollection
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'src'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
from figurestead import line, PlotSpec
from figurestead._direct_labels import solve, contrast, LEADER_TOLERANCE
from figurestead.themes import get_theme
from matplotlib.transforms import Bbox
from matplotlib.text import Text

class DirectLabelTests(unittest.TestCase):
    def tearDown(self):plt.close('all')
    def make(self,**kw):
        opts=dict(labels=['S1','S2','S3'],theme='lavender_fog_notebook',direct_labels=True)
        opts.update(kw)
        return line([0,1,2],[[1,2,3],[2,3,3.05],[3,4,3.1]],**opts)
    def png(self,f):
        b=io.BytesIO();f.savefig(b,format='png');return b.getvalue()
    def test_solver_vectors_and_objective(self):
        cases=json.loads((Path(__file__).parents[1]/'direct-labels/solver-cases.json').read_text())
        for c in cases:
            e=[dict(anchor=a,rank=r) for a,r in zip(c['anchors'],c['ranks'])]
            p=solve(e,c['lo'],c['hi'],c['height'],c['gap'])
            self.assertEqual(None if p is None else [x['center'] for x in p],c['centers'],c['name'])
            if 'order'in c:self.assertEqual([x['rank'] for x in p],c['order'])
        # Independent feasible-grid objective comparison, not another PAVA call.
        e=[dict(anchor=4,rank=0),dict(anchor=5,rank=1),dict(anchor=12,rank=2)]
        p=solve(e,0,16,2,2);cost=sum((x['anchor']-x['center'])**2 for x in p)
        for a in np.arange(1,8,.5):
            for b in np.arange(a+4,12,.5):
                for c in np.arange(b+4,15.1,.5):self.assertLessEqual(cost,sum((u-v)**2 for u,v in zip([4,5,12],[a,b,c]))+1e-12)
    def test_disabled_and_explicit_false(self):
        f,a=self.make(direct_labels=False);before=self.png(f)
        g,b=line([0,1,2],[[1,2,3],[2,3,3.05],[3,4,3.1]],labels=['S1','S2','S3'],theme='lavender_fog_notebook')
        self.assertEqual(before,self.png(g));self.assertFalse(hasattr(b,'_figurestead_direct_labels'))
    def test_placement_identity_and_lifecycle(self):
        f,a=self.make();xy=[l.get_xydata().copy() for l in a.lines];domains=(a.get_xlim(),a.get_ylim())
        f.canvas.draw();d=a._figurestead_direct_labels;self.assertEqual(d.result['status'],'placed')
        rect=a.get_position().bounds;count=len(a.get_children());png=self.png(f)
        self.assertEqual(png,self.png(f));self.assertEqual(rect,a.get_position().bounds);self.assertEqual(count,len(a.get_children()))
        self.assertEqual(domains,(a.get_xlim(),a.get_ylim()))
        for i,e in enumerate(d.result['entries']):
            np.testing.assert_array_equal(e['markerPath'],a.lines[e['rank']].identity_points.get_paths()[0].vertices)
        for l,before in zip(a.lines,xy):np.testing.assert_array_equal(l.get_xydata(),before)
        for size,dpi in [((7,5),96),((8.4,5.2),180),((8.4,5.2),120)]:
            f.set_size_inches(*size);f.set_dpi(dpi);f.canvas.draw();self.assertEqual(d.result['status'],'placed')
            self.assertEqual(count,len(a.get_children()))
        b=io.BytesIO();f.savefig(b,format='png',dpi=180);self.assertEqual(d.result['status'],'placed')
        f.canvas.draw();self.assertEqual(rect,a.get_position().bounds)
    def test_literal_underscore_labels_draw_and_export_without_legend_rows(self):
        for labels in (['_A','_B','_C'],['_nolegend_']*3,['A','_B','_C']):
            with self.subTest(labels=labels), warnings.catch_warnings(record=True):
                warnings.simplefilter('always')
                f,a=self.make(labels=labels);legend=a.get_legend();d=a._figurestead_direct_labels
                self.assertEqual([t.get_text() for t in legend.get_texts()], [t for t in labels if not t.startswith('_')])
                font=legend.prop.copy();count=len(a.get_children())
                # No visible or fake legend text row may provide direct typography.
                with patch.object(legend,'get_texts',side_effect=AssertionError('legend row accessed')):
                    f.canvas.draw()
                    png=self.png(f);self.assertTrue(png.startswith(b'\x89PNG\r\n\x1a\n'))
                    outlined=io.BytesIO();f.savefig(outlined,format='svg')
                    self.assertIn(b'<svg',outlined.getvalue())
                    svg=io.BytesIO()
                    with matplotlib.rc_context({'svg.fonttype':'none'}):f.savefig(svg,format='svg')
                    text=[e.text for e in ET.fromstring(svg.getvalue()).iter('{http://www.w3.org/2000/svg}text')]
                    for label in set(labels):self.assertEqual(text.count(label),labels.count(label))
                    f.canvas.draw();self.assertEqual(png,self.png(f))
                self.assertEqual(d.result['status'],'placed');self.assertEqual(count,len(a.get_children()))
                texts=[t for t in d.artists if isinstance(t,Text)]
                self.assertCountEqual([t.get_text() for t in texts],labels)
                self.assertTrue(all(t.get_fontproperties()==font and not t.get_parse_math() for t in texts))
                self.assertEqual([l.identity_marker for l in a.lines],['o','s','^'])
                markers=[m for m in d.artists if isinstance(m,PathCollection)]
                for record,marker in zip(d.result['entries'],markers):
                    body=a.lines[record['rank']].identity_points
                    np.testing.assert_array_equal(marker.get_paths()[0].vertices,body.get_paths()[0].vertices)
                    np.testing.assert_array_equal(marker.get_sizes(),body.get_sizes())
                    np.testing.assert_array_equal(marker.get_edgecolors(),body.get_edgecolors())
                plt.close(f)
    def test_underscore_disabled_preserves_ordinary_legend(self):
        for labels in (['_A','_B','_C'],['_nolegend_']*3,['A','_B','_C']):
            figures=[];observations=[]
            for options in ({},{'direct_labels':False}):
                with warnings.catch_warnings(record=True) as caught:
                    warnings.simplefilter('always')
                    f,a=line([0,1,2],[[1,2,3],[2,3,3.05],[3,4,3.1]],labels=labels,
                             theme='lavender_fog_notebook',**options)
                    png=self.png(f)
                self.assertFalse(hasattr(a,'_figurestead_direct_labels'))
                self.assertEqual([t.get_text() for t in a.get_legend().get_texts()], [t for t in labels if not t.startswith('_')])
                observations.append((png,[(w.category.__name__,str(w.message)) for w in caught]))
                figures.append(f)
            self.assertEqual(observations[0],observations[1])
            if all(t.startswith('_') for t in labels):
                self.assertTrue(any('No artists with labels' in message for _,message in observations[0][1]))
            for f in figures:plt.close(f)
    def test_underscore_fallback_restores_ordinary_draw_export_lifecycle(self):
        with warnings.catch_warnings(record=True):
            warnings.simplefilter('always')
            f,a=self.make(labels=['_A','_B','_C']);g,b=self.make(labels=['_A','_B','_C'],direct_labels=False)
        original=a.get_xlim();baseline=b.get_position().bounds;count=len(a.get_children())
        for _ in range(2):
            a.set_xlim(*original);f.canvas.draw();self.assertEqual(a._figurestead_direct_labels.result['status'],'placed')
            # Admitted point centers, but legitimately clipped terminal marker ink.
            a.set_xlim(0,2);b.set_xlim(0,2);f.canvas.draw()
            d=a._figurestead_direct_labels
            self.assertEqual(d.result['reason'],'terminal-marker-clipped');self.assertEqual(d.artists,[])
            self.assertEqual(a.get_position().bounds,baseline);self.assertTrue(a.get_legend().get_visible())
            self.assertEqual(a.get_legend().get_texts(),[]);self.assertEqual(self.png(f),self.png(g))
            x,y=io.BytesIO(),io.BytesIO()
            with matplotlib.rc_context({'svg.hashsalt':'underscore-fallback'}):
                f.savefig(x,format='svg',metadata={'Date':None});g.savefig(y,format='svg',metadata={'Date':None})
            self.assertEqual(x.getvalue(),y.getvalue());self.assertEqual(count,len(a.get_children()))
        # Unavailable font configuration follows the existing measurement fallback.
        a.set_xlim(*original)
        with patch.object(a.get_legend(),'prop',None):d.draw(f.canvas.get_renderer())
        self.assertEqual(d.result['reason'],'unsupported-layout');self.assertEqual(d.artists,[])

    def test_slots_ties_and_rhythm(self):
        for slots in ([1,2],[2,0,1]):
            f,a=line([0,1,2],[[1,2,3]]*len(slots),labels=['duplicate']*len(slots),series_slots=slots,theme='lavender_fog_notebook',direct_labels=True)
            a.lines[0].set_linestyle('--');f.canvas.draw();d=a._figurestead_direct_labels
            self.assertEqual(d.result['status'],'placed');self.assertEqual([e['rank'] for e in d.result['entries']],sorted(slots))
            self.assertEqual(a.lines[0].get_linestyle(),'--')
    def test_fallback_bytes_and_endpoint(self):
        for axis,bounds in [('x',(0,1.8)),('y',(0,3)),('x',(.5,2.5)),('y',(1.5,5))]:
            f,a=self.make();g,b=self.make(direct_labels=False)
            getattr(a,'set_'+axis+'lim')(*bounds);getattr(b,'set_'+axis+'lim')(*bounds)
            self.assertEqual(self.png(f),self.png(g));self.assertEqual(a._figurestead_direct_labels.result['reason'],'outside-common-admission-profile')
    def test_admitted_center_clipped_marker(self):
        f,a=self.make();g,b=self.make(direct_labels=False)
        a.set_xlim(0,2);b.set_xlim(0,2)
        self.assertEqual(self.png(f),self.png(g))
        self.assertEqual(a._figurestead_direct_labels.result['reason'],'terminal-marker-clipped')
        self.assertTrue(all(0<=l.get_xydata()[-1,0]<=2 for l in a.lines))
    def test_text_and_horizontal_fallback(self):
        for label,reason in [('a\nb','unsupported-text'),('a\tb','unsupported-text'),('é','unsupported-text'),(' ','unsupported-text'),('X'*200,'horizontal-capacity')]:
            f,a=self.make(labels=[label,'B','C']);g,b=self.make(labels=[label,'B','C'],direct_labels=False)
            self.assertEqual(self.png(f),self.png(g));self.assertEqual(a._figurestead_direct_labels.result['reason'],reason)
        f,a=self.make(labels=['$x$','<B>','A&B']);f.canvas.draw();self.assertEqual(a._figurestead_direct_labels.result['status'],'placed')
        self.assertTrue(all(not t.get_parse_math() for t in a._figurestead_direct_labels.artists if isinstance(t,matplotlib.text.Text)))
    def test_path_pose_layout_and_identity_failures(self):
        for x in ([0,0,2],[0,2,1]):
            f,a=line(x,[[1,2,3],[2,3,4]],direct_labels=True);f.canvas.draw();self.assertEqual(a._figurestead_direct_labels.result['reason'],'unsupported-geometry')
        f,a=self.make();a.set_xscale('log');a._figurestead_direct_labels.draw(f.canvas.get_renderer());self.assertEqual(a._figurestead_direct_labels.result['reason'],'unsupported-geometry')
        f,a=self.make();f.set_layout_engine('tight');f.canvas.draw();self.assertEqual(a._figurestead_direct_labels.result['reason'],'unsupported-layout')
        f,a=self.make();a.lines[0].identity_points.set_visible(False);f.canvas.draw();self.assertEqual(a._figurestead_direct_labels.result['reason'],'unsupported-geometry')
        f,a=line([0,1,2],[[1,2,3]],direct_labels=True);f.canvas.draw();self.assertEqual(a._figurestead_direct_labels.result['reason'],'unsupported-series-count')
        with self.assertRaises(ValueError):self.make(direct_labels='yes')
        with self.assertRaises(ValueError):line([0,1],[1,float('nan')],direct_labels=True)
    def test_ink_failure_and_geometry_restoration(self):
        f,a=self.make();base=a.get_position().bounds
        with patch('figurestead._direct_labels.contrast',return_value=1):f.canvas.draw()
        self.assertEqual(a._figurestead_direct_labels.result['reason'],'ink-contrast');self.assertEqual(a.get_position().bounds,base);self.assertTrue(a.get_legend().get_visible())
        f.canvas.draw();self.assertEqual(a._figurestead_direct_labels.result['status'],'placed')

    def test_leaders_threshold_ink_fallback_and_crossing(self):
        # Tied anchors centered away from the bounds: ordered straight leaders.
        f,a=line([0,1,2],[[1,2,3]]*3,labels=['A','B','C'],theme='lavender_fog_notebook',direct_labels=True)
        a.set_ylim(0,6);f.canvas.draw();d=a._figurestead_direct_labels
        entries=d.result['entries'];self.assertIsNone(entries[1]['leader'])
        for e in (entries[0],entries[2]):
            l=e['leader'];self.assertLess(l['x2'],e['box'][0]);self.assertEqual(l['y1'],e['anchor'])
            self.assertGreaterEqual(contrast(l['color'],f.get_facecolor()),3)
        self.assertLess(entries[0]['leader']['y2'],entries[2]['leader']['y2'])
        theme=replace(get_theme('lavender_fog_notebook'),secondary='#F4F1F8')
        f,a=line([0,1,2],[[1,2,3]]*3,labels=['A','B','C'],theme=theme,direct_labels=True)
        a.set_ylim(0,6);f.canvas.draw()
        self.assertEqual(a._figurestead_direct_labels.result['entries'][0]['leader']['color'],theme.label)
        # A label color acceptable on field can fail on a custom actual plot surface.
        a.set_facecolor(theme.label);f.canvas.draw();self.assertEqual(a._figurestead_direct_labels.result['reason'],'ink-contrast')
    def test_capacity_margins_measurement_and_custom_clip(self):
        f,a=self.make();f.canvas.draw();self.assertEqual(a._figurestead_direct_labels.result['shrink'],0)
        f,a=self.make(labels=['Long treatment name']*3);base=a.get_position().width;f.canvas.draw();d=a._figurestead_direct_labels
        self.assertEqual(d.result['status'],'placed');self.assertGreater(d.result['shrink'],0);self.assertGreaterEqual(a.get_position().width,base*.75)
        for e in d.result['entries']:self.assertLessEqual(e['box'][2],f.bbox.x1)
        f,a=self.make();renderer=f.canvas.get_renderer()
        with patch.object(renderer,'get_text_width_height_descent',side_effect=NotImplementedError):a._figurestead_direct_labels.draw(renderer)
        self.assertEqual(a._figurestead_direct_labels.result['reason'],'unsupported-layout')
        f,a=self.make();a.lines[0].set_clip_box(Bbox.from_bounds(0,0,30,30));f.canvas.draw()
        self.assertEqual(a._figurestead_direct_labels.result['reason'],'unsupported-geometry')
    def test_layout_engines_fallback_after_success_and_annotation(self):
        for engine in ['tight','constrained']:
            f,a=self.make();g,b=self.make(direct_labels=False);f.canvas.draw()
            f.set_layout_engine(engine);g.set_layout_engine(engine)
            self.assertEqual(self.png(f),self.png(g),engine)
            self.assertEqual(a._figurestead_direct_labels.result['reason'],'unsupported-layout')
        f,a=self.make();f.canvas.draw();a.annotate('collision',(2,3.05),xytext=(2.2,3.05),textcoords='data')
        f.canvas.draw();self.assertEqual(a._figurestead_direct_labels.result['reason'],'unsupported-layout')
    def test_unsupported_export_layout_restores_ordinary(self):
        for options in ({'bbox_inches':'tight'},{'transparent':True}):
            f,a=self.make();g,b=self.make(direct_labels=False);f.canvas.draw()
            x,y=io.BytesIO(),io.BytesIO();f.savefig(x,format='png',**options);g.savefig(y,format='png',**options)
            self.assertEqual(x.getvalue(),y.getvalue())
            self.assertEqual(a._figurestead_direct_labels.result['reason'],'unsupported-layout')
            f.canvas.draw();self.assertEqual(a._figurestead_direct_labels.result['status'],'placed')
    def test_pose_and_vector_export_and_minimum_width(self):
        f,a=self.make(pose='scientific');f.canvas.draw();self.assertEqual(a._figurestead_direct_labels.result['reason'],'unsupported-layout')
        f,a=self.make();out=io.BytesIO();f.savefig(out,format='svg');self.assertGreater(len(out.getvalue()),1000)
        self.assertEqual(a._figurestead_direct_labels.result['status'],'placed');f.canvas.draw();self.assertEqual(a._figurestead_direct_labels.result['status'],'placed')
        f,a=self.make();f.set_size_inches(2,4);f.canvas.draw();self.assertIn(a._figurestead_direct_labels.result['reason'],('horizontal-capacity','terminal-marker-clipped'))

    def test_public_rhythm_samples_and_lifecycle(self):
        from matplotlib.lines import Line2D
        for mapping in ({'model':'dash'},{'control':'dash'},{'model':'dot'},{'model':'dash-dot'}):
            options=dict(labels=['Control','Treatment','Model'],series_keys=['control','treatment','model'],line_styles=mapping)
            f,a=self.make(**options);f.canvas.draw();d=a._figurestead_direct_labels
            self.assertEqual(d.result['status'],'placed');self.assertTrue(d.result['lineSamplesRequired'])
            self.assertEqual(len(d.result['entries']),3)
            lines=[v for v in d.artists if isinstance(v,Line2D)]
            for e in d.result['entries']:
                body=a.lines[e['rank']];sample=e['lineSample']
                artist=next(v for v in lines if list(v.get_xdata())==[sample['x1'],sample['x2']])
                lines.remove(artist)
                self.assertEqual(artist.get_linestyle(),body.get_linestyle())
                self.assertEqual(artist._dash_pattern,body._dash_pattern)
                self.assertEqual(artist.get_color(),body.get_color());self.assertEqual(artist.get_alpha(),body.get_alpha())
                self.assertEqual(artist.get_linewidth(),body.get_linewidth())
                self.assertEqual(artist.get_path_effects(),body.get_path_effects())
                self.assertGreaterEqual(sample['x1'],e['box'][0])
                if e['leader']:self.assertLess(e['leader']['x2'],e['box'][0])
            for leader in lines:
                self.assertEqual(leader.get_linestyle(),'-');self.assertEqual(leader.get_alpha(),1)
                self.assertIn(leader.get_color(),[d.theme.secondary,d.theme.label])
            png=self.png(f);box=a.get_position().bounds;count=len(a.get_children())
            for _ in range(2):
                f.set_size_inches(2.8,5.2);f.canvas.draw()
                self.assertEqual(d.result['reason'],'horizontal-capacity');self.assertTrue(d.result['lineSamplesRequired'])
                self.assertEqual(d.artists,[]);self.assertTrue(a.get_legend().get_visible())
                g,b=self.make(direct_labels=False,**options);g.set_size_inches(2.8,5.2)
                self.assertEqual(self.png(f),self.png(g));plt.close(g)
                f.set_size_inches(8.4,5.2);self.assertEqual(self.png(f),png)
                self.assertEqual(a.get_position().bounds,box);self.assertEqual(len(a.get_children()),count)
            svg=io.BytesIO();f.savefig(svg,format='svg');self.assertEqual(d.result['status'],'placed')
    def test_rhythm_sample_copies_resolved_edge_stroke(self):
        from matplotlib.lines import Line2D
        theme=get_theme('lavender_fog_notebook')
        theme=replace(theme,series_edges=tuple([theme.label]*len(theme.series)))
        f,a=self.make(theme=theme,series_keys=['c','t','m'],line_styles={'m':'dash'})
        f.canvas.draw();d=a._figurestead_direct_labels
        self.assertEqual(d.result['status'],'placed')
        for e in d.result['entries']:
            sample=e['lineSample']
            artist=next(v for v in d.artists if isinstance(v,Line2D) and list(v.get_xdata())==[sample['x1'],sample['x2']] and v.get_ydata()[0]==f.bbox.height-e['center'])
            self.assertEqual(artist.get_path_effects(),a.lines[e['rank']].get_path_effects())
            self.assertTrue(artist.get_path_effects())

    def test_all_solid_has_no_samples(self):
        f,a=self.make(series_keys=['c','t','m']);f.canvas.draw();d=a._figurestead_direct_labels
        self.assertNotIn('lineSamplesRequired',d.result)
        self.assertTrue(all('lineSample' not in e for e in d.result['entries']))

if __name__=='__main__':unittest.main()
