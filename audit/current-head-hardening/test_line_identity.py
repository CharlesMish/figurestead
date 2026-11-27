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


if __name__ == "__main__":
    unittest.main(verbosity=2)
