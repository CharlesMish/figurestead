# Figurestead follow-up field test

Own a short, independent consumer test of the unreleased Python candidate at
**`971f21b8ed3a31aff116135a1f4ea2a71fc7a685`**. Produce figures and evidence, not a package
repair. No Figurestead repository edits or publishing are required. Keep the
original NOAA bundle intact and work in a separate project.

## Establish the exact package

Use a fresh environment supported by the candidate. One installation route is:

```sh
python -m pip install "figurestead @ git+https://github.com/CharlesMish/figurestead.git@971f21b8ed3a31aff116135a1f4ea2a71fc7a685"
```

The package version still reports `0.9.0a4`; that alone does **not** identify
this candidate. Record the resolved full commit, installed package location,
VCS installation metadata (`direct_url.json`), install command, Python/OS,
Matplotlib/backend, and frozen dependencies. Preserve a wheel or source archive
with SHA-256 when practical so the tested package remains identifiable. If
installation is blocked, report the exact blocker; do not silently substitute
registry `0.9.0a4` or a moving branch.

Current-version onboarding corrections are separately pending in
[PR #50](https://github.com/CharlesMish/figurestead/pull/50). The candidate
README still contains an older retained-wheel command; use the source pin above
for this test. Treat that known pending documentation update separately from
new findings.

Read the README and `docs/python-layout-and-comparison.md`,
`docs/direct-series-labels.md`, `docs/line-series-semantics.md`, and
`docs/histogram-medians.md` at that same commit. Record any later need to inspect
implementation source or obtain outside help.

## Replay the NOAA report

Use the original saved 2025 Chicago/Phoenix/Seattle CSV. Its SHA-256 is
`4f1a42d3b9a003f2a8b5326f30d9fcb696da5381b9ce7f95538db14cf830bc81`.
Preserve this snapshot and provenance; NOAA access is needed only for a fresh
retrieval. Record changed analysis commands/code separately from the original.

Correct the report's period error: Phoenix had **90 annual days ≥40 °C, but
75 of 92 June–August days**. Recompute these as separate named fields. Confirm
the station-day counts, medians, and temperature ranges independently.

Recreate the full-year line, histogram, strip summary, and summer revision:

- Initially remove the old note-specific bottom-margin workaround. Use normal
  PNG and SVG exports, without `bbox_inches="tight"`. Inspect the actual files
  at intended reading size; check that source notes are visible and unclipped.
- Inspect strip `n=` labels against points, summary marks, and titles. Check
  that line endpoint labels are actually visible in both export formats;
  internal status metadata alone is insufficient. Record documented legend
  fallback separately from a failed label.
- Repeat at one sensible alternate figure size, and with a longer realistic
  source note. Exercise the documented sizing route and record whether
  caller-supplied axes require caller-owned margins. Log any workaround only
  after capturing the original result.
- Use explicit shared histogram bin edges spanning all observations. Save the
  edges and counts; verify each dataset's counts sum to its included sample
  size. Assess whether overlaid distributions are distinguishable and whether
  unequal sample sizes need clearer interpretation. Keep design feedback
  separate from numerical defects.

## Add a bounded independent test

Choose one small, related real environmental dataset with documented units and
provenance; answer one useful question with one or two figures. Preserve its
raw bytes/hash, retrieval instructions, exclusions, and transformations. Do not
fabricate or silently impute observations.

Then use clearly labeled synthetic fixtures for only these edge cases:

1. A line with interior and boundary NaNs: verify intended breaks and surviving
   observations, without inventing continuity.
2. A one-point line and a one-observation strip group: check visibility and
   truthful counts/summaries.
3. A declared empty strip category: record the documented policy, actual result
   or error, and whether any phantom summary appears.
4. Unequal distributions with different ranges and sample sizes: verify shared
   histogram edges and count conservation, including edge-valued observations.

## Return

Deliver the concise corrected report, inspected PNG/SVG figures, runnable
scripts, raw-data and package identities, dependency record, and exact rerun
commands. Retain before/after evidence for problems. Classify findings as
**confirmed defects, documented limitations, design feedback, dataset/report
errors, or unresolved/environment issues**. Include minimal repros for material
defects and up to three evidence-backed priorities. Report passes too; there is
no bug quota. Distinguish reproduced calculations from rendering checks and
same-environment byte repeatability from portability to another environment.
