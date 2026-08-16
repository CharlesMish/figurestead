# Compact scientific layout hardening audit

This audit isolates the shared Figurestead annotation layout correction from the
accepted public R3 and V2 source trees. The frozen pre-change renderer is served
from commit `ffc23b89ff3e4851bcba91302bb542d9ad53b3e6`; the corrected renderer is
served from the working branch.

## Finding and correction

The former layout estimated plot margins from canvas dimensions, then placed
x ticks, the x-axis title, and provenance from unrelated fixed offsets. At the
1920 × 1080 montage target, all eight cases had a `-12.778 px` vertical
x-title-to-provenance gap and `2100.244 px²` of combined measured overlap. The
y-title-to-tick gaps ranged from `15.264–27.852 px`, while x-tick-to-title gaps
ranged from `33.086–35.572 px`.

The revised internal pass measures the resolved tick strings and lays out, in
order, `plot → ticks → x title → optional footer` and
`y title → y ticks → plot`. Canvas uses the actual `measureText()` bounds; SVG
and non-DOM export use a deterministic conservative monospace metric. The
second resolution pass recomputes scales and geometry against the refined plot
rectangle. A later readability micro-pass changed only the accepted compact
single-panel title floor from 13 to 14 px and compact provenance floor from 8
to 9 px; the audit permits exactly those two deltas and rejects any other
typographic drift.

At the same montage target, all eight cases now have `4 px` x-tick/title gaps,
`5 px` x-title/provenance gaps, `5.15 px` y-title/tick gaps, and zero measured
intersections. Removing the optional footer reclaims `12.5 px` of plot height.

## Evidence

- `specimen-study/evidence/layout-hardening/before/` — frozen pre-change
  screenshots and measured bounds.
- `specimen-study/evidence/layout-hardening/after/` — Chromium and Firefox
  screenshots/bounds at lab, 1920 montage, 390 reflow, Chromium DPR2, normal
  V2 rendering, and 89/183 mm SVG exports.
- `technical-verification.json` — the separate accepted V2 audit result copied
  into this pass before its generated V2 evidence directory was restored.

`after/bounds.json` is the acceptance record. It asserts positive measured
inter-region gaps, zero overlap, zero document overflow, correct DPR2 backing
dimensions, controlled compact typography, footer optionality, and the unchanged
6.372 pt paper-pair minimum against Figurestead's 6 pt project floor.

## Commands

With the repository served at `http://127.0.0.1:4179/`:

```sh
NODE_PATH="$FIGURESTEAD_NODE_MODULES" "$FIGURESTEAD_NODE" \
  audit/compact-layout/run-compact-layout-audit.cjs after

NODE_PATH="$FIGURESTEAD_NODE_MODULES" "$FIGURESTEAD_NODE" \
  specimen-study/audit/run-specimen-audit.cjs

python3 specimen-study/audit/verify-preservation.py
```

The V2 matrix was also rerun with
`FIGURESTEAD_TECHNICAL_URL=http://127.0.0.1:4179/technical-showcase/`; it
returned eight zero-finding Chromium/Firefox cases. The generated V2 evidence
was then restored so the accepted V2 tree itself remained byte-identical.
