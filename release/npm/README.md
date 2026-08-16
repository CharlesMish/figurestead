# Figurestead npm retained candidates

This directory defines the prospective retained-candidate lifecycle for future
`@figurestead/web` releases. It begins after `0.9.0-alpha.1`; it does not claim
that the already-published alpha used this repaired process.

## Current retained state

The first prospective-lifecycle candidate is retained at
`release/npm/0.9.0-alpha.2/`. Its exact tarball bytes were packed once from the
accepted alpha.2 source commit
`da6755b23e1b2533c85d75b4960fdd419a0f3b64` and are awaiting independent
artifact audit.
Retention is not publication approval: no npm publish, tag, release, or
deployment is implied by this directory.

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
absence of versioned directories was an explicit safe passing state before the
first candidate; every retained candidate now present must pass the complete
verifier.

## Trust boundary

The approved SHA-256 remains an explicit manual workflow-dispatch input. The
manifest records the reviewed digest but cannot redirect trust. Candidate
verification is local/read-only and requires no registry credentials or OIDC.
The publish job retains `contents: read` and `id-token: write` only after its
unprivileged candidate gate succeeds.
