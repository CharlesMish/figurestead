#!/usr/bin/env python3
"""Masked-array regressions for the public Python motion boundary."""

from __future__ import annotations

import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


os.environ.setdefault("MPLBACKEND", "Agg")
os.environ.setdefault("MPLCONFIGDIR", "/tmp/figurestead-python-motion-validation-mpl")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

from figurestead._statistics import linear_fit  # noqa: E402
from figurestead.motion import (  # noqa: E402
    MotionStyle,
    animate_line,
    animate_scatter,
    animate_strip_summary,
)


def _partial(values):
    return np.ma.array(values, mask=[False, True, False])


def _full(values):
    return np.ma.array(values, mask=True)


def _zero(values):
    return np.ma.array(values, mask=False)


REJECTION_CASES = (
    ("scatter-partial-x", lambda output: animate_scatter(_partial([12.4, -999.0, 13.1]), [1, 2, 3], output=output), "animate_scatter.x", 1),
    ("scatter-partial-y", lambda output: animate_scatter([0, 1, 2], _partial([12.4, -999.0, 13.1]), output=output), "animate_scatter.y", 1),
    ("scatter-partial-series", lambda output: animate_scatter([0, 1, 2], [1, 2, 3], series=_partial([0, 1, 0]), output=output), "animate_scatter.series", 1),
    ("line-partial-x", lambda output: animate_line(_partial([0, 1, 2]), [1, 2, 3], output=output), "animate_line.x", 1),
    ("line-partial-ys", lambda output: animate_line([0, 1, 2], _partial([12.4, -999.0, 13.1]), output=output), "animate_line.ys", 1),
    ("strip-partial-groups", lambda output: animate_strip_summary(_partial(["a", "a", "b"]), [1, 2, 3], output=output), "animate_strip_summary.groups", 1),
    ("strip-partial-values", lambda output: animate_strip_summary(["a", "a", "b"], _partial([12.4, -999.0, 13.1]), output=output), "animate_strip_summary.values", 1),
    ("strip-partial-series", lambda output: animate_strip_summary(["a", "a", "b"], [1, 2, 3], series=_partial([0, 1, 0]), output=output), "animate_strip_summary.series", 1),
    ("scatter-full-x", lambda output: animate_scatter(_full([0, 1, 2]), [1, 2, 3], output=output), "animate_scatter.x", 3),
    ("line-full-ys", lambda output: animate_line([0, 1, 2], _full([1, 2, 3]), output=output), "animate_line.ys", 3),
    ("strip-full-values", lambda output: animate_strip_summary(["a", "a", "b"], _full([1, 2, 3]), output=output), "animate_strip_summary.values", 3),
    ("scatter-zero-x", lambda output: animate_scatter(_zero([0, 1, 2]), [1, 2, 3], output=output), "animate_scatter.x", 0),
    ("line-zero-ys", lambda output: animate_line([0, 1, 2], _zero([1, 2, 3]), output=output), "animate_line.ys", 0),
    ("strip-zero-values", lambda output: animate_strip_summary(["a", "a", "b"], _zero([1, 2, 3]), output=output), "animate_strip_summary.values", 0),
    (
        "line-nested-ys",
        lambda output: animate_line(
            [0, 1, 2],
            [np.array([1, 2, 3]), _partial([3, -999, 1])],
            output=output,
        ),
        "animate_line.ys",
        1,
    ),
)


