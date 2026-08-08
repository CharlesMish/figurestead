"""Portable schema 0.4 contract builders for temporal extension renderers."""

from __future__ import annotations

from collections.abc import Mapping

from figurestead.portable import export_contract
from .validation import normalize_reference_bands, validate_temporal_vectors


def _base(spec, *, theme, profile, timeline, motion):
    return export_contract(
        renderer="scatter", spec=spec, data={"x": [0.0], "y": [0.0]},
        theme=theme, profile=profile, timeline=timeline, motion=motion,
    )


def export_coverage_contract(
    dates, sites, *, site_order,
    spec: Mapping | object, theme="slipware", profile="deep_scope", timeline=None, motion=None,
):
    """Return a complete browser contract for the temporal coverage renderer."""
    dates, sites, site_order, _ = validate_temporal_vectors(dates, sites, site_order)
    figure = _base(spec, theme=theme, profile=profile, timeline=timeline, motion=motion)
    figure["panels"] = [{
        "id": "temporal-coverage", "renderer": "temporal_coverage", "spec": {},
        "xScale": {"type": "time"}, "yScale": {"type": "band"}, "annotations": [],
        "data": {"dates": list(dates), "sites": list(sites), "siteOrder": list(site_order)},
    }]
    return figure


def export_observation_figure(
    dates, values, sites, *, site_order,
    reference_bands=(), spec: Mapping | object, theme="slipware", profile="deep_scope", timeline=None, motion=None,
):
    """Return ordered, shared-axis browser panels for sparse site observations."""
    dates, sites, site_order, values = validate_temporal_vectors(dates, sites, site_order, values)
    bands = normalize_reference_bands(reference_bands)
    missing = [site for site in site_order if site not in sites]
    if missing:
        raise ValueError(f"site_order contains sites without observations: {missing}")
    figure = _base(spec, theme=theme, profile=profile, timeline=timeline, motion=motion)
    panels = []
    for site in site_order:
        selected = [index for index, value in enumerate(sites) if value == site]
        panels.append({
            "id": f"site-{site}", "renderer": "temporal_observations",
            "spec": {"title": site}, "xScale": {"type": "time"}, "yScale": {"type": "linear"},
            "annotations": [dict(band) for band in bands],
            "data": {"dates": [dates[index] for index in selected], "values": [values[index] for index in selected], "site": site,
                     "referenceBands": [dict(band) for band in bands]},
        })
    figure["panels"] = panels
    figure["layout"] = {"type": "grid", "columns": 1, "gap": 16, "sharedX": True, "sharedY": True}
    return figure
