#!/usr/bin/env python3
"""Validate the browser CVD implementation against Colour's Machado 2009 data."""

from __future__ import annotations

import json
import importlib.metadata
import math
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from colour.blindness import matrix_cvd_Machado2009
import numpy


def srgb_to_linear(value: float) -> float:
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def linear_to_srgb(value: float) -> float:
    return 12.92 * value if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def transform(rgb: list[float], matrix: list[list[float]]) -> list[float]:
    linear = [srgb_to_linear(channel) for channel in rgb]
    transformed = [clamp01(sum(row[index] * linear[index] for index in range(3))) for row in matrix]
    return [clamp01(linear_to_srgb(channel)) for channel in transformed]


def main() -> int:
    if len(sys.argv) != 4:
        raise SystemExit("usage: validate-cvd-reference.py NODE CVECTORS_MJS OUTPUT_JSON")

    node_path, vector_script, output_path = sys.argv[1:]
    observed = json.loads(subprocess.check_output([node_path, vector_script], text=True))
    reference_names = {
        "protanomaly": "Protanomaly",
        "deuteranomaly": "Deuteranomaly",
        "tritanomalyApproximation": "Tritanomaly",
    }
    matrix_deltas: dict[str, float] = {}
    vector_deltas: dict[str, float] = {}
    reference_matrices: dict[str, list[list[float]]] = {}

    for key, reference_name in reference_names.items():
        reference = matrix_cvd_Machado2009(reference_name, 1.0).tolist()
        reference_matrices[key] = reference
        matrix_deltas[key] = max(
            abs(observed["matrices"][key][row][column] - reference[row][column])
            for row in range(3)
            for column in range(3)
        )
        vector_deltas[key] = max(
            abs(observed_value - expected_value)
            for sample_name, rgb in observed["samples"].items()
            for observed_value, expected_value in zip(
                observed["simulations"][key][sample_name], transform(rgb, reference), strict=True
            )
        )

    maximum_delta = max([*matrix_deltas.values(), *vector_deltas.values()])
    threshold = 1e-12
    observed_order = "zero at machine precision" if maximum_delta == 0 else f"10^{math.floor(math.log10(maximum_delta))}"
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "gate": "Machado severity-1 matrix and sample-vector assumption check",
        "result": "pass" if maximum_delta <= threshold else "fail",
        "threshold": threshold,
        "maximum_absolute_delta": maximum_delta,
        "agreement": {
            "criterion": "maximum absolute delta at or below the declared threshold",
            "observed_order_of_magnitude": observed_order,
            "interpretation": "Floating-point last-bit deltas are environment-dependent; the tolerance result, not an exact delta, is the acceptance evidence.",
        },
        "environment": {
            "python": sys.version.split()[0],
            "node": subprocess.check_output([node_path, "--version"], text=True).strip(),
            "colour_science": importlib.metadata.version("colour-science"),
            "numpy": numpy.__version__,
        },
        "matrix_maximum_absolute_delta": matrix_deltas,
        "sample_vector_maximum_absolute_delta": vector_deltas,
        "reference": {
            "implementation": "colour-science matrix_cvd_Machado2009",
            "model": "Machado, Oliveira & Fernandes (2009)",
            "severity": 1.0,
            "working_space": "linear-light sRGB with standard sRGB transfer functions",
            "scope": "Colour Science supplies the reference matrices; this gate compares matrices and sample vectors under the browser pipeline's stated sRGB assumptions. It is not a methodologically independent perceptual validation.",
            "tritan_note": "The reference implementation treats the severity-1 tritanomaly-model result as an approximation.",
        },
        "reference_matrices": reference_matrices,
        "sample_count": len(observed["samples"]),
        "all_values_finite": all(
            math.isfinite(value)
            for kind in observed["simulations"].values()
            for sample in kind.values()
            for value in sample
        ),
    }
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["result"] == "pass" and report["all_values_finite"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
