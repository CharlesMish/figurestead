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

    def test_ordinary_marker_shapes_draw_and_export(self):
        for slots in ([0], [1], [2], [0, 1, 2]):
            with self.subTest(slots=slots):
                fig, ax = line([0, 1, 2], [[i, i + 1, i] for i in slots], series_slots=slots)
                fig.canvas.draw()
                for fmt, signature in (("png", b"\x89PNG"), ("svg", b"<svg"), ("pdf", b"%PDF")):
                    with self.subTest(format=fmt):
                        output = BytesIO()
                        fig.savefig(output, format=fmt)
                        self.assertIn(signature, output.getvalue()[:1000])
                plt.close(fig)

    def test_masked_marker_offsets_match_omitted_markers_without_changing_data(self):
        # A mask in either coordinate hides that marker in Matplotlib. The
        # scientific line still passes through its observation without a hole.
        masks = [np.zeros((3, 2), dtype=bool), np.ones((3, 2), dtype=bool)]
        for coordinate in (0, 1):
            mask = np.zeros((3, 2), dtype=bool)
            mask[1, coordinate] = True
            masks.append(mask)
        for slot in range(3):
            for scale in ("linear", "log"):
                for mask in masks:
                    with self.subTest(slot=slot, scale=scale, mask=mask.tolist()):
                        images = []
                        for masked in (True, False):
                            fig, ax = line([1, 2, 4], [1, 1, 1], series_slots=[slot])
                            body = ax.lines[0]
                            xy = body.get_xydata().copy()
                            offsets = (np.ma.array(xy, mask=mask) if masked
                                       else xy[~mask.any(axis=1)])
                            body.identity_points.set_offsets(offsets)
                            ax.set_xscale(scale)
                            ax.axvline(2, color="#00ff00", linewidth=2, zorder=1)
                            fig.canvas.draw()
                            images.append(np.asarray(fig.canvas.buffer_rgba()).copy())
                            np.testing.assert_array_equal(body.get_xydata(), xy)
                            retained = body.identity_points.get_offsets()
                            np.testing.assert_array_equal(np.ma.getdata(retained), np.ma.getdata(offsets))
                            np.testing.assert_array_equal(np.ma.getmaskarray(retained), np.ma.getmaskarray(offsets))
                            plt.close(fig)
                        np.testing.assert_array_equal(*images)

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
                    if n == 1:
                        from matplotlib.collections import PathCollection
                        self.assertIsInstance(sample,PathCollection)
                        np.testing.assert_array_equal(sample.get_paths()[0].vertices,body.identity_points.get_paths()[0].vertices)
                        self.assertEqual(len(sample.get_offsets()),1)
                    else:
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

class AccumulatedLegendTests(unittest.TestCase):
    def tearDown(self):
        plt.close('all')

    def test_appended_lines_refresh_all_eligible_labels_and_paired_styles(self):
        from itertools import product
        for counts in ((2, 1), (1, 1), (1, 2)):
            for first_direct, last_direct in product((False, True), repeat=2):
                with self.subTest(counts=counts, direct=(first_direct, last_direct)):
                    ax = None
                    offset = 0
                    for count, direct in zip(counts, (first_direct, last_direct)):
                        slots = list(range(offset, offset + count))
                        labels = [f'Authored {slot}' for slot in slots]
                        keys = [f'trace-{slot}' for slot in slots]
                        fig, ax = line([0, 1, 2], [[slot, slot + .5, slot + 1] for slot in slots],
                                       labels=labels, series_slots=slots, series_keys=keys,
                                       line_styles={key: 'dash' if slot == 2 else 'solid'
                                                    for key, slot in zip(keys, slots)},
                                       direct_labels=direct, ax=ax, theme='lavender_fog_notebook')
                        fig.canvas.draw()
                        offset += count
                    legend = ax.get_legend()
                    self.assertIsNotNone(legend)
                    self.assertTrue(legend.get_visible())
                    self.assertEqual([t.get_text() for t in legend.get_texts()],
                                     [f'Authored {slot}' for slot in range(offset)])
                    handles = legend.legend_handles if hasattr(legend, 'legend_handles') else legend.legendHandles
                    for slot, (body, sample) in enumerate(zip(ax.lines, handles)):
                        self.assertIsInstance(sample, IdentityLine)
                        self.assertEqual(body.identity_marker, ['o', 's', '^'][slot])
                        self.assertEqual(sample.identity_marker, body.identity_marker)
                        self.assertEqual(sample.get_color(), body.get_color())
                        self.assertEqual(sample.get_linestyle(), body.get_linestyle())
                        np.testing.assert_array_equal(body.get_xydata(), [[0, slot], [1, slot + .5], [2, slot + 1]])
                        np.testing.assert_array_equal(sample.identity_points.get_paths()[0].vertices,
                                                      body.identity_points.get_paths()[0].vertices)
                    if last_direct:
                        planner = ax._figurestead_direct_labels
                        self.assertEqual(planner.result, {'status': 'fallback', 'reason': 'unsupported-layout'})
                        self.assertEqual(planner.artists, [])
                        self.assertEqual(ax.get_position(original=True).bounds, planner.baseline.bounds)
                    for fmt in ('png', 'svg'):
                        output = BytesIO()
                        fig.savefig(output, format=fmt)
                        self.assertGreater(len(output.getvalue()), 100)
                    plt.close(fig)

    def test_fresh_single_line_stays_quiet_but_authored_underscore_appends(self):
        for direct in (False, True):
            fig, ax = line([0, 1], [1, 2], labels=['Only'], direct_labels=direct)
            fig.canvas.draw()
            self.assertIsNone(ax.get_legend())
            line([0, 1], [2, 3], labels=['_private'], ax=ax, direct_labels=direct)
            fig.canvas.draw()
            # Deliberate compatibility correction: an authored underscore is
            # literal attribution, not Matplotlib's anonymous-artist sentinel.
            self.assertEqual([t.get_text() for t in ax.get_legend().get_texts()], ['Only', '_private'])
            self.assertTrue(ax.get_legend().get_visible())
            plt.close(fig)

    def test_anonymous_point_layers_never_acquire_internal_zero_legend(self):
        from figurestead import scatter, strip_summary, histogram
        for family in ('scatter', 'strip'):
            for direct in (False, True):
                for next_family in ('line', 'scatter', 'histogram'):
                    with self.subTest(family=family, direct=direct, next=next_family):
                        if family == 'scatter':
                            fig, ax = scatter([0, 1], [1, 2])
                        else:
                            fig, ax = strip_summary(['Control', 'Control'], [1, 2])
                        self.assertEqual(ax.get_legend_handles_labels()[1], [])
                        offsets = [c.get_offsets().copy() for c in ax.collections]
                        if next_family == 'line':
                            line([0, 1], [[1, 2], [2, 3]], labels=['Observed', 'Predicted'],
                                 ax=ax, direct_labels=direct)
                        elif next_family == 'scatter':
                            scatter([0, 1], [2, 3], series=['Observed', 'Predicted'], ax=ax)
                        else:
                            histogram([[1, 2], [2, 3]], labels=['Observed', 'Predicted'], ax=ax)
                        fig.canvas.draw()
                        labels = [t.get_text() for t in ax.get_legend().get_texts()]
                        self.assertEqual(len(labels), 2)
                        self.assertTrue(labels[0].startswith('Observed'))
                        self.assertTrue(labels[1].startswith('Predicted'))
                        self.assertNotIn('0', ax.get_legend_handles_labels()[1])
                        for before, after in zip(offsets, ax.collections):
                            np.testing.assert_array_equal(before, after.get_offsets())
                        plt.close(fig)

    def test_explicit_numeric_zero_and_authored_categories_remain_eligible(self):
        from figurestead import scatter, strip_summary
        for family in ('scatter', 'strip'):
            for label in (0, '0', 'Observations', 'nan'):
                with self.subTest(family=family, label=label):
                    if family == 'scatter':
                        fig, ax = scatter([0, 1], [1, 2], series=[label, label])
                    else:
                        fig, ax = strip_summary(['Control', 'Control'], [1, 2], series=[label, label])
                    self.assertEqual(ax.get_legend_handles_labels()[1], [str(label)])
                    line([0, 1], [2, 3], labels=['Added'], series_slots=[2], ax=ax)
                    self.assertEqual([t.get_text() for t in ax.get_legend().get_texts()], [str(label), 'Added'])
                    fig.canvas.draw()
                    plt.close(fig)

