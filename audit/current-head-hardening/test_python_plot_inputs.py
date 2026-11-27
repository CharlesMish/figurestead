#!/usr/bin/env python3
"""Headless regressions for the direct Python plotting input boundary."""

from __future__ import annotations

import math
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch


os.environ.setdefault("MPLBACKEND", "Agg")
os.environ.setdefault("MPLCONFIGDIR", "/tmp/figurestead-python-input-validation-mpl")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

from figurestead import available_plots, heatmap, histogram, line, scatter, strip_summary  # noqa: E402


class PythonPlotInputRegression(unittest.TestCase):
    def setUp(self) -> None:
        plt.close("all")

    def tearDown(self) -> None:
        plt.close("all")

    def test_shipped_title_profiles_request_regular_weight(self) -> None:
        from figurestead.profiles import PROFILES

        for key in ("deep_scope", "instrument", "monograph"):
            for profile in (key, PROFILES[key]):
                with self.subTest(profile=key, by_key=isinstance(profile, str)):
                    fig, ax = line([0, 1], [0, 1], profile=profile)
                    self.assertEqual(ax._left_title.get_fontweight(), "normal")
                    self.assertEqual(ax._left_title.get_fontfamily(), [PROFILES[key].title_family])
                    plt.close(fig)

    def test_custom_title_profiles_keep_medium_and_artist_overrides(self) -> None:
        from dataclasses import replace
        from figurestead.profiles import PROFILES

        for family in ("DejaVu Sans Mono", "STIXGeneral"):
            custom = replace(PROFILES["deep_scope"], title_family=family)
            for by_key in (False, True):
                with self.subTest(family=family, by_key=by_key), patch.dict(PROFILES, deep_scope=custom):
                    fig, ax = line([0, 1], [0, 1], profile="deep_scope" if by_key else custom)
                    self.assertEqual(ax._left_title.get_fontweight(), "medium")
                    self.assertEqual(ax._left_title.get_fontfamily(), [family])
                    ax._left_title.set_fontweight(700)
                    self.assertEqual(ax._left_title.get_fontweight(), 700)
                    plt.close(fig)

    def test_gallery_system_grammar_requests_regular_weight(self) -> None:
        from figurestead.gallery import build_gallery

        weights = []

        def inspect_save(fig, *args, **kwargs):
            weights.extend(text.get_fontweight() for ax in fig.axes for text in ax.texts
                           if text.get_text() == "SYSTEM GRAMMAR")

        with patch("matplotlib.figure.Figure.savefig", inspect_save):
            build_gallery(Path(os.environ["MPLCONFIGDIR"]) / "unused-gallery.png")
        self.assertEqual(weights, ["normal"])

    def assert_rejected_before_allocation(self, invoke, pattern: str) -> None:
        before = tuple(plt.get_fignums())
        with patch("figurestead.plots.ensure_axes") as ensure_axes:
            with self.assertRaisesRegex(ValueError, pattern):
                invoke()
            ensure_axes.assert_not_called()
        self.assertEqual(tuple(plt.get_fignums()), before)

    def test_direct_surface_remains_the_registered_five(self) -> None:
        self.assertEqual(
            tuple(available_plots()),
            ("strip_summary", "scatter", "line", "histogram", "heatmap"),
        )

    def test_histogram_flat_list_is_one_dataset(self) -> None:
        fig, ax = histogram([1, 2, 3])
        self.assertEqual(len(ax.lines), 1)
        self.assertEqual(len(ax.patches), 1)
        plt.close(fig)

    def test_histogram_flat_array_is_one_dataset(self) -> None:
        fig, ax = histogram(np.array([1.0, 2.0, 3.0]), labels=["sample"])
        self.assertEqual(list(ax.lines[0].get_xdata()), [2.0, 2.0])
        plt.close(fig)

    def test_histogram_nested_values_are_multiple_datasets(self) -> None:
        fig, ax = histogram([[1, 2, 3], [4, 5]], labels=["first", "second"])
        self.assertEqual(len(ax.lines), 2)
        self.assertEqual(len(ax.patches), 2)
        self.assertEqual([item.get_text() for item in ax.get_legend().get_texts()], ["first · 2", "second · 4.5"])
        plt.close(fig)

    def test_histogram_two_dimensional_array_uses_rows_as_datasets(self) -> None:
        fig, ax = histogram(np.array([[1, 2], [3, 4]]), labels=["first", "second"])
        self.assertEqual(len(ax.lines), 2)
        plt.close(fig)

    def test_histogram_rejects_empty_input(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: histogram([]), r"histogram\.values: must contain at least one observation"
        )

    def test_histogram_rejects_empty_nested_dataset(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: histogram([[1, 2], []]), r"histogram\.values\[1\]: must contain at least one observation"
        )

    def test_histogram_rejects_mixed_scalar_and_nested_input(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: histogram([1, [2, 3]]), r"histogram\.values: .*cannot be mixed"
        )

    def test_histogram_rejects_three_dimensional_input(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: histogram(np.zeros((2, 2, 2))), r"histogram\.values: must be a 1 or 2-dimensional"
        )

    def test_histogram_rejects_short_supplied_labels(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: histogram([[1, 2], [3, 4]], labels=["first"]),
            r"histogram\.labels: expected 2 entries, found 1",
        )

    def test_histogram_rejects_long_supplied_labels(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: histogram([[1, 2]], labels=["first", "second"]),
            r"histogram\.labels: expected 1 entries, found 2",
        )

    def test_histogram_rejects_invalid_bins(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: histogram([1, 2, 3], bins=0), r"histogram\.bins: invalid bin specification"
        )

    def test_line_accepts_one_dimensional_single_series(self) -> None:
        fig, ax = line([0, 1, 2], [0, 1, 0])
        self.assertEqual(len(ax.lines), 1)
        self.assertEqual(len(ax.collections), 1)
        plt.close(fig)

    def test_line_preserves_normal_multi_series_output(self) -> None:
        fig, ax = line([0, 1], [[0, 1], [1, 0]], labels=["rising", "falling"])
        self.assertEqual(len(ax.lines), 2)
        self.assertEqual(len(ax.collections), 2)
        self.assertEqual([item.get_text() for item in ax.get_legend().get_texts()], ["rising", "falling"])
        plt.close(fig)

    def test_line_rejects_series_width_mismatch(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: line([0, 1, 2], [[0, 1]]), r"line\.ys: each series must match line\.x length 3"
        )

    def test_line_rejects_short_supplied_labels(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: line([0, 1], [[0, 1], [1, 0]], labels=["first"]),
            r"line\.labels: expected 2 entries, found 1",
        )

    def test_line_rejects_long_supplied_labels(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: line([0, 1], [[0, 1]], labels=["first", "second"]),
            r"line\.labels: expected 1 entries, found 2",
        )

    def test_line_does_not_treat_supplied_empty_labels_as_omitted(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: line([0, 1], [[0, 1]], labels=[]), r"line\.labels: expected 1 entries, found 0"
        )

    def test_scatter_preserves_valid_categorized_points(self) -> None:
        fig, ax = scatter([0, 1], [1, 2], series=["a", "b"])
        self.assertGreaterEqual(len(ax.collections), 2)
        self.assertIsNotNone(ax.get_legend())
        plt.close(fig)

    def test_scatter_rejects_paired_vector_mismatch(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: scatter([0, 1], [1]), r"scatter\.x: paired vectors must have equal lengths"
        )

    def test_scatter_rejects_series_cardinality_mismatch(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: scatter([0, 1], [1, 2], series=["a"]),
            r"scatter\.x: paired vectors must have equal lengths",
        )

    def test_strip_preserves_valid_distribution(self) -> None:
        fig, ax = strip_summary(["a", "a", "b"], [1, 2, 3], series=["s", "s", "s"])
        self.assertEqual([item.get_text() for item in ax.get_xticklabels()], ["a", "b"])
        self.assertEqual(len(ax.lines), 4)
        plt.close(fig)

    def test_strip_rejects_duplicate_explicit_order(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: strip_summary(["a", "b"], [1, 2], order=["a", "a", "b"]),
            r"strip_summary\.order\[1\]: duplicate category 'a'",
        )

    def test_strip_rejects_observed_category_missing_from_order(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: strip_summary(["a", "b"], [1, 2], order=["a"]),
            r"strip_summary\.order: observed category 'b' is missing",
        )

    def test_strip_preserves_declared_unobserved_order_slot(self) -> None:
        fig, ax = strip_summary(["a"], [1], order=["a", "declared-empty"])
        self.assertEqual([item.get_text() for item in ax.get_xticklabels()], ["a", "declared-empty"])
        plt.close(fig)

    def test_strip_does_not_decide_fully_empty_declared_category_policy(self) -> None:
        fig, ax = strip_summary([], [], order=["declared-empty"])
        self.assertEqual([item.get_text() for item in ax.get_xticklabels()], ["declared-empty"])
        self.assertIn("n=0", [item.get_text() for item in ax.texts])
        plt.close(fig)

    def test_strip_rejects_paired_vector_mismatch(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: strip_summary(["a", "b"], [1]),
            r"strip_summary\.groups: paired vectors must have equal lengths",
        )

    def test_strip_rejects_series_cardinality_mismatch(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: strip_summary(["a", "b"], [1, 2], series=["s"]),
            r"strip_summary\.groups: paired vectors must have equal lengths",
        )

    def test_heatmap_preserves_valid_matrix_and_labels(self) -> None:
        fig, ax = heatmap([[1, 2], [3, 4]], xlabels=["x1", "x2"], ylabels=["y1", "y2"])
        self.assertEqual(len(ax.images), 1)
        self.assertEqual([item.get_text() for item in ax.get_xticklabels()], ["x1", "x2"])
        self.assertEqual([item.get_text() for item in ax.get_yticklabels()], ["y1", "y2"])
        plt.close(fig)

    def test_heatmap_rejects_xlabel_cardinality_mismatch(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: heatmap([[1, 2]], xlabels=["x1"]),
            r"heatmap\.xlabels: expected 2 entries, found 1",
        )

    def test_heatmap_rejects_ylabel_cardinality_mismatch(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: heatmap([[1], [2]], ylabels=["y1"]),
            r"heatmap\.ylabels: expected 2 entries, found 1",
        )

    def test_heatmap_rejects_empty_matrix(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: heatmap(np.empty((0, 2))), r"heatmap\.matrix: must contain at least one observation"
        )

    def test_all_direct_numeric_surfaces_reject_each_nonfinite_value(self) -> None:
        for value in (math.nan, math.inf, -math.inf):
            cases = (
                (lambda value=value: strip_summary(["a", "b"], [1, value]), "strip_summary.values"),
                (lambda value=value: scatter([0, value], [1, 2]), "scatter.x"),
                (lambda value=value: line([0, 1], [[1, value]]), "line.ys"),
                (lambda value=value: histogram([1, value]), "histogram.values"),
                (lambda value=value: heatmap([[1, value]]), "heatmap.matrix"),
            )
            for invoke, path in cases:
                if path == "line.ys" and math.isnan(value):
                    continue  # NaN y is admitted only by the ordinary line route.
                with self.subTest(value=value, path=path):
                    self.assert_rejected_before_allocation(invoke, rf"{path}: must contain only finite numbers")

    def test_line_rejects_masked_values_before_allocation(self) -> None:
        values = np.ma.masked_equal(np.array([12.4, -999.0, 13.1]), -999.0)
        self.assert_rejected_before_allocation(
            lambda: line(np.arange(3), values),
            r"line\.ys: masked arrays are not currently supported \(1 masked entry\)",
        )

    def test_scatter_rejects_masked_x_before_allocation(self) -> None:
        values = np.ma.masked_equal(np.array([12.4, -999.0, 13.1]), -999.0)
        self.assert_rejected_before_allocation(
            lambda: scatter(values, np.arange(3)),
            r"scatter\.x: masked arrays are not currently supported \(1 masked entry\)",
        )

    def test_scatter_rejects_masked_y_before_allocation(self) -> None:
        values = np.ma.masked_equal(np.array([12.4, -999.0, 13.1]), -999.0)
        self.assert_rejected_before_allocation(
            lambda: scatter(np.arange(3), values),
            r"scatter\.y: masked arrays are not currently supported \(1 masked entry\)",
        )

    def test_histogram_rejects_masked_data_before_allocation(self) -> None:
        values = np.ma.masked_equal(np.array([12.4, -999.0, 13.1]), -999.0)
        self.assert_rejected_before_allocation(
            lambda: histogram(values),
            r"histogram\.values: masked arrays are not currently supported \(1 masked entry\)",
        )

    def test_strip_rejects_masked_values_before_allocation(self) -> None:
        values = np.ma.masked_equal(np.array([12.4, -999.0, 13.1]), -999.0)
        self.assert_rejected_before_allocation(
            lambda: strip_summary(["a", "a", "b"], values),
            r"strip_summary\.values: masked arrays are not currently supported \(1 masked entry\)",
        )

    def test_heatmap_rejects_masked_matrix_before_allocation(self) -> None:
        values = np.ma.masked_equal(np.array([[12.4, -999.0], [13.1, 12.9]]), -999.0)
        self.assert_rejected_before_allocation(
            lambda: heatmap(values),
            r"heatmap\.matrix: masked arrays are not currently supported \(1 masked entry\)",
        )

    def test_fully_unmasked_masked_array_is_rejected_consistently(self) -> None:
        values = np.ma.array([12.4, 13.1, 12.9], mask=False)
        self.assert_rejected_before_allocation(
            lambda: histogram(values),
            r"histogram\.values: masked arrays are not currently supported \(0 masked entries\)",
        )

    def test_nested_masked_array_cannot_be_stripped_by_outer_normalization(self) -> None:
        values = [np.ma.masked_equal(np.array([12.4, -999.0]), -999.0), np.array([13.1, 12.9])]
        self.assert_rejected_before_allocation(
            lambda: line(np.arange(2), values),
            r"line\.ys: masked arrays are not currently supported \(1 masked entry\)",
        )

    def test_ordinary_ndarray_and_later_render_succeed_after_mask_rejection(self) -> None:
        masked = np.ma.masked_equal(np.array([12.4, -999.0, 13.1]), -999.0)
        self.assert_rejected_before_allocation(
            lambda: line(np.arange(3), masked), r"line\.ys: masked arrays"
        )
        fig, ax = line(np.arange(3), np.array([12.4, 13.1, 12.9]))
        self.assertEqual(list(ax.lines[0].get_ydata()), [12.4, 13.1, 12.9])
        plt.close(fig)

    def test_numeric_category_nonfinite_is_rejected(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: strip_summary([1, math.nan], [1, 2]),
            r"strip_summary\.groups\[1\]: numeric category values must be finite",
        )

    def _category_calls(self, categories, ax=None):
        return (
            ("strip_summary.groups", lambda: strip_summary(categories, [3, 2, 100], ax=ax)),
            ("strip_summary.series", lambda: strip_summary(["A", "A", "B"], [3, 2, 100], series=categories, ax=ax)),
            ("scatter.series", lambda: scatter([0, 1, 2], [3, 2, 100], series=categories, ax=ax)),
        )

    def test_missing_category_guard_precedes_mixed_string_coercion(self) -> None:
        for missing in (math.nan, math.inf, -math.inf, np.float32("nan"), np.float64("inf")):
            for factory in (list, tuple):
                categories = factory(["Control", "nan", missing])
                for path, invoke in self._category_calls(categories):
                    with self.subTest(path=path, missing=missing, container=factory.__name__):
                        self.assert_rejected_before_allocation(
                            invoke, rf"{path}\[2\]: numeric category values must be finite"
                        )

    def test_missing_category_guard_covers_explicit_object_and_numeric_arrays(self) -> None:
        for missing in (math.nan, math.inf, -math.inf):
            for categories in (
                np.array(["Control", "nan", missing], dtype=object),
                np.array([1, 2, missing]),
            ):
                for path, invoke in self._category_calls(categories):
                    with self.subTest(path=path, missing=missing, dtype=categories.dtype):
                        self.assert_rejected_before_allocation(
                            invoke, rf"{path}\[2\]: numeric category values must be finite"
                        )

    def test_nonfinite_complex_categories_cannot_be_stringified(self) -> None:
        for missing in (complex(math.nan, 0), complex(0, math.inf), complex(-math.inf, 2)):
            for categories in (["Control", "nan", missing], np.array([1, 2, missing])):
                for path, invoke in self._category_calls(categories):
                    with self.subTest(path=path, missing=missing):
                        self.assert_rejected_before_allocation(
                            invoke, rf"{path}\[2\]: numeric category values must be finite"
                        )

    def test_literal_nan_inf_strings_remain_valid_categories(self) -> None:
        for factory in (list, np.array, lambda data: np.array(data, dtype=object)):
            categories = factory(["nan", "inf", "-inf"])
            for path, invoke in self._category_calls(categories):
                with self.subTest(path=path, factory=factory):
                    fig, ax = invoke()
                    if path == "strip_summary.groups":
                        self.assertEqual([t.get_text() for t in ax.get_xticklabels()], ["nan", "inf", "-inf"])
                        self.assertEqual([t.get_text() for t in ax.texts if getattr(t, "_figurestead_strip_count", False)], ["n=1"] * 3)
                    else:
                        self.assertEqual([t.get_text() for t in ax.get_legend().get_texts()], ["nan", "inf", "-inf"])
                    plt.close(fig)
        fig, ax = strip_summary(["Control", "nan", "nan"], [3, 2, 100])
        self.assertEqual([t.get_text() for t in ax.texts if getattr(t, "_figurestead_strip_count", False)], ["n=1", "n=2"])
        self.assertTrue(any(np.all(np.asarray(item.get_ydata()) == 51) for item in ax.lines))
        plt.close(fig)

    def test_category_guard_keeps_canonical_dtype_and_first_appearance(self) -> None:
        from figurestead.plots import _category_vector

        for categories in (["treatment", 0, 0], [2, 1, 2], [1 + 2j, 2 + 1j, 1 + 2j]):
            actual, unique = _category_vector(categories, path="category")
            expected = np.asarray(categories)
            np.testing.assert_array_equal(actual, expected)
            self.assertEqual(actual.dtype, expected.dtype)
            np.testing.assert_array_equal(unique, expected[:2])

    def test_category_guard_keeps_shape_mask_hash_and_comparison_boundaries(self) -> None:
        from figurestead.plots import _category_vector

        unhashable = np.empty(2, dtype=object)
        unhashable[:] = [{"a": 1}, {"b": 2}]
        for value, message in (
            ([[1, 2], [3, 4]], "one-dimensional"),
            (np.ma.array([1, 2], mask=False), "masked arrays"),
            (unhashable, "hashable"),
            (np.array([1, "Control"], dtype=object), "mutually comparable"),
            ([], "at least one category"),
        ):
            with self.subTest(message=message):
                with self.assertRaisesRegex(ValueError, message):
                    _category_vector(value, path="category")
        empty, unique = _category_vector([], path="category", allow_empty=True)
        self.assertEqual(empty.size, 0)
        self.assertEqual(unique.size, 0)

    def test_missing_category_rejection_preserves_caller_axes(self) -> None:
        import hashlib
        import io
        import matplotlib as mpl

        def snapshot(fig, ax):
            fig.canvas.draw()
            return (
                tuple(ax.get_children()), tuple(fig.axes), tuple(ax.get_xlim()), tuple(ax.get_ylim()),
                tuple(ax.dataLim.bounds), tuple(ax.get_position().bounds), ax.get_autoscalex_on(),
                ax.get_autoscaley_on(), ax.get_title(), ax.get_xlabel(), ax.get_ylabel(),
                ax.get_facecolor(), ax.get_legend(), tuple(ax.get_xticks()), tuple(ax.get_yticks()),
                tuple(t.get_text() for t in ax.get_xticklabels()),
            )

        def exports(fig):
            results = []
            for format in ("png", "svg"):
                data = io.BytesIO()
                fig.savefig(data, format=format, metadata={"Date": None} if format == "svg" else {})
                results.append(hashlib.sha256(data.getvalue()).hexdigest())
            return tuple(results)

        with mpl.rc_context({"svg.hashsalt": "category-rejection"}):
            fig, ax = plt.subplots()
            ax.plot([0, 1], [2, 3], label="Existing")
            ax.scatter([0.5], [2.5])
            ax.legend()
            ax.set(title="Caller-owned", xlabel="Time", ylabel="Response", xlim=(-2, 4), ylim=(-1, 6))
            state, pixels = snapshot(fig, ax), exports(fig)
            for missing in (math.nan, math.inf, -math.inf):
                for categories in (["Control", "nan", missing], np.array(["Control", "nan", missing], dtype=object)):
                    for path, invoke in self._category_calls(categories, ax=ax):
                        with self.subTest(path=path, missing=missing):
                            with self.assertRaisesRegex(ValueError, rf"{path}\[2\]: numeric category values must be finite"):
                                invoke()
                            self.assertEqual(snapshot(fig, ax), state)
                            self.assertEqual(exports(fig), pixels)
            plt.close(fig)

    def test_upstream_stringification_is_not_reclassified_as_missing(self) -> None:
        # A pre-stringified ndarray has no remaining evidence of numeric NaN.
        categories = np.asarray(["Control", "nan", math.nan])
        for path, invoke in self._category_calls(categories):
            with self.subTest(path=path):
                fig, ax = invoke()
                self.assertIsNotNone(ax)
                plt.close(fig)

    def test_non_numeric_scientific_values_are_rejected_publicly(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: line(["0", "1"], [0, 1]), r"line\.x: must contain only real numbers"
        )

    def test_rejection_does_not_mutate_caller_axes(self) -> None:
        fig, ax = plt.subplots()
        before = (len(ax.lines), len(ax.collections), len(ax.patches), ax.get_title())
        with self.assertRaisesRegex(ValueError, r"line\.labels"):
            line([0, 1], [[0, 1], [1, 0]], labels=["only"], ax=ax)
        after = (len(ax.lines), len(ax.collections), len(ax.patches), ax.get_title())
        self.assertEqual(after, before)
        plt.close(fig)

    def test_point_series_slots_reject_before_axes(self) -> None:
        invalid = (
            ([0, 1], r"must be a mapping"),
            ("AB", r"must be a mapping"),
            (0, r"must be a mapping"),
            (np.ma.array([0]), r"masked arrays are not currently supported"),
            ({"A": True, "B": 0}, r"must be a nonnegative integer \(not boolean\)"),
            ({"A": np.bool_(False), "B": 1}, r"must be a nonnegative integer \(not boolean\)"),
            ({"A": -1, "B": 0}, r"must be a nonnegative integer \(not boolean\)"),
            ({"A": 1.2, "B": 0}, r"must be a nonnegative integer \(not boolean\)"),
            ({"A": None, "B": 0}, r"must be a nonnegative integer \(not boolean\)"),
            ({"A": "0", "B": 1}, r"must be a nonnegative integer \(not boolean\)"),
            ({"A": np.array([1]), "B": 0}, r"must be a nonnegative integer \(not boolean\)"),
            ({"A": 0}, r"observed series 'B' has no slot"),
            ({"A": 0, "B": 1, "quiet": -2}, r"series_slots\['quiet'\]"),
        )
        for family in ("scatter", "strip"):
            for slots, pattern in invalid:
                with self.subTest(family=family, slots=slots):
                    if family == "scatter":
                        invoke = lambda slots=slots: scatter(
                            [0, 1], [1, 2], series=["A", "B"], series_slots=slots)
                    else:
                        invoke = lambda slots=slots: strip_summary(
                            ["G", "G"], [1, 2], series=["A", "B"], series_slots=slots)
                    self.assert_rejected_before_allocation(invoke, pattern)
            with self.subTest(family=family, slots="anonymous"):
                if family == "scatter":
                    invoke = lambda: scatter([0, 1], [1, 2], series_slots={0: 1})
                else:
                    invoke = lambda: strip_summary(["G", "H"], [1, 2], series_slots={"G": 0})
                self.assert_rejected_before_allocation(
                    invoke, r"keyed slots require an explicit series")
        self.assert_rejected_before_allocation(
            lambda: scatter([0, 1], [1, 2], series=["A"], series_slots={"A": -1}),
            r"scatter\.x: paired vectors must have equal lengths",
        )
        self.assert_rejected_before_allocation(
            lambda: scatter([0, math.nan], [1, 2], series=["A", "B"], series_slots={"A": 0, "B": 1}),
            r"scatter\.x: must contain only finite numbers",
        )

    def test_point_series_slots_accept_inactive_keys_and_explicit_numeric_zero(self) -> None:
        fig, ax = scatter([0, 1, 2, 3], [1, 2, 3, 4], series=[0, 0, 1, 1],
                          series_slots={0: np.int64(3), 1: np.uint64(0), "inactive": 4})
        self.assertEqual([text.get_text() for text in ax.get_legend().get_texts()], ["0", "1"])
        plt.close(fig)
        fig, ax = strip_summary(["G", "G"], [1, 2], series=[0, 0], series_slots={0: 2, "quiet": 0})
        self.assertIsNone(ax.get_legend())
        plt.close(fig)
        fig, ax = strip_summary([], [], series=[], series_slots={"quiet": 0}, order=["empty"])
        self.assertEqual([text.get_text() for text in ax.get_xticklabels()], ["empty"])
        self.assertIn("n=0", [text.get_text() for text in ax.texts])
        plt.close(fig)

    def test_point_styles_reject_before_axes(self) -> None:
        bad_point = (
            ([14], r"must be a mapping"),
            ("size", r"must be a mapping"),
            (0, r"must be a mapping"),
            (np.ma.array([14]), r"masked arrays are not currently supported"),
            ({"size": True}, r"finite positive marker area"),
            ({"size": np.bool_(False)}, r"finite positive marker area"),
            ({"size": 0}, r"finite positive marker area"),
            ({"size": -4}, r"finite positive marker area"),
            ({"size": math.nan}, r"finite positive marker area"),
            ({"size": math.inf}, r"finite positive marker area"),
            ({"size": "14"}, r"finite positive marker area"),
            ({"size": None}, r"finite positive marker area"),
            ({"size": np.array(14.0)}, r"finite positive marker area"),
            ({"alpha": True}, r"finite opacity"),
            ({"alpha": False}, r"finite opacity"),
            ({"alpha": np.bool_(True)}, r"finite opacity"),
            ({"alpha": -0.01}, r"finite opacity"),
            ({"alpha": 1.01}, r"finite opacity"),
            ({"alpha": math.nan}, r"finite opacity"),
            ({"alpha": math.inf}, r"finite opacity"),
            ({"alpha": "0.5"}, r"finite opacity"),
            ({"alpha": None}, r"finite opacity"),
            ({"marker": "o"}, r"circle, square, triangle, or diamond"),
            ({"marker": "Circle"}, r"circle, square, triangle, or diamond"),
            ({"marker": None}, r"circle, square, triangle, or diamond"),
            ({"marker": 1}, r"circle, square, triangle, or diamond"),
            ({"linewidth": 1}, r"unknown field"),
            ({"color": "#000000"}, r"unknown field"),
            ({"s": 12}, r"unknown field"),
        )
        bad_series = (
            ([{"size": 14}], r"must be a mapping from series keys"),
            ("Recent", r"must be a mapping from series keys"),
            (4, r"must be a mapping from series keys"),
            (np.ma.array([14]), r"masked arrays are not currently supported"),
            ({"A": 14}, r"must be a mapping of marker fields"),
            ({"A": "circle"}, r"must be a mapping of marker fields"),
            ({"quiet": {"size": -1}}, r"series_styles\['quiet'\]\['size'\]"),
            ({"quiet": {"marker": "star"}}, r"series_styles\['quiet'\]\['marker'\]"),
            ({"quiet": {"zorder": 5}}, r"unknown field"),
            ({"A": {"alpha": np.ma.array(0.2, mask=True)}}, r"masked arrays are not currently supported"),
            ({}, r"keyed styles require an explicit series"),
        )
        for family in ("scatter", "strip"):
            for style, pattern in bad_point:
                with self.subTest(family=family, style=style):
                    if family == "scatter":
                        invoke = lambda style=style: scatter(
                            [0, 1], [1, 2], series=["A", "B"], point_style=style)
                    else:
                        invoke = lambda style=style: strip_summary(
                            ["G", "G"], [1, 2], series=["A", "B"], point_style=style)
                    self.assert_rejected_before_allocation(invoke, pattern)
            for style, pattern in bad_series:
                with self.subTest(family=family, series_styles=style):
                    if family == "scatter":
                        if style == {}:
                            invoke = lambda: scatter([0, 1], [1, 2], series_styles={})
                        else:
                            invoke = lambda style=style: scatter(
                                [0, 1], [1, 2], series=["A", "B"], series_styles=style)
                    else:
                        if style == {}:
                            invoke = lambda: strip_summary(["G", "H"], [1, 2], series_styles={})
                        else:
                            invoke = lambda style=style: strip_summary(
                                ["G", "G"], [1, 2], series=["A", "B"], series_styles=style)
                    self.assert_rejected_before_allocation(invoke, pattern)
            with self.subTest(family=family, series_styles="anonymous-invalid"):
                if family == "scatter":
                    invoke = lambda: scatter([0, 1], [1, 2], series_styles={"A": {"size": -5}})
                else:
                    invoke = lambda: strip_summary(
                        ["G", "H"], [1, 2], series_styles={"G": {"marker": "star"}})
                self.assert_rejected_before_allocation(
                    invoke, r"keyed styles require an explicit series")

    def test_point_styles_accept_inactive_empty_and_explicit_numeric_zero(self) -> None:
        fig, ax = scatter(
            [0, 1, 2, 3], [1, 2, 3, 4], series=[0, 0, 1, 1],
            point_style={"size": np.float64(12), "alpha": np.float64(0.4)},
            series_styles={0: {"marker": "diamond", "size": np.int64(20)}, "quiet": {"alpha": 0}},
        )
        self.assertEqual([text.get_text() for text in ax.get_legend().get_texts()], ["0", "1"])
        plt.close(fig)
        fig, ax = scatter(
            [0, 1], [1, 2], series=[0, "A"],
            series_styles={0: {"size": 10}, "0": {"size": 15}, "A": {"marker": "square"}},
        )
        labelled = [artist for artist in ax.collections if getattr(artist, "_figurestead_authored_label", False)]
        self.assertEqual([artist.get_label() for artist in labelled], ["0", "A"])
        self.assertEqual(float(labelled[0].get_sizes()[0]), 15.0)
        self.assertEqual([text.get_text() for text in ax.get_legend().get_texts()], ["0", "A"])
        plt.close(fig)
        fig, ax = scatter([0, 1], [1, 2], series=["A", "B"], point_style={}, series_styles={})
        self.assertEqual([text.get_text() for text in ax.get_legend().get_texts()], ["A", "B"])
        plt.close(fig)
        fig, ax = scatter([0, 1], [1, 2], point_style={"marker": "triangle", "alpha": 0, "size": 9})
        self.assertIsNone(ax.get_legend())
        plt.close(fig)
        fig, ax = strip_summary(
            [], [], series=[], series_styles={"quiet": {"alpha": 0, "marker": "circle"}}, order=["empty"])
        self.assertEqual([text.get_text() for text in ax.get_xticklabels()], ["empty"])
        self.assertIn("n=0", [text.get_text() for text in ax.texts])
        plt.close(fig)

    def test_series_orders_reject_before_axes(self) -> None:
        invalid = (
            (["A", "B", "A"], None, r"draw_order\[2\]: duplicate series 'A'"),
            (["A", "A"], None, r"draw_order\[1\]: duplicate series 'A'"),
            (None, ["B", "A", "B"], r"legend_order\[2\]: duplicate series 'B'"),
            (["A", "B", "Nope"], None, r"draw_order\[2\]: unknown series 'Nope'"),
            (None, ["A", "B", "Missing"], r"legend_order\[2\]: unknown series 'Missing'"),
            (["A"], None, r"draw_order: observed series 'B' is missing"),
            (None, ["B"], r"legend_order: observed series 'A' is missing"),
            (["A", "B", "quiet"], None, r"draw_order\[2\]: unknown series 'quiet'"),
            ("AB", None, r"draw_order: must be a non-string sequence of series keys"),
            (None, "BA", r"legend_order: must be a non-string sequence of series keys"),
            (5, None, r"draw_order: must be a sequence of series keys"),
            (None, object(), r"legend_order: must be a sequence of series keys"),
            (np.ma.array(["A", "B"]), None, r"draw_order: masked arrays are not currently supported"),
            (["A", "B", math.nan], None, r"draw_order\[2\]: numeric series keys must be finite"),
            ([{"A": 1}, "B"], None, r"draw_order\[0\]: series keys must be hashable"),
        )
        for family in ("scatter", "strip"):
            for draw_order, legend_order, pattern in invalid:
                with self.subTest(family=family, draw_order=draw_order, legend_order=legend_order):
                    styles = {"quiet": {"size": 8}}
                    if family == "scatter":
                        invoke = lambda draw_order=draw_order, legend_order=legend_order, styles=styles: scatter(
                            [0, 1], [1, 2], series=["A", "B"], series_styles=styles,
                            draw_order=draw_order, legend_order=legend_order)
                    else:
                        invoke = lambda draw_order=draw_order, legend_order=legend_order, styles=styles: strip_summary(
                            ["G", "G"], [1, 2], series=["A", "B"], series_styles=styles,
                            draw_order=draw_order, legend_order=legend_order)
                    self.assert_rejected_before_allocation(invoke, pattern)
            for argument in ("draw_order", "legend_order"):
                with self.subTest(family=family, anonymous=argument):
                    if family == "scatter":
                        invoke = lambda argument=argument: scatter([0, 1], [1, 2], **{argument: 5})
                    else:
                        invoke = lambda argument=argument: strip_summary(
                            ["G", "H"], [1, 2], **{argument: ["G"]})
                    noun = "draw order" if argument == "draw_order" else "legend order"
                    self.assert_rejected_before_allocation(
                        invoke, rf"{noun} requires an explicit series")
        held, held_ax = plt.subplots()
        held_ax.set_title("unchanged")
        caller = held_ax.scatter([0], [1], c="black", label="Caller")
        before = (held_ax.get_title(), len(held_ax.collections), len(held_ax.lines),
                  caller.get_zorder(), held_ax.get_legend())
        with self.assertRaisesRegex(ValueError, r"scatter\.draw_order\[1\]: duplicate series 'A'"):
            scatter([0, 1], [2, 3], series=["A", "B"], draw_order=["A", "A"], ax=held_ax)
        self.assertEqual(
            (held_ax.get_title(), len(held_ax.collections), len(held_ax.lines),
             caller.get_zorder(), held_ax.get_legend()),
            before)
        with self.assertRaisesRegex(ValueError, r"scatter\.legend_order: legend order requires an explicit series"):
            scatter([0, 1], [2, 3], legend_order=["A"], ax=held_ax)
        self.assertEqual(
            (held_ax.get_title(), len(held_ax.collections), len(held_ax.lines),
             caller.get_zorder(), held_ax.get_legend()),
            before)
        plt.close(held)
        bare, bare_ax = plt.subplots()
        bare_ax.set_title("unchanged")
        with self.assertRaisesRegex(ValueError, r"strip_summary\.draw_order: draw order requires an explicit series"):
            strip_summary(["G", "H"], [1, 2], draw_order=["G"], ax=bare_ax)
        self.assertEqual((bare_ax.get_title(), len(bare_ax.collections), len(bare_ax.lines)),
                         ("unchanged", 0, 0))
        plt.close(bare)
        for invoke in (
            lambda: line([0, 1], [0, 1], draw_order=["A"]),
            lambda: histogram([0, 1], legend_order=["A"]),
            lambda: heatmap([[1, 2], [3, 4]], draw_order=["A"]),
        ):
            with self.subTest(invoke=invoke):
                before_figs = tuple(plt.get_fignums())
                with patch("figurestead.plots.ensure_axes") as ensure_axes:
                    with self.assertRaises(TypeError):
                        invoke()
                    ensure_axes.assert_not_called()
                self.assertEqual(tuple(plt.get_fignums()), before_figs)

    def test_series_orders_accept_inactive_slot_keys_without_phantoms(self) -> None:
        slots = {"A": 0, "B": 1, "quiet": 4, 0: 2}
        fig, ax = scatter(
            [0, 1, 2, 3], [1, 2, 3, 4], series=["A", "B", "A", "B"], series_slots=slots,
            draw_order=["quiet", "B", "A"], legend_order=["B", "quiet", "A"])
        self.assertEqual([artist.get_label() for artist in ax.collections
                          if getattr(artist, "_figurestead_authored_label", False)], ["B", "A"])
        self.assertEqual([text.get_text() for text in ax.get_legend().get_texts()], ["B", "A"])
        plt.close(fig)
        fig, ax = strip_summary(
            ["G", "G"], [1, 2], series=[0, "A"], series_slots={0: 3, "0": 1, "A": 0, "quiet": 2},
            draw_order=[0, "0", "A"], legend_order=["A", "quiet", "0"])
        labelled = [artist.get_label() for artist in ax.collections
                    if getattr(artist, "_figurestead_authored_label", False)]
        self.assertEqual(labelled, ["0", "A"])
        self.assertEqual([text.get_text() for text in ax.get_legend().get_texts()], ["A", "0"])
        self.assertNotIn("quiet", labelled)
        plt.close(fig)
        fig, ax = strip_summary([], [], series=[], series_slots={"quiet": 0},
                                draw_order=["quiet"], legend_order=["quiet"], order=["empty"])
        self.assertEqual([text.get_text() for text in ax.get_xticklabels()], ["empty"])
        self.assertIsNone(ax.get_legend())
        self.assertEqual(len(ax.collections), 0)
        plt.close(fig)

    def test_valid_call_succeeds_after_rejected_input(self) -> None:
        self.assert_rejected_before_allocation(
            lambda: histogram([[1, 2], [3, 4]], labels=["only"]), r"histogram\.labels"
        )
        fig, ax = line([0, 1, 2], [[0, 1, 0]])
        self.assertEqual(len(ax.lines), 1)
        self.assertEqual(len(plt.get_fignums()), 1)
        plt.close(fig)


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(PythonPlotInputRegression)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if result.testsRun != 63:
        raise SystemExit(f"expected exactly 63 Python input-validation cases, ran {result.testsRun}")
    raise SystemExit(0 if result.wasSuccessful() else 1)
