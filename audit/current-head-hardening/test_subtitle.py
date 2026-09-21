"""Public draw/resize/export coverage for measured subtitle containment."""
import io, sys, unittest
import xml.etree.ElementTree as ET
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

if __name__=='__main__':unittest.main()
