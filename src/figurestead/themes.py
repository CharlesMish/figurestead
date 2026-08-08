"""Semantic color tokens for the six-theme Figurestead public alpha."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Theme:
    key: str
    name: str
    field: str
    panel: str
    grid: str
    spine: str
    label: str
    secondary: str
    faint: str
    primary: str
    summary_core: str
    warm: str
    series: tuple[str, ...]
    primary_edge: str | None = None
    summary_edge: str | None = None
    series_edges: tuple[str, ...] | None = None


THEMES: dict[str, Theme] = {
    "deep_observatory_sage_core": Theme(
        key="deep_observatory_sage_core",
        name='Deep Observatory / Sage Core',
        field='#10171D',
        panel='#19252A',
        grid='#29393A',
        spine='#748780',
        label='#E3ECE8',
        secondary='#A8B5AE',
        faint='#71817C',
        primary='#5A9FA4',
        summary_core='#C1C7BC',
        warm='#D45A34',
        series=('#5A9FA4', '#C59C3E', '#B44D4F', '#8A76C4', '#7BB888'),
    ),
    "slipware": Theme(
        key="slipware",
        name='Slipware',
        field='#E0D3C4',
        panel='#FAF5EE',
        grid='#DCD1C2',
        spine='#6E6055',
        label='#2B2320',
        secondary='#6B5D53',
        faint='#9C8F84',
        primary='#1B4C8A',
        summary_core='#0E0A08',
        warm='#B4552A',
        series=('#1B4C8A', '#143F33', '#0E766E', '#8B7A16', '#3C97AC'),
    ),
    "midnight_transit_signal_slate": Theme(
        key="midnight_transit_signal_slate",
        name='Midnight Transit / Signal Slate',
        field='#0A1522',
        panel='#13243A',
        grid='#263D4E',
        spine='#708A93',
        label='#DDE7E5',
        secondary='#9EAFB3',
        faint='#637980',
        primary='#5EA5C8',
        summary_core='#C3C8BC',
        warm='#E06018',
        series=('#5EA5C8', '#8BAF81', '#B6696B', '#8B69A3', '#CDAD33'),
    ),
    "ultraviolet_laboratory": Theme(
        key="ultraviolet_laboratory",
        name='Ultraviolet Laboratory',
        field='#0D0B18',
        panel='#171329',
        grid='#302A4E',
        spine='#4D4672',
        label='#F6F2FF',
        secondary='#C9C0E5',
        faint='#8D83B2',
        primary='#B59BFF',
        summary_core='#67D7C4',
        warm='#F2A65A',
        series=('#B59BFF', '#67D7C4', '#F2A65A', '#E57FA6', '#8DB7FF', '#BBD66B'),
    ),
    "lavender_fog_notebook": Theme(
        key="lavender_fog_notebook",
        name='Lavender Fog Notebook',
        field='#F4F1F8',
        panel='#FCFAFF',
        grid='#DDD7E7',
        spine='#9087A1',
        label='#201B2B',
        secondary='#51495F',
        faint='#7B718B',
        primary='#6855A8',
        summary_core='#18776D',
        warm='#A44E5E',
        series=('#6855A8', '#18776D', '#9B5B16', '#A44E5E', '#326D9B', '#52752C'),
    ),
    "registration_ink": Theme(
        key="registration_ink",
        name='Registration Ink',
        field='#E7DFD2',
        panel='#F5EFE4',
        grid='#D7CCC0',
        spine='#806F64',
        label='#271E1B',
        secondary='#62564F',
        faint='#94877B',
        primary='#9C3038',
        summary_core='#241B1C',
        warm='#A83A9A',
        series=('#9C3038', '#1C6673', '#4E3E78', '#B16D28', '#6C2948'),
    ),
}


def get_theme(theme: str | Theme = "slipware") -> Theme:
    if isinstance(theme, Theme):
        return theme
    try:
        return THEMES[theme]
    except KeyError as exc:
        choices = ", ".join(THEMES)
        raise ValueError(f"Unknown theme {theme!r}; choose one of: {choices}") from exc
