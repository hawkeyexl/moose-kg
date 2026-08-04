---
id: cuj-map-site-routes
type: cuj
title: Make my published site's links resolve to real edges
personas:
  - persona-docs-engineer
trigger: >-
  stats reports a pile of broken links that are not broken on the published site — the
  corpus links by site route, and dockg resolved them against the filesystem
entry_point: /dockg/build/routes/
success_criteria: >-
  Site-style links become dcterms:references edges, the broken-link count drops to the
  genuinely broken ones, and the reader can explain which of their links resolve and why.
steps:
  - stage: trigger
    doc: /dockg/build/
    exists: true
    note: "The stats broken-links section is where this journey starts; it must link onward."
  - stage: orient
    doc: /dockg/build/routes/
    exists: true
    note: "Why a /docs/actions/find link cannot resolve without being told the mapping."
  - stage: act
    doc: /dockg/build/routes/
    exists: true
    note: "Configure routes[]: basePath, root, extensions, indexFiles. Worked example per generator."
  - stage: verify
    doc: /dockg/build/routes/
    exists: true
    note: "Re-run stats, compare the broken-link count, inspect one resolved edge with query."
  - stage: extend
    doc: /dockg/reference/configuration/
    exists: true
    note: "Full routes[] key reference including normalization of basePath and root."
---

Priya's corpus links the way the site publishes, and dockg resolved those links against the
filesystem instead.

## The journey

This journey is **discovered, not sought.** Nobody sets out to configure route mappings; they
run `stats`, see a broken-link count that contradicts what they know about their site, and go
looking for the reason. The entry point is therefore the broken-links section of the `build`
track, and that section has to hand off clearly or the reader concludes dockg's link detection
is simply wrong.

The underlying situation is ordinary: a page written as `[find](/docs/actions/find)` publishes
correctly because the site generator knows `/docs/actions/find` maps to
`src/content/docs/actions/find.mdx`. dockg does not know that until it is told. Once it is,
those links become real graph edges and the impact and reference questions start working.

## What they need to reach, in order

1. **The diagnosis.** A broken-link report whose entries look correct on the live site means
   the corpus links by route and dockg is resolving by path. Naming that pattern is most of the
   fix.
2. **The mapping model** — `basePath` is where the site serves from, `root` is the repo
   directory it serves, plus the extension and index-file rules that make `/docs/actions/find`
   and `/docs/actions/` both land somewhere.
3. **A worked example matching their generator.** This is the step that actually gets done or
   not; an abstract description of the four keys will strand them.
4. **Verification by delta.** Re-run `stats`, watch the count drop, then inspect one specific
   edge to confirm it points where they expect rather than trusting the number.

## Design notes

- **The remaining broken links are the valuable output.** After mapping, what is left is
  genuinely broken, and that is the feature — this journey converts noise into a signal Priya
  can act on. The page should end by framing it that way, not by celebrating zero.
- **Multiple route entries are normal**, not an edge case: a docs section and a blog often
  publish under different base paths from different roots.
- Route configuration is corpus-defining, so it is config-only with no CLI override. Worth
  stating, since Priya will look for a flag.

## Where it goes next

[`cuj-gate-metadata-in-ci`](gate-metadata-in-ci.md) — a broken-link count is only useful once
something fails when it rises.
