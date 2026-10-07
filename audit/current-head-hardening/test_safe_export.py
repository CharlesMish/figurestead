"""Failed renders preserve destinations; successful exports retain savefig behavior."""

import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.artist import Artist

from figurestead import PlotSpec, line, save_figure
from figurestead import _export


class SafeExportTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def tearDown(self):
        plt.close("all")

    def figure(self, *, note="", direct_labels=False):
        return line([0, 1, 2], [[1, 2, 3], [3, 2, 4], [4, 5, 6]],
                    labels=["Control", "Treatment", "Reference"],
                    direct_labels=direct_labels,
                    spec=PlotSpec("Observations", xlabel="Sampling day",
                                  ylabel="Value", note=note, signature=""))

    def assert_complete(self, destination, fmt):
        data = destination.read_bytes()
        if fmt == "svg":
            self.assertEqual(ET.fromstring(data).tag, "{http://www.w3.org/2000/svg}svg")
        else:
            self.assertTrue(data.startswith(b"\x89PNG"))
        return data

    def assert_directory(self, *paths):
        self.assertEqual(set(self.root.iterdir()), set(paths))

    def test_footer_failure_new_existing_and_same_figure_recovery(self):
        # A late footer exception can leave partial vector output in savefig.
        # Exercise genuine note failure, not just a mocked savefig exception.
        for fmt in ("png", "svg"):
            for existing in (False, True):
                with self.subTest(format=fmt, existing=existing):
                    target = self.root / ("observations." + fmt)
                    original = None
                    if existing:
                        good, _ = self.figure()
                        save_figure(good, target)
                        original = self.assert_complete(target, fmt)
                    fig, ax = self.figure(note="Source: station observations; no imputation.")
                    fig.set_size_inches(5, 3.2)
                    fig.subplots_adjust(bottom=.02)
                    position = ax.get_position(original=True).bounds
                    domains = ax.get_xlim(), ax.get_ylim()
                    with self.assertRaisesRegex(ValueError, "PlotSpec.note: insufficient footer space"):
                        save_figure(fig, target)
                    self.assertEqual(target.exists(), existing)
                    if existing:
                        self.assertEqual(target.read_bytes(), original)
                    self.assert_directory(*([target] if existing else []))
                    self.assertEqual(ax.get_position(original=True).bounds, position)
                    self.assertEqual((ax.get_xlim(), ax.get_ylim()), domains)

                    fig.subplots_adjust(bottom=.35)
                    self.assertEqual(save_figure(fig, target), target)
                    recovered = self.assert_complete(target, fmt)
                    if existing:
                        self.assertNotEqual(recovered, original)
                    self.assertEqual((ax.get_xlim(), ax.get_ylim()), domains)
                    self.assert_directory(target)
                    target.unlink()

    def test_vector_only_draw_failure_cannot_be_preflighted_with_agg(self):
        class VectorFailure(Artist):
            def draw(self, renderer):
                if type(renderer).__name__ != "RendererAgg":
                    raise ValueError("synthetic vector-only failure")

        fig, _ = plt.subplots()
        fig.add_artist(VectorFailure())
        fig.canvas.draw()  # This succeeds but does not certify an SVG render.
        target = self.root / "vector.svg"
        with self.assertRaisesRegex(ValueError, "synthetic vector-only failure"):
            save_figure(fig, target)
        self.assert_directory()

    def test_format_inference_matches_matplotlib_paths(self):
        fig, _ = self.figure()
        cases = [
            ("inferred.SVG", {}, "inferred.SVG", "svg"),
            ("default", {}, "default.png", "png"),
            ("trailing.", {}, "trailing.png", "png"),
            ("explicit", {"format": "svg"}, "explicit", "svg"),
            ("mismatch.png", {"format": "svg"}, "mismatch.png", "svg"),
            ("none", {"format": None}, "none.png", "png"),
        ]
        for name, kwargs, actual, fmt in cases:
            with self.subTest(path=name):
                target = save_figure(fig, self.root / name, **kwargs)
                self.assertEqual(target, self.root / actual)
                self.assert_complete(target, fmt)
                target.unlink()
        with matplotlib.rc_context({"savefig.format": "svg"}):
            target = save_figure(fig, self.root / "default-vector")
        self.assertEqual(target, self.root / "default-vector.svg")
        self.assert_complete(target, "svg")
        self.assert_directory(target)

    def test_save_options_and_direct_label_lifecycle_are_preserved(self):
        fig, ax = self.figure(direct_labels=True)
        methods = fig.draw, fig.savefig
        for fmt in ("png", "svg"):
            for crop, transparent in ((None, False), ("tight", False), (None, True)):
                with self.subTest(format=fmt, crop=crop, transparent=transparent):
                    kwargs = dict(format=fmt, dpi=170, transparent=transparent,
                                  bbox_inches=crop, pad_inches=.25)
                    if fmt == "svg":
                        kwargs["metadata"] = {"Date": None}
                    expected = io.BytesIO()
                    with matplotlib.rc_context({"svg.hashsalt": "safe-export-test"}):
                        fig.savefig(expected, **kwargs)
                        target = save_figure(fig, self.root / ("direct." + fmt), **kwargs)
                    self.assertEqual(target.read_bytes(), expected.getvalue())
                    self.assertEqual(ax._figurestead_direct_labels.result["status"],
                                     "fallback" if crop or transparent else "placed")
                    self.assertFalse(ax._figurestead_direct_labels.export_unsupported)
                    self.assertEqual((fig.draw, fig.savefig), methods)
                    target.unlink()
        self.assert_directory()

    def test_partial_write_failure_propagates_and_cleans_temporary(self):
        fig, _ = self.figure()
        target = self.root / "existing.svg"
        save_figure(fig, target)
        original = target.read_bytes()
        error = OSError("simulated output write failure")

        def fail(stream, **kwargs):
            stream.write(b"<svg>partial")
            raise error

        with patch.object(fig, "savefig", side_effect=fail):
            with self.assertRaises(OSError) as raised:
                save_figure(fig, target)
        self.assertIs(raised.exception, error)
        self.assertEqual(target.read_bytes(), original)
        self.assert_directory(target)

    def test_close_failure_does_not_replace_destination(self):
        fig, _ = self.figure()
        target = self.root / "existing.png"
        save_figure(fig, target)
        original = target.read_bytes()
        factory = tempfile.NamedTemporaryFile
        error = OSError("simulated close failure")

        class CloseFailure:
            def __init__(self, **kwargs):
                self.stream = factory(**kwargs)

            def __enter__(self):
                return self.stream.__enter__()

            def __exit__(self, *args):
                self.stream.__exit__(*args)
                raise error

        with patch.object(_export.tempfile, "NamedTemporaryFile", CloseFailure):
            with self.assertRaises(OSError) as raised:
                save_figure(fig, target)
        self.assertIs(raised.exception, error)
        self.assertEqual(target.read_bytes(), original)
        self.assert_directory(target)

    def test_replacement_failure_preserves_existing_file_and_cleans_up(self):
        fig, _ = self.figure()
        target = self.root / "existing.svg"
        save_figure(fig, target)
        original = target.read_bytes()
        error = PermissionError("simulated replacement failure")
        with patch.object(_export.os, "replace", side_effect=error):
            with self.assertRaises(PermissionError) as raised:
                save_figure(fig, target)
        self.assertIs(raised.exception, error)
        self.assertEqual(target.read_bytes(), original)
        self.assert_directory(target)

    def test_bad_format_and_stream_rejection_leave_no_temporary(self):
        fig, _ = self.figure()
        target = self.root / "invalid.badformat"
        with self.assertRaisesRegex(ValueError, "not supported"):
            save_figure(fig, target)
        with self.assertRaises(TypeError):
            save_figure(fig, io.BytesIO())
        with self.assertRaises(FileNotFoundError):
            save_figure(fig, self.root / "missing" / "figure.svg")
        self.assert_directory()


if __name__ == "__main__":
    unittest.main()
