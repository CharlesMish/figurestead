# Required correctness floor

The required workflow runs for every pull request and every push to `main`.
It uses explicit suites with fixed nonzero case counts; it does not use generic
test discovery.

Canonical local entry points:

```sh
npm ci --ignore-scripts
npm test
npm run test:npm-release-integrity
python audit/current-head-hardening/test_scientific_geometry.py

FIGURESTEAD_AUDIT_MODE=check \
FIGURESTEAD_AUDIT_OUTPUT_ROOT=/tmp/figurestead-audits \
FIGURESTEAD_BASE_URL=http://127.0.0.1:4179/ \
FIGURESTEAD_TECHNICAL_URL=http://127.0.0.1:4179/technical-showcase/ \
FIGURESTEAD_LAYOUT_URL=http://127.0.0.1:4179/ \
FIGURESTEAD_SPECIMEN_URL=http://127.0.0.1:4179/specimen-study/ \
npm run test:browser-first-success

FIGURESTEAD_SPECIMEN_URL=http://127.0.0.1:4179/specimen-study/ \
npm run test:browser-scientific-geometry

FIGURESTEAD_SPECIMEN_URL=http://127.0.0.1:4179/specimen-study/ \
npm run test:browser-controller-integrity

FIGURESTEAD_SPECIMEN_URL=http://127.0.0.1:4179/specimen-study/ \
npm run test:browser-responsive-header

FIGURESTEAD_AUDIT_MODE=check FIGURESTEAD_AUDIT_OUTPUT_ROOT=/tmp/figurestead-audits \
FIGURESTEAD_TECHNICAL_URL=http://127.0.0.1:4179/technical-showcase/ \
node audit/technical-showcase/run-technical-audit.cjs

FIGURESTEAD_AUDIT_OUTPUT_ROOT=/tmp/figurestead-audits \
FIGURESTEAD_LAYOUT_URL=http://127.0.0.1:4179/ \
node audit/compact-layout/run-compact-layout-audit.cjs after

FIGURESTEAD_AUDIT_MODE=check FIGURESTEAD_AUDIT_OUTPUT_ROOT=/tmp/figurestead-audits \
FIGURESTEAD_SPECIMEN_URL=http://127.0.0.1:4179/specimen-study/ \
node specimen-study/audit/run-specimen-audit.cjs

FIGURESTEAD_AUDIT_MODE=check FIGURESTEAD_AUDIT_OUTPUT_ROOT=/tmp/figurestead-audits \
FIGURESTEAD_SPECIMEN_URL=http://127.0.0.1:4179/specimen-study/ \
node specimen-study/audit/run-response-matrix-audit.cjs

python audit/public-site/validate-assets.py
FIGURESTEAD_AUDIT_OUTPUT_ROOT=/tmp/figurestead-corpus \
python specimen-study/audit/verify-corpus-v0.2.py
```

The browser audit commands in `.github/workflows/pr-correctness.yml` share one
local HTTP server. Check-only mode writes reports and any transient captures
under `FIGURESTEAD_AUDIT_OUTPUT_ROOT`, never into accepted repository evidence.

The full specimen audit remains required because it is the current committed
cross-browser protection for the accepted compact/categorical fixtures. Static
README and social-preview rendering studies remain path-specific reviewer tools;
their immutable asset hashes are checked by the package/site job instead of
regenerating screenshots on every pull request.

`npm test` also runs `ci/check-playwright-notices.mjs`. The root
`package.json` exact Playwright pin is the canonical tooling version; the check
requires the lockfile's Playwright packages and both root/web third-party
notices to agree with it.

`npm run test:npm-release-integrity` exercises the retained-candidate verifier
against deterministic valid and adversarial fixtures, then verifies every real
versioned candidate under `release/npm/`. A zero-candidate repository is an
explicit passing state: verifier regressions remain covered while publication
stays unavailable until a candidate lands through protected review.
