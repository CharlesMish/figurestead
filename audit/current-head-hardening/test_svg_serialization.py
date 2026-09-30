#!/usr/bin/env python3
"""XML-structure regressions for every public Figurestead SVG path."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import unittest
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[2]
RUNNER = ROOT / "web" / "test" / "svg-serialization-cases.mjs"
EXPECTED_NORMAL = {
    # Explicit root font and header-role attribute; B2 geometry/escaping unchanged.
    'exportFigureSvg': (5498, '34679444d058fbe9da027bf57e20f30366cd1e6eac528db89e56c286c38e39c1'),
    'exportFigureArtifacts': (5498, '34679444d058fbe9da027bf57e20f30366cd1e6eac528db89e56c286c38e39c1'),
    'sceneToSvg': (5498, '34679444d058fbe9da027bf57e20f30366cd1e6eac528db89e56c286c38e39c1'),
    'resolvedSceneToSvg': (5453, 'de6c90c37829f7113886251e2e38d56f421d1f4d667a33a0b4231243572f54c0'),
}
SVG = "{http://www.w3.org/2000/svg}"


class SvgSerializationRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        completed = subprocess.run(
            ["node", str(RUNNER)], cwd=ROOT, check=True, capture_output=True, text=True
        )
        cls.results = json.loads(completed.stdout)

    def test_normal_svg_bytes_and_xml_structure_remain_stable(self) -> None:
        structures = {}
        for name, svg in self.results["valid"].items():
            root = ET.fromstring(svg)
            self.assertEqual(root.tag, f"{SVG}svg")
            structures[name] = [element.tag for element in root.iter()]
            expected_bytes, expected_hash = EXPECTED_NORMAL[name]
            payload = svg.encode("utf-8")
            self.assertEqual(len(payload), expected_bytes)
            self.assertEqual(hashlib.sha256(payload).hexdigest(), expected_hash)
        self.assertEqual(structures["exportFigureSvg"], structures["exportFigureArtifacts"])
        self.assertEqual(structures["exportFigureSvg"], structures["sceneToSvg"])
        self.assertEqual(structures["exportFigureSvg"], structures["resolvedSceneToSvg"])

    def test_noncanonical_colors_are_rejected_on_every_public_path(self) -> None:
        for payload_name, paths in self.results["invalidColors"].items():
            for path_name, result in paths.items():
                with self.subTest(payload=payload_name, path=path_name):
                    self.assertTrue(result["rejected"])
                    self.assertIn("canonical #RRGGBB color", result["error"])
                    self.assertNotIn("svg", result)

    def test_text_is_xml_escaped_without_changing_structure(self) -> None:
        expected_title = "Title & <proof> \"quote\" 'apostrophe' \uFFFD end"
        for name, svg in self.results["escapedText"].items():
            with self.subTest(path=name):
                root = ET.fromstring(svg)
                self.assertEqual(root.find(f"{SVG}title").text, expected_title)
                self.assertFalse(any(element.attrib.get("data-proof") for element in root.iter()))
                self.assertEqual(
                    [element.tag for element in root.iter()],
                    [element.tag for element in ET.fromstring(self.results["valid"][name]).iter()],
                )

    def test_standalone_font_intent_is_explicit_on_every_public_path(self) -> None:
        expected = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        for case in self.results["typography"]:
            for name, svg in case["outputs"].items():
                with self.subTest(theme=case["theme"], layout=case["layout"]["key"], path=name):
                    root = ET.fromstring(svg)
                    self.assertEqual(root.get("font-family"), expected)
                    self.assertFalse(root.findall(f".//{SVG}style"))
                    self.assertFalse(root.findall(f".//{SVG}foreignObject"))

    def test_subtitles_are_visible_text_in_compact_ordinary_paper_and_panel_exports(self) -> None:
        cases = self.results["typography"]
        self.assertEqual(len(cases), 14)
        for case in cases:
            layout = case["layout"]
            for name, svg in case["outputs"].items():
                with self.subTest(theme=case["theme"], layout=layout["key"], path=name):
                    root = ET.fromstring(svg)
                    self.assertEqual(root.get("viewBox"), f'0 0 {layout["width"]} {layout["height"]}')
                    subtitles = root.findall(f'.//{SVG}text[@data-header-part="subtitle"]')
                    self.assertEqual(len(subtitles), layout.get("panels", 1))
                    for subtitle in subtitles:
                        self.assertEqual("".join(subtitle.itertext()), 'Synthetic "A" & B')
                        self.assertEqual(subtitle.get("font-style"), "italic")
                    ids = {element.get("id") for element in root.iter() if element.get("id")}
                    self.assertEqual(root.get("role"), "img")
                    self.assertTrue(set(root.get("aria-labelledby").split()).issubset(ids))

    def test_subtitle_escaping_preserves_literal_text_and_accessible_description(self) -> None:
        expected = 'Literal </text><script data-proof="inert">&\uFFFD end'
        for name, svg in self.results["escapedSubtitle"].items():
            with self.subTest(path=name):
                root = ET.fromstring(svg)
                subtitle = root.find(f'.//{SVG}text[@data-header-part="subtitle"]')
                self.assertIsNotNone(subtitle)
                self.assertEqual("".join(subtitle.itertext()), expected)
                self.assertIn(expected, root.find(f"{SVG}desc").text)
                self.assertFalse(root.findall(f".//{SVG}script"))
                self.assertFalse(any(element.attrib.get("data-proof") for element in root.iter()))

    def test_empty_subtitle_adds_no_text_row(self) -> None:
        for name, svg in self.results["valid"].items():
            with self.subTest(path=name):
                self.assertFalse(ET.fromstring(svg).findall(f'.//{SVG}text[@data-header-part="subtitle"]'))


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(SvgSerializationRegression)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if result.testsRun != 7:
        raise SystemExit(f"expected exactly 7 SVG regression cases, ran {result.testsRun}")
    raise SystemExit(0 if result.wasSuccessful() else 1)
