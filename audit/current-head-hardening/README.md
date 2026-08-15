# Figurestead current-HEAD hardening revalidation

> **Historical audit snapshot.** This report records the repository state
> audited at `c07b7683ddf2c37a22b59bac1c8e3deb8649366d`; its findings and counts are
> intentionally preserved as observations of that state. Current required-CI
> authority is `.github/workflows/pr-correctness.yml` and `ci/README.md`.
> Later scientific-geometry findings are recorded separately in
> `audit/current-head-hardening/scientific-geometry-findings.json`.

## Scientific geometry follow-up

Luna independently reproduced two P1 findings at
`d00f7b1c5b083011c55a74d11a7eccfbd352ac9e`: authored core scale domains did
not control rendered geometry, and unidentifiable `linear_fit` requests emitted
plausible horizontal lines. Luna did not freshly rerun Chromium/Firefox because
her sandbox lacked the required browser environment.

The narrow corrections are `07017dbdb5d6f422a64fafd47447ef894d71a23b`
(domain precedence and geometry) and
`5fdb32a3434845c529ef122ff4e9c185c5c77020` (shared fit identifiability).
Codex then ran the dedicated post-fix gate in Chromium and Firefox: 2/2 engine
cases and 28/28 fixed-count assertions passed. The concise machine-readable
record is `scientific-geometry-findings.json`.

Historical source: `figurestead-hardening-handoff.zip`, prepared from
`9ea5a9b80842c23476e810026c1330aa88db163b`.

Current authority: branch `docs/social-preview-promotion`, audited after the
owner-selection commit `87f3a4e9e142ae4a09f1aa1e1542b6565d639551` and the narrow SVG correction
`c07b7683ddf2c37a22b59bac1c8e3deb8649366d`.

The old handoff was used as an adversarial regression corpus. No old finding
was accepted merely because its former path still existed or rejected merely
because a filename changed.

## Outcome

| Status | Count |
| --- | ---: |
| `CLOSED_BY_LATER_WORK` | 2 |
| `PARTIALLY_CLOSED` | 6 |
| `STILL_REPRODUCES` | 12 |
| `NEEDS_MAINTAINER_DECISION` | 2 |
| `NO_LONGER_APPLICABLE` | 0 |
| `NOT_REPRODUCED` | 0 |

## Historical finding triage

