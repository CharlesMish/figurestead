"""Uncropped categorical-matrix decoration containment and ownership."""
import copy
import io
import itertools
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import warnings

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'src'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.text import Text
from matplotlib.transforms import Bbox
import numpy as np
from PIL import Image

from figurestead import PlotSpec, save_figure
from figurestead.extensions.matrix import categorical_matrix
from figurestead.extensions.matrix._layout import MatrixLayout, MatrixLegend, MatrixNote
from figurestead._subtitle import SubtitleLayout
from figurestead.themes import THEMES


LONG = 'Middle East, North Africa, Afghanistan & Pakistan'
NOTE = 'Source: deterministic synthetic evidence; no measured observations or inferred estimates.'


def fixture(long_x=False, long_y=False, statuses=2, long_status=False):
    xs = [LONG, 'Latin America & Caribbean'] if long_x else ['Control', 'Treatment']
    ys = [LONG, 'Latin America & Caribbean', 'Sub-Saharan Africa'] if long_y else ['r1', 'r2', 'r3']
    cells = [dict(x=x, y=y, value=(i * 2 + j) / 5, status='observed')
             for i, y in enumerate(ys) for j, x in enumerate(xs)]
    cells[-1] = dict(x=xs[-1], y=ys[-1], status='missing')
    if statuses == 2:
        cells[-2] = dict(x=xs[0], y=ys[-1], status='insufficient')
    data = dict(xCategories=xs, yCategories=ys, cells=cells,
                valueScale=dict(domain=[0, 1], label='Share', format='percent'))
    if long_status:
        data['statusLabels'] = dict(missing=('Missing observation: ' + 'authored status description ' * 3)[:80],
                                    insufficient=('Insufficient evidence: ' + 'authored status description ' * 3)[:80])
    return data


def boxes(fig, ax, renderer=None):
    """Independent renderer oracle: no implementation-provided decoration list."""
    renderer = renderer or fig.canvas.get_renderer()
    found = []
    def add(name, artist):
        if artist.get_visible() and (not isinstance(artist, Text) or artist.get_text()):
            box = artist.get_window_extent(renderer)
            if box.width and box.height:
                found.append((name, box))
    bar = ax.images[0].colorbar
    axes_to_check = (ax, bar.ax) if bar is not None and bar.ax in fig.axes else (ax,)
    for index, axes in enumerate(axes_to_check):
        prefix = 'colorbar ' if index else ''
        for axis in (axes.xaxis, axes.yaxis):
            if axis.get_visible():
                for tick in axis.get_ticklabels():
                    add(prefix + 'tick', tick)
                add(prefix + 'label', axis.label)
                add(prefix + 'offset', axis.offsetText)
        for title in (axes.title, axes._left_title, axes._right_title):
            add(prefix + 'title', title)
    for header in fig.artists:
        if isinstance(header, SubtitleLayout) and header.ax is ax:
            add('subtitle', header.text)
    for note in ax.texts:
        if isinstance(note, MatrixNote):
            add('note', note)
    legend = ax.get_legend()
    if legend is not None:
        assert legend.get_visible(), 'required status legend absent'
        add('legend', legend)
    if bar is not None and bar.ax in fig.axes:
        found.append(('colorbar', bar.ax.bbox.frozen()))
    return found


def assert_contained(test, fig, ax, renderer=None):
    found = boxes(fig, ax, renderer)
    tolerance = 1e-7
    for name, box in found:
        test.assertTrue(np.isfinite(box.extents).all(), name)
        test.assertGreaterEqual(box.x0, fig.bbox.x0 - tolerance, name)
        test.assertLessEqual(box.x1, fig.bbox.x1 + tolerance, name)
        test.assertGreaterEqual(box.y0, fig.bbox.y0 - tolerance, name)
        test.assertLessEqual(box.y1, fig.bbox.y1 + tolerance, name)
    for (name, box), (other, candidate) in itertools.combinations(found, 2):
        overlap = Bbox.intersection(box, candidate)
        test.assertTrue(overlap is None or min(overlap.width, overlap.height) <= tolerance,
                        f'{name} overlaps {other}')
    test.assertIsNotNone(ax.get_legend())


