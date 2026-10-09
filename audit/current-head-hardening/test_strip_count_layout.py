"""Strip counts belong to category decoration, never the observation rectangle."""
import io
from pathlib import Path
import sys
import unittest
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'src'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

from figurestead import PROFILES, PlotSpec, strip_summary


class StripCountLayoutTests(unittest.TestCase):
    def tearDown(self):
        plt.close('all')

    def counts(self, ax):
        return [text for text in ax.texts
                if getattr(text, '_figurestead_strip_count', False)]

    def assert_count_band(self, fig, ax, renderer=None):
        renderer = renderer or fig.canvas.get_renderer()
        ticks = ax.get_xticklabels()
        for text, tick in zip(self.counts(ax), ticks):
            box = text.get_window_extent(renderer)
            self.assertLess(box.y1, ax.bbox.y0)
            self.assertGreater(box.y0, tick.get_window_extent(renderer).y1)
            self.assertGreaterEqual(box.y0, fig.bbox.y0)
            self.assertLessEqual(box.x1, fig.bbox.x1)
            self.assertGreaterEqual(box.x0, fig.bbox.x0)

    def fixture(self, **kwargs):
        # The upper Chicago observation used to intersect n=365 at axes y=.965.
        groups = np.repeat(['Chicago', 'Phoenix', 'Seattle'], 365)
        values = np.concatenate([np.linspace(2.2, 20.5, 365),
                                 np.linspace(3.3, 17.0, 365),
                                 np.linspace(2.2, 15.5, 365)])
        return strip_summary(groups, values, spec=PlotSpec(
            'Daily temperature range', xlabel='Station', ylabel='Range (°C)'), **kwargs)

    def test_field_failure_counts_clear_all_point_ink_across_profiles_and_dpi(self):
        for profile in PROFILES:
            with self.subTest(profile=profile):
                fig, ax = self.fixture(profile=profile)
                for size, dpi in [((8.4, 5.2), 72), ((6, 4.5), 150),
                                  ((10, 6), 300), ((8.4, 5.2), 120)]:
                    with self.subTest(size=size, dpi=dpi):
                        fig.set_size_inches(*size)
                        fig.set_dpi(dpi)
                        fig.canvas.draw()
                        self.assert_count_band(fig, ax)
                        self.assertEqual([text.get_text() for text in self.counts(ax)],
                                         ['n=365'] * 3)
                        # All observation layers stay clipped to the axes; the
                        # entire count row is below their clipping rectangle.
                        for collection in ax.collections:
                            self.assertTrue(collection.get_clip_on())
                            self.assertEqual(tuple(collection.get_clip_box().bounds),
                                             tuple(ax.bbox.bounds))

    def test_observations_jitter_medians_and_automatic_domains_are_unchanged(self):
        groups = ['B', 'A', 'B', 'A']
        values = [1.0, 4.0, 7.0, 10.0]
        fig, ax = strip_summary(groups, values, profile='monograph', seed=17)
        jitter = np.random.default_rng(17).uniform(-.13, .13, size=4)
        np.testing.assert_array_equal(ax.collections[0].get_offsets()[:, 1], values)
        np.testing.assert_array_equal(ax.collections[0].get_offsets()[:, 0],
                                      np.array([0, 1, 0, 1]) + jitter)
        self.assertEqual([list(line.get_ydata()) for line in ax.lines],
                         [[4.0, 4.0], [7.0, 7.0]])
        self.assertEqual(ax.get_ylim(), (.55, 10.45))
        self.assertEqual(ax.get_xlim(), (-.55, 1.55))
        self.assertEqual([tick.get_text() for tick in ax.get_xticklabels()], ['B', 'A'])

    def test_explicit_linear_inverted_and_log_domains_and_sibling_untouched(self):
        for scale, limits in [('linear', (0, 10)), ('linear', (10, 0)),
                              ('log', (1, 10)), ('log', (10, 1))]:
            with self.subTest(scale=scale, limits=limits):
                fig, (ax, sibling) = plt.subplots(1, 2, figsize=(9, 5.2))
                ax.set_yscale(scale)
                ax.set_ylim(*limits)
                sibling.plot([1, 2], [30, 40])
                position = ax.get_position().bounds
                sibling_state = (sibling.get_position().bounds, sibling.get_xlim(),
                                 sibling.get_ylim(), len(sibling.texts))
                strip_summary(['A', 'B'], [1, 10], ax=ax)
                fig.canvas.draw()
                self.assert_count_band(fig, ax)
                self.assertEqual(ax.get_ylim(), limits)
                self.assertEqual(ax.get_position().bounds, position)
                self.assertEqual((sibling.get_position().bounds, sibling.get_xlim(),
                                  sibling.get_ylim(), len(sibling.texts)), sibling_state)
                self.assertFalse(ax.get_autoscaley_on())
                np.testing.assert_array_equal(ax.collections[0].get_offsets()[:, 1], [1, 10])

    def test_empty_order_slots_and_reordered_categories_keep_correct_counts(self):
        fig, ax = strip_summary(['B', 'A', 'B'], [2, 3, 4],
                               order=['A', 'missing', 'B'], profile='monograph')
        fig.canvas.draw()
        self.assert_count_band(fig, ax)
        self.assertEqual([text.get_text() for text in self.counts(ax)], ['n=1', 'n=0', 'n=2'])
        self.assertEqual([text.get_text() for text in ax.get_xticklabels()],
                         ['A', 'missing', 'B'])
        self.assertEqual(len(ax.lines), 2)
        self.assertTrue(all(np.isfinite(line.get_xydata()).all() for line in ax.lines))
        fig, ax = strip_summary([], [], order=['empty'])
        fig.canvas.draw()
        self.assert_count_band(fig, ax)
        self.assertEqual([text.get_text() for text in self.counts(ax)], ['n=0'])
        self.assertEqual(len(ax.lines), 0)
        fig, ax = strip_summary([], [])
        fig.canvas.draw()
        self.assertEqual(self.counts(ax), [])

    def test_existing_larger_tick_pad_is_retained_and_no_global_rc_change(self):
        fig, ax = plt.subplots(figsize=(8.4, 5.2))
        ax.tick_params(axis='x', pad=18, length=7)
        before = matplotlib.rcParams.copy()
        strip_summary(['A', 'B'], [1, 3], ax=ax)
        fig.canvas.draw()
        self.assert_count_band(fig, ax)
        self.assertTrue(all(tick.get_pad() == 18 for tick in ax.xaxis.get_major_ticks()))
        self.assertEqual(dict(matplotlib.rcParams), dict(before))

    def test_counts_clear_category_labels_for_inward_outward_and_inout_ticks(self):
        for direction in ['in', 'out', 'inout']:
            for length in [7, 14]:
                for authored_pad in [3.5, 18]:
                    with self.subTest(direction=direction, length=length, pad=authored_pad):
                        fig, ax = plt.subplots(figsize=(8.4, 5.2), dpi=120)
                        ax.tick_params(axis='x', direction=direction, length=length,
                                       pad=authored_pad)
                        strip_summary(['A', 'B'], [1, 3], ax=ax)
                        fig.canvas.draw()
                        self.assert_count_band(fig, ax)
                        self.assertTrue(all(tick.get_pad() >= authored_pad
                                            for tick in ax.xaxis.get_major_ticks()))
                        plt.close(fig)

    def test_native_layout_engines_and_first_exports_keep_counts_visible(self):
        for layout in [None, 'tight', 'constrained']:
            with self.subTest(layout=layout):
                fig, ax = self.fixture()
                fig.set_layout_engine(layout)
                states = []
                def on_draw(event):
                    self.assert_count_band(fig, ax, event.renderer)
                    states.append(len(self.counts(ax)))
                connection = fig.canvas.mpl_connect('draw_event', on_draw)
                for fmt, kwargs in [('png', {'dpi': 180}), ('svg', {}),
                                    ('pdf', {}), ('png', {'bbox_inches': 'tight'}),
                                    ('svg', {'bbox_inches': 'tight', 'pad_inches': 0})]:
                    output = io.BytesIO()
                    with matplotlib.rc_context({'svg.fonttype': 'none'}):
                        fig.savefig(output, format=fmt, **kwargs)
                    if fmt == 'svg':
                        root = ET.fromstring(output.getvalue())
                        texts = [element.text for element in root.iter('{http://www.w3.org/2000/svg}text')]
                        self.assertEqual(texts.count('n=365'), 3)
                    else:
                        self.assertGreater(len(output.getvalue()), 100)
                self.assertTrue(states)
                self.assertTrue(all(count == 3 for count in states))
                fig.canvas.mpl_disconnect(connection)

    def test_count_row_and_source_note_fit_together_without_changing_data_limits(self):
        source = ('Source: NOAA NCEI GHCN-Daily (daily-summaries), retrieved '
                  '2026-10-04. Unadjusted station observations.')
        fig, ax = strip_summary(['Chicago', 'Chicago', 'Phoenix', 'Seattle'],
                               [2.2, 20.5, 13.3, 7.8], spec=PlotSpec(
                                   'Daily temperature range', subtitle='One point per day',
                                   xlabel='Station', ylabel='Range (°C)', note=source))
        original_limits = ax.get_ylim()
        original_position = ax.get_position().bounds
        for fmt in ['png', 'svg', 'pdf']:
            # The first export must work without drawing or adjusting margins.
            fig.savefig(io.BytesIO(), format=fmt)
        fig.canvas.draw()
        renderer = fig.canvas.get_renderer()
        self.assert_count_band(fig, ax)
        note = next(text for text in ax.texts
                    if text.get_text().replace('\n', '') == source)
        box = note.get_window_extent(renderer)
        self.assertGreaterEqual(box.y0, fig.bbox.y0)
        self.assertLess(box.y1, ax.xaxis.get_tightbbox(renderer).y0)
        self.assertEqual(ax.get_ylim(), original_limits)
        self.assertEqual(ax.get_position().bounds, original_position)

        # Hidden bottom ticks must not hide count ink from footer placement.
        ax.tick_params(axis='x', labelbottom=False, labeltop=True)
        ax.set_xlabel('')
        fig.canvas.draw()
        renderer = fig.canvas.get_renderer()
        self.assertLess(note.get_window_extent(renderer).y1,
                        min(text.get_window_extent(renderer).y0 for text in self.counts(ax)))
        ax.xaxis.set_visible(False)
        fig.canvas.draw()
        renderer = fig.canvas.get_renderer()
        self.assertLess(note.get_window_extent(renderer).y1,
                        min(text.get_window_extent(renderer).y0 for text in self.counts(ax)))


if __name__ == '__main__':
    unittest.main()