| ID | Current status | Current evidence |
| --- | --- | --- |
| P0-1 SVG serialization boundary | `CLOSED_BY_LATER_WORK` | Reproduced on all four public SVG paths, then fixed in `c07b768`. All malformed color cases are rejected; escaped text parses as XML; normal SVG hashes are unchanged. |
| P0-2 functional tests / PR CI | `PARTIALLY_CLOSED` | Substantial V2, compact-layout, specimen, corpus, README, social-preview, preservation, CVD, and SVG regression machinery now exists. No workflow has a `pull_request` trigger; `unittest discover` still runs zero tests and `npm test` is undefined. |
| P0-3 npm release workflow | `STILL_REPRODUCES` | `.github/workflows/publish-npm.yml` remains dispatchable and requires `release/npm/$VERSION`; the entire `release/npm/` tree and its promised README are absent. |
| P1-1 portable-contract parity | `PARTIALLY_CLOSED` | Canonical colors are now strict and path-aware. Python still emits numeric titles/line keys that the browser rejects; Python `fps=0` leaks `ZeroDivisionError`; browser `fps=0`, negative marker size, padding `9`, and non-array annotations remain accepted/coerced. |
| P1-2 semantic IDs / duplicate panels | `STILL_REPRODUCES` | Line keys `a b` and `a-b` produce three duplicate full mark IDs in browser scenes and the same lossy stems in Python. Duplicate panel IDs are accepted in both contract paths. |
| P1-3 Python plotting inputs | `STILL_REPRODUCES` | Flat histogram fails after allocating a figure; line and histogram labels silently truncate; incomplete strip order raises raw `KeyError` after allocation; duplicate order and non-finite inputs are not rejected consistently. |
| P1-4 empty strip groups | `NEEDS_MAINTAINER_DECISION` | A declared empty group produces a `NaN` median, non-finite terminal mark, and `NaN` SVG geometry. The valid-versus-invalid empty-category policy is still undecided. |
| P1-5 `figurestead.scene/1` parity | `NEEDS_MAINTAINER_DECISION` | Python and browser still use the same identifier for materially different objects; Python strip compilation still returns zero marks. The intended interchange/public boundary remains undecided. |
| P1-6 large-array extent | `STILL_REPRODUCES` | `extent()` still uses spread arguments; a bounded 200,000-value call raises `RangeError: Maximum call stack size exceeded`. |
| P1-7 first success / landing pages | `PARTIALLY_CLOSED` | Root README and exact Python/browser examples now deliver first success; both were executed successfully. `web/README.md`, which becomes the npm landing README, remains only a short boundary note without first success. |
| P1-8 runtime / extension boundary | `PARTIALLY_CLOSED` | Root README and specimen evidence now truthfully disclose renderer asymmetry, especially the Python-only categorical matrix. No complete feature matrix or browser categorical registry exists; categorical Python builders remain unpaired. |
| P1-9 contributor/support/security path | `STILL_REPRODUCES` | No tracked `CONTRIBUTING.md`, `AGENTS.md`, `SECURITY.md`, `SUPPORT.md`, changelog, issue template, or PR template exists; the four Python CLIs remain largely undiscovered. |
| P2-1 dependency policy | `STILL_REPRODUCES` | Broad minimums remain in `pyproject.toml`; there is no committed advisory/minimum-version policy, scan workflow, or minimum/latest matrix. No vulnerability claim is inferred from the floor alone. |
| P2-2 npm provenance / candidate identity | `PARTIALLY_CLOSED` | The workflow uses GitHub OIDC with supported Node/npm versions and does not disable provenance. The public `0.9.0-alpha.1` registry record exposes signatures but no `dist.attestations`; no retained digest-bound npm candidate exists at HEAD. |
| P2-3 version synchronization | `STILL_REPRODUCES` | Current Python/SemVer spellings are coherent, but no single mechanical check covers manifests, READMEs, site, export constant, workflows, and retained paths. |
| P2-4 frozen-site acceptance model | `PARTIALLY_CLOSED` | R3 added canonical/derivative manifests and a much stronger deploy validator. `site/README.md` still does not document the full generation, review, acceptance, rollback, and ownership process. |
| P2-5 public-site asset cost | `CLOSED_BY_LATER_WORK` | R3 retains 69,380,331 canonical bytes while serving 2,127,517 lossless bytes, a recorded 96.934% saving, plus responsive derivatives and lazy loading. |
| P2-6 compatibility / metadata | `STILL_REPRODUCES` | npm still declares Node `>=24 <25`; Python still lacks authors, classifiers, and keywords; no declared-versus-tested support matrix exists. |
| P2-7 static-site defense / resilience | `STILL_REPRODUCES` | Overview/Atlas heads have no CSP or referrer policy; `site/app.js` still throws at module top level when `public-alpha-set.json` fails. This accepted-R3 issue is held, not changed. |
| P2-8 annotation accessibility text | `STILL_REPRODUCES` | Real hidden-companion output still says `Focus annotation: Evidence-bound peak at x undefined, y undefined.` for an `anchorId` annotation. |
| P2-9 configuration transactionality | `STILL_REPRODUCES` | Rejected `setConfig({panels: []})` changes controller renderers from `["line"]` to `[]` while leaving the prior companion attached. State is mixed rather than rolled back. |
| P2-10 consumer types / formatting | `STILL_REPRODUCES` | No `.d.ts` or `py.typed` is shipped and no formatting boundary is configured; the inspected source/site set contains 103 lines over 240 characters. |

Exact structured paths, observations, regression coverage, and proposed future
packages are in `triage.json`.

## SVG correction evidence

Before `c07b768`, the inert payload
`"/><g data-proof="inert"></g><rect fill="` created one extra `<g data-proof>`
through each of:

- `exportFigureSvg`
- `exportFigureArtifacts().svg`
- `sceneToSvg`
- `resolvedSceneToSvg`

