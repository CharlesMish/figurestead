#!/usr/bin/env python3
"""Verify v0.2 regeneration, v0.1 preservation, and categorical statistics."""

from __future__ import annotations

import hashlib
import json
import os
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
    paths.extend(sorted((root / "derived").glob("*.csv")))
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

    matrix_scene_path = v02 / "scenes" / "habitat_response_matrix.json"
    matrix_table_path = v02 / "tables" / "habitat_response_matrix.csv"
    matrix_scene = json.loads(matrix_scene_path.read_text(encoding="utf-8"))
    habitats = matrix_scene["data"]["xCategories"]
    bands = matrix_scene["responseBands"]
    observations = matrix_scene["rawObservations"]
    count_matrix = matrix_scene["derived"]["countMatrix"]
    share_matrix = matrix_scene["derived"]["shareMatrix"]
    cell_lookup = {(cell["x"], cell["y"]): cell for cell in matrix_scene["data"]["cells"]}
    observations_by_habitat = {habitat: [item for item in observations if item["habitat"] == habitat] for habitat in habitats}
    recomputed_counts = []
    for band in bands:
        recomputed_counts.append([
            sum(item["responseBand"] == band["label"] for item in observations_by_habitat[habitat])
            for habitat in habitats
        ])
    recomputed_shares = [[count / 30 for count in row] for row in recomputed_counts]
    bin_membership_exact = all(
        sum(
            item["responseIndex"] >= band["lowerInclusive"]
            and (
                item["responseIndex"] <= band["upperInclusive"]
                if band["upperInclusive"] is not None
                else item["responseIndex"] < band["upperExclusive"]
            )
            for band in bands
        ) == 1
        for item in observations
    )
    cells_exact = all(
        cell_lookup[(habitat, band["label"])]["count"] == recomputed_counts[row_index][column_index]
        and cell_lookup[(habitat, band["label"])]["share"] == recomputed_shares[row_index][column_index]
        and cell_lookup[(habitat, band["label"])]["value"] == recomputed_shares[row_index][column_index]
        and cell_lookup[(habitat, band["label"])]["label"] == f"{recomputed_shares[row_index][column_index]:.0%}\nn={recomputed_counts[row_index][column_index]}"
        for row_index, band in enumerate(bands)
        for column_index, habitat in enumerate(habitats)
    )

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
        "responseMatrix": {
            "scenePath": matrix_scene_path.relative_to(study).as_posix(),
            "sceneSha256": sha256(matrix_scene_path.read_bytes()),
            "rawTablePath": matrix_table_path.relative_to(study).as_posix(),
            "rawTableSha256": sha256(matrix_table_path.read_bytes()),
            "seed": matrix_scene["seed"],
            "renderer": matrix_scene["renderer"],
            "rendererAuthority": matrix_scene["rendererAuthority"],
            "observationCount": len(observations),
            "habitatCount": len(habitats),
            "responseBandCount": len(bands),
            "observationsPerHabitat": {habitat: len(items) for habitat, items in observations_by_habitat.items()},
            "binMembershipExact": bin_membership_exact,
            "derivedCountsMatchRaw": count_matrix == recomputed_counts,
            "derivedSharesMatchCounts": share_matrix == recomputed_shares,
            "columnCountSums": [sum(row[column] for row in count_matrix) for column in range(len(habitats))],
            "columnShareSums": [sum(row[column] for row in share_matrix) for column in range(len(habitats))],
            "columnShareSumTolerance": 1e-12,
            "cellsMatchDerivedMatrices": cells_exact,
            "countMatrix": count_matrix,
            "shareMatrix": share_matrix,
        },
    }
    checks = [
        report["sceneCount"] == 14,
        report["tableCount"] == 14,
        report["seed"] == 15401,
        report["observationCount"] == 90,
        report["regenerationByteStable"],
        report["originalV01GeneratedFilesUnchanged"],
        all(item["count"] == 9 for item in statistics_by_group),
        all(item["mean"] == item["targetCenter"] for item in statistics_by_group),
        all(item["sampleStandardDeviation"] == item["targetSpread"] for item in statistics_by_group),
        report["responseMatrix"]["seed"] == 15401,
        report["responseMatrix"]["renderer"] == "categorical_matrix",
        report["responseMatrix"]["observationCount"] == 300,
        report["responseMatrix"]["habitatCount"] == 10,
        report["responseMatrix"]["responseBandCount"] == 6,
        set(report["responseMatrix"]["observationsPerHabitat"].values()) == {30},
        report["responseMatrix"]["binMembershipExact"],
        report["responseMatrix"]["derivedCountsMatchRaw"],
        report["responseMatrix"]["derivedSharesMatchCounts"],
        report["responseMatrix"]["columnCountSums"] == [30] * 10,
        all(
            abs(value - 1.0) <= report["responseMatrix"]["columnShareSumTolerance"]
            for value in report["responseMatrix"]["columnShareSums"]
        ),
        report["responseMatrix"]["cellsMatchDerivedMatrices"],
    ]
    report["expectedCheckCount"] = 21
    report["executedCheckCount"] = len(checks)
    if len(checks) != report["expectedCheckCount"]:
        raise RuntimeError(
            f"expected {report['expectedCheckCount']} corpus checks, executed {len(checks)}"
        )
    if not all(checks):
        report["result"] = "FAIL"
    output_root = os.environ.get("FIGURESTEAD_AUDIT_OUTPUT_ROOT")
    output = (
        Path(output_root).resolve() / "corpus-v0.2-regeneration.json"
        if output_root
        else study / "audit" / "corpus-v0.2-regeneration.json"
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
