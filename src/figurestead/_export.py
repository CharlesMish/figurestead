"""Transactional path exports for Matplotlib figures."""

from __future__ import annotations

import os
from pathlib import Path
import tempfile

import matplotlib as mpl


def save_figure(figure, path: str | os.PathLike[str], **savefig_kwargs) -> Path:
    """Save to a path, replacing it only after rendering and closing succeed.

    Matplotlib's ``format`` and filename-extension rules apply: an explicit
    format uses the path verbatim; an extensionless path with no format gains
    the canvas's default extension. SVG/SVGZ require ``svg.image_inline=True``;
    external-image mode is rejected before staging or drawing. Other keywords
    pass to ``figure.savefig``.
    Return the effective destination path.

    The parent directory must exist. This helper accepts filesystem paths,
    not streams, and stages the single output file in the same directory.
    A rendering, writing, or replacement error propagates without changing
    the destination. This is not a crash-durability guarantee or a transaction
    for multi-file output from other backends. Existing file metadata
    is not retained; an existing symlink is replaced, not followed.
    ``figure.savefig`` itself keeps its ordinary Matplotlib behavior.
    """
    destination = Path(path)
    file_format = savefig_kwargs.pop("format", None)
    if file_format is None:
        file_format = os.path.splitext(str(destination))[1][1:]
        if not file_format:
            file_format = figure.canvas.get_default_filetype()
            destination = Path(str(destination).rstrip(".") + "." + file_format)

    # The SVG renderer derives external image paths from the temporary stream's
    # name, outside our one-file transaction. Rasterized artists can create those
    # images during drawing, so reject the mode without inspecting artist types
    # or silently changing the caller's rcParams.
    if file_format.lower() in ("svg", "svgz") and not mpl.rcParams["svg.image_inline"]:
        raise ValueError(
            "save_figure: SVG/SVGZ exports require svg.image_inline=True; "
            "enable embedded images with matplotlib.rc_context({'svg.image_inline': True}), "
            "or use fig.savefig() and manage the external image files"
        )

    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w+b", prefix=".figurestead-", suffix=".tmp",
            dir=destination.parent, delete=False,
        ) as stream:
            temporary = Path(stream.name)
            figure.savefig(stream, format=file_format, **savefig_kwargs)
        os.replace(temporary, destination)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return destination
