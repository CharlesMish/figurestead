"""Ordinary heatmap candidate-A regressions; categorical matrices stay separate."""
from dataclasses import asdict, replace
import hashlib
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
import matplotlib
matplotlib.use("Agg")
from matplotlib import colors
import matplotlib.pyplot as plt
import numpy as np
from figurestead import heatmap, PlotSpec
from figurestead._sequential import sequential_colormap
from figurestead.themes import THEMES
from figurestead.extensions.matrix import categorical_matrix

FIXTURES = Path(__file__).with_name("fixtures")
GOLDEN = json.loads((FIXTURES / "sequential-ramp-anchors.json").read_text())
FIXTURE = json.loads((FIXTURES / "sequential-ramp.json").read_text())


def lstar(rgb):
    # Independent scalar reference: IEC sRGB EOTF then CIELAB L* (D65/Yn=1).
    rgb = np.asarray(rgb)
    def scalar(color):
        linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in color]
        y = sum(w * v for w, v in zip((.2126, .7152, .0722), linear))
        return 116 * y ** (1 / 3) - 16 if y > (6 / 29) ** 3 else (29 / 3) ** 3 * y
    return np.array([scalar(v) for v in rgb.reshape(-1, 3)]).reshape(rgb.shape[:-1])


def old_colormap(theme):
    return colors.LinearSegmentedColormap.from_list(
        f"figurestead_{theme.key}", [theme.field, theme.panel, theme.primary, theme.summary_core])


def artist_contract(fig, ax):
    image = ax.images[0]
    return {
        "size": fig.get_size_inches().tolist(), "dpi": fig.dpi,
        "array": image.get_array().tolist(), "extent": list(image.get_extent()),
        "interpolation": image.get_interpolation(), "alpha": image.get_alpha(),
        "origin": image.origin, "norm": [type(image.norm).__name__, image.norm.vmin, image.norm.vmax, image.norm.clip],
        "axes": [{"bounds": list(a.get_position().bounds), "xlim": a.get_xlim(), "ylim": a.get_ylim(),
                  "xticks": a.get_xticks().tolist(), "yticks": a.get_yticks().tolist(),
                  "texts": [(t.get_text(), t.get_fontsize(), t.get_color()) for t in
                            [a._left_title, a.xaxis.label, a.yaxis.label, *a.texts, *a.get_xticklabels(), *a.get_yticklabels()]]}
                 for a in fig.axes],
    }


