"""Public draw/resize/export coverage for measured subtitle containment."""
import io, sys, unittest
import xml.etree.ElementTree as ET
from unittest.mock import patch
import numpy as np
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'src'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from figurestead import line, PlotSpec
from figurestead._subtitle import SubtitleLayout

class SubtitleTests(unittest.TestCase):
    def tearDown(self): plt.close('all')
    def test_resize_and_exports(self):
        original='Repeated observations reveal a gradual response across the three sampling stations.'
        fig,ax=line([0,1,2],[[1,2,3],[2,3,4]],spec=PlotSpec('Response',subtitle=original))
        layout=next(a for a in fig.artists if isinstance(a,SubtitleLayout))
        count=len(ax.texts); images=[]
        for size in [(4.5,5.2),(10,5.2),(4.5,5.2)]:
            fig.set_size_inches(*size);fig.canvas.draw();renderer=fig.canvas.get_renderer()
            self.assertEqual(layout.text.get_text().replace('\n',''),original)
            box=layout.text.get_window_extent(renderer); title=ax._left_title.get_window_extent(renderer)
            self.assertLessEqual(box.x1,ax.bbox.x1);self.assertGreaterEqual(box.x0,0)
            self.assertLessEqual(title.y1,fig.bbox.y1);self.assertLess(box.y1,title.y0)
            self.assertEqual(len(ax.texts),count)
            if size[0]==10:self.assertEqual(layout.text.get_text(),original)
            out=io.BytesIO();fig.savefig(out,format='png');images.append(out.getvalue())
            out=io.BytesIO()
            with matplotlib.rc_context({'svg.fonttype':'none'}):
                fig.savefig(out,format='svg',metadata={'Date':None})
            rows=[e.text or '' for e in ET.fromstring(out.getvalue()).iter('{http://www.w3.org/2000/svg}text')]
            self.assertIn(original, ''.join(rows))
            self.assertEqual(len(ax.texts),count)
        self.assertEqual(images[0],images[2])
        fig.savefig(io.BytesIO(),format='png',dpi=180)
        fig.canvas.draw()
        self.assertEqual(layout.text.get_text().replace('\n',''),original)
        self.assertEqual(len(ax.texts),count)
    def test_short_subtitle_unchanged(self):
        fig,ax=line([0,1,2],[1,2,3],spec=PlotSpec('Response',subtitle='Short subtitle'))
        layout=next(a for a in fig.artists if isinstance(a,SubtitleLayout))
        before=io.BytesIO();fig.savefig(before,format='png')
        layout.remove()
        after=io.BytesIO();fig.savefig(after,format='png')
        self.assertEqual(before.getvalue(),after.getvalue())
    def test_impossible_header_fails_explicitly(self):
        fig,ax=line([0,1,2],[1,2,3],spec=PlotSpec('Response',subtitle='Long subtitle '*100))
        fig.set_size_inches(3,2)
        with self.assertRaisesRegex(ValueError,'PlotSpec.subtitle: insufficient header height'):fig.canvas.draw()

    def make_header(self, subtitle='Repeated observations reveal a gradual response across the three sampling stations.'):
        fig,ax=line([0,1,2],[[1,2,3],[2,3,4]],spec=PlotSpec('Response',subtitle=subtitle))
        fig.set_size_inches(4.5,5.2)
        return fig,ax,next(a for a in fig.artists if isinstance(a,SubtitleLayout))

    def assert_header(self, fig, ax, layout):
        renderer=fig.canvas.get_renderer()
        box=layout.text.get_window_extent(renderer);title=layout.title.get_window_extent(renderer)
        self.assertEqual(layout.text.get_text().replace('\n',''),layout.authored)
        self.assertGreaterEqual(box.x0,fig.bbox.x0);self.assertLessEqual(box.x1,fig.bbox.x1)
        self.assertGreaterEqual(box.y0,fig.bbox.y0);self.assertLessEqual(title.y1,fig.bbox.y1)
        self.assertLess(box.y1,title.y0)

    def export(self, fig, fmt, **kw):
        out=io.BytesIO()
        with matplotlib.rc_context({'svg.hashsalt':'subtitle-lifecycle','svg.fonttype':'none'}):
            fig.savefig(out,format=fmt,metadata={'Date':None} if fmt=='svg' else None,**kw)
        if fmt=='svg':
            rows=[e.text or '' for e in ET.fromstring(out.getvalue()).iter('{http://www.w3.org/2000/svg}text')]
            self.assertIn('Response', ''.join(rows))
            for layout in fig.artists:
                if isinstance(layout,SubtitleLayout):self.assertIn(layout.authored, ''.join(rows))
        else:self.assertTrue(out.getvalue().startswith(b'\x89PNG'))
        return out.getvalue()

    def test_tight_crop_short_matches_unmodified_matplotlib_path(self):
        for fmt in ['png','svg']:
            for pad in [0,.01]:
                with self.subTest(fmt=fmt,pad=pad):
                    f,a,l=self.make_header('Short subtitle')
                    g,b,baseline=self.make_header('Short subtitle');baseline.remove()
                    # The first export is tight: no warm-up draw/export.
                    self.assertEqual(self.export(f,fmt,bbox_inches='tight',pad_inches=pad),
                                     self.export(g,fmt,bbox_inches='tight',pad_inches=pad))
                    self.assertEqual(self.export(f,fmt),self.export(g,fmt))
                    f.canvas.draw();self.assert_header(f,a,l)
                    self.assertFalse(l.tight_export);self.assertFalse(l.export_prepared)
                    plt.close(f);plt.close(g)

    def test_first_layout_engine_draw_and_full_lifecycle(self):
        for engine in ['constrained','tight']:
            with self.subTest(engine=engine):
                f,a,l=self.make_header();f.set_layout_engine(engine)
                counts=(len(f.artists),len(a.texts),len(a.get_children()))
                for width,dpi in [(4.5,120),(10,120),(4.5,120),(4.5,180),(4.5,120)]:
                    f.set_size_inches(width,5.2);f.set_dpi(dpi)
                    # No failed warm-up draw: every first draw must succeed.
                    f.canvas.draw();self.assert_header(f,a,l)
                    text=l.text.get_text()
                    f.canvas.draw();self.assert_header(f,a,l);self.assertEqual(l.text.get_text(),text)
                    if width==10:self.assertEqual(l.text.get_text(),l.authored)
                    for fmt in ['png','svg']:
                        self.export(f,fmt)
                        for pad in [0,.01]:self.export(f,fmt,bbox_inches='tight',pad_inches=pad)
                        self.export(f,fmt)
                    f.canvas.draw();self.assert_header(f,a,l)
                    self.assertEqual((len(f.artists),len(a.texts),len(a.get_children())),counts)
                plt.close(f)

    def test_failure_does_not_leave_prepared_header_state(self):
        import warnings
        for engine in [None,'constrained','tight']:
            f,a,l=self.make_header('Long subtitle '*100);f.set_size_inches(3,2)
            if engine:f.set_layout_engine(engine)
            state=l._state();counts=(len(f.artists),len(a.texts));position=a.get_position().bounds
            for _ in range(2):
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore',UserWarning)
                    with self.assertRaisesRegex(ValueError,'PlotSpec.subtitle: insufficient header height'):f.canvas.draw()
                self.assertEqual(l._state(),state)
                self.assertEqual(a.get_position().bounds,position)
                self.assertEqual((len(f.artists),len(a.texts)),counts)
            plt.close(f)

    def test_explicit_crop_and_genuine_overflow_still_reject(self):
        from matplotlib.transforms import Bbox
        f,a,l=self.make_header('Short subtitle')
        with self.assertRaisesRegex(ValueError,'PlotSpec.subtitle: insufficient header height'):
            self.export(f,'svg',bbox_inches=Bbox.from_bounds(0,0,1,1),pad_inches=0)
        for fmt in ['png','svg']:
            with self.assertRaisesRegex(ValueError,'PlotSpec.subtitle: insufficient header height'):
                self.export(f,fmt,bbox_inches='tight',pad_inches=-.1)
        f.canvas.draw();self.assert_header(f,a,l)
        g,b,other=self.make_header('Long subtitle '*100);g.set_size_inches(3,2)
        for fmt in ['png','svg']:
            with self.assertRaisesRegex(ValueError,'PlotSpec.subtitle: insufficient header height'):
                self.export(g,fmt,bbox_inches='tight',pad_inches=0)
            self.assertEqual(other.text.get_text(),other.authored)

    def test_sc3_first_paint_geometry_and_round_trips(self):
        # A row-count boundary: allocation at the old width sees three rows,
        # but final drawing at the allocated width needs only two. Text/count
        # assertions alone missed the previous 15-pixel plot-height change.
        for engine_name in ['tight','constrained']:
            f,a,l=self.make_header('word '*24);f.set_layout_engine(engine_name)
            engine=f.get_layout_engine();execute=engine.execute
            counts=(len(f.artists),len(a.texts),len(a.get_children()))
            first=None
            for width,dpi in [(4.5,120),(4.5,120),(4.5,120),(10,120),
                              (4.5,120),(4.5,180),(4.5,120)]:
                f.set_size_inches(width,5.2);f.set_dpi(dpi)
                with patch.object(f,'draw',wraps=f.draw) as paint:
                    f.canvas.draw()
                    self.assertEqual(paint.call_count,1)  # no hidden draw retry
                self.assertEqual(engine.execute,execute)
                self.assert_header(f,a,l)
                r=f.canvas.get_renderer()
                geometry=np.array([*a.bbox.bounds,*l.text.get_window_extent(r).bounds,
                                   *l.title.get_window_extent(r).bounds])
                pixels=bytes(f.canvas.buffer_rgba())
                if width==4.5 and dpi==120:
                    if first is None:first=(geometry,l.text.get_text(),pixels)
                    # 1e-6 display pixels is the test ceiling, NOT exact float
                    # equality and not permission for visible allocation drift.
                    np.testing.assert_allclose(geometry,first[0],rtol=0,atol=1e-6)
                    self.assertEqual(l.text.get_text(),first[1])
                    self.assertEqual(pixels,first[2])
                before=l._state()
                for _ in range(2):
                    a.get_tightbbox(r);self.assertEqual(l._state(),before)
                for fmt in ['png','svg']:
                    ordinary=self.export(f,fmt)
                    for pad in [0,.01]:self.export(f,fmt,bbox_inches='tight',pad_inches=pad)
                    after=self.export(f,fmt)
                    if fmt=='png':self.assertEqual(ordinary,after)
                    self.assertFalse(l.tight_export or l.export_prepared or l.tight_header_included)
                self.assertEqual((len(f.artists),len(a.texts),len(a.get_children())),counts)
            plt.close(f)

    def test_sc3_nonconvergence_is_bounded_and_transactional(self):
        from figurestead._subtitle import _LAYOUT_PASSES
        f,a,l=self.make_header('word '*24);f.set_layout_engine('tight')
        engine=f.get_layout_engine();state=l._state()
        position=a.get_position().bounds;in_layout=a.get_in_layout()
        subplot=vars(f.subplotpars).copy()
        def oscillate(figure):
            a.set_position([.1,.1,.7 if moving.call_count%2 else .6,.7])
            figure.subplotpars.update(top=.8)
        with patch.object(engine,'execute',side_effect=oscillate) as moving:
            for _ in range(2):
                moving.reset_mock()
                with patch.object(a,'draw',wraps=a.draw) as paint:
                    with self.assertRaisesRegex(RuntimeError,'did not converge within 12 allocation passes'):
                        f.canvas.draw()
                    self.assertEqual(paint.call_count,0)
                self.assertEqual(moving.call_count,_LAYOUT_PASSES)
                self.assertIs(engine.execute,moving)
                self.assertEqual(l._state(),state)
                self.assertEqual(a.get_position().bounds,position)
                self.assertEqual(a.get_in_layout(),in_layout)
                self.assertEqual(vars(f.subplotpars),subplot)

    def test_sc3_engine_failure_cannot_be_swallowed_or_leave_allocation(self):
        f,a,l=self.make_header();f.set_layout_engine('constrained')
        engine=f.get_layout_engine();state=l._state();position=a.get_position().bounds
        def fail(figure):
            a.set_position([.2,.2,.5,.5])
            raise ValueError('injected allocation failure')
        with patch.object(engine,'execute',side_effect=fail) as execute:
            with self.assertRaisesRegex(ValueError,'injected allocation failure'):f.canvas.draw()
            self.assertIs(engine.execute,execute)
            self.assertEqual(l._state(),state)
            self.assertEqual(a.get_position().bounds,position)
        f.canvas.draw();self.assert_header(f,a,l)

if __name__=='__main__':unittest.main()
