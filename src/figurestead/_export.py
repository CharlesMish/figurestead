"""Transactional path exports for Matplotlib figures."""

from __future__ import annotations

import os
from pathlib import Path
import tempfile


def save_figure(figure, path: str | os.PathLike[str], **savefig_kwargs) -> Path:
    """Save to a path, replacing it only after rendering and closing succeed.

    Matplotlib's ``format`` and filename-extension rules apply: an explicit
    format uses the path verbatim; an extensionless path with no format gains
    the canvas's default extension. Other keywords pass to ``figure.savefig``.
    Return the effective destination path.

    The parent directory must exist. This helper accepts filesystem paths,
    not streams, and stages the single output file in the same directory.
    A rendering, writing, or replacement error propagates without changing
    the destination. This is not a crash-durability guarantee or a transaction
    for auxiliary files produced by a custom backend. Existing file metadata
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