class SequentialHeatmapTests(unittest.TestCase):
    def tearDown(self):
        plt.close("all")

    def test_retained_fixture_binding_and_color_reference(self):
        self.assertEqual(hashlib.sha256((FIXTURES / "sequential-ramp.json").read_bytes()).hexdigest(), GOLDEN["fixture_sha256"])
        self.assertEqual(np.shape(FIXTURE["values"]), (8, 24))
        np.testing.assert_allclose(lstar([[0, 0, 0], [1, 1, 1]]), [0, 100], atol=1e-12)
        self.assertEqual(set(GOLDEN["themes"]), set(THEMES))

    def test_all_six_luts_match_study_and_endpoint_design_values(self):
        for key, theme in THEMES.items():
            with self.subTest(theme=key):
                golden = GOLDEN["themes"][key]
                cmap = sequential_colormap(theme)
                self.assertEqual(cmap.N, 256)
                rgb = cmap(np.arange(256))[:, :3]
                np.testing.assert_array_equal(rgb, sequential_colormap(theme)(np.arange(256))[:, :3])
                self.assertTrue(np.all((rgb >= 0) & (rgb <= 1)))
                start, end = np.array(golden["endpoints"])
                np.testing.assert_allclose(rgb, start + np.linspace(0, 1, 256)[:, None] * (end - start), rtol=0, atol=2e-15)
                np.testing.assert_allclose(lstar(rgb[[0, -1]]), [24, 92] if golden["ascending"] else [92, 24], rtol=0, atol=1e-12)
                self.assertIsInstance(cmap, colors.ListedColormap)

    def test_component_float_and_quantized_order_without_clipping(self):
        for key, theme in THEMES.items():
            with self.subTest(theme=key):
                cmap = sequential_colormap(theme)
                rgb = cmap(np.arange(256))[:, :3]
                sign = 1 if GOLDEN["themes"][key]["ascending"] else -1
                self.assertTrue(np.all(sign * np.diff(rgb, axis=0) >= 0))
                self.assertTrue(np.all(sign * np.diff(lstar(rgb)) > 0))
                # Native Matplotlib uint8 truncation, and nearest-channel rounding.
                for quantized in (cmap(np.arange(256), bytes=True)[:, :3], np.rint(rgb * 255).astype(np.uint8)):
                    steps = sign * np.diff(lstar(quantized / 255))
                    self.assertTrue(np.all(steps >= 0))
                    # Repeats may occur, but no extended saturated endpoint run.
                    self.assertFalse(np.all(quantized[:3] == quantized[0]))
                    self.assertFalse(np.all(quantized[-3:] == quantized[-1]))
                repeats = np.count_nonzero(np.all(np.diff(cmap(np.arange(256), bytes=True)[:, :3].astype(int), axis=0) == 0, axis=1))
                self.assertEqual(repeats, GOLDEN["themes"][key]["eight_bit_repeats"])

    def test_primary_seed_and_surface_label_polarity_not_theme_names(self):
        base = THEMES["lavender_fog_notebook"]
        original = sequential_colormap(base)(np.arange(256))
        # Other former stops and names cannot influence quantitative colors.
        changed = replace(base, key="custom", panel="#000000", summary_core="#FFFFFF", field="#EEEEEE")
        np.testing.assert_array_equal(original, sequential_colormap(changed)(np.arange(256)))
        inverted = replace(base, field=base.label, label=base.field)
        np.testing.assert_array_equal(original[::-1], sequential_colormap(inverted)(np.arange(256)))
        other = replace(base, primary=THEMES["slipware"].primary)
        self.assertFalse(np.array_equal(original, sequential_colormap(other)(np.arange(256))))
        # Primary seeds outside [24,92] remain bracketed without clipping.
        for seed in ("#000000", "#FFFFFF"):
            np.testing.assert_allclose(lstar(sequential_colormap(replace(base, primary=seed))(np.array([0, 255]))[:, :3]), [92, 24], atol=1e-12)

    def test_numeric_mapping_equal_probes_extrema_and_normalization(self):
        values = np.array(FIXTURE["values"])
        for key in THEMES:
            with self.subTest(theme=key):
                fig, ax = heatmap(values, theme=key)
                image = ax.images[0]
                np.testing.assert_array_equal(image.get_array(), values)
                np.testing.assert_array_equal(image.norm(values), values)
                sign = 1 if GOLDEN["themes"][key]["ascending"] else -1
                for byte_output in (False, True):
                    rgba = image.cmap(image.norm(values), bytes=byte_output)
                    rgb = rgba[..., :3] / (255 if byte_output else 1)
                    lightness = sign * lstar(rgb)
                    probes = rgba[6, 1::2]
                    np.testing.assert_array_equal(probes, np.tile(probes[0], (len(probes), 1)))
                    for row, light in zip(values, lightness):
                        numeric_max = (row[1:-1] > row[:-2]) & (row[1:-1] > row[2:])
                        numeric_min = (row[1:-1] < row[:-2]) & (row[1:-1] < row[2:])
                        np.testing.assert_array_equal(numeric_max, (light[1:-1] > light[:-2]) & (light[1:-1] > light[2:]))
                        np.testing.assert_array_equal(numeric_min, (light[1:-1] < light[:-2]) & (light[1:-1] < light[2:]))
                    for row in (0, 4, 5):
                        self.assertTrue(np.all(np.diff(lightness[row]) >= 0))
                        self.assertGreater(lightness[row, -1], lightness[row, 0])
                plt.close(fig)

    def test_only_colormap_changes_in_ordinary_heatmap(self):
        spec = PlotSpec("Heatmap", "Same numeric observations", xlabel="x", ylabel="y", note="No rescaling", signature="figurestead")
        for key in THEMES:
            for values in (np.array([[-5., 0., 7.], [7., -5., 2.]]), np.full((2, 3), 2.)):
                with self.subTest(theme=key, constant=np.ptp(values) == 0):
                    args = dict(theme=key, xlabels=["A", "B", "C"], ylabels=["a", "b"], spec=spec)
                    with patch("figurestead.plots.sequential_colormap", old_colormap):
                        fig, ax = heatmap(values, **args); fig.canvas.draw()
                        baseline = artist_contract(fig, ax); plt.close(fig)
                    fig, ax = heatmap(values, **args); fig.canvas.draw()
                    self.assertEqual(artist_contract(fig, ax), baseline)
                    plt.close(fig)

    def test_themes_not_mutated(self):
        root = Path(__file__).resolve().parents[2] / "src/figurestead/themes"
        files = {p.name: p.read_bytes() for p in root.glob("*.json")}
        objects = {k: asdict(v) for k, v in THEMES.items()}
        for theme in THEMES.values():
            sequential_colormap(theme)
            fig, _ = heatmap([[0, 1], [1, 0]], theme=theme); plt.close(fig)
        self.assertEqual(objects, {k: asdict(v) for k, v in THEMES.items()})
        self.assertEqual(files, {p.name: p.read_bytes() for p in root.glob("*.json")})

    def test_categorical_matrix_keeps_its_own_ramp_and_status_policy(self):
        data = {"xCategories": ["A", "B", "C"], "yCategories": ["row"],
                "valueScale": {"domain": [0, 1], "label": "Value"},
                "cells": [{"x": "A", "y": "row", "value": .5, "status": "observed", "label": "0.5"},
                          {"x": "B", "y": "row", "value": None, "status": "missing"},
                          {"x": "C", "y": "row", "value": None, "status": "insufficient"}]}
        for key, theme in THEMES.items():
            with self.subTest(theme=key), patch("figurestead.plots.sequential_colormap", side_effect=AssertionError("ordinary heatmap only")):
                fig, ax = categorical_matrix(data, theme=key)
                expected = colors.LinearSegmentedColormap.from_list("matrix", [(0, theme.panel), (.68, theme.primary), (1, theme.summary_core)])
                np.testing.assert_array_equal(ax.images[0].cmap(np.linspace(0, 1, 256)), expected(np.linspace(0, 1, 256)))
                self.assertEqual(np.ma.count_masked(ax.images[0].get_array()), 2)
                fig.canvas.draw(); plt.close(fig)


if __name__ == "__main__":
    unittest.main()