After the correction, quote/element, angle-bracket, ampersand, URL-reference,
and control-character color inputs are rejected on all four paths with a
path-aware `canonical #RRGGBB color` error. Caller text is XML-sanitized and
escaped. Python `ElementTree` parses every valid/escaped result and asserts the
same element sequence.

The ordinary 640×480 fixture is byte-identical before/after:

| Path | Bytes | SHA-256 |
| --- | ---: | --- |
| `exportFigureSvg` | 4,140 | `a1b3bf0c3dc31bb8346151bd17b95c05ccca81fd75abbfe45f832a50a6f75f63` |
| `exportFigureArtifacts().svg` | 4,140 | `a1b3bf0c3dc31bb8346151bd17b95c05ccca81fd75abbfe45f832a50a6f75f63` |
| `sceneToSvg` | 4,140 | `a1b3bf0c3dc31bb8346151bd17b95c05ccca81fd75abbfe45f832a50a6f75f63` |
| `resolvedSceneToSvg` | 4,095 | `f34f50f4e8ef6368352d33b87b3d9a13c24bd85694fa18362dcd34ec167cb5f5` |

The accepted V2 audit passed 8/8 Chromium/Firefox cases after the repair. The
compact-layout audit passed Chromium/Firefox, including the 89 mm and 183 mm
SVG export checks. V1, public R3, and canonical paper bytes/pixels passed their
preservation gates.

## Current automated-test and audit inventory

| Surface | Committed machinery | Suitability as a required check |
| --- | --- | --- |
| SVG boundary | `audit/current-head-hardening/test_svg_serialization.py`, `web/test/svg-serialization-cases.mjs` | Yes; deterministic, XML-parsing, no browser dependency. |
| V2 browser/accessibility/motion/paper | `audit/technical-showcase/run-technical-audit.cjs` | Yes as a browser integration job; requires a local server plus Chromium/Firefox and writes evidence. |
| CVD assumptions | `cvd-vectors.mjs`, `validate-cvd-reference.py` | Yes; narrow deterministic numerical gate with declared tolerance. |
| V2/R3/V1/paper preservation | `audit/technical-showcase/verify-preservation.py` | Valuable, but the current script assumes the accepted V1 sibling workspace; make inputs CI-portable first. |
| Compact scientific layout | `audit/compact-layout/run-compact-layout-audit.cjs` | Yes as a browser integration job; separate check-only output from accepted evidence before CI. |
| Specimen lab | `specimen-study/audit/run-specimen-audit.cjs` | Yes, likely path-scoped or nightly because it runs 16 browser cases and regenerates evidence. |
| Populated response matrix | `run-response-matrix-audit.cjs`, `verify-corpus-v0.2.py` | Yes; browser behavior plus deterministic corpus/data checks. |
| README / first success | `docs/readme-review/audit_readme.py` | Useful for README-scoped changes; its protected-path baseline intentionally fails on unrelated authorized core changes. |
| Social preview | `docs/social-preview-study/audit_study.py` | Useful for social-preview scope; same baseline caveat. |
| Python release bytes | `release/python/verify_index_release.py` and publish-workflow checks | Release-specific, not a substitute for functional PR tests. |
| Public-site assets | inline validator in `deploy-pages.yml` | Strong deployment gate; extract to a reusable check-only command for PR CI. |

Current repository-defined PR CI: **none**. None of the three workflows has a
`pull_request` trigger. Standard collection is not wired to the committed
audits: `python3 -m unittest discover -v` exits 5 after zero tests, while
`npm test` exits 1 because no script exists. There is therefore no current
required check that proves a relevant test was collected and run.

### Minimal current CI plan

1. **Core/cross-runtime job** on Python 3.10/3.12/3.14 and Node 24: compile
   Python, syntax-check browser modules, run the SVG XML regression, execute
   Python/browser first-success, and add the reproduced core/contract fixtures.
   Invoke explicit test files and assert nonzero case counts.
