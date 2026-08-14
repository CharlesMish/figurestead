#!/usr/bin/env python3
"""Check the accepted R3 frozen-site bytes and lossless delivery mapping."""

from __future__ import annotations

import hashlib
import json
import struct
from pathlib import Path
import subprocess
import zlib


ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
ACCEPTED_FILES = {
    "index.html": "572120e037d96209c507f1f23a00e070e9a649ca3015f8121734276f9d6d62ca",
    "evidence/index.html": "e9bf28929af0e1210f749cbc7686c2106f6f8eae66dbd33a45b19bb36db3641f",
    "styles.css": "281d7261c7663621d9e6632fcafb1cbc4d5a5a4550546b31fc7c3c9cbdd89b59",
    "README.md": "e089b27769a66923d11d7e873912f847fcb36fc43d0b5d0534184a77e006419c",
    "public-alpha-set.json": "657cc806d1ee4ae43c2cb70a910da4360c896e87e5855f5c16fa163b0b42bef9",
    "WEB_ASSET_MANIFEST.json": "f5865fc6cc06703358e6cd859fb88c8ed950c17c1d96041413d81fab91522d07",
}


def sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def paeth(left: int, above: int, upper_left: int) -> int:
    estimate = left + above - upper_left
    distances = (abs(estimate - left), abs(estimate - above), abs(estimate - upper_left))
    return (left, above, upper_left)[distances.index(min(distances))]


