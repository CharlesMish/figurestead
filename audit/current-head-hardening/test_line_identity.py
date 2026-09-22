"""Direct B2 default-line regressions; no historical qualification machinery."""
from dataclasses import replace
from io import BytesIO
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from figurestead import line
from figurestead._line_identity import IdentityLine, IdentityLegend, visible_intervals
from figurestead.core import style_legend, resolve


class LineIdentityTests(unittest.TestCase):
    def tearDown(self):
        plt.close("all")

    def test_shared_identities_and_independent_rhythm(self):
        fig, ax = line([0, 1, 2], [[0, 0, 0], [1, 1, 1], [2, 2, 2]])
        self.assertEqual([p.identity_marker for p in ax.lines], ["o", "s", "^"])
        self.assertEqual([p.get_linestyle() for p in ax.lines], ["-"] * 3)
        self.assertEqual([p.get_linewidth() for p in ax.lines], [1.45] * 3)
        ax.lines[0].set_linestyle((2, (6, 3)))
        fig.canvas.draw()
        self.assertEqual(ax.lines[0].identity_marker, "o")
        self.assertEqual(ax.lines[0].get_linestyle(), "--")
        for p in ax.collections:
            self.assertEqual(p.get_alpha(), 1)
            self.assertEqual(len(p.get_facecolors()), 0)

    def test_own_line_gap_leaves_background_grid_and_other_line(self):
        for slot in range(3):
            for under in (None, "#00ff00", "#0000ff"):
                with self.subTest(slot=slot, under=under):
                    fig, ax = line([0, 1, 2], [[0, 0, 0]] * (slot + 1))
                    for p in list(ax.lines)[:-1]:
                        p.set_visible(False); p.identity_points.set_visible(False)
                    ax.get_legend() and ax.get_legend().remove()
                    ax.set(xlim=(0, 2), ylim=(-1, 1), facecolor="white")
                    ax.set_axis_off(); fig.set_facecolor("white")
                    if under:
                        # Grid-like line behind the series, or another series in front.
                        ax.axvline(1, color=under, linewidth=2, zorder=1 if under == "#00ff00" else 3.5)
                    for dpi in (100, 160):
                        fig.set_dpi(dpi)
                        body = next(p for p in ax.lines if isinstance(p, IdentityLine) and p.get_visible())
                        body.set_visible(False); body.identity_points.set_visible(False)
                        fig.canvas.draw()
                        x, y = ax.transData.transform((1, 0))
                        row, col = int(fig.bbox.height - y), int(x)
                        expected = np.asarray(fig.canvas.buffer_rgba())[row, col, :3].copy()
                        body.set_visible(True); body.identity_points.set_visible(True)
                        fig.canvas.draw()
                        pixel = np.asarray(fig.canvas.buffer_rgba())[row, col, :3]
                        np.testing.assert_array_equal(pixel, expected)

    def test_legend_uses_body_style_and_marker(self):
        fig, ax = line([0, 1], [[0, 0], [1, 1], [2, 2]])
        ax.lines[1].set_linestyle("--")
        theme, _ = resolve("slipware", "deep_scope")
        legend = style_legend(ax, theme, handler_map={IdentityLine: IdentityLegend()})
        fig.canvas.draw()
        for body, sample in zip(ax.lines, legend.legend_handles):
            self.assertEqual(body.identity_marker, sample.identity_marker)
            self.assertEqual(body.get_linestyle(), sample.get_linestyle())
            self.assertEqual(body.get_color(), sample.get_color())
            np.testing.assert_array_equal(body.identity_points.get_sizes(), sample.identity_points.get_sizes())
            self.assertEqual(len(sample.identity_points.get_offsets()), 1)

    def test_overlapping_holes_are_unioned(self):
        actual = list(visible_intervals(np.array([0., 0.]), np.array([10., 0.]),
                                       np.array([[4., 0.], [5., 0.]]), "o", 4.))
        np.testing.assert_allclose(actual, [(0, .2), (.7, 1)])

    def test_oblique_stroke_clearance(self):
        # A horizontal stroke near the top of a circle must not intrude sideways.
        pieces = list(visible_intervals(np.array([-8., 2.8]), np.array([8., 2.8]),
                                        np.array([[0., 0.]]), "o", 6., padding=1.))
        self.assertEqual(len(pieces), 2)
        self.assertLess(-8 + pieces[0][1] * 16, -2.8)
        self.assertGreater(-8 + pieces[1][0] * 16, 2.8)

    def test_edges_and_scientific_data_are_retained(self):
        base, _ = resolve("registration_ink", "deep_scope")
        edged = replace(base, series_edges=("#000000",) * len(base.series))
        fig, ax = line([0, 1, 2], [2, 3, 2], theme=edged)
        p = ax.lines[0]
        self.assertTrue(p.get_path_effects())
        self.assertTrue(p.identity_points.get_path_effects())
        fig.canvas.draw()
        np.testing.assert_array_equal(p.get_xydata(), [[0, 2], [1, 3], [2, 2]])

    def test_existing_artist_identity_survives_visibility_changes(self):
        fig, ax = line([0, 1], [[0, 0], [1, 1], [2, 2]])
        first = ax.lines[0]
        first.set_visible(False); first.identity_points.set_visible(False)
        fig.canvas.draw()
        self.assertEqual([p.identity_marker for p in ax.lines[1:]], ["s", "^"])

    def test_omitted_none_and_positional_slots_have_identical_png_bytes(self):
        images = []
        for options in ({}, {"series_slots": None}, {"series_slots": [0, 1, 2]}):
            fig, ax = line([0, 1, 2], [[0, 1, 0], [1, 0, 1], [2, 1, 2]], **options)
            self.assertEqual([p.identity_marker for p in ax.lines], ["o", "s", "^"])
            output = BytesIO()
            fig.savefig(output, format="png")
            images.append(output.getvalue())
            plt.close(fig)
        self.assertEqual(images[0], images[1])
        self.assertEqual(images[0], images[2])

    def test_filtered_slots_preserve_markers_colors_and_edges(self):
        base, _ = resolve("slipware", "deep_scope")
        theme = replace(base, series_edges=("#111111", "#222222", "#333333"))
        _, ax = line([0, 1], [[1, 1], [2, 2]], series_slots=[1, 2], theme=theme)
        self.assertEqual([p.identity_marker for p in ax.lines], ["s", "^"])
        self.assertEqual([p.get_color() for p in ax.lines], [theme.series[1], theme.series[2]])
        for p, edge in zip(ax.lines, ["#222222", "#333333"]):
            self.assertEqual(p.get_path_effects()[0]._gc["foreground"], edge)
            self.assertEqual(p.identity_points.get_path_effects()[0]._gc["foreground"], edge)

    def test_reordered_slots_follow_rows_not_labels(self):
        base, _ = resolve("slipware", "deep_scope")
        _, ax = line([0, 1], [[2, 2], [0, 0], [1, 1]], series_slots=[2, 0, 1],
                     labels=["duplicate", "S99 is display text", "duplicate"])
        self.assertEqual([p.identity_marker for p in ax.lines], ["^", "o", "s"])
        self.assertEqual([p.get_color() for p in ax.lines], [base.series[2], base.series[0], base.series[1]])
        self.assertEqual([p.get_label() for p in ax.lines], ["duplicate", "S99 is display text", "duplicate"])
        for p, y in zip(ax.lines, [2, 0, 1]):
            np.testing.assert_array_equal(p.get_ydata(), [y, y])
        _, other = line([0, 1], [[2, 2], [0, 0], [1, 1]], series_slots=[2, 0, 1],
                        labels=["S1", "S1", "S1"])
        self.assertEqual([p.identity_marker for p in other.lines], ["^", "o", "s"])
        self.assertEqual([p.get_color() for p in other.lines], [p.get_color() for p in ax.lines])

    def test_explicit_slot_and_dash_override_are_orthogonal(self):
        fig, ax = line([0, 1, 2], [0, 1, 0], series_slots=[1])
        p = ax.lines[0]
        color, marker = p.get_color(), p.identity_points.get_paths()[0].vertices.copy()
        p.set_linestyle((2, (6, 3)))
        fig.canvas.draw()
        self.assertEqual(p.get_linestyle(), "--")
        self.assertEqual(p.identity_marker, "s")
        self.assertEqual(p.get_color(), color)
        np.testing.assert_array_equal(p.identity_points.get_paths()[0].vertices, marker)

    def test_slot_domain_and_independent_cycles(self):
        base, _ = resolve("slipware", "deep_scope")
        theme = replace(base, series=base.series[:3], series_edges=("#111111", "#222222"))
        _, ax = line([0, 1], [[0, 0]] * 4, theme=theme,
                     series_slots=(np.int64(0), np.uint64(5), 2 ** 80, 5))
        self.assertEqual([p.identity_marker for p in ax.lines], ["o", "s", "o", "s"])
        self.assertEqual([p.get_color() for p in ax.lines], [theme.series[i] for i in [0, 2, 1, 2]])
        self.assertEqual([p.get_path_effects()[0]._gc["foreground"] for p in ax.lines],
                         ["#111111", "#222222", "#111111", "#222222"])

    def test_invalid_slots_reject_before_mutating_axes(self):
        fig, ax = plt.subplots()
        ax.set_title("unchanged")
        invalid = [[], [0, 1], "0", 0, [-1], [True], [np.bool_(False)], [1.0], [1.2],
                   [np.nan], [np.inf], ["1"], [None], [[1]], np.ma.array([1], mask=False),
                   np.ma.array([1], mask=True)]
        for slots in invalid:
            with self.subTest(slots=slots), self.assertRaisesRegex(ValueError, r"line\.series_slots"):
                line([0, 1], [0, 1], series_slots=slots, ax=ax)
            self.assertEqual((len(ax.lines), len(ax.collections), ax.get_title()), (0, 0, "unchanged"))

    def test_explicit_pose_marker_cycle_uses_the_slot(self):
        from figurestead.presentation import ScientificPose
        _, ax = line([0, 1], [[0, 1], [1, 0]], series_slots=[2, 0], pose=ScientificPose())
        base, _ = resolve("slipware", "deep_scope")
        self.assertEqual([p.get_color() for p in ax.lines], [base.series[2]] * 2 + [base.series[0]] * 2)
        # The explicit pose's existing two-marker cycle overrides canonical defaults.
        from matplotlib.markers import MarkerStyle
        shape = MarkerStyle("o")
        expected = shape.get_path().transformed(shape.get_transform()).vertices
        for points in ax.collections:
            np.testing.assert_array_equal(points.get_paths()[0].vertices, expected)


