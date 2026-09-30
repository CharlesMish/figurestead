"""Authored matrix domains survive colorbars, resampling, draws and exports."""
import copy
from decimal import Decimal, localcontext
import io
import math
from pathlib import Path
import sys
import unittest
import warnings
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
import matplotlib
matplotlib.use("Agg")
from matplotlib import colors
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image
from matplotlib.ticker import FixedLocator, FuncFormatter
from figurestead.extensions.matrix import categorical_matrix, normalize_matrix_data
from figurestead.themes import THEMES


def fixture(domain, *, value_format="decimal", values=None, statuses=False):
    values = list(domain) if values is None else values
    data = {
        "xCategories": [f"c{i}" for i in range(len(values))], "yCategories": ["r"],
        "valueScale": {"domain": list(domain), "label": "Synthetic value", "format": value_format},
        "cells": [{"x": f"c{i}", "y": "r", "value": value, "label": f"value {i}"}
                  for i, value in enumerate(values)],
    }
    if statuses:
        data["xCategories"] += ["missing", "insufficient", "omitted"]
        data["cells"] += [
            {"x": "missing", "y": "r", "value": None, "status": "missing"},
            {"x": "insufficient", "y": "r", "value": None, "status": "insufficient"},
        ]
    return data


def luminance(color):
    rgb = colors.to_rgb(color)
    linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    return sum(a * b for a, b in zip(linear, [.2126, .7152, .0722]))


def contrast(a, b):
    lo, hi = sorted([luminance(a), luminance(b)])
    return (hi + .05) / (lo + .05)