class PointSeriesSlotTests(unittest.TestCase):
    """Keyed point slots reuse the line marker cycle without changing omission."""

    continents = ["Asia", "Europe", "Africa", "North America", "South America", "Oceania"]
    markers = ("o", "s", "^", "D")

    def tearDown(self):
        plt.close("all")

    def slots(self, extra=None):
        mapping = {name: index for index, name in enumerate(self.continents)}
        if extra:
            mapping.update(extra)
        return mapping

    def vertices(self, marker):
        from matplotlib.markers import MarkerStyle
        style = MarkerStyle(marker)
        return style.get_path().transformed(style.get_transform()).vertices

    def labelled(self, ax):
        return [artist for artist in ax.collections
                if getattr(artist, "_figurestead_authored_label", False)]

    def assert_marker(self, artist, marker):
        np.testing.assert_array_equal(artist.get_paths()[0].vertices, self.vertices(marker))

    def png(self, fig):
        output = BytesIO()
        fig.savefig(output, format="png")
        return output.getvalue()

    def frame(self, names):
        x, y, series, groups = [], [], [], []
        for index, name in enumerate(names):
            for step in range(4):
                x.append(float(index) + step / 10)
                y.append(float(index) + step)
                series.append(name)
                groups.append("East" if step % 2 == 0 else "West")
        return x, y, series, groups

    def draw(self, family, names, **kwargs):
        from figurestead import scatter, strip_summary
        x, y, series, groups = self.frame(names)
        if family == "scatter":
            return scatter(x, y, series=series, **kwargs)
        return strip_summary(groups, y, series=series, **kwargs)

    def test_omitted_and_none_match_and_explicit_slots_change_only_style(self):
        from figurestead import scatter, strip_summary
        from matplotlib.collections import PathCollection
        for family in ("scatter", "strip"):
            images = []
            for options in ({}, {"series_slots": None}):
                fig, ax = self.draw(family, ["A", "B", "C"], **options)
                for artist in self.labelled(ax):
                    self.assert_marker(artist, "o")
                    self.assertFalse(hasattr(artist, "_figurestead_point_treatment"))
                    self.assertIs(type(artist), PathCollection)
                    self.assertIs(artist.axes, ax)
                images.append(self.png(fig))
                plt.close(fig)
            self.assertEqual(images[0], images[1])
            fig, ax = self.draw(family, ["A", "B", "C"], series_slots={"A": 0, "B": 1, "C": 2})
            self.assertEqual([artist.get_label() for artist in self.labelled(ax)], ["A", "B", "C"])
            for artist, marker in zip(self.labelled(ax), ["o", "s", "^"]):
                self.assert_marker(artist, marker)
            self.assertNotEqual(self.png(fig), images[0])
            plt.close(fig)
        # The helper above passes series. Anonymous omission is the scatter/strip default.
        fig, ax = scatter([0, 1], [1, 2])
        other, other_ax = scatter([0, 1], [1, 2], series_slots=None)
        self.assertEqual(self.png(fig), self.png(other))
        self.assertIsNone(ax.get_legend())
        self.assertIsNone(other_ax.get_legend())
        plt.close(fig)
        plt.close(other)
        fig, ax = strip_summary(["East", "West"], [1, 2], seed=5)
        other, other_ax = strip_summary(["East", "West"], [1, 2], seed=5, series_slots=None)
        self.assertEqual(self.png(fig), self.png(other))
        plt.close(fig)
        plt.close(other)

    def test_continent_slots_survive_subset_and_reorder(self):
        from figurestead import get_theme
        theme = get_theme("lavender_fog_notebook")
        full = self.draw("scatter", self.continents, series_slots=self.slots(), theme=theme)
        _, full_ax = full
        labels = [artist.get_label() for artist in self.labelled(full_ax)]
        self.assertEqual(labels, self.continents)
        pairs = []
        for artist, name in zip(self.labelled(full_ax), self.continents):
            slot = self.slots()[name]
            marker = self.markers[slot % 4]
            self.assert_marker(artist, marker)
            from matplotlib.colors import to_rgba
            self.assertTrue(np.allclose(artist.get_edgecolor()[0, :3], to_rgba(theme.series[slot])[:3]))
            pairs.append((theme.series[slot], marker))
        self.assertEqual(len(set(pairs)), 6)
        self.assertEqual([text.get_text() for text in full_ax.get_legend().get_texts()], self.continents)
        subset_names = ["Africa", "Oceania", "Europe"]
        _, subset_ax = self.draw("scatter", subset_names, series_slots=self.slots(), theme=theme)
        self.assertEqual([artist.get_label() for artist in self.labelled(subset_ax)], subset_names)
        for artist, name in zip(self.labelled(subset_ax), subset_names):
            slot = self.slots()[name]
            self.assert_marker(artist, self.markers[slot % 4])
            self.assertEqual(artist._figurestead_point_treatment["color"], theme.series[slot])
        reordered = list(reversed(self.continents))
        _, reorder_ax = self.draw("scatter", reordered, series_slots=self.slots(), theme=theme)
        by_label = {artist.get_label(): artist for artist in self.labelled(reorder_ax)}
        for name, original in zip(self.continents, self.labelled(full_ax)):
            self.assert_marker(by_label[name], self.markers[self.slots()[name] % 4])
            np.testing.assert_array_equal(by_label[name].get_edgecolor(), original.get_edgecolor())
        _, strip_ax = self.draw("strip", subset_names, series_slots=self.slots({"quiet": 8}), theme=theme)
        self.assertEqual([artist.get_label() for artist in self.labelled(strip_ax)], subset_names)
        for artist, name in zip(self.labelled(strip_ax), subset_names):
            self.assert_marker(artist, self.markers[self.slots()[name] % 4])

    def test_repeated_slots_share_style_without_merging_series(self):
        from figurestead import scatter
        fig, ax = scatter([0, 1, 2, 3], [1, 2, 3, 4], series=["Asia", "Europe", "Asia", "Europe"],
                          series_slots={"Asia": 1, "Europe": 1, "Africa": 4})
        labelled = self.labelled(ax)
        self.assertEqual([artist.get_label() for artist in labelled], ["Asia", "Europe"])
        self.assert_marker(labelled[0], "s")
        self.assert_marker(labelled[1], "s")
        np.testing.assert_array_equal(labelled[0].get_edgecolor(), labelled[1].get_edgecolor())
        self.assertEqual(len(labelled[0].get_offsets()), 2)
        self.assertEqual(len(labelled[1].get_offsets()), 2)
        np.testing.assert_array_equal(labelled[0].get_offsets()[:, 1], [1, 3])
        np.testing.assert_array_equal(labelled[1].get_offsets()[:, 1], [2, 4])
        self.assertEqual([text.get_text() for text in ax.get_legend().get_texts()], ["Asia", "Europe"])
        fig.canvas.draw()
        proxies = ax.get_legend().findobj(type(labelled[0]))
        for body in labelled:
            self.assertTrue(any(np.array_equal(body.get_paths()[0].vertices, proxy.get_paths()[0].vertices)
                                for proxy in proxies))
        plt.close(fig)

    def test_cycles_edges_and_filled_profiles_keep_their_structure(self):
        from matplotlib.collections import PathCollection
        from matplotlib.colors import to_rgba
        from figurestead import scatter, strip_summary
        base, _ = resolve("lavender_fog_notebook", "deep_scope")
        theme = replace(base, series=base.series[:3], series_edges=("#111111", "#222222"))
        series = ["A", "B", "C", "D"]
        mapping = {"A": np.int64(0), "B": np.uint64(5), "C": 2 ** 80, "D": 5, "quiet": 1}
        expected_slots = [0, 5, 2 ** 80, 5]
        fig, ax = scatter([0, 1, 2, 3], [1, 1, 1, 1], series=series, series_slots=mapping, theme=theme)
        labelled = self.labelled(ax)
        self.assertEqual([type(artist) for artist in labelled], [PathCollection] * 4)
        for artist, slot in zip(labelled, expected_slots):
            self.assert_marker(artist, self.markers[slot % 4])
            self.assertEqual(artist._figurestead_point_treatment["color"], theme.series[slot % 3])
            edge = theme.series_edges[slot % 2]
            self.assertEqual(artist._figurestead_point_treatment["edge"], edge)
            halo = [item for item in ax.collections
                    if len(item.get_edgecolor())
                    and np.allclose(item.get_edgecolor()[0, :3], to_rgba(edge)[:3])
                    and np.array_equal(item.get_offsets(), artist.get_offsets())
                    and np.array_equal(item.get_paths()[0].vertices, artist.get_paths()[0].vertices)]
            self.assertGreaterEqual(len(halo), 1)
            cores = [item for item in ax.collections
                     if len(item.get_facecolor())
                     and np.allclose(item.get_facecolor()[0, :3], to_rgba(theme.series[slot % 3])[:3])
                     and np.array_equal(item.get_offsets(), artist.get_offsets())]
            self.assertTrue(any(np.array_equal(core.get_paths()[0].vertices, artist.get_paths()[0].vertices)
                                for core in cores))
        fig.canvas.draw()
        proxies = ax.get_legend().findobj(PathCollection)
        for artist, slot in zip(labelled, expected_slots):
            edge = theme.series_edges[slot % 2]
            self.assertTrue(any(np.array_equal(proxy.get_paths()[0].vertices, artist.get_paths()[0].vertices)
                                and np.allclose(proxy.get_edgecolor()[0], artist.get_edgecolor()[0])
                                for proxy in proxies))
            self.assertTrue(any(len(proxy.get_edgecolor())
                                and np.allclose(proxy.get_edgecolor()[0, :3], to_rgba(edge)[:3])
                                and np.array_equal(proxy.get_paths()[0].vertices, artist.get_paths()[0].vertices)
                                for proxy in proxies))
        plt.close(fig)
        for profile in ("instrument", "monograph"):
            fig, ax = strip_summary(["G", "G", "H", "H"], [1, 2, 3, 4], series=series,
                                    series_slots=mapping, theme=theme, profile=profile, seed=3)
            for artist, slot in zip(self.labelled(ax), expected_slots):
                self.assert_marker(artist, self.markers[slot % 4])
                self.assertIsNone(artist._figurestead_point_treatment["edge"])
                self.assertFalse(any(np.allclose(item.get_edgecolor()[0, :3], to_rgba("#111111")[:3])
                                     or np.allclose(item.get_edgecolor()[0, :3], to_rgba("#222222")[:3])
                                     for item in ax.collections if len(item.get_edgecolor())))
            plt.close(fig)

    def test_explicit_zero_native_ownership_and_mixed_legend(self):
        from matplotlib.collections import PathCollection
        from figurestead import scatter, strip_summary
        fig, ax = scatter([0, 1, 2, 3], [1, 2, 3, 4], series=[0, 0, 1, 1],
                          series_slots={0: 3, 1: 0})
        self.assertEqual([text.get_text() for text in ax.get_legend().get_texts()], ["0", "1"])
        zero, one = self.labelled(ax)
        self.assert_marker(zero, "D")
        self.assert_marker(one, "o")
        self.assertIs(type(zero), PathCollection)
        self.assertIn(zero, ax.collections)
        plt.close(fig)
        held, held_ax = plt.subplots()
        held_ax.set_title("unchanged")
        caller = held_ax.scatter([0], [1], marker="*", c="black", label="Caller", s=40)
        star = caller.get_paths()[0].vertices.copy()
        with self.assertRaisesRegex(ValueError, r"scatter\.series_slots: keyed slots require an explicit series"):
            scatter([0, 1], [2, 3], series_slots={0: 1}, ax=held_ax)
        self.assertEqual(held_ax.get_title(), "unchanged")
        self.assertEqual(len(held_ax.collections), 1)
        scatter([0, 1, 2], [1, 2, 3], series=["_control", "Kept", "_control"],
                series_slots={"_control": 2, "Kept": 0}, ax=held_ax, theme="lavender_fog_notebook")
        line([0, 1], [4, 5], labels=["Reference"], series_slots=[2], ax=held_ax)
        self.assertEqual([text.get_text() for text in held_ax.get_legend().get_texts()],
                         ["Caller", "_control", "Kept", "Reference"])
        np.testing.assert_array_equal(caller.get_paths()[0].vertices, star)
        control, kept = self.labelled(held_ax)
        self.assert_marker(control, "^")
        self.assert_marker(kept, "o")
        self.assertIs(type(control), PathCollection)
        held.canvas.draw()
        self.assertTrue(any(item.identity_marker == "^" for item in held_ax.get_legend().findobj(IdentityLine)))
        proxies = held_ax.get_legend().findobj(PathCollection)
        self.assertTrue(any(np.array_equal(proxy.get_paths()[0].vertices, star) for proxy in proxies))
        self.assertTrue(any(np.array_equal(proxy.get_paths()[0].vertices, self.vertices("^")) for proxy in proxies))
        plt.close(held)
        bare, bare_ax = plt.subplots()
        bare_ax.set_title("unchanged")
        with self.assertRaisesRegex(ValueError, r"strip_summary\.series_slots: keyed slots require an explicit series"):
            strip_summary(["G", "H"], [1, 2], series_slots={"G": 0}, ax=bare_ax)
        self.assertEqual((bare_ax.get_title(), len(bare_ax.collections), len(bare_ax.lines)), ("unchanged", 0, 0))
        plt.close(bare)

    def same_offsets(self, ax):
        return [artist.get_offsets().copy() for artist in ax.collections]

    def support_layers(self, ax, artist):
        return [item for item in ax.collections
                if np.array_equal(item.get_offsets(), artist.get_offsets())]

    def assert_legend_matches_primary(self, ax):
        from matplotlib.collections import PathCollection
        ax.figure.canvas.draw()
        proxies = ax.get_legend().findobj(PathCollection)
        for artist in self.labelled(ax):
            self.assertTrue(any(
                np.array_equal(proxy.get_paths()[0].vertices, artist.get_paths()[0].vertices)
                and np.allclose(proxy.get_sizes(), artist.get_sizes())
                and proxy.get_alpha() == artist.get_alpha()
                for proxy in proxies
            ), artist.get_label())
            treatment = getattr(artist, "_figurestead_point_treatment", None) or {}
            if treatment.get("edge"):
                self.assertTrue(any(
                    np.array_equal(proxy.get_paths()[0].vertices, artist.get_paths()[0].vertices)
                    and np.allclose(proxy.get_sizes(), np.asarray(artist.get_sizes(), dtype=float) * 1.18)
                    and proxy.get_alpha() == artist.get_alpha() * 0.75
                    for proxy in proxies
                ), artist.get_label())

    def test_omitted_point_styles_match_empty_mappings(self):
        from figurestead import PROFILES, scatter, strip_summary
        for family in ("scatter", "strip"):
            plain = self.png(self.draw(family, ["A", "B", "C"])[0])
            plt.close("all")
            for options in ({"point_style": None, "series_styles": None},
                            {"point_style": {}, "series_styles": {}}):
                fig, ax = self.draw(family, ["A", "B", "C"], **options)
                self.assertEqual(self.png(fig), plain)
                for artist in self.labelled(ax):
                    self.assert_marker(artist, "o")
                    self.assertNotIn("size", getattr(artist, "_figurestead_point_treatment", {}))
                plt.close(fig)
            slotted = self.png(self.draw(
                family, ["A", "B", "C"], series_slots={"A": 0, "B": 1, "C": 2})[0])
            plt.close("all")
            for options in (
                {"series_slots": {"A": 0, "B": 1, "C": 2}, "point_style": None, "series_styles": None},
                {"series_slots": {"A": 0, "B": 1, "C": 2}, "point_style": {}, "series_styles": {}},
            ):
                fig, _ = self.draw(family, ["A", "B", "C"], **options)
                self.assertEqual(self.png(fig), slotted)
                plt.close(fig)
        profile = PROFILES["deep_scope"]
        fig, ax = scatter([0, 1, 2], [4, 5, 6], series=["A", "B", "A"])
        other, other_ax = scatter([0, 1, 2], [4, 5, 6], series=["A", "B", "A"], point_style={})
        self.assertEqual(self.png(fig), self.png(other))
        for artist in self.labelled(ax):
            self.assertEqual(float(artist.get_sizes()[0]), profile.marker_size)
            self.assertEqual(artist.get_alpha(), profile.marker_alpha)
            layers = self.support_layers(ax, artist)
            glow = next(item for item in layers if item.get_zorder() == 2)
            core = next(item for item in layers if item.get_zorder() == 4)
            self.assertEqual(glow.get_alpha(), 0.055)
            self.assertEqual(float(glow.get_sizes()[0]), profile.marker_size * 1.75)
            self.assertEqual(float(core.get_sizes()[0]), profile.marker_size * profile.core_fraction)
            self.assertEqual(core.get_alpha(), profile.marker_alpha * 0.58)
        anon, anon_ax = scatter([0, 1], [1, 2], point_style={})
        plain_anon, plain_anon_ax = scatter([0, 1], [1, 2])
        self.assertEqual(self.png(anon), self.png(plain_anon))
        self.assertIsNone(anon_ax.get_legend())
        self.assertIsNone(plain_anon_ax.get_legend())
        strip, strip_ax = strip_summary(["East", "West"], [1, 2], seed=5, point_style={})
        plain_strip, plain_strip_ax = strip_summary(["East", "West"], [1, 2], seed=5)
        self.assertEqual(self.png(strip), self.png(plain_strip))
        self.assertEqual(strip_ax.get_xlim(), plain_strip_ax.get_xlim())
        self.assertEqual(strip_ax.get_ylim(), plain_strip_ax.get_ylim())
        plt.close("all")

    def test_partial_styles_layer_over_slots_without_changing_color_or_offsets(self):
        from dataclasses import replace
        from matplotlib.colors import to_rgba
        from figurestead import scatter, strip_summary
        base_theme, _ = resolve("slipware", "deep_scope")
        theme = replace(base_theme, series_edges=("#111111", "#222222", "#333333", "#444444"))
        names = ["Historical", "Recent", "Other"]
        slots = {"Historical": 0, "Recent": 2, "Other": 1, "Future": 4}
        point_style = {"size": 14, "alpha": 0.25, "marker": "square"}
        series_styles = {
            "Recent": {"size": 52, "alpha": 0.95, "marker": "diamond"},
            "Future": {"alpha": 0, "marker": "triangle"},
        }
        x, y, series, groups = self.frame(names)
        shared = dict(series=series, series_slots=slots, theme=theme)
        plain, plain_ax = scatter(x, y, **shared)
        styled, styled_ax = scatter(x, y, point_style=point_style, series_styles=series_styles, **shared)
        self.assertEqual([artist.get_label() for artist in self.labelled(plain_ax)], names)
        self.assertEqual([artist.get_label() for artist in self.labelled(styled_ax)], names)
        self.assertEqual([text.get_text() for text in plain_ax.get_legend().get_texts()],
                         [text.get_text() for text in styled_ax.get_legend().get_texts()])
        expected = {
            "Historical": ("s", 14, 0.25, 0),
            "Recent": ("D", 52, 0.95, 2),
            "Other": ("s", 14, 0.25, 1),
        }
        for artist, plain_artist in zip(self.labelled(styled_ax), self.labelled(plain_ax)):
            marker, size, alpha, slot = expected[artist.get_label()]
            self.assert_marker(artist, marker)
            self.assertEqual(float(artist.get_sizes()[0]), size)
            self.assertEqual(artist.get_alpha(), alpha)
            self.assertEqual(artist._figurestead_point_treatment["size"], size)
            self.assertEqual(artist._figurestead_point_treatment["alpha"], alpha)
            self.assertEqual(artist._figurestead_point_treatment["color"], theme.series[slot % len(theme.series)])
            np.testing.assert_allclose(artist.get_edgecolor()[0, :3], plain_artist.get_edgecolor()[0, :3])
            np.testing.assert_array_equal(artist.get_offsets(), plain_artist.get_offsets())
            layers = self.support_layers(styled_ax, artist)
            edge = theme.series_edges[slot % len(theme.series_edges)]
            halo = [item for item in layers if item.get_zorder() == 2.8]
            glow = [item for item in layers if item.get_zorder() == 2]
            core = [item for item in layers if item.get_zorder() == 4]
            self.assertEqual(len(halo), 1)
            self.assertEqual(len(glow), 1)
            self.assertEqual(len(core), 1)
            self.assertEqual(float(halo[0].get_sizes()[0]), size * 1.18)
            self.assertEqual(halo[0].get_alpha(), alpha * 0.75)
            self.assertTrue(np.allclose(halo[0].get_edgecolor()[0, :3], to_rgba(edge)[:3]))
            self.assertEqual(float(glow[0].get_sizes()[0]), size * 1.75)
            self.assertEqual(glow[0].get_alpha(), 0.055 * (alpha / 0.80))
            self.assert_marker(glow[0], marker)
            self.assert_marker(core[0], marker)
            self.assertEqual(float(core[0].get_sizes()[0]), size * 0.12)
            self.assertEqual(core[0].get_alpha(), alpha * 0.58)
        self.assert_legend_matches_primary(styled_ax)
        self.assertEqual(styled_ax.get_xlim(), plain_ax.get_xlim())
        self.assertEqual(styled_ax.get_ylim(), plain_ax.get_ylim())
        self.assertEqual(tuple(styled_ax.dataLim.bounds), tuple(plain_ax.dataLim.bounds))
        plt.close(plain)
        plt.close(styled)
        partial, partial_ax = scatter(
            [0, 1, 2], [1, 2, 3], series=names, series_slots=slots,
            series_styles={"Recent": {"alpha": 0.5}})
        recent = next(artist for artist in self.labelled(partial_ax) if artist.get_label() == "Recent")
        historical = next(artist for artist in self.labelled(partial_ax) if artist.get_label() == "Historical")
        self.assert_marker(recent, "^")
        self.assertEqual(recent.get_alpha(), 0.5)
        self.assertEqual(float(recent.get_sizes()[0]), 46)
        self.assert_marker(historical, "o")
        self.assertEqual(historical.get_alpha(), 0.80)
        self.assertNotIn("size", historical._figurestead_point_treatment)
        plt.close(partial)
        for profile in ("instrument", "monograph"):
            fig, ax = strip_summary(
                groups, y, series=series, series_slots=slots, seed=9, profile=profile,
                theme="ultraviolet_laboratory", point_style={"size": 16, "alpha": 0.35},
                series_styles={"Recent": {"marker": "triangle", "size": 40}})
            by_label = {artist.get_label(): artist for artist in self.labelled(ax)}
            self.assert_marker(by_label["Historical"], "o")
            self.assertEqual(float(by_label["Historical"].get_sizes()[0]), 16)
            self.assertEqual(by_label["Historical"].get_alpha(), 0.35)
            self.assert_marker(by_label["Recent"], "^")
            self.assertEqual(float(by_label["Recent"].get_sizes()[0]), 40)
            self.assertEqual(by_label["Recent"].get_alpha(), 0.35)
            self.assertTrue(all(artist._figurestead_point_treatment["edge"] is None for artist in self.labelled(ax)))
            self.assertEqual(len(self.support_layers(ax, by_label["Recent"])), 1)
            self.assert_legend_matches_primary(ax)
            plt.close(fig)

    def test_alpha_zero_hides_every_mark_layer_and_keeps_observations(self):
        from figurestead import scatter, strip_summary
        names = ["Historical", "Recent"]
        x, y, series, groups = self.frame(names)
        slots = {"Historical": 0, "Recent": 2}
        plain, plain_ax = scatter(x, y, series=series, series_slots=slots, profile="deep_scope")
        hidden, hidden_ax = scatter(
            x, y, series=series, series_slots=slots, profile="deep_scope",
            point_style={"alpha": 0.3}, series_styles={"Recent": {"alpha": 0}})
        recent = next(artist for artist in self.labelled(hidden_ax) if artist.get_label() == "Recent")
        historical = next(artist for artist in self.labelled(hidden_ax) if artist.get_label() == "Historical")
        plain_recent = next(artist for artist in self.labelled(plain_ax) if artist.get_label() == "Recent")
        self.assertEqual(recent.get_alpha(), 0)
        self.assertTrue(all(item.get_alpha() == 0 for item in self.support_layers(hidden_ax, recent)))
        self.assertGreater(len(self.support_layers(hidden_ax, recent)), 1)
        np.testing.assert_array_equal(recent.get_offsets(), plain_recent.get_offsets())
        self.assertEqual(historical.get_alpha(), 0.3)
        self.assertEqual([text.get_text() for text in hidden_ax.get_legend().get_texts()], names)
        self.assert_legend_matches_primary(hidden_ax)
        self.assertEqual(tuple(hidden_ax.dataLim.bounds), tuple(plain_ax.dataLim.bounds))
        plt.close(plain)
        plt.close(hidden)
        strip, strip_ax = strip_summary(
            groups, y, series=series, series_slots=slots, seed=13,
            series_styles={"Recent": {"alpha": 0, "size": 70}})
        bare, bare_ax = strip_summary(groups, y, series=series, series_slots=slots, seed=13)
        self.assertEqual([text.get_text() for text in strip_ax.texts if getattr(text, "_figurestead_strip_count", False)],
                         [text.get_text() for text in bare_ax.texts if getattr(text, "_figurestead_strip_count", False)])
        for one, two in zip(strip_ax.lines, bare_ax.lines):
            np.testing.assert_array_equal(one.get_xydata(), two.get_xydata())
        for one, two in zip(strip_ax.collections, bare_ax.collections):
            np.testing.assert_array_equal(one.get_offsets(), two.get_offsets())
        recent = next(artist for artist in self.labelled(strip_ax) if artist.get_label() == "Recent")
        self.assertTrue(all(item.get_alpha() == 0 for item in self.support_layers(strip_ax, recent)))
        self.assertEqual(len(recent.get_offsets()), 4)
        plt.close(strip)
        plt.close(bare)

    def test_anonymous_point_style_and_rejected_styles_leave_caller_axes(self):
        from matplotlib.collections import PathCollection
        from figurestead import scatter, strip_summary
        fig, ax = scatter([0, 1, 2, 3], [1, 4, 2, 8], point_style={"size": 10, "alpha": 0.15, "marker": "square"})
        primary = next(artist for artist in ax.collections if artist.get_zorder() == 3)
        self.assertIs(type(primary), PathCollection)
        self.assert_marker(primary, "s")
        self.assertEqual(float(primary.get_sizes()[0]), 10)
        self.assertEqual(primary.get_alpha(), 0.15)
        self.assertEqual(primary._figurestead_point_treatment["edge"], None)
        glow = next(artist for artist in ax.collections if artist.get_zorder() == 2)
        self.assertEqual(float(glow.get_sizes()[0]), 17.5)
        self.assertEqual(glow.get_alpha(), 0.055 * (0.15 / 0.80))
        self.assertIsNone(ax.get_legend())
        np.testing.assert_array_equal(primary.get_offsets()[:, 0], [0, 1, 2, 3])
        plt.close(fig)
        held, held_ax = plt.subplots()
        held_ax.set_title("unchanged")
        held_ax.scatter([0], [1], c="black")
        before = (held_ax.get_title(), len(held_ax.collections), len(held_ax.lines), tuple(held_ax.get_xlim()))
        with self.assertRaisesRegex(ValueError, r"scatter\.point_style\['size'\]"):
            scatter([0, 1], [2, 3], point_style={"size": 0}, ax=held_ax)
        with self.assertRaisesRegex(ValueError, r"scatter\.series_styles: keyed styles require an explicit series"):
            scatter([0, 1], [2, 3], series_styles={"Recent": {"size": 12}}, ax=held_ax)
        self.assertEqual((held_ax.get_title(), len(held_ax.collections), len(held_ax.lines), tuple(held_ax.get_xlim())), before)
        plt.close(held)
        bare, bare_ax = plt.subplots()
        bare_ax.set_title("unchanged")
        with self.assertRaisesRegex(ValueError, r"strip_summary\.series_styles: keyed styles require an explicit series"):
            strip_summary(["G", "H"], [1, 2], series_styles={}, ax=bare_ax)
        with self.assertRaisesRegex(ValueError, r"strip_summary\.point_style\['marker'\]"):
            strip_summary(["G", "H"], [1, 2], point_style={"marker": "star"}, ax=bare_ax)
        self.assertEqual((bare_ax.get_title(), len(bare_ax.collections), len(bare_ax.lines)), ("unchanged", 0, 0))
        plt.close(bare)

    def test_faint_ring_core_glow_stays_drawable_on_both_point_apis(self):
        from dataclasses import replace
        from figurestead import PROFILES, scatter, strip_summary

        faint = replace(PROFILES["deep_scope"], marker_alpha=0.01)
        tiny = replace(PROFILES["deep_scope"], marker_alpha=1e-320)
        filled = replace(PROFILES["monograph"], marker_alpha=0.01)
        self.assertEqual(faint.marker, "ring_core")
        self.assertTrue(faint.point_glow)
        self.assertGreater(tiny.marker_alpha, 0.0)
        self.assertEqual(filled.marker, "filled")
        self.assertFalse(filled.point_glow)
        # The uncapped glow for this profile is 4.4, outside Matplotlib's opacity.
        self.assertEqual(0.055 * (0.8 / faint.marker_alpha), 4.4)

        x = [0.0, 1.0, 2.0, 3.0]
        y = [1.0, 3.0, 5.0, 7.0]
        series = ["Historical", "Recent", "Historical", "Recent"]
        groups = ["East", "East", "West", "West"]

        def primaries(ax):
            labelled = self.labelled(ax)
            self.assertEqual([artist.get_label() for artist in labelled], ["Historical", "Recent"])
            self.assertEqual([len(artist.get_offsets()) for artist in labelled], [2, 2])
            return labelled

        def assert_saturated_glow(ax):
            for artist in primaries(ax):
                self.assertEqual(artist.get_alpha(), 0.8)
                glow = [item for item in self.support_layers(ax, artist) if item.get_zorder() == 2]
                self.assertEqual(len(glow), 1)
                self.assertEqual(glow[0].get_alpha(), 1.0)
                for item in self.support_layers(ax, artist):
                    self.assertGreaterEqual(item.get_alpha(), 0.0)
                    self.assertLessEqual(item.get_alpha(), 1.0)

        for family in ("scatter", "strip"):
            with self.subTest(family=family, profile="faint"):
                held, held_ax = plt.subplots()
                if family == "scatter":
                    returned, returned_ax = scatter(
                        x, y, series=series, point_style={"alpha": 0.8}, profile=faint, ax=held_ax)
                else:
                    returned, returned_ax = strip_summary(
                        groups, y, series=series, point_style={"alpha": 0.8},
                        profile=faint, seed=5, ax=held_ax)
                self.assertIs(returned, held)
                self.assertIs(returned_ax, held_ax)
                assert_saturated_glow(held_ax)
                plt.close(held)

        for family in ("scatter", "strip"):
            with self.subTest(family=family, profile="tiny"):
                if family == "scatter":
                    fig, ax = scatter(x, y, series=series, point_style={"alpha": 0.8}, profile=tiny)
                else:
                    fig, ax = strip_summary(
                        groups, y, series=series, point_style={"alpha": 0.8}, profile=tiny, seed=5)
                assert_saturated_glow(ax)
                plt.close(fig)

        for family in ("scatter", "strip"):
            with self.subTest(family=family, profile="filled"):
                if family == "scatter":
                    fig, ax = scatter(x, y, series=series, point_style={"alpha": 0.8}, profile=filled)
                else:
                    fig, ax = strip_summary(
                        groups, y, series=series, point_style={"alpha": 0.8}, profile=filled, seed=5)
                for artist in primaries(ax):
                    self.assertEqual(artist.get_alpha(), 0.8)
                    self.assertFalse(any(item.get_zorder() == 2 for item in self.support_layers(ax, artist)))
                    self.assertEqual(len(self.support_layers(ax, artist)), 1)
                plt.close(fig)

        fig, ax = scatter(x, y, series=series, point_style={"alpha": 0.25})
        for artist in primaries(ax):
            glow = next(item for item in self.support_layers(ax, artist) if item.get_zorder() == 2)
            self.assertEqual(artist.get_alpha(), 0.25)
            self.assertEqual(glow.get_alpha(), 0.055 * (0.25 / 0.80))
        plt.close(fig)

        fig, ax = scatter(x, y, series=series, point_style={"alpha": 0}, profile=faint)
        for artist in primaries(ax):
            self.assertEqual(artist.get_alpha(), 0.0)
            layers = self.support_layers(ax, artist)
            self.assertGreater(len(layers), 1)
            self.assertTrue(all(item.get_alpha() == 0 for item in layers))
        plt.close(fig)

        plain, plain_ax = strip_summary(groups, y, series=series, profile=faint, seed=5)
        styled, styled_ax = strip_summary(
            groups, y, series=series, profile=faint, seed=5, point_style={"alpha": 0.8})
        hidden, hidden_ax = strip_summary(
            groups, y, series=series, profile=faint, seed=5, point_style={"alpha": 0})
        for other in (styled_ax, hidden_ax):
            self.assertEqual(
                [text.get_text() for text in plain_ax.texts if getattr(text, "_figurestead_strip_count", False)],
                [text.get_text() for text in other.texts if getattr(text, "_figurestead_strip_count", False)])
            for one, two in zip(plain_ax.lines, other.lines):
                np.testing.assert_array_equal(one.get_xydata(), two.get_xydata())
            for one, two in zip(plain_ax.collections, other.collections):
                np.testing.assert_array_equal(one.get_offsets(), two.get_offsets())
            self.assertEqual(plain_ax.get_xlim(), other.get_xlim())
            self.assertEqual(tuple(plain_ax.dataLim.bounds), tuple(other.dataLim.bounds))
        self.assertEqual(
            [text.get_text() for text in styled_ax.texts if getattr(text, "_figurestead_strip_count", False)],
            ["n=2", "n=2"])
        self.assertEqual(sorted({float(line.get_ydata()[0]) for line in styled_ax.lines}), [2.0, 6.0])
        self.assertTrue(all(item.get_alpha() == 0.055 for item in plain_ax.collections if item.get_zorder() == 2))
        for artist in self.labelled(styled_ax):
            self.assertEqual(artist.get_alpha(), 0.8)
        for artist in self.labelled(hidden_ax):
            self.assertTrue(all(item.get_alpha() == 0 for item in self.support_layers(hidden_ax, artist)))
        plt.close(plain)
        plt.close(styled)
        plt.close(hidden)

    def legend_texts(self, ax):
        legend = ax.get_legend()
        if legend is None:
            return None
        return [text.get_text() for text in legend.get_texts()]

    def fresh_layers(self, ax, before, paint_order):
        ours = [artist for artist in ax.collections if id(artist) not in before]
        count = len(paint_order)
        self.assertGreater(count, 0)
        self.assertEqual(len(ours) % count, 0)
        width = len(ours) // count
        layers = {}
        for index, label in enumerate(paint_order):
            chunk = ours[index * width:(index + 1) * width]
            labelled = [artist for artist in chunk if getattr(artist, "_figurestead_authored_label", False)]
            self.assertEqual([artist.get_label() for artist in labelled], [str(label)])
            layers[str(label)] = chunk
        return layers

    def assert_whole_series_stacked(self, layers, paint_order):
        previous = None
        for label in paint_order:
            chunk = layers[str(label)]
            depths = [artist.get_zorder() for artist in chunk]
            self.assertEqual(len(depths), len(set(depths)))
            if previous is not None:
                self.assertLess(max(previous), min(depths))
            previous = depths

    def test_omitted_series_orders_match_current_painting_and_legend(self):
        from figurestead import scatter, strip_summary
        for family in ("scatter", "strip"):
            plain_fig, plain_ax = self.draw(family, ["A", "B", "C"], series_slots={"A": 0, "B": 1, "C": 2, "quiet": 4},
                                            point_style={"size": 18, "alpha": 0.4})
            plain = self.png(plain_fig)
            plt.close(plain_fig)
            for options in ({"draw_order": None, "legend_order": None}, {}):
                fig, ax = self.draw(family, ["A", "B", "C"], series_slots={"A": 0, "B": 1, "C": 2, "quiet": 4},
                                    point_style={"size": 18, "alpha": 0.4}, **options)
                self.assertEqual(self.png(fig), plain)
                self.assertEqual(self.legend_texts(ax), ["A", "B", "C"])
                for artist in self.labelled(ax):
                    depths = sorted(item.get_zorder() for item in self.support_layers(ax, artist))
                    self.assertEqual(depths, [2, 3, 4])
                    self.assertFalse(hasattr(artist, "_figurestead_legend_rank"))
                plt.close(fig)
        fig, ax = scatter([0, 1], [1, 2], series=["Only", "Only"], draw_order=["Only"], legend_order=["Only"])
        self.assertIsNone(ax.get_legend())
        plt.close(fig)
        fig, ax = scatter([0, 1], [1, 2], series=["A", "B"])
        scatter([2], [3], series=["Only"], draw_order=["Only"], legend_order=["Only"], ax=ax)
        self.assertEqual(self.legend_texts(ax), ["A", "B"])
        plt.close(fig)
        fig, ax = strip_summary(["East", "West"], [1, 2], seed=5)
        other, other_ax = strip_summary(["East", "West"], [1, 2], seed=5, draw_order=None, legend_order=None)
        self.assertEqual(self.png(fig), self.png(other))
        self.assertEqual(ax.get_xlim(), other_ax.get_xlim())
        plt.close(fig)
        plt.close(other)

    def test_legend_order_does_not_change_painting_and_draw_order_keeps_legend(self):
        from figurestead import scatter, strip_summary
        slots = {"Historical": 0, "Recent": 2, "Future": 4}
        styles = {"Recent": {"size": 52, "alpha": 0.95, "marker": "diamond"}}
        point_style = {"size": 18, "alpha": 0.4}
        for family in ("scatter", "strip"):
            with self.subTest(family=family):
                shared = dict(series_slots=slots, point_style=point_style, series_styles=styles)
                if family == "scatter":
                    x, y, series, _ = self.frame(["Recent", "Historical"])
                    draw = lambda **kw: scatter(x, y, series=series, **shared, **kw)
                else:
                    _, y, series, groups = self.frame(["Recent", "Historical"])
                    draw = lambda **kw: strip_summary(groups, y, series=series, order=["West", "East"], seed=11, **shared, **kw)
                plain, plain_ax = draw()
                legend_only, legend_ax = draw(legend_order=["Historical", "Recent"])
                draw_only, draw_ax = draw(draw_order=["Historical", "Recent"])
                both, both_ax = draw(draw_order=["Historical", "Recent"], legend_order=["Recent", "Historical"])
                self.assertEqual(self.legend_texts(plain_ax), ["Recent", "Historical"])
                self.assertEqual(self.legend_texts(legend_ax), ["Historical", "Recent"])
                self.assertEqual(self.legend_texts(draw_ax), ["Recent", "Historical"])
                self.assertEqual(self.legend_texts(both_ax), ["Recent", "Historical"])
                self.assertEqual(len(plain_ax.collections), len(legend_ax.collections))
                for one, two in zip(plain_ax.collections, legend_ax.collections):
                    self.assertEqual(one.get_zorder(), two.get_zorder())
                    np.testing.assert_array_equal(one.get_offsets(), two.get_offsets())
                    np.testing.assert_array_equal(one.get_sizes(), two.get_sizes())
                    self.assertEqual(one.get_alpha(), two.get_alpha())
                for ax in (legend_ax, draw_ax, both_ax):
                    self.assertEqual(ax.get_xlim(), plain_ax.get_xlim())
                    self.assertEqual(ax.get_ylim(), plain_ax.get_ylim())
                    self.assertEqual(tuple(ax.dataLim.bounds), tuple(plain_ax.dataLim.bounds))
                    by_plain = {artist.get_label(): artist for artist in self.labelled(plain_ax)}
                    for artist in self.labelled(ax):
                        original = by_plain[artist.get_label()]
                        np.testing.assert_array_equal(artist.get_offsets(), original.get_offsets())
                        np.testing.assert_array_equal(artist.get_edgecolor(), original.get_edgecolor())
                        self.assertEqual(float(artist.get_sizes()[0]), float(original.get_sizes()[0]))
                        self.assertEqual(artist.get_alpha(), original.get_alpha())
                        self.assertEqual(artist._figurestead_point_treatment["color"],
                                         original._figurestead_point_treatment["color"])
                if family == "strip":
                    self.assertEqual([text.get_text() for text in plain_ax.get_xticklabels()], ["West", "East"])
                    self.assertEqual([text.get_text() for text in both_ax.get_xticklabels()], ["West", "East"])
                paint = self.fresh_layers(draw_ax, set(), ["Historical", "Recent"])
                self.assert_whole_series_stacked(paint, ["Historical", "Recent"])
                self.assertLess(max(artist.get_zorder() for artist in paint["Historical"]), 5)
                self.assertLess(max(artist.get_zorder() for artist in paint["Recent"]), 5)
                plain_paint = self.fresh_layers(plain_ax, set(), ["Recent", "Historical"])
                for label, chunk in plain_paint.items():
                    self.assertEqual(sorted(artist.get_zorder() for artist in chunk), [2, 3, 4])
                plt.close("all")

    def test_draw_order_stacks_theme_edge_filled_marks_and_strip_bars(self):
        from matplotlib.colors import to_rgba
        from figurestead import scatter, strip_summary
        base, _ = resolve("slipware", "deep_scope")
        theme = replace(base, series_edges=("#111111", "#222222", "#333333", "#444444"))
        slots = {"Historical": 0, "Recent": 2, "Future": 1}
        series = ["Historical", "Recent", "Historical", "Recent"]
        shared = dict(series=series, series_slots=slots, theme=theme,
                      point_style={"size": 18, "alpha": 0.4},
                      series_styles={"Recent": {"size": 52, "alpha": 0.95, "marker": "diamond"},
                                     "Future": {"size": 8}})
        for profile, layer_count in (("deep_scope", 4), ("instrument", 1), ("monograph", 1)):
            with self.subTest(profile=profile):
                fig, ax = scatter([0, 1, 2, 3], [1, 1, 2, 2], profile=profile,
                                  draw_order=["Historical", "Recent"], **shared)
                layers = self.fresh_layers(ax, set(), ["Historical", "Recent"])
                self.assertTrue(all(len(chunk) == layer_count for chunk in layers.values()))
                self.assert_whole_series_stacked(layers, ["Historical", "Recent"])
                if profile == "deep_scope":
                    historical_edge = theme.series_edges[0]
                    edge_layers = [artist for artist in layers["Historical"]
                                   if len(artist.get_edgecolor())
                                   and np.allclose(artist.get_edgecolor()[0, :3], to_rgba(historical_edge)[:3])]
                    self.assertEqual(len(edge_layers), 1)
                    self.assertLess(edge_layers[0].get_zorder(), min(artist.get_zorder() for artist in layers["Recent"]))
                    self.assertGreater(edge_layers[0].get_zorder(),
                                       min(artist.get_zorder() for artist in layers["Historical"]))
                plt.close(fig)
                fig, ax = strip_summary(["East", "West", "East", "West"], [1, 5, 3, 9],
                                        profile=profile, seed=4,
                                        draw_order=["Recent", "Historical"], **shared)
                layers = self.fresh_layers(ax, set(), ["Recent", "Historical"])
                self.assert_whole_series_stacked(layers, ["Recent", "Historical"])
                point_z = [artist.get_zorder() for chunk in layers.values() for artist in chunk]
                bar_z = [line.get_zorder() for line in ax.lines]
                self.assertGreaterEqual(min(bar_z), 5)
                self.assertLess(max(point_z), min(bar_z))
                self.assertEqual(sorted({round(float(line.get_ydata()[0]), 10) for line in ax.lines}), [2.0, 7.0])
                plt.close(fig)

    def test_coincident_overlap_and_caller_artists_stay_scoped(self):
        from matplotlib.colors import to_rgba
        from figurestead import line, scatter, strip_summary
        base, _ = resolve("lavender_fog_notebook", "deep_scope")
        theme = replace(base, series_edges=("#aa3344", "#225588", "#117744", "#886622"))
        slots = {"Historical": 0, "Recent": 1}
        x = [0.0, 0.0, 0.0, 0.0]
        y = [1.0, 1.0, 1.0, 1.0]
        series = ["Historical", "Recent", "Historical", "Recent"]
        fig, ax = plt.subplots()
        caller = ax.scatter([2], [3], marker="*", c="black", s=40, label="Caller", zorder=1.2)
        guide, = ax.plot([0, 2], [0, 3], color="#336699", label="Guide", zorder=6.4)
        caller_z, guide_z = caller.get_zorder(), guide.get_zorder()
        before = {id(caller)}
        scatter(x, y, series=series, series_slots=slots, theme=theme, profile="deep_scope",
                point_style={"size": 30, "alpha": 1},
                series_styles={"Recent": {"size": 70, "marker": "diamond", "alpha": 1}},
                draw_order=["Historical", "Recent"], legend_order=["Recent", "Historical"], ax=ax)
        self.assertEqual(caller.get_zorder(), caller_z)
        self.assertEqual(guide.get_zorder(), guide_z)
        self.assertFalse(hasattr(caller, "_figurestead_legend_rank"))
        self.assertFalse(hasattr(guide, "_figurestead_legend_rank"))
        self.assertEqual(self.legend_texts(ax), ["Caller", "Guide", "Recent", "Historical"])
        layers = self.fresh_layers(ax, before, ["Historical", "Recent"])
        self.assertEqual(len(layers["Historical"]), 4)
        self.assertEqual(len(layers["Recent"]), 4)
        self.assert_whole_series_stacked(layers, ["Historical", "Recent"])
        np.testing.assert_array_equal(self.labelled(ax)[0].get_offsets(), [[0, 1], [0, 1]])
        np.testing.assert_array_equal(self.labelled(ax)[1].get_offsets(), [[0, 1], [0, 1]])
        historical_edge = [artist for artist in layers["Historical"]
                           if len(artist.get_edgecolor())
                           and np.allclose(artist.get_edgecolor()[0, :3], to_rgba(theme.series_edges[0])[:3])]
        self.assertEqual(len(historical_edge), 1)
        self.assertLess(historical_edge[0].get_zorder(), min(artist.get_zorder() for artist in layers["Recent"]))
        line([0, 1], [[4, 5], [5, 6]], labels=["North", "South"], ax=ax)
        self.assertEqual(self.legend_texts(ax), ["Caller", "Guide", "Recent", "Historical", "North", "South"])
        self.assertEqual(caller.get_zorder(), caller_z)
        plt.close(fig)
        fig, ax = plt.subplots()
        star = ax.scatter([-1], [4], marker="*", c="black", s=30, label="Caller", zorder=7)
        star_z = star.get_zorder()
        before = {id(star)}
        strip_summary(["East", "East", "West", "West"], [2, 2, 2, 2], series=series, seed=3,
                      series_slots=slots, theme=theme, profile="monograph",
                      draw_order=["Recent", "Historical"], legend_order=["Historical", "Recent"], ax=ax)
        layers = self.fresh_layers(ax, before, ["Recent", "Historical"])
        self.assertTrue(all(len(chunk) == 1 for chunk in layers.values()))
        self.assert_whole_series_stacked(layers, ["Recent", "Historical"])
        self.assertLess(max(artist.get_zorder() for chunk in layers.values() for artist in chunk),
                        min(line.get_zorder() for line in ax.lines))
        self.assertEqual(star.get_zorder(), star_z)
        self.assertEqual(self.legend_texts(ax), ["Caller", "Historical", "Recent"])
        np.testing.assert_array_equal(layers["Recent"][0].get_offsets()[:, 1], [2, 2])
        plt.close(fig)

    def test_series_orders_survive_legend_refresh_without_reordering_other_artists(self):
        from figurestead import scatter
        fig, ax = scatter([0, 0, 1, 1], [1, 2, 1, 2], series=["A", "B", "A", "B"],
                          draw_order=["B", "A"], legend_order=["B", "A"])
        self.assertEqual(self.legend_texts(ax), ["B", "A"])
        layers = self.fresh_layers(ax, set(), ["B", "A"])
        self.assert_whole_series_stacked(layers, ["B", "A"])
        line([0, 1], [[3, 4], [4, 5]], labels=["North", "South"], ax=ax)
        self.assertEqual(self.legend_texts(ax), ["B", "A", "North", "South"])
        fig2, ax2 = scatter([0, 0, 1, 1], [1, 2, 1, 2], series=["A", "B", "A", "B"], draw_order=["B", "A"])
        self.assertEqual(self.legend_texts(ax2), ["A", "B"])
        line([0, 1], [[3, 4], [4, 5]], labels=["North", "South"], ax=ax2)
        self.assertEqual(self.legend_texts(ax2), ["A", "B", "North", "South"])
        plt.close(fig)
        plt.close(fig2)

    def test_reattached_calls_reorder_only_inside_their_own_legend_slots(self):
        from figurestead import _legend, scatter
        fig, ax = plt.subplots()
        for keys, xy in ((["A", "B"], 0), (["C", "D"], 1)):
            scatter([xy, xy], [xy, xy], series=keys, profile="monograph",
                    legend_order=keys[::-1], ax=ax)
        guide, = ax.plot([0, 1], [0, 1], label="guide")
        for label in ("A", "B"):
            artist = next(artist for artist in list(ax.collections)
                          if getattr(artist, "_figurestead_authored_label", False)
                          and artist.get_label() == label)
            artist.remove()
            ax.add_collection(artist)
        captured = {}

        def keep_native(handles, texts):
            captured["texts"] = list(texts)
            return handles, texts

        original = _legend._apply_legend_ranks
        _legend._apply_legend_ranks = keep_native
        try:
            _legend.legend_entries(ax)
        finally:
            _legend._apply_legend_ranks = original
        self.assertEqual(captured["texts"], ["C", "D", "guide", "A", "B"])
        ranks = {}
        for artist in ax.collections:
            if getattr(artist, "_figurestead_authored_label", False):
                ranks[artist.get_label()] = artist._figurestead_legend_rank
        self.assertEqual(ranks["A"][0], ranks["B"][0])
        self.assertEqual(ranks["C"][0], ranks["D"][0])
        self.assertNotEqual(ranks["A"][0], ranks["C"][0])
        self.assertLess(ranks["B"][1], ranks["A"][1])
        self.assertLess(ranks["D"][1], ranks["C"][1])
        self.assertFalse(hasattr(guide, "_figurestead_legend_rank"))
        line([0, 1], [1, 2], labels=["refresh"], ax=ax)
        self.assertEqual(self.legend_texts(ax), ["D", "C", "guide", "B", "A", "refresh"])
        refresh = next(artist for artist in ax.lines if artist.get_label() == "refresh")
        self.assertFalse(hasattr(refresh, "_figurestead_legend_rank"))
        self.assertFalse(hasattr(guide, "_figurestead_legend_rank"))
        plt.close(fig)


if __name__ == "__main__":
    unittest.main(verbosity=2)
