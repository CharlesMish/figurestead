"""Auxiliary terminal scenes follow the ordinary all-solid implicit contract."""
from copy import deepcopy
from pathlib import Path
import json
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'src'))
from figurestead import compile_terminal_scene, export_contract

THEME = json.loads((Path(__file__).resolve().parents[2] / 'src/figurestead/themes/lavender_fog_notebook.json').read_text())['themes']['lavender_fog_notebook']


def contract(count):
    return {'theme': THEME, 'panels': [{'id': 'line', 'renderer': 'line',
        'data': {'x': [0, 1, 2], 'series': [
            {'key': f'S{i+1}', 'y': [i, i+1, i]} for i in range(count)]}}]}


class SceneRhythmTests(unittest.TestCase):
    def test_exported_summary_contract_rejects_without_mutation(self):
        source = export_contract(renderer='scatter', spec={'title': 'Fit'},
            data={'x': [0, 1, 2], 'y': [1, 3, 5], 'summary': 'linear_fit'})
        before = deepcopy(source)
        with self.assertRaisesRegex(ValueError, r'panels\[0\].data.summary:.*do not implement'):
            compile_terminal_scene(source)
        self.assertEqual(source, before)

    def test_exported_strip_contract_rejects_instead_of_empty_scene(self):
        source = export_contract(renderer='strip_summary', spec={'title': 'Groups'},
            data={'groups': ['Empty', 'A'], 'group': ['A', 'A'],
                  'values': [1, 2], 'summary': 'median'})
        before = deepcopy(source)
        with self.assertRaisesRegex(ValueError, r'panels\[0\].renderer:.*only basic line and scatter'):
            compile_terminal_scene(source)
        self.assertEqual(source, before)

    def test_rejects_unsupported_later_panel_and_any_requested_summary(self):
        source = contract(1)
        source['panels'].append({'id': 'later', 'renderer': 'strip_summary',
                                'data': {'groups': ['A'], 'group': ['A'], 'values': [1]}})
        before = deepcopy(source)
        with self.assertRaisesRegex(ValueError, r'panels\[1\].renderer'):
            compile_terminal_scene(source)
        self.assertEqual(source, before)
        for summary in ('linear_fit', 'median', 'unknown', False):
            with self.subTest(summary=summary):
                source = contract(1)
                source['panels'][0]['data']['summary'] = summary
                with self.assertRaisesRegex(ValueError, r'data.summary'):
                    compile_terminal_scene(source)

    def test_basic_scatter_null_summary_preserves_exact_records(self):
        source = export_contract(renderer='scatter', spec={'title': 'Points'},
            data={'x': [0, 1, 2], 'y': [1, 3, 5], 'series': ['B', 'A', 'B']})
        before = deepcopy(source)
        scene = compile_terminal_scene(source)
        self.assertEqual(source, before)
        marks = scene['panels'][0]['marks']
        self.assertEqual([(m['id'], m['kind'], m['series'], m['x'], m['y']) for m in marks],
            [('panel-1/point/B/0', 'point', 'B', 0.0, 1.0),
             ('panel-1/point/A/1', 'point', 'A', 1.0, 3.0),
             ('panel-1/point/B/2', 'point', 'B', 2.0, 5.0)])
        source['panels'][0]['data']['summary'] = None
        self.assertEqual(compile_terminal_scene(source), scene)

    def test_default_allocation_and_body_records(self):
        for count in (3, 4, 5, 6, 13, 17):
            source = contract(count)
            before = deepcopy(source)
            scene = compile_terminal_scene(source)
            for i, (key, style) in enumerate(scene['seriesStyles'].items()):
                self.assertEqual(style['lineStyle'], 'solid')
                self.assertEqual(style['glyph'], ('ring', 'square', 'triangle', 'diamond')[i % 4])
                self.assertEqual(style['color'], THEME['series'][i % len(THEME['series'])])
                for mark in scene['panels'][0]['marks']:
                    if mark['series'] == key:
                        self.assertEqual(mark['style'], style)
            self.assertEqual(source, before)
            source['style'] = {'lineStyles': ['solid']}
            self.assertEqual(compile_terminal_scene(source), scene)

    def test_explicit_arrays_and_key_precedence(self):
        for cycle in (None, ['dash'], ['solid', 'dash', 'dot', 'dash-dot']):
            source = contract(17)
            source['style'] = {'series': {'S1': {'lineStyle': 'dash'},
                'S2': {'lineStyle': 'dot'}, 'S3': {'lineStyle': 'dash-dot'},
                'S5': {'color': '#123456'}, 'S9': {'lineStyle': 'solid'}}}
            if cycle is not None:
                source['style']['lineStyles'] = cycle
            scene = compile_terminal_scene(source)
            for i, (key, style) in enumerate(scene['seriesStyles'].items()):
                expected = source['style']['series'].get(key, {}).get(
                    'lineStyle', (cycle or ['solid'])[(i // 4) % len(cycle or ['solid'])])
                self.assertEqual(style['lineStyle'], expected)


if __name__ == '__main__':
    unittest.main()
