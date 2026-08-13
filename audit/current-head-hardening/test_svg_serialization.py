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
    "exportFigureSvg": (4140, "a1b3bf0c3dc31bb8346151bd17b95c05ccca81fd75abbfe45f832a50a6f75f63"),
    "exportFigureArtifacts": (4140, "a1b3bf0c3dc31bb8346151bd17b95c05ccca81fd75abbfe45f832a50a6f75f63"),
    "sceneToSvg": (4140, "a1b3bf0c3dc31bb8346151bd17b95c05ccca81fd75abbfe45f832a50a6f75f63"),
    "resolvedSceneToSvg": (4095, "f34f50f4e8ef6368352d33b87b3d9a13c24bd85694fa18362dcd34ec167cb5f5"),
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
    unittest.main(verbosity=2)