class AuthoredRhythmTests(unittest.TestCase):
    def tearDown(self): plt.close('all')
    def make(self, **kw):
        return line([0,1,2], [[1,2,3]]*3, labels=['duplicate']*3,
                    theme='lavender_fog_notebook', **kw)
    def test_omission_and_solid_mapping_bytes(self):
        images=[]
        for options in ({}, {'series_keys':['c','t','m']}, {'series_keys':['c','t','m'], 'line_styles':{}}):
            f,a=self.make(**options); b=BytesIO();f.savefig(b,format='png');images.append(b.getvalue())
            self.assertEqual([l.get_linestyle() for l in a.lines], ['-']*3)
        self.assertEqual(images[0],images[1]);self.assertEqual(images[0],images[2])
    def test_authored_rhythm_and_truthful_legend(self):
        for styles,expected in [({'m':'dash'},['-','-','--']),({'c':'dash'},['--','-','-']),
                                ({'c':'dot','t':'dash-dot','inactive':'dash'},[':','-.','-'])]:
            f,a=self.make(series_keys=['c','t','m'],line_styles=styles);f.canvas.draw()
            self.assertEqual([l.get_linestyle() for l in a.lines],expected)
            self.assertEqual([l.identity_marker for l in a.lines],['o','s','^'])
            samples=a.get_legend().findobj(IdentityLine)
            self.assertEqual([l.get_linestyle() for l in samples],expected)
            for body,sample in zip(a.lines,samples):
                self.assertEqual(body.identity_marker,sample.identity_marker)
                self.assertEqual(body.get_color(),sample.get_color())
                self.assertEqual(body.get_alpha(),sample.get_alpha())
    def test_carried_keys_slots_and_repeated_slots(self):
        for slots,keys,expected in [([2,0,1],['m','c','t'],['-','--','-']),
                                    ([1,2],['t','m'],['-','-']),
                                    ([0,0],['c','m'],['--','-'])]:
            f,a=line([0,1,2],[[1,2,3]]*len(slots),labels=['arbitrary']*len(slots),
                     series_slots=slots,series_keys=keys,line_styles={'c':'dash'},theme='lavender_fog_notebook')
            self.assertEqual([l.get_linestyle() for l in a.lines],expected)
            self.assertEqual([l.identity_marker for l in a.lines],[['o','s','^'][i] for i in slots])
            if slots==[0,0]:self.assertEqual(a.lines[0].get_color(),a.lines[1].get_color())
    def test_validation(self):
        for options in [dict(line_styles={}),dict(series_keys=['c','c','m']),dict(series_keys=['c',' ','m']),
                        dict(series_keys=['c','m']),dict(series_keys=['c',1,'m']),
                        dict(series_keys=['c','t','m'],line_styles={'c':'dashed'}),
                        dict(series_keys=['c','t','m'],line_styles={'':'dash'}),
                        dict(series_keys=['c','t','m'],line_styles=[]),
                        dict(series_keys=['c','t','m'],line_styles={'c':'dash'},pose='scientific')]:
            with self.subTest(options=options),self.assertRaises(ValueError):self.make(**options)

