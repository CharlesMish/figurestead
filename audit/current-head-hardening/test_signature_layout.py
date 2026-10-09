"""Optional branding stays outside evidence and yields to authored layout."""

import io
import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.text import Text
import numpy as np

from figurestead import THEMES, PlotSpec, line, strip_summary
from figurestead._note import NoteText
from figurestead._signature import SignatureText


X = [0, 1, 2, 3, 4]
LOW_ENDPOINTS = [[2, 2.5, 3.5, 3, 2], [5, 4, 3, 2, 1]]
SOURCE = "Source: synthetic regression observations; no filtering or imputation."


class SignatureLayoutTests(unittest.TestCase):
    def tearDown(self):
        plt.close("all")

    def make(self, **kwargs):
        options = dict(labels=["Tributary", "Downstream"], series_slots=[2, 1],
                       spec=PlotSpec("Observations"))
        options.update(kwargs)
        return line(X, LOW_ENDPOINTS, **options)

    def signature(self, ax):
        found = [text for text in ax.texts if isinstance(text, SignatureText)]
        self.assertEqual(len(found), 1)
        return found[0]

    def assert_safe(self, signature, renderer):
        box = signature.get_window_extent(renderer)
        if box.width == 0 or box.height == 0:
            return False
        ax, frame = signature.axes, signature.figure.bbox
        tolerance = 1e-7
        self.assertGreaterEqual(box.x0, max(frame.x0, ax.bbox.x0) - tolerance)
        self.assertLessEqual(box.x1, min(frame.x1, ax.bbox.x1) + tolerance)
        self.assertGreaterEqual(box.y0, frame.y0 - tolerance)
        self.assertLess(box.y1, ax.bbox.y0)
        axis_box = ax.xaxis.get_tightbbox(renderer)
        if ax.axison and ax.xaxis.get_visible() and axis_box is not None:
            self.assertLess(box.y1, axis_box.y0)
        for text in ax.texts:
            if text.get_visible() and (isinstance(text, NoteText)
                                      or getattr(text, "_figurestead_strip_count", False)):
                self.assertLess(box.y1, text.get_window_extent(renderer).y0)
        return True

    def export(self, fig, fmt, **kwargs):
        observations = []
        original = SignatureText.draw

        def checked_draw(signature, renderer):
            original(signature, renderer)
            observations.append(self.assert_safe(signature, renderer))

        stream = io.BytesIO()
        with patch.object(SignatureText, "draw", checked_draw):
            with matplotlib.rc_context({"svg.fonttype": "none"}):
                fig.savefig(stream, format=fmt, **kwargs)
        self.assertTrue(observations)
        output = stream.getvalue()
        if fmt == "svg":
            ET.fromstring(output)
        elif fmt == "png":
            self.assertTrue(output.startswith(b"\x89PNG"))
        else:
            self.assertTrue(output.startswith(b"%PDF"))
        return output, observations

    def test_low_endpoint_default_signature_no_longer_forces_legend(self):
        # The field tester's independent repro: the lower-right square used to
        # share its association corridor with the fixed branding text.
        for theme in THEMES:
            results = []
            for signature in ("figurestead", ""):
                with self.subTest(theme=theme, signature=signature):
                    fig, ax = self.make(theme=theme, direct_labels=True,
                                        spec=PlotSpec("T", signature=signature))
                    fig.canvas.draw()
                    result = ax._figurestead_direct_labels.result
                    results.append((result["status"], result["reason"]))
                    self.assertEqual(result["status"], "placed")
                    plt.close(fig)
            self.assertEqual(results[0], results[1])

    def test_signature_changes_no_pixels_in_the_evidence_rectangle(self):
        evidence = []
        for signature in ("figurestead", ""):
            fig, ax = self.make(direct_labels=False,
                                spec=PlotSpec("T", signature=signature))
            fig.set_size_inches(5, 3.2)
            fig.set_dpi(180)
            fig.canvas.draw()
            pixels = np.asarray(fig.canvas.buffer_rgba()).copy()
            height = pixels.shape[0]
            x0, y0, x1, y1 = ax.bbox.extents
            # Compare actual evidence pixels, including the terminal marker;
            # avoid a dependency on signature z-order or its chosen position.
            evidence.append(pixels[int(np.ceil(height-y1)):int(np.floor(height-y0)),
                                   int(np.ceil(x0)):int(np.floor(x1))])
            plt.close(fig)
        np.testing.assert_array_equal(*evidence)

    def test_first_exports_measure_the_actual_renderer_below_note_and_counts(self):
        for fmt in ("png", "svg", "pdf"):
            for dpi in (96, 200):
                with self.subTest(format=fmt, dpi=dpi):
                    fig, ax = strip_summary(
                        ["North"] * 3 + ["South"] * 3, [1, 4, 9, 2, 5, 10],
                        spec=PlotSpec("Observations", xlabel="Station", note=SOURCE))
                    # Deliberately provide space; the optional signature must
                    # not take space away from the required source note.
                    fig.subplots_adjust(bottom=.30)
                    domains = ax.get_xlim(), ax.get_ylim()
                    position = ax.get_position(original=True).bounds
                    output, placed = self.export(fig, fmt, dpi=dpi)
                    self.assertTrue(all(placed))
                    self.assertEqual((ax.get_xlim(), ax.get_ylim()), domains)
                    self.assertEqual(ax.get_position(original=True).bounds, position)
                    if fmt == "svg":
                        texts = [node.text for node in ET.fromstring(output).iter()
                                 if node.tag.endswith("}text")]
                        self.assertIn("figurestead", texts)
                    plt.close(fig)

    def test_resize_omits_and_restores_without_accumulating_artists(self):
        fig, ax = self.make(spec=PlotSpec("T", xlabel="Sampling day"))
        signature = self.signature(ax)
        count = len(ax.get_children()), len(fig.artists)
        position = ax.get_position(original=True).bounds
        domains = ax.get_xlim(), ax.get_ylim()
        outcomes, images = [], []
        for height in (5.2, .7, 5.2, .7):
            fig.set_size_inches(8.4, height)
            fig.canvas.draw()
            outcomes.append(signature.get_window_extent(fig.canvas.get_renderer()).width > 0)
            images.append(np.asarray(fig.canvas.buffer_rgba()).copy())
            self.assertEqual((len(ax.get_children()), len(fig.artists)), count)
            self.assertEqual(ax.get_position(original=True).bounds, position)
            self.assertEqual((ax.get_xlim(), ax.get_ylim()), domains)
        self.assertEqual(outcomes, [True, False, True, False])
        np.testing.assert_array_equal(images[0], images[2])
        np.testing.assert_array_equal(images[1], images[3])

    def test_long_signature_and_no_footer_omit_without_mutating_layout(self):
        for signature, bottom in (("Long branding " * 100, .25), ("figurestead", .01)):
            with self.subTest(signature=signature[:20], bottom=bottom):
                fig, ax = plt.subplots(figsize=(8.4, 5.2))
                fig.subplots_adjust(bottom=bottom)
                self.make(ax=ax, spec=PlotSpec("T", signature=signature))
                position = ax.get_position(original=True).bounds
                fig.canvas.draw()
                self.assertEqual(self.signature(ax).get_window_extent(fig.canvas.get_renderer()).width, 0)
                self.assertEqual(ax.get_position(original=True).bounds, position)
                self.assertEqual(self.signature(ax).get_text(), signature)
                plt.close(fig)

    def test_caller_axes_methods_domains_and_artist_lifecycle(self):
        fig, (ax, sibling) = plt.subplots(1, 2, figsize=(12, 6))
        fig.subplots_adjust(bottom=.25)
        ax.set_xlim(-2, 7)
        ax.set_ylim(-4, 15)
        positions = [item.get_position(original=True).bounds for item in (ax, sibling)]
        methods = fig.draw, fig.savefig, ax.get_tightbbox
        caller = ax.text(.3, .4, "figurestead", transform=ax.transAxes)
        self.make(ax=ax)
        first = self.signature(ax)
        self.assertFalse(first.get_in_layout())
        fig.canvas.draw()
        self.assertEqual((fig.draw, fig.savefig, ax.get_tightbbox), methods)
        self.assertEqual([item.get_position(original=True).bounds for item in (ax, sibling)], positions)
        self.assertEqual((ax.get_xlim(), ax.get_ylim()), ((-2, 7), (-4, 15)))
        self.make(ax=ax, spec=PlotSpec("T", signature="Replacement"))
        self.assertNotIn(first, ax.texts)
        self.assertEqual(self.signature(ax).get_text(), "Replacement")
        self.make(ax=ax, spec=PlotSpec("T", signature=""))
        self.assertFalse(any(isinstance(text, SignatureText) for text in ax.texts))
        self.assertIn(caller, ax.texts)
        self.make(ax=ax)
        ax.clear()
        self.assertFalse(any(isinstance(text, SignatureText) for text in ax.texts))
        self.make(ax=ax)
        ax.remove()
        fig.canvas.draw()
        self.assertEqual(fig.artists, [])

    def test_authored_footer_annotation_takes_priority_and_removal_restores(self):
        for owner in ("axes", "figure"):
            with self.subTest(owner=owner):
                fig, ax = self.make()
                fig.subplots_adjust(bottom=.25)
                signature = self.signature(ax)
                fig.canvas.draw()
                box = signature.get_window_extent(fig.canvas.get_renderer())
                self.assertGreater(box.width, 0)
                xy = fig.transFigure.inverted().transform(((box.x0+box.x1)/2, (box.y0+box.y1)/2))
                if owner == "axes":
                    caller = ax.text(*xy, "Author annotation", transform=fig.transFigure,
                                     ha="center", va="center", fontsize=12)
                else:
                    caller = fig.text(*xy, "Author annotation", ha="center", va="center", fontsize=12)
                fig.canvas.draw()
                self.assertEqual(signature.get_window_extent(fig.canvas.get_renderer()).width, 0)
                caller.remove()
                fig.canvas.draw()
                self.assertGreater(signature.get_window_extent(fig.canvas.get_renderer()).width, 0)
                plt.close(fig)

    def test_other_panel_evidence_takes_priority(self):
        fig, ax = self.make()
        fig.subplots_adjust(bottom=.30)
        signature = self.signature(ax)
        fig.canvas.draw()
        box = signature.get_window_extent(fig.canvas.get_renderer())
        self.assertGreater(box.width, 0)
        bounds = fig.transFigure.inverted().transform_bbox(box).expanded(1.5, 2)
        sibling = fig.add_axes(bounds.bounds)
        sibling.plot([0, 1], [0, 1])
        position = ax.get_position(original=True).bounds
        fig.canvas.draw()
        self.assertEqual(signature.get_window_extent(fig.canvas.get_renderer()).width, 0)
        self.assertEqual(ax.get_position(original=True).bounds, position)
        sibling.remove()
        fig.canvas.draw()
        self.assertGreater(signature.get_window_extent(fig.canvas.get_renderer()).width, 0)

    def test_neighboring_panel_title_takes_priority_on_first_export(self):
        fig, ax = self.make()
        fig.subplots_adjust(bottom=.45)
        signature = self.signature(ax)
        fig.canvas.draw()
        box = signature.get_window_extent(fig.canvas.get_renderer())
        self.assertGreater(box.width, 0)
        sibling = fig.add_axes([.125, .08, .775, .15])
        sibling.plot([0, 1], [0, 1])
        # An authored panel header can extend beyond its evidence rectangle.
        # Its explicit position must be respected even before that axes draws.
        _, y = sibling.transAxes.inverted().transform((box.x1, (box.y0+box.y1)/2))
        title = sibling.set_title("Neighboring panel header", loc="right", y=y,
                                  va="center", fontsize=12)
        self.assertFalse(box.overlaps(sibling.bbox))
        self.assertTrue(box.overlaps(title.get_window_extent(fig.canvas.get_renderer())))
        _, placed = self.export(fig, "svg")
        self.assertFalse(any(placed))

    def test_inset_panel_evidence_takes_priority_and_removal_restores(self):
        fig, ax = self.make()
        fig.subplots_adjust(bottom=.30)
        signature = self.signature(ax)
        fig.canvas.draw()
        box = signature.get_window_extent(fig.canvas.get_renderer())
        self.assertGreater(box.width, 0)
        bounds = fig.transFigure.inverted().transform_bbox(box).expanded(1.5, 2)
        inset = ax.inset_axes(bounds.bounds, transform=fig.transFigure)
        inset.plot([0, 1], [0, 1])
        self.assertIn(inset, ax.child_axes)
        self.assertNotIn(inset, fig.axes)
        fig.canvas.draw()
        self.assertEqual(signature.get_window_extent(fig.canvas.get_renderer()).width, 0)
        inset.remove()
        fig.canvas.draw()
        self.assertGreater(signature.get_window_extent(fig.canvas.get_renderer()).width, 0)

    def test_footer_tables_and_unclipped_images_take_priority(self):
        for kind in ("table", "image"):
            with self.subTest(kind=kind):
                fig, ax = self.make()
                fig.subplots_adjust(bottom=.30)
                signature = self.signature(ax)
                fig.canvas.draw()
                box = signature.get_window_extent(fig.canvas.get_renderer())
                self.assertGreater(box.width, 0)
                limits = ax.get_xlim(), ax.get_ylim()
                if kind == "table":
                    bounds = ax.transAxes.inverted().transform_bbox(box).expanded(1.5, 2)
                    authored = ax.table(cellText=[["Authored table"]], bbox=bounds.bounds)
                    authored.set_clip_on(False)
                else:
                    bounds = ax.transData.inverted().transform_bbox(box).expanded(1.5, 2)
                    ax.set_autoscale_on(False)
                    authored = ax.imshow([[0, 1], [1, 0]], aspect="auto", origin="lower",
                                         extent=(bounds.x0, bounds.x1, bounds.y0, bounds.y1),
                                         clip_on=False)
                fig.canvas.draw()
                self.assertEqual(signature.get_window_extent(fig.canvas.get_renderer()).width, 0)
                self.assertEqual((ax.get_xlim(), ax.get_ylim()), limits)
                authored.remove()
                fig.canvas.draw()
                self.assertGreater(signature.get_window_extent(fig.canvas.get_renderer()).width, 0)
                plt.close(fig)

    def test_annotation_background_is_protected_beyond_glyph_bounds(self):
        for owner in ("axes", "figure"):
            with self.subTest(owner=owner):
                fig, ax = self.make()
                fig.subplots_adjust(bottom=.30)
                signature = self.signature(ax)
                fig.canvas.draw()
                renderer = fig.canvas.get_renderer()
                box = signature.get_window_extent(renderer)
                self.assertGreater(box.width, 0)
                # The glyphs themselves are clear; only the deliberately padded
                # background reaches the branding's candidate region.
                x, y = fig.transFigure.inverted().transform(
                    ((box.x0+box.x1)/2, box.y0-renderer.points_to_pixels(6)))
                options = dict(ha="center", va="top", fontsize=8,
                               bbox={"boxstyle": "square,pad=2", "facecolor": "white"})
                authored = (ax.text(x, y, "Note", transform=fig.transFigure, **options)
                            if owner == "axes" else fig.text(x, y, "Note", **options))
                authored.update_bbox_position_size(renderer)
                self.assertFalse(box.overlaps(authored.get_window_extent(renderer)))
                self.assertTrue(box.overlaps(authored.get_bbox_patch().get_window_extent(renderer)))
                fig.canvas.draw()
                self.assertEqual(signature.get_window_extent(fig.canvas.get_renderer()).width, 0)
                authored.remove()
                fig.canvas.draw()
                self.assertGreater(signature.get_window_extent(fig.canvas.get_renderer()).width, 0)
                plt.close(fig)

    def test_later_panel_automatic_title_is_protected_during_first_paint(self):
        for fmt in ("png", "svg", "pdf"):
            with self.subTest(format=fmt):
                fig, ax = self.make()
                fig.subplots_adjust(bottom=.45)
                sibling = fig.add_axes([.125, .05, .775, .25])
                sibling.plot([0, 1], [0, 1])
                sibling.xaxis.tick_top()
                sibling.xaxis.set_label_position("top")
                sibling.set_xlabel("X LABEL")
                title = sibling.set_title("SIBLING HEADER", loc="right")
                painted_signatures, painted_titles = [], []
                original = Text.draw

                def record_paint(text, renderer):
                    # Record the boxes of text actually painted, not a later
                    # signature query after the sibling updated its title.
                    if isinstance(text, SignatureText):
                        painted_signatures.append(Text.get_window_extent(text, renderer).frozen())
                    elif text is title:
                        painted_titles.append(Text.get_window_extent(text, renderer).frozen())
                    return original(text, renderer)

                with patch.object(Text, "draw", record_paint):
                    fig.savefig(io.BytesIO(), format=fmt)
                self.assertTrue(painted_titles)
                for branding in painted_signatures:
                    for header in painted_titles:
                        self.assertFalse(branding.overlaps(header))
                plt.close(fig)

    def test_multi_panel_best_legends_do_not_recursively_replan_signatures(self):
        fig, axes = plt.subplots(2, 3, figsize=(18, 10))
        fig.subplots_adjust(bottom=.16, hspace=.6)
        for ax in axes.flat:
            self.make(ax=ax)
        calls = []
        original = SignatureText._obstacles

        def counted(signature, renderer):
            calls.append(signature)
            yield from original(signature, renderer)

        with patch.object(SignatureText, "_obstacles", counted):
            fig.canvas.draw()
        # Each best legend measures axes text. That nested measurement must not
        # trigger another whole-figure collision pass and recurse through all
        # other legends. A generous linear bound avoids timing assumptions.
        self.assertGreaterEqual(len(calls), len(axes.flat))
        self.assertLessEqual(len(calls), 4 * len(axes.flat))

    def test_left_aligned_panel_signature_and_tight_layout_exports(self):
        # Poses previously moved branding to the lower-left evidence corner.
        # Exercise that route as well as layout engines/crops where branding
        # may disappear rather than demanding additional allocation.
        for engine in (None, "tight", "constrained"):
            with self.subTest(engine=engine):
                fig, ax = self.make(pose="scientific",
                                    spec=PlotSpec("T", xlabel="Sampling day"))
                if engine:
                    fig.set_layout_engine(engine)
                self.export(fig, "png")
                self.export(fig, "svg", bbox_inches="tight", pad_inches=0)
                self.assertFalse(self.signature(ax).get_in_layout())
                plt.close(fig)

    def test_ordinary_corridor_annotation_still_forces_direct_label_fallback(self):
        fig, ax = self.make(direct_labels=True)
        fig.canvas.draw()
        self.assertEqual(ax._figurestead_direct_labels.result["status"], "placed")
        ax.text(4, 1, "Authored evidence annotation", transform=ax.transData,
                ha="right", va="center")
        fig.canvas.draw()
        self.assertEqual(ax._figurestead_direct_labels.result["status"], "fallback")
        self.assertEqual(ax._figurestead_direct_labels.result["reason"], "unsupported-layout")

    def test_arrow_annotation_without_text_takes_priority(self):
        fig, ax = self.make()
        fig.subplots_adjust(bottom=.3)
        fig.canvas.draw()
        signature = self.signature(ax)
        renderer = fig.canvas.get_renderer()
        box = signature.get_window_extent(renderer)
        self.assertGreater(box.width, 0)
        inv = fig.transFigure.inverted()
        y = (box.y0 + box.y1) / 2
        arrow = ax.annotate(
            "", xy=inv.transform((box.x1 + 15, y)),
            xytext=inv.transform((box.x0 - 15, y)),
            xycoords="figure fraction", annotation_clip=False,
            arrowprops={"arrowstyle": "->", "linewidth": 3})
        self.assertTrue(box.overlaps(arrow.get_window_extent(renderer)))
        for fmt in ("png", "svg", "pdf"):
            with self.subTest(format=fmt):
                _, placed = self.export(fig, fmt)
                self.assertFalse(any(placed))
        arrow.remove()
        fig.canvas.draw()
        self.assertGreater(signature.get_window_extent(renderer).width, 0)

    def test_required_note_error_and_recovery_are_unchanged(self):
        for fmt in ("png", "svg", "pdf"):
            with self.subTest(format=fmt):
                fig, ax = self.make(spec=PlotSpec("T", xlabel="Sampling day", note=SOURCE))
                fig.set_size_inches(5, 3.2)
                fig.subplots_adjust(bottom=.02)
                with self.assertRaisesRegex(ValueError, "PlotSpec.note: insufficient footer space"):
                    fig.savefig(io.BytesIO(), format=fmt)
                fig.subplots_adjust(bottom=.30)
                self.export(fig, fmt)
                plt.close(fig)


if __name__ == "__main__":
    unittest.main()
