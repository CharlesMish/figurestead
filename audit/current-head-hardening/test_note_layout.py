"""Ordinary footer exports, measured layout, and axes-owned note lifecycle."""

import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from figurestead import PlotSpec, heatmap, histogram, line, scatter, strip_summary
from figurestead._note import NoteText


SOURCE_NOTE = ("Source: NOAA NCEI GHCN-Daily (daily-summaries), retrieved "
               "2026-10-04. Unadjusted station observations.")


class NoteLayoutTests(unittest.TestCase):
    def tearDown(self):
        plt.close("all")

    def spec(self, note=SOURCE_NOTE, **kwargs):
        return PlotSpec("Observations", xlabel="Sampling day", ylabel="Value", note=note, **kwargs)

    def make_line(self, ax=None, **kwargs):
        options = dict(labels=["Control", "Treatment", "Reference"],
                       spec=self.spec(), theme="lavender_fog_notebook", ax=ax)
        options.update(kwargs)
        return line([0, 1, 2], [[1, 2, 3], [3, 2, 4], [4, 5, 6]], **options)

    def note(self, ax):
        notes = [text for text in ax.texts if isinstance(text, NoteText)]
        self.assertEqual(len(notes), 1)
        return notes[0]

    def assert_note(self, note, renderer):
        box = note.get_window_extent(renderer)
        ax, frame = note.axes, note.figure.bbox
        self.assertGreaterEqual(box.x0, frame.x0 - 1e-7)
        self.assertLessEqual(box.x1, frame.x1 + 1e-7)
        self.assertGreaterEqual(box.y0, frame.y0 - 1e-7)
        self.assertLessEqual(box.y1, frame.y1 + 1e-7)
        self.assertGreaterEqual(box.x0, ax.bbox.x0 - 1e-7)
        self.assertLessEqual(box.x1, ax.bbox.x1 + 1e-7)
        axis_box = ax.xaxis.get_tightbbox(renderer)
        if axis_box is not None:
            self.assertLess(box.y1, axis_box.y0)
        for count in ax.texts:
            if getattr(count, "_figurestead_strip_count", False):
                self.assertLess(box.y1, count.get_window_extent(renderer).y0)
        self.assertEqual(note.get_text().replace("\n", ""), note.authored.replace("\n", ""))

    def export(self, fig, fmt, **kwargs):
        checks = []
        original = NoteText.draw

        def checked_draw(note, renderer):
            original(note, renderer)
            self.assert_note(note, renderer)
            checks.append(type(renderer).__name__)

        out = io.BytesIO()
        with patch.object(NoteText, "draw", checked_draw), matplotlib.rc_context({"svg.fonttype": "none"}):
            fig.savefig(out, format=fmt, **kwargs)
        self.assertTrue(checks)
        if fmt == "svg":
            elements = list(ET.fromstring(out.getvalue()).iter())
            content = "".join(element.text or "" for element in elements
                              if element.tag.endswith("}text"))
            self.assertIn(self.note(fig.axes[0]).authored.replace("\n", ""), content)
        elif fmt == "png":
            self.assertTrue(out.getvalue().startswith(b"\x89PNG"))
        else:
            self.assertTrue(out.getvalue().startswith(b"%PDF"))
        return out.getvalue()

    def test_default_source_note_first_png_svg_pdf_all_plotters(self):
        factories = [self.make_line,
                     lambda: histogram([[1, 2, 3], [2, 4, 5]], spec=self.spec()),
                     lambda: strip_summary(["Chicago"] * 3 + ["Phoenix"] * 3,
                                           [1, 2, 30, 3, 4, 12], spec=self.spec()),
                     lambda: heatmap([[1, 2], [3, 4]], spec=self.spec()),
                     lambda: scatter([0, 1, 2], [1, 2, 3], spec=self.spec())]
        for factory in factories:
            for fmt in ("png", "svg", "pdf"):
                with self.subTest(factory=factory, format=fmt):
                    fig, ax = factory()
                    self.export(fig, fmt, dpi=150)
                    fig.canvas.draw()
                    self.assert_note(self.note(ax), fig.canvas.get_renderer())

    def test_direct_labels_subtitle_resize_and_export_dpi(self):
        fig, ax = self.make_line(direct_labels=True,
                                 spec=self.spec(subtitle="Three sampling conditions"))
        note = self.note(ax)
        domains = (ax.get_xlim(), ax.get_ylim())
        counts = len(ax.texts), len(fig.artists)
        baseline = ax.get_position(original=True).bounds
        outputs = []
        for width in (5.8, 10, 5.8):
            fig.set_size_inches(width, 5.2)
            outputs.append(self.export(fig, "png", dpi=150))
            self.assertEqual(ax._figurestead_direct_labels.result["status"], "placed")
            for fmt in ("svg", "pdf"):
                self.export(fig, fmt, dpi=200)
                self.assertEqual(ax._figurestead_direct_labels.result["status"], "placed")
            self.assertEqual((ax.get_xlim(), ax.get_ylim()), domains)
            self.assertEqual((len(ax.texts), len(fig.artists)), counts)
        self.assertEqual(outputs[0], outputs[2])
        fig.set_size_inches(8.4, 5.2)
        fig.canvas.draw()
        self.assertEqual(ax._figurestead_direct_labels.baseline.bounds, baseline)
        self.assert_note(note, fig.canvas.get_renderer())

    def test_caller_axes_geometry_domains_and_methods_remain_owned(self):
        fig, (ax, sibling) = plt.subplots(1, 2, figsize=(12, 6), dpi=120)
        fig.subplots_adjust(bottom=.27)
        ax.set_xlim(-2, 4)
        ax.set_ylim(-8, 20)
        position = ax.get_position(original=True).bounds
        sibling_position = sibling.get_position(original=True).bounds
        methods = fig.draw, fig.savefig, ax.get_tightbbox
        caller = ax.text(.2, .5, "Caller annotation", transform=ax.transAxes)
        self.make_line(ax)
        self.export(fig, "png")
        self.assertEqual(ax.get_position(original=True).bounds, position)
        self.assertEqual(sibling.get_position(original=True).bounds, sibling_position)
        self.assertEqual((ax.get_xlim(), ax.get_ylim()), ((-2, 4), (-8, 20)))
        self.assertEqual((fig.draw, fig.savefig, ax.get_tightbbox), methods)
        self.assertIn(caller, ax.texts)

    def test_no_note_path_has_standard_margins_and_no_managed_text(self):
        expected, ordinary = plt.subplots(figsize=(8.4, 5.2), dpi=120)
        fig, ax = self.make_line(spec=self.spec(note=""))
        self.assertEqual(ax.get_position().bounds, ordinary.get_position().bounds)
        self.assertFalse(any(isinstance(text, NoteText) for text in ax.texts))
        self.assertFalse(any("note" in key for key in vars(fig)))

    def test_clear_reuse_replacement_and_user_edits(self):
        fig, ax = self.make_line()
        first = self.note(ax)
        first.set_text("Edited source note")
        self.export(fig, "png")
        self.assertEqual(first.authored, "Edited source note")
        caller = ax.text(.25, .4, "Caller text", transform=ax.transAxes)
        self.make_line(ax, spec=self.spec(note="Replacement source"))
        self.assertNotIn(first, ax.texts)
        self.assertIn(caller, ax.texts)
        self.export(fig, "png")
        self.make_line(ax, spec=self.spec(note=""))
        self.assertFalse(any(isinstance(text, NoteText) for text in ax.texts))
        for clear in (ax.cla, ax.clear):
            self.make_line(ax)
            clear()
            self.assertFalse(any(isinstance(text, NoteText) for text in ax.texts))
            ax.plot([0, 1], [1, 2])
            fig.canvas.draw()
        self.assertEqual(fig.artists, [])

    def test_rotated_tick_labels_and_scientific_offset_are_measured(self):
        fig, ax = plt.subplots(figsize=(8.4, 6.4), dpi=120)
        fig.subplots_adjust(bottom=.4)
        self.make_line(ax)
        ax.set_xticks([0, 1, 2], ["First sampling day", "Second sampling day", "Third sampling day"], rotation=38)
        self.export(fig, "png")
        ax.set_xticks([0, 1, 2], ["0", "1", "2"])
        ax.xaxis.offsetText.set_visible(True)
        ax.set_xticks([])
        ax.xaxis.set_major_locator(matplotlib.ticker.AutoLocator())
        ax.xaxis.set_major_formatter(matplotlib.ticker.ScalarFormatter())
        ax.set_xlim(1e8, 1e8 + 2)
        self.export(fig, "svg")
        self.assertTrue(ax.xaxis.offsetText.get_text())

    def test_layout_engines_and_zero_pad_tight_exports(self):
        for engine in (None, "tight", "constrained"):
            for fmt in ("png", "svg", "pdf"):
                with self.subTest(engine=engine, format=fmt):
                    fig, ax = self.make_line()
                    if engine:
                        fig.set_layout_engine(engine)
                    self.export(fig, fmt, bbox_inches="tight", pad_inches=0)
                    self.export(fig, fmt)
                    self.assertEqual(len([a for a in ax.texts if isinstance(a, NoteText)]), 1)

    def test_impossible_footer_fails_explicitly_without_geometry_mutation(self):
        fig, ax = plt.subplots(figsize=(8.4, 5.2), dpi=120)
        fig.subplots_adjust(bottom=.02)
        self.make_line(ax)
        position, domains = ax.get_position().bounds, (ax.get_xlim(), ax.get_ylim())
        with self.assertRaisesRegex(ValueError, "PlotSpec.note: insufficient footer space"):
            fig.savefig(io.BytesIO(), format="png")
        self.assertEqual(ax.get_position().bounds, position)
        self.assertEqual((ax.get_xlim(), ax.get_ylim()), domains)
        fig.subplots_adjust(bottom=.25)
        self.export(fig, "png")
        note = self.note(ax)
        note.set_text("An extremely long source note " * 100)
        with self.assertRaisesRegex(ValueError, "PlotSpec.note: insufficient footer space"):
            fig.canvas.draw()
        note.set_text(SOURCE_NOTE)
        self.export(fig, "png")

    def test_too_narrow_failure_restores_text_then_recovers(self):
        fig, ax = self.make_line()
        note = self.note(ax)
        original = note.get_text(), note.get_position()
        ax.set_position([.2, .3, .0001, .4])
        with self.assertRaisesRegex(ValueError, "PlotSpec.note: footer is too narrow"):
            fig.canvas.draw()
        self.assertEqual((note.get_text(), note.get_position()), original)
        ax.set_position([.2, .3, .6, .4])
        self.export(fig, "png")

    def test_temporal_owned_and_faceted_engine_managed_notes(self):
        from figurestead.extensions.temporal import coverage_timeline, faceted_temporal_observations
        dates = ["2025-01-01", "2025-01-02", "2025-01-01", "2025-01-02"]
        sites = ["North", "North", "South", "South"]
        fig, ax = coverage_timeline(dates, sites, site_order=["North", "South"], spec=self.spec())
        self.export(fig, "png")
        fig, axes = faceted_temporal_observations(dates, [1, 2, 3, 4], sites,
                                                  site_order=["North", "South"], spec=self.spec())
        for fmt in ("png", "svg", "pdf"):
            fig.savefig(io.BytesIO(), format=fmt)
        fig.canvas.draw()
        self.assert_note(self.note(axes[-1]), fig.canvas.get_renderer())
        self.assertFalse(any(isinstance(text, NoteText) for text in axes[0].texts))

    def test_wrapping_preserves_math_spans_and_literal_dollars(self):
        expression = r"$T_{\max} - T_{\min}$"
        authored = "Source: NOAA daily station observations; " + expression + ", in degrees C."
        fig, ax = self.make_line(spec=self.spec(note=authored))
        fig.set_size_inches(4, 5.2)
        note = self.note(ax)
        fig.canvas.draw()
        self.assertIn("\n", note.get_text())
        self.assertIn(expression, note.get_text())
        parsed = [note._preprocess_math(row) for row in note.get_text().split("\n")]
        math_rows = [row for row, ismath in parsed if ismath]
        self.assertEqual(len(math_rows), 1)
        self.assertIn(expression, math_rows[0])
        self.assert_note(note, fig.canvas.get_renderer())
        # Export each backend with native math handling intact; SVG emits math
        # spans as several text nodes, so the plain-string SVG helper is inapt.
        for fmt in ("png", "svg", "pdf"):
            fig.savefig(io.BytesIO(), format=fmt)

        for authored in (r"Source: NOAA; $n=365$; no imputation.",
                         r"Source: a $5 instrument fee, paid once; observations unchanged.",
                         r"Source: a \$5 instrument fee; the values \$6 and \$7 are literal.",
                         r"Source: $5, $6, and $7 are literal prices; observations unchanged."):
            with self.subTest(note=authored):
                note.set_text(authored)
                fig.canvas.draw()
                self.assert_note(note, fig.canvas.get_renderer())
                math_rows = [row for row in note.get_text().split("\n") if note._preprocess_math(row)[1]]
                self.assertEqual(len(math_rows), int("$n=365$" in authored))

        note.set_text("$" + " + ".join([r"T_{\max}"] * 30) + "$")
        original = note.get_text(), note.get_position()
        with self.assertRaisesRegex(ValueError, "PlotSpec.note: footer is too narrow"):
            fig.canvas.draw()
        self.assertEqual((note.get_text(), note.get_position()), original)
        note.set_text(SOURCE_NOTE)
        self.export(fig, "png")


if __name__ == "__main__":
    unittest.main()
