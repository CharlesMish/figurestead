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
    # Hash-only change from the accepted Slipware provenance resolution
    # (#9C8F84 -> #7A6D63); SVG byte length and XML structure are unchanged.
    "exportFigureSvg": (4140, "c25e8c1107585ff414ef921014a1243d3376948b033a256028363c939bcb2dc9"),
    "exportFigureArtifacts": (4140, "c25e8c1107585ff414ef921014a1243d3376948b033a256028363c939bcb2dc9"),
    "sceneToSvg": (4140, "c25e8c1107585ff414ef921014a1243d3376948b033a256028363c939bcb2dc9"),
    "resolvedSceneToSvg": (4095, "75b6107f23fa88647e63ef7850d984d4bb411c4438b2214ac61d76cfd3148e4a"),
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


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(SvgSerializationRegression)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if result.testsRun != 3:
        raise SystemExit(f"expected exactly 3 SVG regression cases, ran {result.testsRun}")
    raise SystemExit(0 if result.wasSuccessful() else 1)
