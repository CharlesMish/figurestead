"""Owned regular headings retain their face across draw and SVG text export."""
from dataclasses import replace
from io import BytesIO
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties, findfont
from figurestead import PROFILES, PlotSpec, heatmap, histogram, line, scatter, strip_summary


class RegularHeadingTests(unittest.TestCase):
    def tearDown(self):
        plt.close("all")

    def test_all_plot_routes_and_shipped_profiles_export_regular_headings(self):
        routes = {
            "line": lambda **kw: line([0, 1, 2], [1, 2, 3], series_slots=[1], **kw),
            "scatter": lambda **kw: scatter([0, 1], [1, 2], **kw),
            "strip_summary": lambda **kw: strip_summary(["A", "A", "B", "B"], [1, 2, 2, 3], **kw),
            "histogram": lambda **kw: histogram([1, 2, 3], **kw),
            "heatmap": lambda **kw: heatmap([[1, 2], [3, 4]], **kw),
        }
        # Square markers isolate heading compatibility from NumPy's separate
        # masked circular-marker issue at the declared dependency minimum.
        for key, profile in PROFILES.items():
            for route, make in routes.items():
                with self.subTest(profile=key, route=route):
                    fig, ax = make(profile=key, spec=PlotSpec("Regular heading"))
                    title = ax._left_title
                    expected = FontProperties(family=profile.title_family, weight=400)
                    self.assertEqual(findfont(title.get_fontproperties()), findfont(expected))
                    fig.canvas.draw()
                    bounds = title.get_window_extent(fig.canvas.get_renderer()).bounds
                    for fmt, fonttype in (("png", "path"), ("pdf", "path"), ("svg", "path"), ("svg", "none")):
                        with self.subTest(format=fmt, fonttype=fonttype):
                            output = BytesIO()
                            with matplotlib.rc_context({"svg.fonttype": fonttype}):
                                fig.savefig(output, format=fmt)
                            self.assertGreater(len(output.getvalue()), 1000)
                            if fmt == "svg" and fonttype == "none":
                                texts = [e.text for e in ET.fromstring(output.getvalue()).iter("{http://www.w3.org/2000/svg}text")]
                                self.assertIn("Regular heading", texts)
                    fig.canvas.draw()
                    self.assertEqual(title.get_window_extent(fig.canvas.get_renderer()).bounds, bounds)
                    plt.close(fig)

    def test_custom_profiles_and_caller_weights_survive_draw_and_export(self):
        for key, shipped in list(PROFILES.items()):
            custom = replace(shipped)
            for by_key in (False, True):
                with self.subTest(profile=key, by_key=by_key), patch.dict(PROFILES, {key: custom}):
                    fig, ax = scatter([0, 1], [1, 2], profile=key if by_key else custom)
                    self.assertEqual(ax._left_title.get_fontweight(), "medium")
                    ax._left_title.set_fontweight(700)
                    fig.canvas.draw()
                    fig.savefig(BytesIO(), format="png")
                    self.assertEqual(ax._left_title.get_fontweight(), 700)
                    plt.close(fig)
            fig, ax = scatter([0, 1], [1, 2], profile=shipped)
            ax._left_title.set_fontweight("bold")
            with matplotlib.rc_context({"svg.fonttype": "none"}):
                fig.savefig(BytesIO(), format="svg")
            self.assertEqual(ax._left_title.get_fontweight(), "bold")
            plt.close(fig)


if __name__ == "__main__":
    unittest.main()
