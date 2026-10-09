"""Bounded dataset-owned histogram median and legend regressions."""
from dataclasses import replace
from io import BytesIO
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import warnings

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'src'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import to_rgba, to_rgb
from matplotlib.lines import Line2D
from matplotlib.patches import Rectangle
from matplotlib.transforms import IdentityTransform
import numpy as np
from figurestead import histogram, get_theme
from figurestead.core import PlotSpec, style_axes, resolve
from figurestead._histogram_legend import HistogramMedianLegend, median_labels

THEMES = ('lavender_fog_notebook', 'ultraviolet_laboratory')
DATA = ([1,5,9], [2,4,6.08,8], [8,9,9.4,10,12], [2,4,5,7.9,9,11])
LABELS = ['Baseline','Low-dose treatment','High-dose control','Recovery cohort']

class HistogramOwnershipTests(unittest.TestCase):
    def tearDown(self): plt.close('all')

    def test_body_association_and_geometry(self):
        for theme in THEMES:
            for n in (2,3,4):
                for bins in (7, np.linspace(0,13,12)):
                    with self.subTest(theme=theme,n=n,bins=bins):
                        f,a=histogram(DATA[:n],labels=LABELS[:n],bins=bins,theme=theme)
                        g,b=plt.subplots(figsize=(8.4,5.2),dpi=120)
                        t,profile=resolve(theme);style_axes(b,t,profile,PlotSpec('Distribution'))
                        for row,label,color,body,rule in zip(DATA,LABELS,t.series,a.patches,a.lines):
                            counts,edges,patches=b.hist(row,bins=bins,histtype='stepfilled',color=color,
                                alpha=.15,edgecolor=color,linewidth=1.,label=label,zorder=3)
                            expected_counts,expected_edges=np.histogram(row,bins=bins)
                            np.testing.assert_array_equal(counts,expected_counts)
                            np.testing.assert_array_equal(edges,expected_edges)
                            np.testing.assert_array_equal(body.get_path().vertices,patches[0].get_path().vertices)
                            self.assertEqual(body.get_facecolor(),patches[0].get_facecolor())
                            self.assertEqual(body.get_edgecolor(),patches[0].get_edgecolor())
                            self.assertEqual(body.get_label(),label)
                            self.assertEqual((body.get_alpha(),body.get_linewidth(),body.get_zorder()),(.15,1.,3))
                            median=np.median(row);b.axvline(median,color=t.summary_core,linewidth=1.1,alpha=.85,zorder=4)
                            np.testing.assert_array_equal(rule.get_xdata(),[median,median])
                            np.testing.assert_array_equal(rule.get_ydata(),[0,1])
                            self.assertEqual(to_rgb(rule.get_color()),body.get_facecolor()[:3])
                            self.assertEqual((rule.get_linewidth(),rule.get_alpha(),rule.get_zorder(),rule.get_linestyle()),(1.1,.85,4,'-'))
                            self.assertFalse(rule.get_path_effects())
                        f.canvas.draw();g.canvas.draw()
                        self.assertEqual(a.get_xlim(),b.get_xlim());self.assertEqual(a.get_ylim(),b.get_ylim())
                        self.assertEqual(a.get_position().bounds,b.get_position().bounds)
                        plt.close(f);plt.close(g)

    def test_legend_rows_order_and_actual_samples(self):
        for theme in THEMES:
            for n in (2,3,4):
                f,a=histogram(DATA[:n],labels=LABELS[:n],theme=theme);f.canvas.draw()
                legend=a.get_legend()
                expected=[f'{label} · {v}' for label,v in zip(LABELS,median_labels([np.median(y) for y in DATA[:n]]))]
                self.assertEqual([t.get_text() for t in legend.get_texts()],expected)
                self.assertEqual(legend.get_title().get_text(),'Dataset · median (vertical rule)')
                self.assertEqual(legend.get_title().get_fontsize(),7)
                self.assertFalse(legend.get_frame_on())
                fills=legend.findobj(Rectangle);rules=legend.findobj(Line2D)
                self.assertEqual(len(fills),n);self.assertEqual(len(rules),n)
                for source,fill,body,sample in zip(a.patches,fills,a.lines,rules):
                    self.assertEqual(fill.get_facecolor(),source.get_facecolor())
                    self.assertEqual(fill.get_edgecolor(),source.get_edgecolor())
                    self.assertEqual(fill.get_alpha(),source.get_alpha())
                    self.assertEqual(fill.get_linewidth(),source.get_linewidth())
                    for getter in ('get_color','get_linewidth','get_alpha','get_linestyle','get_zorder'):
                        self.assertEqual(getattr(sample,getter)(),getattr(body,getter)())
                    self.assertEqual(sample.get_xdata()[0],sample.get_xdata()[1])
                    self.assertGreater(sample.get_ydata()[1],sample.get_ydata()[0])
                bbox=legend.get_window_extent(f.canvas.get_renderer())
                self.assertTrue(f.bbox.contains(bbox.x0,bbox.y0));self.assertTrue(f.bbox.contains(bbox.x1,bbox.y1))
                plt.close(f)

    def test_handler_copies_changed_actual_artist_styles(self):
        f,a=histogram(DATA[:2]);body=a.patches[0];rule=a.lines[0]
        body.set_facecolor('#123456');body.set_edgecolor('#654321');body.set_alpha(.31);body.set_linewidth(2.4);body.set_hatch('//')
        rule.set_color('#abcdef');rule.set_alpha(.62);rule.set_linewidth(2.3)
        fill,sample=HistogramMedianLegend().create_artists(a.get_legend(),(body,rule),0,0,15,8,7,IdentityTransform())
        for getter in ('get_facecolor','get_edgecolor','get_alpha','get_linewidth','get_hatch'):
            self.assertEqual(getattr(fill,getter)(),getattr(body,getter)())
        for getter in ('get_color','get_linewidth','get_alpha','get_linestyle'):
            self.assertEqual(getattr(sample,getter)(),getattr(rule,getter)())

    def test_near_coincident_and_similar_color_ownership(self):
        for theme in THEMES:
            t=get_theme(theme);t=replace(t,series=(t.series[0],t.series[0],*t.series[2:]))
            for medians in ([5,5.04],[5,5]):
                ys=[[m-1,m,m+1] for m in medians]
                f,a=histogram(ys,labels=['same','same'],theme=t)
                self.assertEqual([p.get_xdata()[0] for p in a.lines],medians)
                self.assertEqual([text.get_text() for text in a.get_legend().get_texts()],['same · '+s for s in median_labels(medians)])
                self.assertEqual(len(a.lines),2)
                self.assertEqual(to_rgb(a.lines[0].get_color()),to_rgb(a.lines[1].get_color()))
                f.canvas.draw();plt.close(f)

    def test_formatter_precision_rounding_and_nonaliasing(self):
        self.assertEqual(median_labels([5.,5.04,-2.5,0.,1e-20,1e20]),['5','5.04','-2.5','0','1e-20','1e+20'])
        self.assertEqual(median_labels([1/3]),['≈ 0.333333'])
        self.assertEqual(median_labels([5.,5.]),['5','5'])
        for value in (1.,-2.,1e-300,1e300):
            values=[value,np.nextafter(value,np.inf),np.nextafter(value,-np.inf)]
            text=median_labels(values)
            self.assertEqual(len(set(text)),len(values));self.assertEqual(text,median_labels(values))
            for actual,v in zip(text,values):self.assertEqual(float(actual.removeprefix('≈ ')),v)
        values=[5.0000001,5.0000002,5.04,1/3]
        text=median_labels(values)
        self.assertEqual(text[:2],[format(v,'.17g') for v in values[:2]])
        self.assertEqual(text[2:],['5.04','≈ 0.333333'])
        # On platforms with extended precision, do not lose finite magnitudes
        # or distinct medians merely by converting them to binary64 for text.
        if np.finfo(np.longdouble).eps < np.finfo(np.float64).eps:
            values=[np.longdouble(1),np.nextafter(np.longdouble(1),np.longdouble(2))]
            text=median_labels(values);self.assertEqual(len(set(text)),2)
            # NumPy 1.x scalar promotion can conservatively retain the existing
            # approximation prefix on an extended-precision readout. As above,
            # require distinct labels and exact numeric round-trip, not absence
            # of that prefix; never parse display punctuation as a number.
            for s,v in zip(text,values):self.assertEqual(np.longdouble(s.removeprefix('≈ ')),v)
            for v in (np.longdouble('1e400'),np.longdouble('1e-400')):
                self.assertEqual(np.longdouble(median_labels([v])[0].removeprefix('≈ ')),v)

    def test_single_dataset_keeps_summary_and_no_legend(self):
        for theme in THEMES:
            for data in ([1,3,5,9],[[1,3,5,9]],np.array([1,3,5,9])):
                with patch('figurestead.plots.histogram_legend') as legend:
                    f,a=histogram(data,theme=theme);legend.assert_not_called()
                self.assertEqual(a.lines[0].get_color(),get_theme(theme).summary_core)
                self.assertIsNone(a.get_legend());self.assertEqual(len(a.patches),1)
                plt.close(f)

    def test_external_axes_and_exports(self):
        for theme in THEMES:
            f,a=plt.subplots(figsize=(8.4,5.2),dpi=120)
            old,=a.plot([0,1],[1,2],label='Caller');a.set(xlim=(-1,15),ylim=(0,8))
            position=a.get_position().bounds
            histogram(DATA[:3],labels=LABELS[:3],theme=theme,ax=a)
            self.assertIs(a.lines[0],old);self.assertEqual(a.get_xlim(),(-1,15));self.assertEqual(a.get_ylim(),(0,8))
            self.assertEqual(a.get_position().bounds,position)
            self.assertFalse(a.get_autoscalex_on());self.assertFalse(a.get_autoscaley_on())
            self.assertEqual(len(a.get_legend().get_texts()),3)
            for fmt in ('png','svg'):
                b=BytesIO();f.savefig(b,format=fmt);self.assertGreater(len(b.getvalue()),1000)
            plt.close(f)

    def test_authored_labels_and_invalid_inputs(self):
        _,a=histogram(DATA[:3],labels=['_control','_nolegend_','_control'])
        self.assertEqual([t.get_text() for t in a.get_legend().get_texts()],['_control · 5','_nolegend_ · 5.04','_control · 9.4'])
        for values,kw in [([1,np.nan],{}),([1,np.inf],{}),(np.ma.array([1,2],mask=False),{}),
                          ([],{}),([[1,2],[]],{}),([[1,2],[3,4]],{'labels':['short']}),([1,2],{'bins':0})]:
            f,a=plt.subplots();before=tuple(a.get_children())
            with self.assertRaises(ValueError):histogram(values,ax=a,**kw)
            self.assertEqual(tuple(a.get_children()),before);plt.close(f)

    def test_explicit_edges_disclose_exclusions_without_changing_geometry(self):
        data = [-5, 0, 1, 2, 8]
        edges = [0, 1, 2]
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always', UserWarning)
            fig, ax = histogram(data, labels=['Station A'], bins=edges)
        self.assertEqual(len(caught), 1)
        self.assertIs(caught[0].category, UserWarning)
        message = str(caught[0].message)
        self.assertIn("histogram.values[0] ('Station A')", message)
        self.assertIn('2 of 5 observations', message)
        self.assertIn('median still uses all 5 observations', message)
        self.assertEqual(Path(caught[0].filename), Path(__file__))
        control, control_ax = plt.subplots()
        counts, returned_edges, patches = control_ax.hist(data, bins=edges, histtype='stepfilled')
        np.testing.assert_array_equal(counts, [1, 2])  # Includes the final edge (2).
        np.testing.assert_array_equal(returned_edges, edges)
        np.testing.assert_array_equal(ax.patches[0].get_path().vertices, patches[0].get_path().vertices)
        np.testing.assert_array_equal(ax.lines[0].get_xdata(), [np.median(data)] * 2)

    def test_each_affected_dataset_is_identified(self):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always', UserWarning)
            _, ax = histogram([[-5, 0, 1], [0, 1, 7, 8], [0, 1, 2]],
                              labels=['Cold', 'Hot', 'Covered'], bins=[0, 1, 2])
        self.assertEqual(len(caught), 2)
        self.assertIn("histogram.values[0] ('Cold'): 1 of 3", str(caught[0].message))
        self.assertIn("histogram.values[1] ('Hot'): 2 of 4", str(caught[1].message))
        self.assertEqual([line.get_xdata()[0] for line in ax.lines], [0, 4, 1])
        self.assertEqual([text.get_text() for text in ax.get_legend().get_texts()],
                         ['Cold · 0', 'Hot · 4', 'Covered · 1'])

    def test_covered_data_and_automatic_bins_have_no_exclusion_warning(self):
        for bins in ([0, 1, 2], np.array([0, 1, 2]), 2, np.int64(2), 'auto'):
            with self.subTest(bins=bins), warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter('always', UserWarning)
                histogram([[0, 1, 2], [0.25, 1.75]], bins=bins)
                self.assertEqual(caught, [])

    def test_exclusion_warning_as_error_does_not_mutate_caller(self):
        fig, ax = plt.subplots()
        ax.plot([0, 1], [1, 2], label='Existing')
        ax.set(title='Caller title', xlabel='Caller x', ylabel='Caller y',
               xlim=(-10, 10), ylim=(-2, 5), facecolor='#abcdef')
        before = (tuple(ax.get_children()), ax.get_xlim(), ax.get_ylim(),
                  ax.get_position().bounds, ax.get_title(), ax.get_xlabel(),
                  ax.get_ylabel(), ax.get_facecolor(), fig.get_facecolor(),
                  ax.get_autoscalex_on(), ax.get_autoscaley_on())
        with warnings.catch_warnings():
            warnings.simplefilter('error', UserWarning)
            with self.assertRaisesRegex(UserWarning, "histogram.values\\[1\\].*1 of 2"):
                histogram([[0, 1], [1, 9]], labels=['Covered', 'Excluded'],
                          bins=[0, 1, 2], spec=PlotSpec('Replacement'), ax=ax)
        after = (tuple(ax.get_children()), ax.get_xlim(), ax.get_ylim(),
                 ax.get_position().bounds, ax.get_title(), ax.get_xlabel(),
                 ax.get_ylabel(), ax.get_facecolor(), fig.get_facecolor(),
                 ax.get_autoscalex_on(), ax.get_autoscaley_on())
        self.assertEqual(after, before)

    def test_exclusion_warning_as_error_allocates_no_figure(self):
        before = plt.get_fignums()
        with warnings.catch_warnings():
            warnings.simplefilter('error', UserWarning)
            with self.assertRaisesRegex(UserWarning, "histogram.values\\[0\\].*1 of 2"):
                histogram([0, 4], bins=[0, 1, 2])
        self.assertEqual(plt.get_fignums(), before)

if __name__=='__main__':unittest.main(verbosity=2)
