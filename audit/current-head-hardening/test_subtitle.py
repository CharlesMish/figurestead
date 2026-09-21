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

if __name__=='__main__':unittest.main()