class MarkerCadenceTests(unittest.TestCase):
    def tearDown(self):
        plt.close("all")

    def make(self, n=10, **kw):
        return line(np.arange(n), [np.arange(n) * .1 + i for i in range(3)],
                    labels=["Control", "Treatment", "Model"], theme="lavender_fog_notebook", **kw)

    def png(self, fig):
        out = BytesIO(); fig.savefig(out, format="png"); return out.getvalue()

    def test_indices_full_path_and_default_bytes(self):
        for n, stride, selected in [(29,4,[0,4,8,12,16,20,24,28]), (10,4,[0,4,8,9]),
                                   (1,4,[0]), (2,4,[0,1]), (5,99,[0,4]), (4,1,[0,1,2,3])]:
            with self.subTest(n=n, stride=stride):
                f,a=self.make(n); g,b=self.make(n,marker_stride=stride)
                for body, sparse in zip(a.lines,b.lines):
                    np.testing.assert_array_equal(body.get_xydata(),sparse.get_xydata())
                    np.testing.assert_array_equal(sparse.identity_points.get_offsets(),body.get_xydata()[selected])
                    self.assertEqual(body.identity_marker,sparse.identity_marker)
                f.canvas.draw();g.canvas.draw()
                for body,sample in zip(b.lines,b.get_legend().legend_handles):
                    self.assertEqual(body.identity_marker,sample.identity_marker)
                    self.assertEqual(len(sample.identity_points.get_offsets()),1)
                plt.close(f);plt.close(g)
        f,a=self.make();g,b=self.make(marker_stride=1)
        self.assertEqual(self.png(f),self.png(g))
        _,a=self.make(marker_stride=np.int64(4))
        self.assertEqual(len(a.lines[0].identity_points.get_offsets()),4)

    def test_authored_order_and_unmarked_extrema_remain_data(self):
        x=[0,3,2,2,4,1];y=[0,1,100,2,-20,3]
        f,a=line(x,y);g,b=line(x,y,marker_stride=4)
        f.canvas.draw();g.canvas.draw()
        np.testing.assert_array_equal(b.lines[0].get_xydata(),list(zip(x,y)))
        np.testing.assert_array_equal(b.lines[0].identity_points.get_offsets(),np.array(list(zip(x,y)))[[0,4,5]])
        self.assertEqual(a.get_xlim(),b.get_xlim());self.assertEqual(a.get_ylim(),b.get_ylim())

    def test_invalid_stride(self):
        for value in (0,-1,True,False,np.bool_(True),4.0,1.5,"4",None,[],float('inf')):
            with self.subTest(value=value),self.assertRaisesRegex(ValueError,'line.marker_stride'):
                self.make(marker_stride=value)
        with self.assertRaisesRegex(ValueError,'explicit presentation poses'):
            self.make(marker_stride=4,pose='scientific')

    def test_carried_slots_keys_repeats_and_rhythms(self):
        for slots,keys in [([0,1,2],['c','t','m']),([2,0,1],['m','c','t']),([1,2],['t','m']),([0,0],['c','m'])]:
            for mapping in ({'m':'dash'},{'c':'dash'},{'m':'dot'},{'m':'dash-dot'}):
                ys=[np.arange(10)*.1+i for i in slots]
                opts=dict(series_slots=slots,series_keys=keys,line_styles=mapping,labels=['same']*len(slots))
                f,a=line(np.arange(10),ys,**opts);g,b=line(np.arange(10),ys,marker_stride=4,**opts)
                for control,body,sample in zip(a.lines,b.lines,b.get_legend().legend_handles):
                    self.assertEqual(control.identity_marker,body.identity_marker)
                    self.assertEqual(control.get_color(),body.get_color())
                    self.assertEqual(control._dash_pattern,body._dash_pattern)
                    self.assertEqual(sample._dash_pattern,body._dash_pattern)
                    self.assertEqual(sample.identity_marker,body.identity_marker)
                plt.close(f);plt.close(g)

    def test_holes_only_at_drawn_markers_keep_underlying_ink(self):
        for slot in range(3):
            for under in (None,'#00ff00','#0000ff'):
                f,a=line(np.arange(10),np.zeros(10),series_slots=[slot],marker_stride=4)
                a.set(xlim=(-1,10),ylim=(-1,1),facecolor='white');a.set_axis_off();f.set_facecolor('white')
                body=a.lines[0]
                if under:a.axvline(4,color=under,linewidth=2,zorder=1 if under=='#00ff00' else 3.5)
                def pixels():
                    f.canvas.draw();image=np.asarray(f.canvas.buffer_rgba())
                    return [image[int(f.bbox.height-y),int(x),:3].copy() for x,y in a.transData.transform([(2,0),(4,0)])]
                body.set_visible(False);body.identity_points.set_visible(False);baseline=pixels()
                body.set_visible(True);body.identity_points.set_visible(True);actual=pixels()
                self.assertFalse(np.array_equal(actual[0],baseline[0]),'unmarked sample must retain owning stroke')
                np.testing.assert_array_equal(actual[1],baseline[1])
                self.assertEqual(len(body.get_path().vertices),10)
                plt.close(f)

    def test_sparse_direct_identity_samples_and_atomic_fallback(self):
        from matplotlib.lines import Line2D
        for mapping in ({},{'m':'dash'},{'c':'dash'},{'m':'dot'},{'m':'dash-dot'}):
            opts=dict(series_keys=['c','t','m'],line_styles=mapping,marker_stride=4)
            f,a=self.make(direct_labels=True,**opts);f.canvas.draw();d=a._figurestead_direct_labels
            self.assertEqual(d.result['status'],'placed')
            self.assertEqual(bool(d.result.get('lineSamplesRequired')),bool(mapping))
            for e in d.result['entries']:
                body=a.lines[e['rank']]
                np.testing.assert_array_equal(body.identity_points.get_offsets()[-1],body.get_xydata()[-1])
                np.testing.assert_array_equal(e['markerPath'],body.identity_points.get_paths()[0].vertices)
                if mapping:
                    sample=e['lineSample']
                    artist=next(v for v in d.artists if isinstance(v,Line2D) and list(v.get_xdata())==[sample['x1'],sample['x2']] and v.get_ydata()[0]==f.bbox.height-e['center'])
                    self.assertEqual(artist._dash_pattern,body._dash_pattern)
            original=self.png(f);box=a.get_position().bounds
            f.set_size_inches(2,5.2);f.canvas.draw()
            self.assertEqual(d.result['status'],'fallback')
            self.assertEqual(d.result['reason'],'horizontal-capacity')
            g,b=self.make(direct_labels=False,**opts);g.set_size_inches(2,5.2)
            self.assertEqual(self.png(f),self.png(g));self.assertEqual(d.artists,[])
            f.set_size_inches(8.4,5.2);self.assertEqual(self.png(f),original);self.assertEqual(a.get_position().bounds,box)
            out=BytesIO();f.savefig(out,format='svg');self.assertEqual(d.result['status'],'placed')
            plt.close(f);plt.close(g)

if __name__ == "__main__":
    unittest.main(verbosity=2)