def make(data=None, *, note='', size=(8.4, 5.2), dpi=120, engine=None, ax=None, theme='lavender_fog_notebook'):
    with matplotlib.rc_context({'figure.constrained_layout.use': engine == 'constrained',
                                'figure.autolayout': engine == 'tight'}):
        fig, ax = categorical_matrix(data or fixture(), spec=PlotSpec(
            'Synthetic evidence matrix', subtitle='Observed, absent and insufficient evidence',
            xlabel='Model', ylabel='Category', note=note), theme=theme, ax=ax)
    fig.set_size_inches(*size)
    fig.set_dpi(dpi)
    return fig, ax


class MatrixLayoutTests(unittest.TestCase):
    def tearDown(self):
        plt.close('all')

    def test_no_note_and_two_status_legend_are_visible_without_crop(self):
        for statuses in (1, 2):
            fig, ax = make(fixture(statuses=statuses))
            fig.canvas.draw()
            assert_contained(self, fig, ax)
            output = io.BytesIO()
            fig.savefig(output, format='png')
            self.assertEqual(Image.open(output).size, (1008, 624))
            self.assertEqual(len(ax.get_legend().get_texts()), statuses)

    def test_colorbar_removal_preserves_remaining_decorations_on_first_draw_and_export(self):
        for drawn, engine, note in itertools.product(
                (False, True), (None, 'tight', 'constrained'), ('', NOTE)):
            with self.subTest(drawn=drawn, engine=engine, note=bool(note)):
                fig, ax = make(engine=engine, note=note)
                if drawn:
                    fig.canvas.draw()
                    assert_contained(self, fig, ax)
                image, bar = ax.images[0], ax.images[0].colorbar
                bar.remove()
                self.assertIsNone(image.colorbar)
                self.assertIsNone(image.colorbar_cid)
                self.assertEqual(fig.axes, [ax])
                counts = (len(fig.artists), len(ax.texts), len(ax.patches))
                original = fig.draw
                painted = []

                def checked_draw(renderer):
                    result = original(renderer)
                    # Use the actual PNG/SVG renderer and uncropped frame,
                    # independently of MatrixLayout's decoration collector.
                    assert_contained(self, fig, ax, renderer)
                    painted.append(type(renderer).__name__)
                    return result

                with patch.object(fig, 'draw', checked_draw), patch.object(
                        bar.ax, 'apply_aspect', side_effect=AssertionError('removed colorbar was measured')):
                    # Also exercise export as the first operation after removal.
                    for fmt in ('png', 'svg', 'png', 'svg'):
                        output = io.BytesIO()
                        fig.savefig(output, format=fmt)
                        self.assertTrue(output.getvalue())
                        if fmt == 'png':
                            self.assertEqual(Image.open(output).size, (1008, 624))
                    positions, pixels = [], []
                    for _ in range(2):
                        fig.canvas.draw()
                        positions.append(ax.get_position().extents.copy())
                        pixels.append(np.asarray(fig.canvas.buffer_rgba()).copy())
                self.assertGreaterEqual(len(painted), 6)
                np.testing.assert_array_equal(positions[0], positions[1])
                np.testing.assert_array_equal(pixels[0], pixels[1])
                self.assertEqual(len(ax.get_legend().get_texts()), 2)
                self.assertEqual(counts, (len(fig.artists), len(ax.texts), len(ax.patches)))
                self.assertEqual(fig.axes, [ax])
                plt.close(fig)

    def test_colorbar_removal_preserves_capacity_failure_and_caller_axes(self):
        fig, ax = make()
        fig.canvas.draw()
        ax.images[0].colorbar.remove()
        fig.canvas.draw()
        assert_contained(self, fig, ax)
        position = ax.get_position(original=True).frozen()
        fig.set_size_inches(1, 1)
        for fmt in ('png', 'svg'):
            with self.assertRaisesRegex(ValueError, 'categorical_matrix: insufficient decoration space'):
                fig.savefig(io.BytesIO(), format=fmt)
            np.testing.assert_array_equal(ax.get_position(original=True).extents, position.extents)
        fig.set_size_inches(8.4, 5.2)
        fig.canvas.draw()
        assert_contained(self, fig, ax)

        external, axes = plt.subplots(1, 2, figsize=(12, 5.2), dpi=120)
        axes[0].plot([0, 1], [0, 1])
        _, target = make(ax=axes[1], size=(12, 5.2))
        target.images[0].colorbar.remove()
        positions = [a.get_position(original=True).frozen() for a in external.axes]
        for fmt in ('png', 'svg'):
            try:
                external.savefig(io.BytesIO(), format=fmt)
            except ValueError as error:
                self.assertRegex(str(error), 'categorical_matrix: insufficient decoration space')
            else:
                assert_contained(self, external, target)
            for a, expected in zip(external.axes, positions):
                np.testing.assert_array_equal(a.get_position(original=True).extents, expected.extents)

    def test_measured_footer_stack_includes_rotated_ticks_legend_and_note(self):
        for engine in (None, 'tight', 'constrained'):
            fig, ax = make(fixture(long_x=True), note=NOTE, size=(10, 8), engine=engine)
            fig.canvas.draw()
            assert_contained(self, fig, ax)
            r = fig.canvas.get_renderer()
            legend = ax.get_legend().get_window_extent(r)
            self.assertLess(legend.y1, ax.xaxis.get_tightbbox(r).y0)
            note = next(t for t in ax.texts if isinstance(t, MatrixNote))
            self.assertLess(note.get_window_extent(r).y1, legend.y0)

    def test_complete_uncropped_grid_fits_or_rejects_explicitly(self):
        successes = failures = 0
        records = []
        for long_x, long_y, statuses, long_status, note, size, dpi, engine in itertools.product(
                (False, True), (False, True), (1, 2), (False, True), ('', NOTE),
                ((8.4, 5.2), (6.5, 4.2), (10, 8)), (72, 200), (None, 'tight', 'constrained')):
            with self.subTest(x=long_x, y=long_y, statuses=statuses, long_status=long_status,
                              note=bool(note), size=size, dpi=dpi, engine=engine):
                fig, ax = make(fixture(long_x, long_y, statuses, long_status),
                               note=note, size=size, dpi=dpi, engine=engine)
                record = dict(long_x=long_x, long_y=long_y, statuses=statuses,
                              long_status=long_status, note=bool(note), size=size, dpi=dpi, engine=engine)
                try:
                    with warnings.catch_warnings():
                        warnings.filterwarnings('ignore', message='.*[Ll]ayout.*')
                        # First operation is a normal uncropped export; no
                        # warm-up draw or tight crop may hide an off-canvas key.
                        fig.savefig(io.BytesIO(), format='png', dpi=dpi)
                except ValueError as error:
                    self.assertRegex(str(error), 'categorical_matrix: insufficient decoration space|PlotSpec.subtitle:.*enlarge')
                    self.assertTrue(long_x or long_y or long_status,
                                    'ordinary short decoration set must succeed at all standard sizes')
                    record.update(outcome='explicit-capacity-error', reason=str(error))
                    failures += 1
                else:
                    assert_contained(self, fig, ax)
                    record.update(outcome='contained', axes=list(ax.get_position().bounds))
                    successes += 1
                finally:
                    plt.close(fig)
                records.append(record)
        if os.environ.get("FIGURESTEAD_MATRIX_LAYOUT_REPORT"):
            Path(os.environ["FIGURESTEAD_MATRIX_LAYOUT_REPORT"]).write_text(json.dumps(records, indent=2))
        self.assertEqual(successes + failures, 576)
        self.assertGreater(successes, 100, 'must allocate useful layouts, not reject everything')
        print(f'matrix grid: {successes} contained / {failures} explicit capacity rejections / 576 total')

    def test_external_axes_not_reallocated_and_neighbours_protected(self):
        for size, long_x, long_y, note, statuses in itertools.product(
                ((12, 5), (9, 4)), (False, True), (False, True), ('', NOTE), (1, 2)):
            fig, axes = plt.subplots(1, 2, figsize=size)
            axes[0].plot([0, 1], [0, 1])
            peer_position = axes[0].get_position().frozen()
            fig, ax = make(fixture(long_x, long_y, statuses), ax=axes[1], size=size, note=note)
            # The colorbar allocation is an existing, separate Matplotlib change.
            expected = [a.get_position(original=True).frozen() for a in fig.axes]
            for _ in range(2):
                try:
                    fig.canvas.draw()
                except ValueError as error:
                    self.assertRegex(str(error), 'categorical_matrix: insufficient decoration space')
                else:
                    assert_contained(self, fig, ax)
                for a, before in zip(fig.axes, expected):
                    np.testing.assert_array_equal(a.get_position(original=True).extents, before.extents)
                np.testing.assert_array_equal(axes[0].get_position().extents, peer_position.extents)
            plt.close(fig)

    def test_resize_dpi_engine_and_export_lifecycle_does_not_accumulate(self):
        for engine in (None, 'tight', 'constrained'):
            fig, ax = make(note=NOTE, engine=engine)
            counts = (len(fig.axes), len(fig.artists), len(ax.texts), len(ax.patches))
            positions = []
            pixels = []
            for size, dpi in (((8.4, 5.2), 120), ((10, 8), 200), ((8.4, 5.2), 120)):
                fig.set_size_inches(*size); fig.set_dpi(dpi)
                fig.canvas.draw(); assert_contained(self, fig, ax)
                positions.append(ax.get_position().extents.copy())
                pixels.append(np.asarray(fig.canvas.buffer_rgba()).copy())
                for fmt in ('png', 'svg', 'pdf'):
                    fig.savefig(io.BytesIO(), format=fmt)
                    fig.savefig(io.BytesIO(), format=fmt, bbox_inches='tight', pad_inches=0)
                    fig.savefig(io.BytesIO(), format=fmt, bbox_inches='tight', pad_inches=.01)
                    fig.savefig(io.BytesIO(), format=fmt)
                self.assertEqual(counts, (len(fig.axes), len(fig.artists), len(ax.texts), len(ax.patches)))
            np.testing.assert_allclose(positions[0], positions[-1], atol=1e-10, rtol=0)
            np.testing.assert_array_equal(pixels[0], pixels[-1])

    def test_impossible_layout_is_transactional_and_recoverable(self):
        fig, ax = make(note=NOTE)
        fig.canvas.draw()
        before = [a.get_position(original=True).frozen() for a in fig.axes]
        counts = len(fig.axes), len(fig.artists), len(ax.texts)
        fig.set_size_inches(1, 1)
        for _ in range(2):
            with self.assertRaisesRegex(ValueError, 'categorical_matrix: insufficient decoration space'):
                fig.canvas.draw()
            for a, position in zip(fig.axes, before):
                np.testing.assert_array_equal(a.get_position(original=True).extents, position.extents)
            self.assertEqual(counts, (len(fig.axes), len(fig.artists), len(ax.texts)))
        fig.set_size_inches(8.4, 5.2)
        fig.canvas.draw(); assert_contained(self, fig, ax)

    def test_values_statuses_categories_and_six_theme_semantics_are_unchanged(self):
        import matplotlib.colors as colors
        from figurestead.themes import get_theme
        for name in THEMES:
            data = fixture()
            original = copy.deepcopy(data)
            fig, ax = make(data, theme=name, note=NOTE)
            fig.canvas.draw(); assert_contained(self, fig, ax)
            self.assertEqual(data, original)
            np.testing.assert_array_equal(ax.images[0].get_array().compressed(), [0, .2, .4, .6])
            np.testing.assert_array_equal(ax.images[0].get_array().mask, [[False, False], [False, False], [True, True]])
            self.assertEqual(ax.images[0].get_clim(), (0, 1))
            self.assertEqual([t.get_text() for t in ax.get_xticklabels()], data['xCategories'])
            self.assertEqual([t.get_text() for t in ax.get_yticklabels()], data['yCategories'])
            theme = get_theme(name)
            insufficient, missing = ax.patches
            self.assertEqual(insufficient.get_facecolor(), colors.to_rgba(theme.panel))
            self.assertEqual(insufficient.get_hatch(), '///')
            self.assertEqual(missing.get_facecolor(), colors.to_rgba(theme.field))
            self.assertNotEqual(colors.to_rgba(theme.panel), colors.to_rgba(theme.field))

    def test_oracle_detects_original_offcanvas_and_rotated_collision(self):
        def old_anchor(legend, renderer):
            legend.set_bbox_to_anchor((0, -.16), transform=legend.axes.transAxes)
        for long_x in (False, True):
            with patch.object(MatrixLegend, '_place', old_anchor), patch.object(MatrixLayout, 'draw', lambda *args: None):
                fig, ax = make(fixture(long_x=long_x))
                fig.canvas.draw()
                with self.assertRaises(AssertionError):
                    assert_contained(self, fig, ax)


if __name__ == '__main__':
    unittest.main()
