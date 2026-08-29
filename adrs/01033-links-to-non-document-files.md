---
status: accepted
date: 2026-08-29
decision-makers: hawkeyexl
---

# A link to a non-document file is not a broken link

## Context and Problem Statement

dockg's own documentation gate started failing the moment the namespace document landed
(ADR 01030). Two pages link to `/dockg/ns.ttl` — the machine-readable Turtle a consumer
dereferences, which is exactly the link those pages exist to offer — and `dockg stats --check`
reported both as broken internal links, exiting 1.

The links are not broken. `docs/public/ns.ttl` is served at `/dockg/ns.ttl` by the site, and a
reader who follows either one gets the file. What broke is dockg's inference: a route mapping
matched the basePath, the target carried an explicit `.ttl` extension, and
`targetCandidates` took it verbatim, looked for `docs/src/content/docs/ns.ttl`, found nothing,
and minted `dockg:brokenLink`.

The generalization matters more than dockg's own site. Every documentation corpus links to
things that are not documents: a downloadable archive, a linked PDF specification, an OpenAPI
`.yaml`, a sample `.json`. Under the previous rule each one is a permanent finding in the
broken-link list — and it is a finding **the author cannot act on**, because there is no
Markdown file they could add that would satisfy it. The only remedies were to delete a correct
link or to stop gating on broken links at all.

That is the specific harm. ADR 01011 made the broken-link count something you gate on in CI, and
[build/routes.mdx](../docs/src/content/docs/build/routes.mdx) sells route mapping on the promise
that "everything left in it is a link that genuinely resolves to nothing". A category of
unfixable findings breaks that promise and teaches readers to ignore the list — the same failure
mode ADR 01029 recorded for coverage rows that sit at zero by construction.

## Decision Drivers

- **A finding must be actionable.** dockg's findings channel is small and gated; a finding with
  no remedy is worse than no finding, because it costs the reader attention and trains them to
  skip the list.
- **Do not weaken the real check.** The typo this catches — a moved or deleted page still linked
  by URL — is the whole point of the feature, and must keep failing.
- **Use a signal the config already carries**, rather than adding a knob. Every knob is a thing
  to document, validate, test, and keep in sync (see the config↔flag pattern in CLAUDE.md).
- **Open-world semantics** (ADR 01014). dockg says what it knows. It does not know how a site
  serves `.ttl`, and asserting a negative about it is a claim dockg cannot support.

## Considered Options

1. **Narrow the claim: a target whose explicit extension is not a document extension does not
   address a document.**
2. **A config-level ignore list** (`stats.ignoreBrokenLinks`, or a glob of exempt targets).
3. **Check the filesystem** for the target under a `public/`-style asset directory.
4. **Do nothing; work around it on dockg's own site** — drop the two links, or exclude the pages.

## Decision Outcome

Chosen: **option 1**. A route mapping's `extensions` list already declares what documents look
like in that corpus; `DEFAULT_LINK_EXTENSIONS` does the same for relative links. A target
carrying some *other* explicit extension is, by that declaration, not addressing a document — so
dockg has no basis to claim it should have resolved to one, and classifies the link the same way
it already classifies a route outside every mapped basePath: skipped, not broken.

The narrowing is deliberately tight:

- **Extensionless and directory-style targets are untouched.** `/docs/actions/missing` and
  `/docs/actions/missing/` are still broken. Those are the typo shapes that matter, and they carry
  no extension to judge.
- **A document extension still has to resolve.** `/docs/actions/missing.mdx` is still broken —
  the author wrote a document target and got it wrong.
- **The corpus decides, not a hardcoded list.** A corpus whose `extensions` include `.ttl`
  (`inputs` can match anything) keeps checking `.ttl` links. In the relative branch the
  `allPaths` membership test runs *first*, so an asset that is genuinely in the corpus still
  links as an internal edge.
- **`anyMatched` is left alone when a mapping declines the target**, so a second mapping whose
  extensions do cover it can still claim the link, and only a target no mapping addresses is
  skipped.

### Consequences

- Good: the broken-link list contains only findings an author can act on, which is what makes it
  gateable. dockg's own docs graph gate passes with the namespace links intact.
- Good: no new configuration. The rule is derived from a field every corpus already sets.
- Bad: a genuinely broken asset link — a renamed `spec.pdf` — is now invisible to dockg. This is
  accepted: dockg is a documentation knowledge graph, not a static-site link checker, and it has
  never crawled or resolved anything outside the corpus. A site-wide link checker is the right
  tool for assets, and dockg's own repo runs one (`scripts/check-docs-links.mjs`).
- Bad: a corpus with an *unusual* document extension not listed in `extensions` silently loses
  checking for it. Mitigated by the fact that such links were never resolvable either — the
  mapping would have had to list the extension for the link to work at all.
- Neutral: the emitted graph can contain strictly fewer `dockg:brokenLink` triples than before.
  No corpus gains triples, so no `dockg check` that passed can start failing.

### Confirmation

- `test/unit/analyze.test.ts`: named cases on both branches — a route target and a relative
  target with non-document extensions are skipped; a route target with a *document* extension
  still breaks; the pre-existing extensionless-typo cases still break.
- The corpus fixture is unchanged and still reports its one deliberate broken link
  (`missing.md`) and its one broken section ref; `dockg stats --check` still exits 1 there by
  design, and `test/fixtures/golden/graph.ttl` is byte-identical.
- The docs graph gate in [docs.yml](../.github/workflows/docs.yml) —
  `dockg check` and `dockg stats --check` over dockg's own pages — passes with
  `Broken internal links (0)`.

## Pros and Cons of the Options

### 1. Narrow the claim by extension

- Good: no new configuration; the signal is a field the corpus already declares.
- Good: scales to every asset type without enumerating any of them.
- Good: keeps the check that matters (extensionless typos, wrong document extensions).
- Bad: a renamed asset stops being reported.

### 2. A config-level ignore list

- Good: fully explicit; the author states exactly what to exempt.
- Bad: pushes a systematic problem onto every user as per-corpus bookkeeping — the "special
  cases layered on shared infrastructure" smell. Every corpus that links a PDF writes the same
  exemption.
- Bad: an ignore list decays. A pattern added for `ns.ttl` silently covers a future broken
  `.ttl` link nobody meant to exempt.
- Bad: a new knob owes a schema field, a default, a CLI story, and tests, for a case a
  declaration already answers.

### 3. Probe the filesystem for the asset

- Good: could distinguish a present asset from a renamed one, preserving the check.
- Bad: requires dockg to learn each generator's asset convention (`public/`, `static/`,
  `assets/`) — Astro, Hugo, Docusaurus and MkDocs all differ. That is a static-site concern
  dockg has deliberately stayed out of.
- Bad: filesystem probes outside the corpus are a new I/O surface in the derive path, and one
  that varies by checkout — a determinism hazard for no gain in the common case.

### 4. Work around it on dockg's own site

- Good: zero code.
- Bad: deletes a correct, useful link to satisfy a false positive — the bandaid, not the fix.
- Bad: leaves every other corpus with the same unfixable findings, and leaves the promise made
  by build/routes.mdx false.
