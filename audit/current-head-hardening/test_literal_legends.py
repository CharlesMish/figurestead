"""Authored labels are attribution, not Matplotlib suppression instructions."""
from io import BytesIO
from itertools import product
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.text import Text
from figurestead import line, scatter, strip_summary, histogram, save_figure, get_theme
from figurestead.core import style_legend
from figurestead._legend import legend_entries
from figurestead._line_identity import IdentityLine
from figurestead.extensions.categorical import categorical_bar, categorical_layered_bar
from figurestead.extensions.interval import interval_comparison


class LiteralLegends(unittest.TestCase):
    labels = ['_control', '_reference', '_nolegend_']

    def tearDown(self):
        plt.close('all')

    def texts(self, ax):
        return [t.get_text() for t in ax.get_legend().get_texts()]

    def make(self, family, labels=None, ax=None, direct=False):
        labels = self.labels if labels is None else labels
        if family == 'line':
            return line([0, 1, 2], [[1, 2, 3], [2, 3, 3.05], [3, 4, 3.1]], labels=labels,
                        direct_labels=direct, ax=ax, theme='lavender_fog_notebook')
        if family == 'scatter':
            return scatter([0, 1, 2], [1, 2, 3], series=labels, ax=ax)
        return strip_summary(['A', 'A', 'B'], [1, 2, 3], series=labels, ax=ax)

    def test_literal_owned_labels_and_native_artist_rules(self):
        for family in ('line', 'scatter', 'strip'):
            with self.subTest(family=family):
                f, a = plt.subplots()
                hidden, = a.plot([0, 1], [2, 3], label='_native')
                sentinel, = a.plot([0, 1], [3, 4], label='_nolegend_')
                native, = a.plot([0, 1], [0, 1], label='Native')
                labels = [x.get_label() for x in a.lines]
                self.make(family, ax=a); f.canvas.draw()
                self.assertEqual(self.texts(a), ['Native', *self.labels])
                self.assertEqual(a.get_legend_handles_labels()[1], ['Native'])
                self.assertEqual([hidden.get_label(), sentinel.get_label(), native.get_label()], labels)
                self.assertFalse(any(hasattr(h, '_figurestead_authored_label') for h in (hidden, sentinel, native)))

    def test_actual_anonymous_layers_stay_suppressed_but_explicit_zero_survives(self):
        for family in ('scatter', 'strip'):
            if family == 'scatter':
                f, a = scatter([0, 1], [1, 2])
                scatter([0, 1], [1, 2], series=[0, 0], ax=a)
            else:
                f, a = strip_summary(['A', 'B'], [1, 2])
                strip_summary(['A', 'B'], [1, 2], series=[0, 0], ax=a)
            anonymous = list(a.collections)
            line([0, 1], [2, 3], labels=['_nolegend_'], ax=a)
            self.assertEqual(self.texts(a), ['0', '_nolegend_'])
            self.assertEqual(len(legend_entries(a)[0]), 2)
            self.assertTrue(all(h in a.collections for h in anonymous))

    def test_repeated_line_calls_keep_slots_and_rhythm_without_extra_rows(self):
        for counts, direct in product(((2, 1), (1, 1), (1, 2)), (False, True)):
            a = None; offset = 0
            for count in counts:
                slots = list(range(offset, offset + count)); labels = self.labels[offset:offset + count]
                f, a = line([0, 1], [[i, i + 1] for i in slots], labels=labels, series_slots=slots,
                            series_keys=labels, line_styles={'_nolegend_': 'dash'}, direct_labels=direct, ax=a)
                offset += count
            for _ in range(2):
                f.canvas.draw(); self.assertEqual(self.texts(a), self.labels[:offset])
            samples = getattr(a.get_legend(), 'legend_handles', None)
            if samples is None: samples = a.get_legend().legendHandles
            for i, sample in enumerate(samples):
                self.assertIsInstance(sample, IdentityLine)
                self.assertEqual(sample.identity_marker, ['o', 's', '^'][i])
                self.assertEqual(sample.get_linestyle(), '--' if i == 2 else '-')
            if direct:
                self.assertEqual(a._figurestead_direct_labels.result['reason'], 'unsupported-layout')
                self.assertTrue(a.get_legend().get_visible())

    def test_mixed_point_and_line_layers_keep_the_identity_handler(self):
        for family, first_line in product(('scatter', 'strip'), (False, True)):
            f, a = plt.subplots()
            add_line = lambda: line([0, 1], [2, 3], labels=['_line'], series_slots=[2], ax=a)
            add_points = lambda: self.make(family, ax=a)
            if first_line: add_line(); add_points()
            else: add_points(); add_line()
            expected = ['_line', *self.labels] if first_line else [*self.labels, '_line']
            self.assertEqual(self.texts(a), expected)
            samples = getattr(a.get_legend(), 'legend_handles', None)
            if samples is None: samples = a.get_legend().legendHandles
            sample = samples[expected.index('_line')]
            self.assertIsInstance(sample, IdentityLine); self.assertEqual(sample.identity_marker, '^')

    def test_fresh_single_series_and_empty_labels_keep_existing_triggers(self):
        for label, direct in product(('_control', '_nolegend_', 'Only', ''), (False, True)):
            f, a = line([0, 1], [1, 2], labels=[label], direct_labels=direct)
            f.canvas.draw(); self.assertIsNone(a.get_legend())
        for family in ('scatter', 'strip'):
            f, a = self.make(family, ['_control'] * 3)
            self.assertIsNone(a.get_legend())
        f, a = histogram([1, 2, 3], labels=['_control']); self.assertIsNone(a.get_legend())

    def test_ordinary_exports_actually_draw_literal_text(self):
        for family in ('line', 'scatter', 'strip'):
            f, a = self.make(family); f.canvas.draw()
            count = len(a.get_children()); data = [h.get_label() for h in legend_entries(a)[0]]
            for fmt, tight in product(('png', 'svg', 'pdf'), (False, True)):
                with self.subTest(family=family, fmt=fmt, tight=tight):
                    drawn = []; original = Text.draw
                    def observe(text, renderer):
                        if text.get_visible() and text.get_text() in self.labels: drawn.append(text.get_text())
                        return original(text, renderer)
                    output = BytesIO()
                    with matplotlib.rc_context({'svg.fonttype': 'none', 'pdf.compression': 0}), patch.object(Text, 'draw', observe):
                        f.savefig(output, format=fmt, bbox_inches='tight' if tight else None)
                    self.assertTrue(set(self.labels).issubset(drawn))
                    self.assertGreater(len(output.getvalue()), 1000)
                    if fmt == 'svg':
                        texts = [n.text for n in ET.fromstring(output.getvalue()).iter('{http://www.w3.org/2000/svg}text')]
                        for label in self.labels: self.assertEqual(texts.count(label), 1)
                    f.canvas.draw(); self.assertEqual(len(a.get_children()), count)
                    self.assertEqual([h.get_label() for h in legend_entries(a)[0]], data)

    def test_direct_placement_tight_fallback_and_redraw_keep_all_labels(self):
        f, a = self.make('line', direct=True); f.canvas.draw()
        d = a._figurestead_direct_labels; count = len(a.get_children())
        self.assertEqual(d.result['status'], 'placed')
        with tempfile.TemporaryDirectory() as temporary:
            for fmt, tight in product(('png', 'svg', 'pdf'), (False, True)):
                target = Path(temporary) / f'labels-{tight}.{fmt}'
                drawn = []; original = Text.draw
                def observe(text, renderer):
                    if text.get_visible() and text.get_text() in self.labels: drawn.append(text.get_text())
                    return original(text, renderer)
                with matplotlib.rc_context({'svg.fonttype': 'none'}), patch.object(Text, 'draw', observe):
                    save_figure(f, target, bbox_inches='tight' if tight else None)
                self.assertTrue(set(self.labels).issubset(drawn)); self.assertGreater(target.stat().st_size, 1000)
                if fmt == 'svg':
                    strings = [n.text for n in ET.parse(target).iter('{http://www.w3.org/2000/svg}text')]
                    for label in self.labels: self.assertEqual(strings.count(label), 1)
                self.assertEqual(self.texts(a), self.labels)
                f.canvas.draw(); self.assertEqual(d.result['status'], 'placed')
                self.assertEqual(len(a.get_children()), count)
        a.set_xlim(0, 2); f.canvas.draw()
        self.assertEqual(d.result['reason'], 'terminal-marker-clipped')
        self.assertTrue(a.get_legend().get_visible()); self.assertEqual(self.texts(a), self.labels)

    def test_direct_labels_do_not_hide_other_owned_underscore_attribution(self):
        f, a = scatter([0, 1], [1, 2], series=['_prior', '_prior'])
        self.make('line', ax=a, direct=True); f.canvas.draw()
        self.assertEqual(a._figurestead_direct_labels.result['reason'], 'unsupported-layout')
        self.assertEqual(self.texts(a), ['_prior', *self.labels]); self.assertTrue(a.get_legend().get_visible())

    def test_removed_and_cleared_artists_cannot_reappear(self):
        f, a = self.make('line', direct=True); f.canvas.draw()
        removed = a.lines[0]; removed.identity_points.remove(); removed.remove()
        style_legend(a, get_theme('lavender_fog_notebook')); f.canvas.draw()
        self.assertEqual(self.texts(a), self.labels[1:])
        self.assertNotIn(removed, legend_entries(a)[0])
        a.clear(); f.canvas.draw(); self.assertEqual(legend_entries(a), ([], []))
        line([0, 1], [1, 2], labels=['_new'], ax=a); self.assertIsNone(a.get_legend())
        line([0, 1], [2, 3], labels=['_again'], ax=a); f.canvas.draw()
        self.assertEqual(self.texts(a), ['_new', '_again'])

    def test_histogram_and_extension_authored_handles_remain_literal(self):
        f, a = histogram([[1, 2, 3], [2, 3, 4]], labels=['_control', '_nolegend_'])
        self.assertEqual(self.texts(a), ['_control · 2', '_nolegend_ · 3'])
        f, a = histogram([1, 2, 3], labels=['_hist'])
        line([0, 1], [1, 2], labels=['_line'], ax=a); self.assertEqual(self.texts(a), ['_hist', '_line'])
        for fn in (categorical_bar, categorical_layered_bar):
            f, a = fn(['A', 'B'], [{'key': 'a', 'label': '_control', 'values': [2, 3]}, {'key': 'b', 'label': '_nolegend_', 'values': [1, 2]}])
            self.assertEqual(self.texts(a), ['_control', '_nolegend_'])
        f, a = interval_comparison({'categories': ['A', 'B'], 'series': [
            {'key': 'a', 'label': '_reference', 'mark': 'interval', 'role': 'reference'},
            {'key': 'b', 'label': '_nolegend_', 'mark': 'point', 'role': 'observed'}],
            'rows': [{'category': 'A', 'values': {'a': [1, 2], 'b': 1.5}}, {'category': 'B', 'values': {'a': [2, 3], 'b': 2.5}}]})
        self.assertEqual(self.texts(a), ['_reference', '_nolegend_'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