2. **Browser evidence job**: start one local server and run V2, compact layout,
   specimen, and response-matrix checks in Chromium/Firefox. Add a check-only
   output mode so PR runs do not rewrite accepted evidence.
3. **Package/site job**: build wheel/sdist and npm tarball, install/import from
   packed artifacts, verify root and temporal exports, run corpus/preservation
   checks, and reuse an extracted version of the Pages asset validator.

## npm publication preflight

The workflow is manually dispatchable. For the current browser version it
expects:

- `release/npm/0.9.0-alpha.1/SHA256SUMS.txt`
- `release/npm/0.9.0-alpha.1/dist/figurestead-web-0.9.0-alpha.1.tgz`
- `release/npm/README.md`

None exists. A manual invocation cannot satisfy its own preflight from HEAD.
This is a release blocker for the next npm version, not authorization to rebuild
or rotate `0.9.0-alpha.1`. The future repair should either make dispatch
deliberately unavailable until a candidate exists or restore a documented,
digest-bound candidate acceptance path.

The public `0.9.0-alpha.1` tarball was read-only verified at SHA-256
`7b3e756c5193d53205925060a5005340a8e57a62550a720253a67391787ebe6a`.
Its packed `package.json` contains no local absolute paths. The public registry
record includes a registry signature but no exposed `dist.attestations` field.

## Current runtime / extension boundary

| Family | Python direct | Python contract | Browser public |
| --- | --- | --- | --- |
| line, scatter, strip summary | Yes | Core schema 0.4 | Root `CORE_REGISTRY` |
| histogram, heatmap | Yes | No core portable builder | No |
| temporal coverage / observations | Yes | Extension builders | `@figurestead/web/extensions/temporal` |
| categorical bar / layered bar | Python extension | Python builders | No registered public definition |
| categorical matrix | Python extension | Study-local scene/data | No registered public definition; terminal geometry support is not a renderer API |
| interval / paired / reference | Python extensions | Runtime-specific helpers | No public browser export |

Python and browser still expose different objects named `figurestead.scene/1`;
the normalized contract, not the scene objects, remains the only defensible
shared boundary at current HEAD.

## Later work explicitly recognized

- R3 reduced canonical site assets from 69,380,331 bytes to 2,127,517 served
  lossless bytes (96.934%), added responsive/lazy delivery, retained canonical
  links, added true Case 05 grayscale, long descriptions, and accepted browser
  accessibility/reflow evidence.
- The root README and public site now state the non-pixel-identical runtime
  boundary truthfully and link exact first-success examples.
- Python first success wrote a 1260×780 PNG at SHA-256
  `34b1117229b84cc6ce1d493253d993d4605697131ba30cb31ae6586e305a2fa8`;
  browser first success reported `Rendered · line · terminal progress 1`.
- The populated categorical-matrix study explicitly says it is Python-rendered
  and does not imply a browser matrix renderer.
- V2 closed hidden focus stops and duplicate companion headings. That did not
  close the separate evidence-bound annotation-description defect reproduced
  here.

## Next three reviewable packages

1. **Required correctness floor / PR CI.** Wire today's explicit audits and new
   regressions into path-scoped PR jobs, add check-only output modes, and fail on
   zero collected cases. Do not change public behavior in this package.
2. **npm candidate preflight containment.** Disable dispatch until an accepted
   candidate exists, or restore the documented digest-bound `release/npm/`
   path plus a non-publishing preflight test.
3. **Core Python input validation.** Define flat/multi histogram input,
   cardinality, order, empty, dimensionality, and finite-value errors; validate
   before figure allocation; add headless regressions across all five direct
   plot functions.

Held for explicit compatibility/product decisions: semantic ID encoding,
`figurestead.scene/1`, and empty-category policy. Also held as separate small
correctness packages: iterative large-array extent, annotation description, and
transactional configuration replacement.

## Scope confirmation

No package version, theme, corpus data, release artifact, Git tag/release,
deployment, GitHub setting, public navigation, public R3 page, or accepted V2
presentation was changed. GitHub repository social-preview configuration remains
manual. All pre-existing untracked `.DS_Store`, cache, and ZIP artifacts were
preserved and excluded from commits.
