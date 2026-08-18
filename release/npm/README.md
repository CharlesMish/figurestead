# Figurestead npm retained candidates

This directory defines the retained-candidate lifecycle for
`@figurestead/web`. It began after `0.9.0-alpha.1`; it does not claim that the
already-published first alpha used this repaired process.

## Current retained state

`@figurestead/web@0.9.0-alpha.2` is published. Its accepted candidate is
retained at
`release/npm/0.9.0-alpha.2/dist/figurestead-web-0.9.0-alpha.2.tgz`, was packed
once from accepted source-only authority
`27bc7f88985353c598d9b8f67bcf39c20def33d2`, and was retained by commit
`750c8a3c58a14f9619dbd93af8dde6dfdaa7a092` after the complete protected
correctness floor passed. The retained artifact is 84,601 bytes with 62 archive
members and SHA-256
`ac737f3e243b6cb941c801c387a9725dd565132cab5fa1e4c74cb4ebd4eb7f78`.

GitHub Actions run `32093254496` passed its unprivileged candidate gate,
protected-commit/exact-byte reverification, and Trusted Publishing/OIDC
`npm publish` step; npm emitted `+ @figurestead/web@0.9.0-alpha.2`. The overall
workflow run then failed because its immediate `npm pack` registry readback saw
`ETARGET` before npm propagation completed. This was a failed workflow run
after successful publication, not a failed release, and no second publication
was attempted.

Independent read-only verification after propagation downloaded registry bytes
that were byte-for-byte identical to the retained candidate: the same SHA-256,
84,601-byte size, and 62 members. Registry provenance attestation is present;
the `alpha` dist-tag points to `0.9.0-alpha.2`, while `latest` remains
`0.9.0-alpha.1`.

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
8. After publication, run the bounded public-registry verifier. It waits only
   for narrowly identified propagation states and accepts only a registry
   download whose SHA-256 exactly equals the same approved digest.

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

The alpha.2 packing OS/architecture was not recorded in committed
contemporaneous evidence and is therefore not inferred here. Reviewer x64
repacking did not reproduce the retained gzip stream byte-for-byte, while the
uncompressed tar payload and all 62 member contents/metadata matched source
authority. The release guarantee is exact-byte retention plus approved SHA-256
binding: independently regenerated npm packs may differ at gzip-stream level
across environments even when their tar payload and member contents are
identical. Publication consumes the retained bytes and does not depend on
repacking, so this does not weaken alpha.2 artifact provenance.

`verify-current-package.mjs` reports the SHA-256 of its disposable fresh pack
as machine-readable informational output. That digest verifies the temporary
pack it tests; it is deliberately not compared with a retained candidate as a
pass/fail invariant.

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

## Post-publication registry readback

`verify-public-registry.mjs` is a separate, read-only gate after a successful
publish command. It uses seven attempts with deterministic delays of 0, 5, 10,
15, 30, 30, and 30 seconds: at most 120 seconds of waiting. It retries only
when the exact version is not visible (HTTP 404), exact-version metadata is
visible while its tarball still returns 404, or the requested dist-tag has not
yet converged. There is no automatic republish path.

Malformed metadata, unexpected HTTP/authentication responses, wrong
package/version identity, unsafe tarball location, and local input errors fail
closed without being treated as propagation. Once tarball bytes are visible,
a SHA-256 mismatch is an immediate `POST_PUBLISH_INTEGRITY_FAILURE` with no
retry. Exhausting the bounded visibility window produces
`POST_PUBLISH_VISIBILITY_TIMEOUT` and explicitly instructs the operator not to
republish automatically. Success requires the registry tarball SHA-256 to equal
the approved retained-candidate SHA-256 and the requested dist-tag to point to
the exact version.