class MatrixDomainTests(unittest.TestCase):
    def tearDown(self):
        plt.close("all")

    def assert_endpoint_pixels(self, fig, ax, domain):
        fig.canvas.draw()
        image = ax.images[0]
        self.assertEqual(image.get_clim(), tuple(domain))
        np.testing.assert_array_equal(image.norm(domain), [0, 1])
        rgba = np.asarray(fig.canvas.buffer_rgba())
        for index, value in enumerate(domain):
            # Interior of each cell, away from annotations, borders and signature.
            x, y = ax.transData.transform((index, -.25))
            actual = rgba[rgba.shape[0] - 1 - int(y), int(x)]
            expected = image.cmap(image.norm(value), bytes=True)
            np.testing.assert_array_equal(actual, expected)

    def test_narrow_domains_all_themes_keep_endpoint_colors_after_draw(self):
        domains = [(0., math.ulp(0.)), (-math.ulp(0.), math.ulp(0.)), (1., math.nextafter(1., 2.)),
                   (-1., math.nextafter(-1., 0.)), (1e-280, 2e-280)]
        for theme in THEMES:
            for domain in domains:
                with self.subTest(theme=theme, domain=domain), warnings.catch_warnings():
                    warnings.simplefilter("error", RuntimeWarning)
                    data = fixture(domain)
                    original = copy.deepcopy(data)
                    fig, ax = categorical_matrix(data, theme=theme)
                    self.assert_endpoint_pixels(fig, ax, domain)
                    self.assertEqual(data, original)
                    np.testing.assert_array_equal(ax.images[0].get_array(), [domain])
                    plt.close(fig)

    def test_unit_colorbar_keeps_legacy_gradient_and_exact_endpoint_labels(self):
        for theme in THEMES:
            for domain in [(0., math.ulp(0.)), (1., math.nextafter(1., 2.))]:
                for kind in ("decimal", "integer", "percent"):
                    with self.subTest(theme=theme, domain=domain, format=kind):
                        fig, ax = categorical_matrix(fixture(domain, value_format=kind), theme=theme)
                        fig.canvas.draw()
                        bar = fig.axes[-1]._colorbar
                        self.assertEqual(bar.ax.get_ylim(), (0., 1.))
                        np.testing.assert_array_equal(bar.get_ticks(), [0, 1])
                        labels = [t.get_text() for t in bar.ax.get_yticklabels()]
                        decoded = [Decimal(t.rstrip("%")) / (100 if kind == "percent" else 1) for t in labels]
                        self.assertEqual(decoded, [Decimal(str(v)) for v in domain])
                        self.assertNotEqual(labels[0], labels[1])
                        self.assertEqual(bar.ax.yaxis.label.get_text(), "Synthetic value")
                        for tick in bar.ax.get_yticklabels():
                            box = tick.get_window_extent(fig.canvas.get_renderer())
                            self.assertGreaterEqual(box.x0, fig.bbox.x0)
                            self.assertLessEqual(box.x1, fig.bbox.x1)
                            self.assertGreaterEqual(box.y0, fig.bbox.y0)
                            self.assertLessEqual(box.y1, fig.bbox.y1)
                        cmap = ax.images[0].cmap
                        self.assertIs(bar.cmap, cmap)
                        np.testing.assert_array_equal(bar.solids.get_facecolors(), cmap((np.arange(cmap.N) + .5) / cmap.N))
                        plt.close(fig)

    def test_annotations_use_final_unbroadened_fill(self):
        domain = (1., math.nextafter(1., 2.))
        for key, theme in THEMES.items():
            fig, ax = categorical_matrix(fixture(domain), theme=key)
            fig.canvas.draw()
            image = ax.images[0]
            for index, value in enumerate(domain):
                text = next(t for t in ax.texts if t.get_text() == f"value {index}")
                fill = image.cmap(image.norm(value))
                expected = theme.label if contrast(theme.label, fill) >= contrast(theme.field, fill) else theme.field
                self.assertEqual(text.get_color(), expected)
            plt.close(fig)

    def test_precise_percent_labels_ignore_callers_decimal_precision(self):
        domain = (1., math.nextafter(1., 2.))
        with localcontext() as context:
            context.prec = 2
            fig, _ = categorical_matrix(fixture(domain, value_format="percent"))
            fig.canvas.draw()
            labels = [t.get_text() for t in fig.axes[-1].get_yticklabels()]
            self.assertEqual(context.prec, 2)
        self.assertTrue(all(label.endswith("%") for label in labels))
        self.assertEqual([Decimal(label[:-1]) for label in labels],
                         [Decimal("100"), Decimal("100.00000000000002")])

    def test_narrow_status_cells_and_constant_observations_preserve_meaning(self):
        domain = (1., math.nextafter(1., 2.))
        for key, theme in THEMES.items():
            fig, ax = categorical_matrix(fixture(domain, values=[domain[0], domain[0]], statuses=True), theme=key)
            fig.canvas.draw()
            image = ax.images[0]
            np.testing.assert_array_equal(np.ma.getmaskarray(image.get_array()), [[False, False, True, True, True]])
            np.testing.assert_array_equal(image.norm(image.get_array())[0, :2], [0, 0])
            self.assertEqual(len(ax.patches), 3)
            self.assertEqual([p.get_hatch() for p in ax.patches], [None, "///", None])
            self.assertEqual([t.get_text() for t in ax.get_legend().get_texts()], ["Insufficient sample", "No data"])
            np.testing.assert_array_equal(image.cmap.get_bad(), colors.to_rgba(theme.field))
            plt.close(fig)

    def test_overflow_refuses_before_any_figure_or_caller_axes_mutation(self):
        fig, ax = plt.subplots()
        ax.plot([0, 1], [2, 3], label="existing")
        ax.set(title="Keep", xlabel="Original x", ylabel="Original y", facecolor="pink")
        ax.legend()
        fig.canvas.draw()
        pixels = np.asarray(fig.canvas.buffer_rgba()).copy()
        children, axes, numbers = tuple(ax.get_children()), tuple(fig.axes), plt.get_fignums()
        bounds = ax.get_position().bounds
        for domain in [(-1e308, 1e308), (-1.7e308, 1e308)]:
            data = fixture(domain)
            self.assertEqual(normalize_matrix_data(data)["valueScale"]["domain"], list(domain))
            for target in (None, ax):
                with self.subTest(domain=domain, caller_axes=target is not None), warnings.catch_warnings():
                    warnings.simplefilter("error", RuntimeWarning)
                    with self.assertRaisesRegex(ValueError, r"data\.valueScale\.domain.*finite positive linear span"):
                        categorical_matrix(data, ax=target)
                self.assertEqual(plt.get_fignums(), numbers)
                self.assertEqual(tuple(fig.axes), axes)
                self.assertEqual(tuple(ax.get_children()), children)
                self.assertEqual(ax.get_position().bounds, bounds)
                fig.canvas.draw()
                np.testing.assert_array_equal(fig.canvas.buffer_rgba(), pixels)
        # A failed request does not poison the caller's axes.
        returned, _ = categorical_matrix(fixture((0., 1.)), ax=ax)
        self.assertIs(returned, fig)
        fig.canvas.draw()

    def test_finite_large_domain_avoids_colorbar_midpoint_overflow(self):
        domain = (1e308, 1.1e308)
        for key in ("lavender_fog_notebook", "ultraviolet_laboratory"):
            with warnings.catch_warnings():
                warnings.simplefilter("error", RuntimeWarning)
                fig, ax = categorical_matrix(fixture(domain), theme=key)
                self.assert_endpoint_pixels(fig, ax, domain)
                plt.close(fig)

    def test_ordinary_domains_keep_shared_colorbar_norm_and_legacy_ramp(self):
        for key, theme in THEMES.items():
            for domain in [(0., 1.), (-2., 2.), (20., 30.)]:
                fig, ax = categorical_matrix(fixture(domain, statuses=True), theme=key)
                fig.canvas.draw()
                image = ax.images[0]
                self.assertIs(image.colorbar.norm, image.norm)
                self.assertIs(image.colorbar.mappable, image)
                self.assertEqual(image.get_clim(), domain)
                expected = colors.LinearSegmentedColormap.from_list("legacy", [(0, theme.panel), (.68, theme.primary), (1, theme.summary_core)])
                np.testing.assert_array_equal(image.cmap(np.arange(256)), expected(np.arange(256)))
                self.assertEqual(image.get_interpolation(), "nearest")
                plt.close(fig)

    def test_repeated_draws_and_exports_preserve_exact_mapping(self):
        with matplotlib.rc_context({"svg.fonttype": "path"}):
            for key in ("lavender_fog_notebook", "ultraviolet_laboratory"):
                for domain in [(0., math.ulp(0.)), (1., math.nextafter(1., 2.))]:
                    previous = None
                    for repeat in range(2):
                        fig, ax = categorical_matrix(fixture(domain), theme=key)
                        self.assert_endpoint_pixels(fig, ax, domain)
                        pixels = np.asarray(fig.canvas.buffer_rgba()).copy()
                        if previous is not None:
                            np.testing.assert_array_equal(pixels, previous)
                        previous = pixels
                        for fmt in ("png", "svg", "pdf"):
                            out = io.BytesIO()
                            fig.savefig(out, format=fmt)
                            self.assertGreater(len(out.getvalue()), 1000)
                            if fmt == "svg":
                                ET.fromstring(out.getvalue())
                                text = out.getvalue().decode("utf-8")
                                for value in domain:
                                    self.assertIn(str(value), text)
                            self.assert_endpoint_pixels(fig, ax, domain)
                        plt.close(fig)

    def test_image_mutations_keep_colorbar_linked_across_domain_transitions_and_exports(self):
        adjacent = (1., math.nextafter(1., 2.))
        subnormal = (0., math.ulp(0.))
        changes = [("viridis", adjacent, True), ("plasma", (0., 2.), False),
                   ("cividis", subnormal, True), ("magma", (10., 20.), False),
                   ("viridis", adjacent, True), ("plasma", (0., 2.), False)]
        for theme in ("lavender_fog_notebook", "ultraviolet_laboratory"):
            for initial in (adjacent, (0., 2.)):
                for kind in ("decimal", "percent"):
                    with self.subTest(theme=theme, initial=initial, format=kind):
                        fig, ax = categorical_matrix(fixture(initial, value_format=kind), theme=theme)
                        image, bar = ax.images[0], fig.axes[-1]._colorbar
                        callback = image.colorbar_cid
                        axes = tuple(fig.axes)
                        for cmap, domain, unit in changes:
                            image.set_cmap(cmap)
                            self.assertIs(bar.cmap, image.cmap)
                            image.set_clim(*domain)
                            image.set_data([domain])
                            self.assertIs(image.colorbar, bar)
                            self.assertIs(bar.mappable, image)
                            self.assertEqual(image.colorbar_cid, callback)
                            self.assertEqual(tuple(fig.axes), axes)
                            self.assert_endpoint_pixels(fig, ax, domain)
                            self.assertEqual(bar.ax.get_ylim(), (0., 1.) if unit else domain)
                            if unit:
                                labels = [t.get_text() for t in bar.ax.get_yticklabels()]
                                decoded = [Decimal(t.rstrip("%")) / (100 if kind == "percent" else 1) for t in labels]
                                self.assertEqual(decoded, [Decimal(str(v)) for v in domain])
                            else:
                                self.assertIs(bar.norm, image.norm)
                                self.assertTrue(all(t.get_rotation() == 0 for t in bar.ax.get_yticklabels()))
                            np.testing.assert_array_equal(bar.solids.get_facecolors(),
                                                          image.cmap((np.arange(image.cmap.N) + .5) / image.cmap.N))
                            for fmt in ("png", "svg", "pdf"):
                                out = io.BytesIO()
                                with matplotlib.rc_context({"svg.fonttype": "path"}):
                                    fig.savefig(out, format=fmt)
                                if fmt == "png":
                                    out.seek(0)
                                    np.testing.assert_array_equal(np.asarray(Image.open(out)), fig.canvas.buffer_rgba())
                                elif fmt == "svg":
                                    ET.fromstring(out.getvalue())
                                    for label in (t.get_text() for t in bar.ax.get_yticklabels()):
                                        self.assertIn(label, out.getvalue().decode())
                                else:
                                    self.assertTrue(out.getvalue().startswith(b"%PDF"))
                                self.assertIs(bar.cmap, image.cmap)
                                self.assertIs(bar.mappable, image)
                                self.assert_endpoint_pixels(fig, ax, domain)
                        plt.close(fig)

    def test_norm_replacement_direct_updates_and_ordinary_tick_customization(self):
        adjacent = (1., math.nextafter(1., 2.))
        for initial in (adjacent, (0., 2.)):
            fig, ax = categorical_matrix(fixture(initial))
            image, bar = ax.images[0], fig.axes[-1]._colorbar
            for norm in (colors.LogNorm(1., 100.), colors.Normalize(*adjacent),
                         colors.Normalize(0., 2.)):
                image.set_norm(norm)
                bar.update_normal(image)
                fig.canvas.draw()
                self.assertIs(bar.mappable, image)
                self.assertIs(image.norm, norm)
                self.assertEqual(image.get_clim(), (norm.vmin, norm.vmax))
                if isinstance(norm, colors.LogNorm):
                    np.testing.assert_allclose(bar.ax.get_ylim(), image.get_clim(), rtol=1e-14, atol=0)
                else:
                    self.assertEqual(bar.ax.get_ylim(), (0., 1.) if norm.vmax == adjacent[1] else image.get_clim())
            locator = FixedLocator([0., 1., 2.])
            formatter = FuncFormatter(lambda v, _: f"custom {v:g}")
            bar.locator, bar.formatter = locator, formatter
            bar.update_ticks()
            image.set_cmap("viridis")
            image.set_clim(0., 3.)
            fig.canvas.draw()
            self.assertIs(bar.locator, locator)
            self.assertIs(bar.formatter, formatter)
            self.assertEqual([t.get_text() for t in bar.ax.get_yticklabels()], ["custom 0", "custom 1", "custom 2"])
            plt.close(fig)

    def test_colorbar_remove_keeps_native_ownership_and_disconnects_updates(self):
        for initial in ((0., 2.), (1., math.nextafter(1., 2.))):
            for layout in (None, "constrained"):
                fig, ax = plt.subplots(layout=layout)
                categorical_matrix(fixture(initial), ax=ax)
                image, bar = ax.images[0], fig.axes[-1]._colorbar
                image.set_cmap("viridis")
                image.set_clim(0., math.ulp(0.))
                bar.remove()
                self.assertIsNone(image.colorbar)
                self.assertIsNone(image.colorbar_cid)
                self.assertEqual(fig.axes, [ax])
                image.set_cmap("plasma")
                image.set_clim(0., 2.)
                self.assertEqual(bar.cmap.name, "viridis")
                fig.canvas.draw()
                plt.close(fig)

    def assert_colorbar_represents_image(self, fig, ax, kind="decimal"):
        image, bar = ax.images[0], ax.images[0].colorbar
        scientific = image.get_clim()
        self.assertIs(bar.mappable, image)
        self.assertIs(bar.cmap, image.cmap)
        if bar.norm is image.norm:
            self.assertEqual(bar.ax.get_ylim(), scientific)
        else:
            self.assertEqual(bar.ax.get_ylim(), (0., 1.))
            np.testing.assert_array_equal(bar.get_ticks(), [0, 1])
            labels = [t.get_text() for t in bar.ax.get_yticklabels()]
            decoded = [Decimal(t.rstrip("%")) / (100 if kind == "percent" else 1) for t in labels]
            self.assertEqual(decoded, [Decimal(str(v)) for v in scientific])
        fig.canvas.draw()
        self.assertEqual(image.get_clim(), scientific)
        np.testing.assert_array_equal(bar.solids.get_facecolors(),
                                      image.cmap((np.arange(image.cmap.N) + .5) / image.cmap.N))
        rgba = np.asarray(fig.canvas.buffer_rgba())
        for index, value in enumerate(image.get_array()[0]):
            x, y = ax.transData.transform((index, -.25))
            np.testing.assert_array_equal(rgba[rgba.shape[0] - 1 - int(y), int(x)],
                                          image.cmap(image.norm(value), bytes=True))

    def test_unbounded_norm_resets_keep_settled_scientific_labels_through_exports(self):
        adjacent = (1., math.nextafter(1., 2.))
        domains = (adjacent, (0., 2.), (0., math.ulp(0.)), adjacent)
        for theme in ("lavender_fog_notebook", "ultraviolet_laboratory"):
            for kind in ("decimal", "percent"):
                with self.subTest(theme=theme, format=kind):
                    fig, ax = categorical_matrix(fixture(adjacent, value_format=kind), theme=theme)
                    image, bar = ax.images[0], ax.images[0].colorbar
                    callback = image.colorbar_cid
                    for domain in domains:
                        for reset in (None, colors.Normalize(), colors.Normalize(vmin=domain[0]),
                                      colors.Normalize(vmax=domain[1])):
                            image.set_data([domain])
                            image.set_norm(reset)
                            # No manual colorbar update: check immediately, then
                            # draw/export the state produced by native callbacks.
                            self.assert_colorbar_represents_image(fig, ax, kind)
                            settled = image.get_clim()
                            for fmt in ("png", "svg", "pdf"):
                                out = io.BytesIO()
                                with matplotlib.rc_context({"svg.fonttype": "path"}):
                                    fig.savefig(out, format=fmt)
                                if fmt == "png":
                                    out.seek(0)
                                    np.testing.assert_array_equal(np.asarray(Image.open(out)), fig.canvas.buffer_rgba())
                                elif fmt == "svg":
                                    ET.fromstring(out.getvalue())
                                    for label in (t.get_text() for t in bar.ax.get_yticklabels()):
                                        self.assertIn(label, out.getvalue().decode())
                                else:
                                    self.assertTrue(out.getvalue().startswith(b"%PDF"))
                                self.assertEqual(image.get_clim(), settled)
                                self.assert_colorbar_represents_image(fig, ax, kind)
                            self.assertEqual(image.colorbar_cid, callback)
                            self.assertEqual(len(fig.axes), 2)
                    plt.close(fig)

    def test_autoscale_methods_follow_repeated_ordinary_and_exceptional_data(self):
        adjacent = (1., math.nextafter(1., 2.))
        for initial in (adjacent, (0., 2.)):
            fig, ax = categorical_matrix(fixture(initial))
            image = ax.images[0]
            for domain in (adjacent, (10., 20.), (0., math.ulp(0.)), (-2., 2.), adjacent):
                image.set_data([domain])
                image.autoscale()
                self.assertEqual(image.get_clim(), domain)
                self.assert_colorbar_represents_image(fig, ax)
                # A caller can clear either/both bounds before autoscale_None.
                # Preserve native version-specific autoscale behavior while
                # requiring the bar to represent the actual settled image norm.
                for clear in ("vmin", "vmax", "both"):
                    with image.norm.callbacks.blocked():
                        if clear in ("vmin", "both"):
                            image.norm.vmin = None
                        if clear in ("vmax", "both"):
                            image.norm.vmax = None
                    image.autoscale_None()
                    self.assert_colorbar_represents_image(fig, ax)
            plt.close(fig)

    def test_native_autoscale_callbacks_preserve_caller_observers_and_nested_changes(self):
        adjacent = (1., math.nextafter(1., 2.))

        def exercise(image, verify=None):
            events, changed = [], []
            settled = []

            def observer(*_):
                events.append(image.get_clim())
                if image.norm.scaled() and not changed:
                    changed.append(True)
                    image.set_cmap("plasma")
                    image.set_clim(0., 4.)

            observer_id = image.callbacks.connect("changed", observer)
            for reset in (None, colors.Normalize()):
                changed.clear()
                image.set_data([(0., 2.)])
                image.set_norm(reset)
                self.assertEqual(changed, [True])
                self.assertEqual(image.cmap.name, "plasma")
                settled.append(image.get_clim())
                if verify is not None:
                    verify()
            self.assertGreater(len(events), 2)
            image.callbacks.disconnect(observer_id)
            return settled

        for initial in (adjacent, (0., 2.)):
            reference, reference_ax = plt.subplots()
            native = reference_ax.imshow([initial], vmin=initial[0], vmax=initial[1])
            reference.colorbar(native, ax=reference_ax)
            # Native versions differ in whether remaining autoscale assignments
            # overwrite a nested observer's limit change. Preserve that ordering.
            expected = exercise(native)
            plt.close(reference)
            fig, ax = categorical_matrix(fixture(initial))
            actual = exercise(ax.images[0], lambda: self.assert_colorbar_represents_image(fig, ax))
            self.assertEqual(actual, expected)
            plt.close(fig)


if __name__ == "__main__":
    unittest.main()
