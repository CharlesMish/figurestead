#!/usr/bin/env python3
"""Verify exact public Python distributions against a local SHA-256 manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import tempfile
import time
import urllib.parse
import urllib.request


ALLOWED_FILE_HOSTS = {
    "pypi.org": {"files.pythonhosted.org"},
    "test.pypi.org": {"test-files.pythonhosted.org"},
}


def read_manifest(path: pathlib.Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line:
            continue
        digest, separator, filename = line.partition("  ")
        if separator != "  " or len(digest) != 64 or not filename:
            raise SystemExit(f"invalid manifest line {number}")
        if pathlib.PurePath(filename).name != filename:
            raise SystemExit(f"manifest filename must be a basename: {filename!r}")
        if filename in result:
            raise SystemExit(f"duplicate manifest filename: {filename}")
        int(digest, 16)
        result[filename] = digest.lower()
    if not result:
        raise SystemExit("empty manifest")
    return result


def fetch_json(url: str, attempts: int = 12) -> dict:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(
                url,
                headers={"Accept": "application/json", "User-Agent": "figurestead-release-verifier/1"},
            )
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.load(response)
        except Exception as error:  # network/index consistency is retried as one boundary
            last_error = error
            if attempt != attempts:
                time.sleep(5)
    raise SystemExit(f"index JSON unavailable after {attempts} attempts: {last_error}")


def download_and_hash(url: str, allowed_hosts: set[str], target: pathlib.Path) -> str:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in allowed_hosts:
        raise SystemExit(f"unexpected distribution URL host: {url}")
    request = urllib.request.Request(url, headers={"User-Agent": "figurestead-release-verifier/1"})
    digest = hashlib.sha256()
    with urllib.request.urlopen(request, timeout=30) as response, target.open("wb") as output:
        final = urllib.parse.urlparse(response.geturl())
        if final.scheme != "https" or final.hostname not in allowed_hosts:
            raise SystemExit(f"unexpected redirected distribution host: {response.geturl()}")
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            output.write(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--index", required=True)
    parser.add_argument("--project", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--manifest", required=True, type=pathlib.Path)
    args = parser.parse_args()

    index = urllib.parse.urlparse(args.index)
    if index.scheme != "https" or index.hostname not in ALLOWED_FILE_HOSTS:
        raise SystemExit("index must be exact PyPI or TestPyPI HTTPS origin")
    if index.path not in ("", "/") or index.params or index.query or index.fragment:
        raise SystemExit("index must not contain path, parameters, query, or fragment")

    expected = read_manifest(args.manifest)
    project = urllib.parse.quote(args.project, safe="")
    version = urllib.parse.quote(args.version, safe="")
    api_url = f"{index.scheme}://{index.hostname}/pypi/{project}/{version}/json"
    payload = fetch_json(api_url)

    if payload.get("info", {}).get("name", "").lower() != args.project.lower():
        raise SystemExit("project name mismatch")
    if payload.get("info", {}).get("version") != args.version:
        raise SystemExit("version mismatch")

    records = payload.get("urls")
    if not isinstance(records, list):
        raise SystemExit("index response has no distribution list")
    observed = {record.get("filename"): record for record in records}
    if len(observed) != len(records):
        raise SystemExit("index response contains duplicate distribution filenames")
    if set(observed) != set(expected):
        raise SystemExit(
            f"distribution set mismatch: expected={sorted(expected)} observed={sorted(observed)}"
        )

    with tempfile.TemporaryDirectory(prefix="figurestead-index-verify-") as temp_dir:
        root = pathlib.Path(temp_dir)
        for filename in sorted(expected):
            record = observed[filename]
            api_digest = record.get("digests", {}).get("sha256", "").lower()
            if api_digest != expected[filename]:
                raise SystemExit(f"index SHA-256 mismatch for {filename}")
            actual_digest = download_and_hash(
                record.get("url", ""), ALLOWED_FILE_HOSTS[index.hostname], root / filename
            )
            if actual_digest != expected[filename]:
                raise SystemExit(f"download SHA-256 mismatch for {filename}")
            print(f"{filename}: {actual_digest} OK")

    print(json.dumps({
        "index": f"{index.scheme}://{index.hostname}",
        "project": args.project,
        "version": args.version,
        "files": expected,
        "verdict": "PASS",
    }, sort_keys=True))


if __name__ == "__main__":
    main()
