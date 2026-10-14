"""Regenerate the browser accessibility input from the public Python exporter.

Run from the repository root with PYTHONPATH=src. This is an input contract,
not retained publication evidence or a raster baseline.
"""
import json
from pathlib import Path

from figurestead import PlotSpec, export_contract

contract = export_contract(
    renderer="scatter",
    spec=PlotSpec("Python root-label fixture", xlabel="Time (s)", ylabel="Temperature (K)"),
    data={"x": [100, 200, 300], "y": [280, 300, 320],
          "series": ["sample", "sample", "sample"], "seriesLabels": {"sample": "Sample"}},
    theme="lavender_fog_notebook",
)
Path(__file__).with_suffix(".json").write_text(json.dumps(contract, indent=2) + "\n")
