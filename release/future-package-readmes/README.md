# Package README preparation for a future release

These are historical **review drafts**, not replacements for the published
a4/alpha.5 artifacts. The a5/alpha.6 candidate adopts a separate Python package
README at `docs/package-python.md` and keeps the complete browser example in
`web/README.md`; these two draft files remain unchanged and are not package inputs.

The drafts use a tested a4/alpha.5 example baseline so they remain executable
now. At the next approved release freeze:

1. Select the new versions and update the exact installation pins and dated
   capability statements together. Do not reuse a4/alpha.5 version identifiers.
2. Bind documentation links to that release tag. Retain complete runnable
   examples, absolute links and explicit Python/browser boundaries.
3. Decide how to source package-facing text (a separate Python readme file and
   a staged npm README are possible). Change packaging only in that release's
   implementation/review loop; do not alter the existing publication records.
4. Build the wheel, sdist and npm tarball. Inspect wheel METADATA description,
   sdist README/metadata and the tarball README, and rerun their examples from
   clean consumers. Check rendered links in a registry-like context.
5. Publish only after the independent release review and owner authorization.

Candidate-state instructions belong in release records. Package onboarding
should describe installation and supported use without calling an eventual
published package an unpublished candidate. A repository documentation merge
does not update the immutable README bytes already inside registry artifacts.
