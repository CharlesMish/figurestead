#!/usr/bin/env python3
"""Python-side regressions for explicit domains and identifiable linear fits."""

from __future__ import annotations

import math
from pathlib import Path
import sys
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from figurestead._statistics import linear_fit  # noqa: E402
from figurestead.motion import animate_scatter  # noqa: E402
from figurestead.portable import PortableContractError, export_contract, export_figure  # noqa: E402


SPEC = {"title": "Scientific geometry"}


def scatter_data(x, y, summary="linear_fit"):
    return {"x": x, "y": y, "series": ["s"] * len(x), "summary": summary}


class ScientificGeometryRegression(unittest.TestCase):
    def test_portable_rejects_one_observation_with_summary_path(self) -> None:
        with self.assertRaisesRegex(PortableContractError, r"data\.summary: .*at least two finite observations"):
            export_contract(renderer="scatter", spec=SPEC, data=scatter_data([1], [5]))

    def test_portable_rejects_constant_x_with_summary_path(self) -> None:
        with self.assertRaisesRegex(PortableContractError, r"data\.summary: .*at least two distinct finite x values"):
            export_contract(renderer="scatter", spec=SPEC, data=scatter_data([1, 1, 1], [1, 2, 3]))

    def test_portable_rejects_nonfinite_inputs(self) -> None:
        for data in (scatter_data([0, math.inf], [1, 2]), scatter_data([0, 1], [1, math.nan])):
            with self.subTest(data=data), self.assertRaisesRegex(PortableContractError, r"must contain only finite numbers"):
                export_contract(renderer="scatter", spec=SPEC, data=data)

    def test_shared_fit_accepts_two_and_three_observations(self) -> None:
        self.assertEqual(linear_fit([0, 2], [1, 5]), (2.0, 1.0))
        self.assertEqual(linear_fit([0, 1, 2], [1, 3, 5]), (2.0, 1.0))

    def test_shared_fit_preserves_valid_horizontal_relation(self) -> None:
        self.assertEqual(linear_fit([0, 1, 2], [5, 5, 5]), (0.0, 5.0))

    def test_motion_rejects_unidentifiable_fit_before_figure_allocation(self) -> None:
        with patch("figurestead.motion.ensure_axes") as ensure_axes:
            with self.assertRaisesRegex(ValueError, r"at least two distinct finite x values"):
                animate_scatter([1, 1], [2, 3], compile_fit=True)
            ensure_axes.assert_not_called()

    def test_portable_preserves_legacy_data_domains(self) -> None:
        contract = export_contract(
            renderer="scatter", spec=SPEC,
            data={**scatter_data([0, 1], [1, 2], summary=None), "xDomain": [-3, 93], "yDomain": [-5, 100]},
        )
        self.assertEqual(contract["panels"][0]["data"]["xDomain"], [-3, 93])
        self.assertEqual(contract["panels"][0]["data"]["yDomain"], [-5, 100])

    def test_multiplot_preserves_authored_scale_domains(self) -> None:
        contract = export_figure(
            spec=SPEC,
            panels=[{
                "renderer": "scatter", "data": scatter_data([0, 1], [1, 2], summary=None),
                "xScale": {"type": "linear", "domain": [-3, 93]},
                "yScale": {"type": "linear", "domain": [-5, 100]},
            }],
        )
        self.assertEqual(contract["panels"][0]["xScale"]["domain"], [-3, 93])
        self.assertEqual(contract["panels"][0]["yScale"]["domain"], [-5, 100])


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ScientificGeometryRegression)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if result.testsRun != 8:
        raise SystemExit(f"expected exactly 8 scientific-geometry Python cases, ran {result.testsRun}")
    raise SystemExit(0 if result.wasSuccessful() else 1)
