"""figurestead public API."""

from .core import PlotSpec
from .plots import heatmap, histogram, line, scatter, strip_summary
from .motion import MotionStyle, MotionTimeline, animate_line, animate_scatter, animate_strip_summary
from .portable import PORTABLE_SCHEMA_VERSION, RENDERER_API_VERSION, export_contract, export_figure, portable_schema
from .profiles import PROFILES, Profile, get_profile
from .registry import PLOTS, available_plots, render
from .themes import THEMES, Theme, get_theme
from .theme_io import (
    THEME_PACK_VERSION, PALETTE_PACK_VERSION, ThemePack, PalettePack, PaletteResolution, ThemePackError, apply_theme, compile_theme_pack,
    contrast_audit, load_authored_theme_pack, load_compiled_theme_pack, load_theme, load_theme_pack,
    normalize_theme_pack_lenient, preview_theme_pack, theme_to_contract,
    load_palette_pack, resolve_palette,
)
from .presentation import EvidenceFocusAnnotation, FocusAnnotation, SCIENTIFIC_POSE, ScientificPose, apply_evidence_pose, apply_scientific_pose, monotone_curve
from .application import APPLICATION_PROFILE_VERSION, APPLICATION_PROFILES, ApplicationProfile, apply_application_profile, get_application_profile
from .scene import TERMINAL_SCENE_VERSION, compile_terminal_scene

__all__ = [
    "PLOTS",
    "PROFILES",
    "THEMES",
    "PlotSpec",
    "MotionStyle",
    "MotionTimeline",
    "PORTABLE_SCHEMA_VERSION",
    "RENDERER_API_VERSION",
    "Profile",
    "Theme",
    "ThemePack",
    "ThemePackError",
    "FocusAnnotation",
    "EvidenceFocusAnnotation",
    "ScientificPose",
    "SCIENTIFIC_POSE",
    "APPLICATION_PROFILE_VERSION",
    "APPLICATION_PROFILES",
    "ApplicationProfile",
    "TERMINAL_SCENE_VERSION",
    "apply_application_profile",
    "get_application_profile",
    "compile_terminal_scene",
    "apply_scientific_pose",
    "apply_evidence_pose",
    "THEME_PACK_VERSION",
    "PALETTE_PACK_VERSION",
    "PalettePack",
    "PaletteResolution",
    "available_plots",
    "animate_line",
    "animate_scatter",
    "animate_strip_summary",
    "export_contract",
    "export_figure",
    "get_profile",
    "get_theme",
    "load_theme",
    "load_theme_pack",
    "load_authored_theme_pack",
    "load_compiled_theme_pack",
    "normalize_theme_pack_lenient",
    "load_palette_pack",
    "resolve_palette",
    "compile_theme_pack",
    "apply_theme",
    "contrast_audit",
    "preview_theme_pack",
    "theme_to_contract",
    "heatmap",
    "histogram",
    "line",
    "monotone_curve",
    "portable_schema",
    "render",
    "scatter",
    "strip_summary",
]
