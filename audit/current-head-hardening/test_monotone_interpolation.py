"""Interval-shape regressions for the opt-in interpolation, not default lines."""
from io import BytesIO
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from figurestead import PlotSpec, apply_scientific_pose, export_contract, line, monotone_curve


CASES = (
    ([0, 1, 2], [0, 10, 9]),
    ([0, 1, 2, 3], [0, 10, 9, 0]),
    ([0, 1, 2], [10, 0, 1]),
    ([0, 1, 2, 3], [0, 9, 10, 0]),
    ([0, 1, 2, 3], [0, 10, 10, 9]),
    ([0, 1, 2, 3], [0, 1, 5, 6]),
    ([0, 1, 2, 3], [9, 8, 4, 0]),
    ([0, .01, 2, 2.1], [0, 10, 9, 0]),
    ([0, .01, 2, 2.1], [0, 1, 3, 10]),
    ([0, 1, 2, 3, 4, 5], [.1, .9, 1, .95, 1, .98]),
)


def cubic_coefficients(values):
    """Recover the public helper's cubic from t=0,1/3,2/3,1, not its algorithm."""
    return np.linalg.solve(np.vander([0., 1/3, 2/3, 1.]), values)


class MonotoneInterpolationTests(unittest.TestCase):
    def tearDown(self):
        plt.close("all")

    def assert_intervals(self, x, y):
        xx, yy = monotone_curve(x, y)
        np.testing.assert_array_equal(xx[::18], x)
        np.testing.assert_array_equal(yy[::18], y)
        derivatives = []
        for i in range(len(x) - 1):
            values = yy[[18*i, 18*i+6, 18*i+12, 18*(i+1)]]
            coefficients = cubic_coefficients(values)
            a, b, c, _ = coefficients
            derivative = np.array([3*a, 2*b, c])
            roots = np.roots(derivative)
            ts = [0., 1.] + [r.real for r in roots if abs(r.imag) < 1e-12 and 0 < r.real < 1]
            extrema = np.polyval(coefficients, ts)
            tolerance = 1e-10 * max(1., abs(y[i]), abs(y[i+1]))
            self.assertGreaterEqual(min(extrema), min(y[i:i+2]) - tolerance)
            self.assertLessEqual(max(extrema), max(y[i:i+2]) + tolerance)
            # Endpoints plus the derivative's vertex establish its sign over
            # the entire interval; a range-only check could miss an inner wiggle.
            dt = [0., 1.]
            if a and 0 < -b/(3*a) < 1:
                dt.append(-b/(3*a))
            dy = np.polyval(derivative, dt)
            sign = np.sign(y[i+1] - y[i])
            if sign:
                self.assertGreaterEqual(min(sign*dy), -tolerance)
            else:
                np.testing.assert_allclose(dy, 0, atol=tolerance, rtol=0)
            h = x[i+1] - x[i]
            derivatives.append((c/h, (3*a+2*b+c)/h))
        for i in range(len(derivatives)-1):
            self.assertAlmostEqual(derivatives[i][1], derivatives[i+1][0], places=9)
            if (y[i+1]-y[i])*(y[i+2]-y[i+1]) < 0:
                self.assertAlmostEqual(derivatives[i][1], 0., places=9)

    def test_exact_interval_shape_and_continuity(self):
        for x, y in CASES:
            with self.subTest(x=x, y=y):
                self.assert_intervals(x, y)

    def test_bounded_deterministic_reversal_corpus(self):
        rng = np.random.default_rng(4020)
        for _ in range(64):
            x = np.r_[0., np.cumsum(rng.uniform(.05, 4, 7))]
            y = rng.integers(-10, 11, 8).astype(float)
            self.assert_intervals(x, y)

    def test_small_inputs_and_existing_nonincreasing_x_fallback(self):
        for x, y in (([], []), ([1], [3]), ([0, 0, 1], [0, 10, 9]), ([2, 1, 0], [0, 10, 9])):
            xx, yy = monotone_curve(x, y)
            np.testing.assert_array_equal(xx, x)
            np.testing.assert_array_equal(yy, y)
        xx, yy = monotone_curve([0, 2], [1, 4])
        np.testing.assert_allclose(yy, 1 + 1.5*xx, rtol=0, atol=1e-14)

    def test_pose_preserves_observations_and_exports_without_overshoot(self):
        fig, ax = line([0, 1, 2], [[0, 10, 9]], labels=["Observed"],
                       spec=PlotSpec("Shape preserving"), pose="scientific")
        body = next(item for item in ax.lines if item.get_label() == "Observed")
        self.assertLessEqual(max(body.get_ydata()), 10.)
        self.assertEqual(len(body.get_xdata()), 37)
        for collection in ax.collections:
            np.testing.assert_array_equal(collection.get_offsets(), [[0, 0], [1, 10], [2, 9]])
        ax.set_ylim(0, 10)
        for fmt, magic in (("png", b"\x89PNG"), ("svg", b"<svg")):
            output = BytesIO()
            fig.savefig(output, format=fmt)
            self.assertIn(magic, output.getvalue()[:1000])

    def test_ordinary_route_is_not_interpolated_and_pose_limits_are_unchanged(self):
        _, ax = line([0, 1, 2], [[0, 10, 9]], series_keys=["s"], line_styles={"s": "dash"}, marker_stride=4)
        np.testing.assert_array_equal(ax.lines[0].get_xydata(), [[0, 0], [1, 10], [2, 9]])
        self.assertEqual(ax.lines[0].get_linestyle(), "--")
        for kwargs, error in (({"line_styles": {"s": "dash"}, "series_keys": ["s"]}, "authored rhythm"),
                              ({"marker_stride": 4}, "sparse cadence"),
                              ({"ys": [[0, np.nan, 9]]}, "NaN breaks")):
            args = dict(x=[0, 1, 2], ys=[[0, 10, 9]], pose="scientific")
            args.update(kwargs)
            with self.assertRaisesRegex(ValueError, error):
                line(**args)

    def test_portable_pose_selects_monotone_without_mutating_data(self):
        source = export_contract(renderer="line", spec=PlotSpec("Pose"), data={"x": [0, 1, 2], "series": [{"key": "s", "label": "S", "y": [0, 10, 9]}]})
        posed = apply_scientific_pose(source)
        self.assertEqual(posed["panels"][0]["encoding"]["interpolation"], "monotone")
        self.assertEqual(source["panels"][0]["encoding"]["interpolation"], "linear")
        self.assertEqual(posed["panels"][0]["data"], source["panels"][0]["data"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
