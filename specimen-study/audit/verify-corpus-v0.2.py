#!/usr/bin/env python3
"""Verify v0.2 regeneration, v0.1 preservation, and categorical statistics."""

from __future__ import annotations

import hashlib
import json
import shutil
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path


def sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def generated_payloads(root: Path) -> dict[str, bytes]:
    paths = [root / "expected-checksums.json"]
    paths.extend(sorted((root / "scenes").glob("*.json")))
    paths.extend(sorted((root / "tables").glob("*.csv")))
    return {path.relative_to(root).as_posix(): path.read_bytes() for path in paths}


def main() -> int:
    study = Path(__file__).resolve().parents[1]
    v01 = study / "corpus"
    v02 = study / "corpus-v0.2"
    before = generated_payloads(v02)
    with tempfile.TemporaryDirectory(prefix="figurestead-corpus-v02-") as temporary:
        regenerated = Path(temporary) / "corpus-v0.2"
        shutil.copytree(v02, regenerated)
        subprocess.run([sys.executable, str(regenerated / "generate_corpus.py")], check=True, capture_output=True, text=True)
        after = generated_payloads(regenerated)

    expected_v01 = json.loads((v01 / "expected-checksums.json").read_text(encoding="utf-8"))["files"]
    expected_v02 = json.loads((v02 / "expected-checksums.json").read_text(encoding="utf-8"))["files"]
    original_files_unchanged = all(
        relative in expected_v02
        and expected_v02[relative]["sha256"] == expectation["sha256"]
        and expected_v02[relative]["bytes"] == expectation["bytes"]
        for relative, expectation in expected_v01.items()
    )

    scene_path = v02 / "scenes" / "habitat_class_response.json"
    table_path = v02 / "tables" / "habitat_class_response.csv"
    scene = json.loads(scene_path.read_text(encoding="utf-8"))
    statistics_by_group = []
    parameters = {item["group"]: item for item in scene["generation"]["parameters"]}
    for group in scene["data"]["groups"]:
        values = [value for label, value in zip(scene["data"]["group"], scene["data"]["values"]) if label == group]
        parameter = parameters[group]
        statistics_by_group.append({
            "group": group,
            "count": len(values),
            "targetCenter": parameter["targetCenter"],
            "mean": round(statistics.mean(values), 4),
            "median": round(statistics.median(values), 4),
            "targetSpread": parameter["targetSpread"],
            "sampleStandardDeviation": round(statistics.stdev(values), 4),
            "minimum": min(values),
            "maximum": max(values),
        })

    report = {
        "schemaVersion": "figurestead.specimen-corpus-regeneration/1",
        "result": "PASS",
        "corpusVersion": "0.2",
        "sceneCount": len(list((v02 / "scenes").glob("*.json"))),
        "tableCount": len(list((v02 / "tables").glob("*.csv"))),
        "seed": scene["seed"],
        "samplingMethod": scene["generation"]["method"],
        "observationCount": len(scene["data"]["values"]),
        "categoryOrder": scene["data"]["groups"],
        "regenerationByteStable": before == after,
        "originalV01GeneratedFilesUnchanged": original_files_unchanged,
        "originalV01GeneratedFileCount": len(expected_v01),
        "v02GeneratedFileCount": len(expected_v02),
        "newFiles": {
            "scene": {"path": scene_path.relative_to(study).as_posix(), "bytes": scene_path.stat().st_size, "sha256": sha256(scene_path.read_bytes())},
            "table": {"path": table_path.relative_to(study).as_posix(), "bytes": table_path.stat().st_size, "sha256": sha256(table_path.read_bytes())},
        },
        "statistics": statistics_by_group,
    }
    checks = [
        report["sceneCount"] == 13,
        report["tableCount"] == 13,
        report["seed"] == 15401,
        report["observationCount"] == 90,
        report["regenerationByteStable"],
        report["originalV01GeneratedFilesUnchanged"],
        all(item["count"] == 9 for item in statistics_by_group),
        all(item["mean"] == item["targetCenter"] for item in statistics_by_group),
        all(item["sampleStandardDeviation"] == item["targetSpread"] for item in statistics_by_group),
    ]
    if not all(checks):
        report["result"] = "FAIL"
    output = study / "audit" / "corpus-v0.2-regeneration.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
