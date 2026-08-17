# Figurestead npm retained candidates

This directory defines the prospective retained-candidate lifecycle for future
`@figurestead/web` releases. It begins after `0.9.0-alpha.1`; it does not claim
that the already-published alpha used this repaired process.

## Current retained state

The replacement `0.9.0-alpha.2` candidate is retained at
`release/npm/0.9.0-alpha.2/`. Its exact tarball bytes were packed once from the
accepted source-only authority
`27bc7f8ac3f917d8c7c37ba8d92b1ded3281d3d5` after the complete protected
correctness floor passed. It is awaiting narrow artifact re-audit and is not
approved for publication. No npm publish, tag, release, or deployment is
implied by this directory.

The earlier alpha.2 digest and its final rejected disposition remain preserved
in Git history and in [REJECTIONS.md](REJECTIONS.md); those bytes must not be
published or restored as the active candidate.

Do not label any current pack as the historical `0.9.0-alpha.1` candidate: the
original reviewed pre-publication bytes were not retained and cannot be
reconstructed with honest provenance.

The public registry artifact for `@figurestead/web@0.9.0-alpha.1` was downloaded
read-only on 2026-08-14 and had SHA-256
`7b3e756c5193d53205925060a5005340a8e57a62550a720253a67391787ebe6a`,
matching the previous observation. Registry metadata exposed an npm signature
and integrity value, but no `dist.attestations` field was observed. This is
historical registry evidence, not a retained candidate.

## Prospective structure

```text
release/npm/
  README.md
  <version>/
    SHA256SUMS.txt
    dist/
      figurestead-web-<version>.tgz
```

`SHA256SUMS.txt` must contain exactly one newline-terminated canonical record:

```text
<64 lowercase hex SHA-256>  figurestead-web-<version>.tgz
```

The manifest cannot select another path. The verifier derives the only trusted
path itself as
`release/npm/<version>/dist/figurestead-web-<version>.tgz`, hashes those exact
bytes directly, and requires the approved dispatch SHA-256 and manifest digest
to match them.

## Future candidate lifecycle

1. Intentionally prepare the next package version in `web/package.json` and its
   package-version export through a separately authorized release change.
2. From that reviewed source, run `npm pack ./web --pack-destination
   release/npm/<version>/dist` once to create the candidate.
3. Record the exact candidate SHA-256 in the strict manifest above.
4. Run the canonical preflight:

   ```sh
   node release/npm/verify-candidate.mjs \
     --version <version> \
     --expected-sha256 <approved-sha256> \
     --release-root release/npm
   ```

5. Review the tarball identity, exact digest, package name/version, metadata,
   root import, and temporal-extension import. Land the versioned directory and
   manifest through normal protected review.
6. Dispatch publication from that protected-main commit using the manifest
   digest as `expected_sha256` and the confirmation phrase:
   `publish @figurestead/web <version> with tag <tag> from accepted tarball`.
7. The unprivileged workflow job verifies the retained candidate first. Only
   then may the environment/OIDC publication job start; it repeats the same
   canonical preflight and publishes the exact derived tarball path.
8. After publication, compare the registry download back to the same approved
   SHA-256.

`verify-all-candidates.mjs` verifies every versioned directory in PR CI. An
absence of versioned directories is an explicit safe passing state before a
candidate exists or while a rejected candidate is being recut. Every retained
candidate present must pass the complete verifier.

## Node authorities

The public `@figurestead/web` consumer package supports Node `>=22.22.0` with no
speculative upper ceiling. Git history shows that the former `>=24 <25` range
entered with the original public-package metadata rather than with a recorded
consumer-runtime incompatibility. Disposable packed candidates were exercised
on Node 22.22.0, 22.23.2, 24.19.0, and 25.9.0 through ordinary and engine-strict
installs, root and temporal imports, and six theme imports; the minimum, Node
24, and Node 25 cases also passed the packed TypeScript fixtures and Vite build.
Figurestead repository development, candidate verification, and trusted
publication remain separately pinned to Node 24 by the private root tooling
package and workflows. Widening the consumer range does not change the
release-tooling authority.

## Artifact-audit boundaries

The packed README first-success regression extracts its code from the README
inside a temporary or retained tarball and runs it against that installed
package. It also guards the specific rejected stale phrases. This proves the
tested packed documentation and package correspond operationally; it is not a
general semantic-staleness detector.

The candidate verifier intentionally does not compare a retained README with
arbitrary later `main`: an accepted candidate may remain publishable after the
source branch advances. Semantic truthfulness therefore remains an explicit
artifact-review responsibility rather than an ambiguous current-tree hash
check.

The packed package still records source-only `prepack` and `postpack` theme
staging hooks whose helper is not shipped. Ordinary installation and all public
imports are unaffected. Consumer repacking/vendoring is a non-blocking edge and
is held for a separately designed lifecycle change; the canonical repository
pack path remains authoritative.

## Trust boundary

The approved SHA-256 remains an explicit manual workflow-dispatch input. The
manifest records the reviewed digest but cannot redirect trust. Candidate
verification is local/read-only and requires no registry credentials or OIDC.
The publish job retains `contents: read` and `id-token: write` only after its
unprivileged candidate gate succeeds.