class PythonMotionInputRegression(unittest.TestCase):
    def setUp(self) -> None:
        plt.close("all")
        self.temporary = tempfile.TemporaryDirectory(prefix="figurestead-motion-inputs-")

    def tearDown(self) -> None:
        self.temporary.cleanup()
        plt.close("all")

    def assert_mask_rejected(self, name, invoke, path, count) -> None:
        output = Path(self.temporary.name) / name / "motion.gif"
        before_figures = tuple(plt.get_fignums())
        noun = "entry" if count == 1 else "entries"
        pattern = rf"{path}: masked arrays are not currently supported \({count} masked {noun}\)"
        with (
            patch("figurestead.motion.ensure_axes") as ensure_axes,
            patch("figurestead.motion.linear_fit") as fit,
            patch("figurestead.motion.PointTrickle") as point_trickle,
            patch("figurestead.motion._save_animation") as save_animation,
        ):
            with self.assertRaisesRegex(ValueError, pattern):
                invoke(output)
            ensure_axes.assert_not_called()
            fit.assert_not_called()
            point_trickle.assert_not_called()
            save_animation.assert_not_called()
        self.assertEqual(tuple(plt.get_fignums()), before_figures)
        self.assertFalse(output.parent.exists())
        self.assertFalse(output.exists())
        self.assertFalse(output.with_suffix(".final.png").exists())

    def test_all_masked_inputs_fail_before_scientific_work(self) -> None:
        for case in REJECTION_CASES:
            with self.subTest(case=case[0]):
                self.assert_mask_rejected(*case)

    def test_partial_fixture_reproduces_the_reviewed_sentinel_boundary(self) -> None:
        values = np.ma.masked_equal(np.array([12.4, -999.0, 13.1]), -999.0)
        self.assertTrue(np.ma.isMaskedArray(values))
        self.assertEqual(values.mask.tolist(), [False, True, False])
        self.assertEqual(np.asarray(values).tolist(), [12.4, -999.0, 13.1])

    def test_valid_scatter_fit_and_motion_style_remain_unchanged(self) -> None:
        captured_fit = []
        captured_motion = []

        def record_fit(x, y):
            result = linear_fit(x, y)
            captured_fit.append(result)
            return result

        def no_save(fig, update, output, motion, **kwargs):
            captured_motion.append(motion)
            update(1.0)
            plt.close(fig)
            return Path(output)

        style = MotionStyle(frames=5, fps=7, seed=73)
        output = Path(self.temporary.name) / "valid-scatter.gif"
        with patch("figurestead.motion.linear_fit", side_effect=record_fit), patch(
            "figurestead.motion._save_animation", side_effect=no_save
        ):
            result = animate_scatter(
                np.array([0.0, 1.0, 2.0]),
                np.array([1.0, 3.0, 5.0]),
                motion=style,
                output=output,
            )
        self.assertEqual(result, output)
        self.assertEqual(captured_fit, [(2.0, 1.0)])
        self.assertEqual(captured_motion, [style])
        self.assertFalse(output.exists())

    def test_valid_list_tuple_and_categorical_controls_remain_accepted(self) -> None:
        outputs = []

        def no_save(fig, update, output, motion, **kwargs):
            update(1.0)
            plt.close(fig)
            outputs.append(Path(output))
            return Path(output)

        with patch("figurestead.motion._save_animation", side_effect=no_save):
            scatter_output = animate_scatter(
                [0, 1, 2], (1, 3, 5), series=("a", "a", "b"),
                output=Path(self.temporary.name) / "scatter.gif",
            )
            line_output = animate_line(
                (0, 1, 2), ([1, 2, 3], [3, 2, 1]),
                output=Path(self.temporary.name) / "line.gif",
            )
            strip_output = animate_strip_summary(
                ("headwater", "headwater", "agriculture"), [1, 2, 3],
                series=np.array([0, 1, 0]),
                output=Path(self.temporary.name) / "strip.gif",
            )
        self.assertEqual(outputs, [scatter_output, line_output, strip_output])
        self.assertTrue(all(not output.exists() for output in outputs))

    def test_each_public_motion_helper_recovers_after_rejection(self) -> None:
        failing = (
            REJECTION_CASES[0],
            REJECTION_CASES[4],
            REJECTION_CASES[6],
        )
        for case in failing:
            with self.subTest(rejection=case[0]):
                self.assert_mask_rejected(*case)

        completed = []

        def no_save(fig, update, output, motion, **kwargs):
            update(1.0)
            plt.close(fig)
            completed.append(Path(output).name)
            return Path(output)

        with patch("figurestead.motion._save_animation", side_effect=no_save):
            animate_scatter([0, 1, 2], [1, 3, 5], output="scatter.gif")
            animate_line([0, 1, 2], [1, 2, 3], output="line.gif")
            animate_strip_summary(["a", "a", "b"], [1, 2, 3], output="strip.gif")
        self.assertEqual(completed, ["scatter.gif", "line.gif", "strip.gif"])


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(PythonMotionInputRegression)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if result.testsRun != 5:
        raise SystemExit(f"expected exactly 5 motion input tests, ran {result.testsRun}")
    if result.wasSuccessful():
        print(
            "motion masked-array regression: "
            f"{len(REJECTION_CASES)} rejection scenarios + 3 recovery paths PASS"
        )
    raise SystemExit(0 if result.wasSuccessful() else 1)