def decode_rgba(path: Path) -> tuple[int, int, bytes]:
    payload = path.read_bytes()
    assert payload[:8] == b"\x89PNG\r\n\x1a\n", path
    position = 8
    compressed = bytearray()
    width = height = None
    while position < len(payload):
        length = struct.unpack(">I", payload[position : position + 4])[0]
        chunk_type = payload[position + 4 : position + 8]
        chunk = payload[position + 8 : position + 8 + length]
        position += 12 + length
        if chunk_type == b"IHDR":
            width, height, depth, color_type, compression, filtering, interlace = struct.unpack(">IIBBBBB", chunk)
            assert (depth, color_type, compression, filtering, interlace) == (8, 6, 0, 0, 0), path
        elif chunk_type == b"IDAT":
            compressed.extend(chunk)
        elif chunk_type == b"IEND":
            break
    assert width and height
    encoded = zlib.decompress(bytes(compressed))
    stride = width * 4
    assert len(encoded) == height * (stride + 1)
    rows: list[bytes] = []
    previous = bytearray(stride)
    offset = 0
    for _ in range(height):
        filter_type = encoded[offset]
        source = encoded[offset + 1 : offset + 1 + stride]
        offset += stride + 1
        row = bytearray(stride)
        for index, value in enumerate(source):
            left = row[index - 4] if index >= 4 else 0
            above = previous[index]
            upper_left = previous[index - 4] if index >= 4 else 0
            predictors = {0: 0, 1: left, 2: above, 3: (left + above) // 2, 4: paeth(left, above, upper_left)}
            assert filter_type in predictors, f"unsupported PNG filter {filter_type} in {path}"
            row[index] = (value + predictors[filter_type]) & 255
        rows.append(bytes(row))
        previous = row
    return width, height, b"".join(rows)


def main() -> int:
    checks = 0
    changed = subprocess.check_output(
        ["git", "diff", "--name-only", "f3cc4a4dbf40b60635707c5ad6e21856bac57057", "--", "site"],
        cwd=ROOT,
        text=True,
    ).splitlines()
    accepted_changed_files = {
        "site/README.md",
        "site/evidence/index.html",
        "site/index.html",
        "site/public-alpha-set.json",
        "site/styles.css",
        "site/WEB_ASSET_MANIFEST.json",
    }
    unexpected = [
        relative for relative in changed
        if relative not in accepted_changed_files and not relative.startswith("site/assets/web/")
    ]
    assert not unexpected, unexpected
    checks += 1
    for relative, expected in ACCEPTED_FILES.items():
        assert sha256((SITE / relative).read_bytes()) == expected, relative
        checks += 1
    assert not any(SITE.rglob("*.lnk"))
    assert not any(path.is_symlink() for path in SITE.rglob("*"))
    checks += 1

    canonical_manifest = json.loads((SITE / "ASSET_MANIFEST.json").read_text(encoding="utf-8"))
    assert canonical_manifest["schemaVersion"] == "figurestead.public-alpha-assets/1"
    assert canonical_manifest["synthetic"] is True
    assert len(canonical_manifest["assets"]) == 17
    canonical_by_path = {entry["path"]: entry for entry in canonical_manifest["assets"]}
    for entry in canonical_manifest["assets"]:
        payload = (SITE / entry["path"]).read_bytes()
        assert len(payload) == entry["bytes"] and sha256(payload) == entry["sha256"], entry["path"]
    checks += 17

    web_manifest = json.loads((SITE / "WEB_ASSET_MANIFEST.json").read_text(encoding="utf-8"))
    assert web_manifest["schemaVersion"] == "figurestead.web-delivery-assets/1"
    assert web_manifest["canonicalAssetsPreserved"] is True
    assert web_manifest["canonicalManifest"] == "ASSET_MANIFEST.json"
    assert len(web_manifest["losslessDerivatives"]) == 17
    recorded_web_paths: set[str] = set()
    for entry in web_manifest["losslessDerivatives"]:
        canonical = canonical_by_path[entry["canonicalPath"]]
        derivative = SITE / entry["derivativePath"]
        payload = derivative.read_bytes()
        assert entry["canonicalBytes"] == canonical["bytes"] and entry["canonicalSha256"] == canonical["sha256"]
        assert len(payload) == entry["derivativeBytes"] and sha256(payload) == entry["derivativeSha256"]
        source_width, source_height, source_pixels = decode_rgba(SITE / entry["canonicalPath"])
        derivative_width, derivative_height, derivative_pixels = decode_rgba(derivative)
        assert (source_width, source_height) == (derivative_width, derivative_height)
        assert source_pixels == derivative_pixels
        assert sha256(source_pixels) == entry["decodedPixelSha256"] and entry["decodedPixelsIdentical"] is True
        recorded_web_paths.add(entry["derivativePath"])
    checks += 17

    for entry in web_manifest["responsiveDerivatives"]:
        payload = (SITE / entry["path"]).read_bytes()
        assert len(payload) == entry["bytes"] and sha256(payload) == entry["sha256"], entry["path"]
        recorded_web_paths.add(entry["path"])
        checks += 1

    grayscale = web_manifest["grayscaleCase05"]
    assert grayscale["sourceCanonicalSha256"] == canonical_by_path[grayscale["sourceCanonicalPath"]]["sha256"]
    grayscale_path = SITE / grayscale["derivativePath"]
    grayscale_payload = grayscale_path.read_bytes()
    assert len(grayscale_payload) == grayscale["derivativeBytes"] and sha256(grayscale_payload) == grayscale["derivativeSha256"]
    grayscale_width, grayscale_height, grayscale_pixels = decode_rgba(grayscale_path)
    source_width, source_height, source_pixels = decode_rgba(SITE / grayscale["sourceCanonicalPath"])
    assert (grayscale_width, grayscale_height) == (source_width, source_height)
    assert all(grayscale_pixels[index] == grayscale_pixels[index + 1] == grayscale_pixels[index + 2] for index in range(0, len(grayscale_pixels), 4))
    assert grayscale_pixels[3::4] == source_pixels[3::4]
    assert sha256(grayscale_pixels) == grayscale["decodedPixelSha256"]
    assert grayscale["channelsEqual"] is True and grayscale["alphaPreserved"] is True and grayscale["geometryPreserved"] is True
    recorded_web_paths.add(grayscale["derivativePath"])
    responsive_grayscale = grayscale["responsiveDerivative"]
    responsive_payload = (SITE / responsive_grayscale["path"]).read_bytes()
    assert len(responsive_payload) == responsive_grayscale["bytes"] and sha256(responsive_payload) == responsive_grayscale["sha256"]
    recorded_web_paths.add(responsive_grayscale["path"])
    checks += 2

    actual_web_paths = {path.relative_to(SITE).as_posix() for path in (SITE / "assets" / "web").glob("*.png")}
    assert actual_web_paths == recorded_web_paths
    assert web_manifest["totals"] == {
        "canonicalBytes": 69380331,
        "losslessDerivativeBytes": 2127517,
        "savingBytes": 67252814,
        "savingPercent": 96.934,
    }
    checks += 2
    expected_checks = 62
    assert checks == expected_checks, f"expected {expected_checks} site checks, executed {checks}"
    print(json.dumps({"suite": "public-r3-assets", "expectedCheckCount": expected_checks, "executedCheckCount": checks, "result": "PASS"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
