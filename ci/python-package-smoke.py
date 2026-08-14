"""Smoke the installed Figurestead wheel, never the source tree."""

from __future__ import annotations

import hashlib
import importlib.metadata
from pathlib import Path
import tempfile

from figurestead import line


checks = []
checks.append(importlib.metadata.version("figurestead") == "0.9.0a1")
checks.append(callable(line))
with tempfile.TemporaryDirectory(prefix="figurestead-packed-smoke-") as temporary:
    output = Path(temporary) / "packed-smoke.png"
    figure, _ = line([0, 1, 2], [[0, 1, 0]])
    figure.savefig(output, dpi=100)
    payload = output.read_bytes()
    checks.append(payload.startswith(b"\x89PNG\r\n\x1a\n") and len(payload) > 1000)
    digest = hashlib.sha256(payload).hexdigest()

if len(checks) != 3:
    raise SystemExit(f"expected exactly 3 packed Python checks, executed {len(checks)}")
if not all(checks):
    raise SystemExit(f"packed Python smoke failed: {checks}")
print({"suite": "python-packed-smoke", "expectedCaseCount": 3, "executedCaseCount": len(checks), "pngSha256": digest, "result": "PASS"})
