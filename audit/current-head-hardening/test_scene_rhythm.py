"""Auxiliary terminal scenes follow the ordinary all-solid implicit contract."""
from copy import deepcopy
from pathlib import Path
import json
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'src'))
from figurestead import compile_terminal_scene

THEME = json.loads((Path(__file__).resolve().parents[2] / 'src/figurestead/themes/lavender_fog_notebook.json').read_text())['themes']['lavender_fog_notebook']


def contract(count):
    return {'theme': THEME, 'panels': [{'id': 'line', 'renderer': 'line',
        'data': {'x': [0, 1, 2], 'series': [
            {'key': f'S{i+1}', 'y': [i, i+1, i]} for i in range(count)]}}]}


class SceneRhythmTests(unittest.TestCase):
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
