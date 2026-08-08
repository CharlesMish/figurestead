"""Temporal renderer extension with Canvas-contract and Matplotlib parity."""

from .contracts import export_coverage_contract, export_observation_figure
from .plots import coverage_timeline, faceted_temporal_observations
from .validation import PROVISIONAL_LABEL, PROVISIONAL_STATUS

__all__ = [
    "PROVISIONAL_LABEL",
    "PROVISIONAL_STATUS",
    "coverage_timeline",
    "export_coverage_contract",
    "export_observation_figure",
    "faceted_temporal_observations",
]
