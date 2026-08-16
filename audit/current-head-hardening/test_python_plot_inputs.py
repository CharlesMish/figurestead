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
        self.assertEqual([item.get_text() for item in ax.get_legend().get_texts()], ["first", "second"])
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
    if result.testsRun != 45:
        raise SystemExit(f"expected exactly 45 Python input-validation cases, ran {result.testsRun}")
    raise SystemExit(0 if result.wasSuccessful() else 1)
