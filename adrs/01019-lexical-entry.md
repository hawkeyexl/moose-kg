---
status: accepted
date: 2026-07-24
decision-makers: [manuel.r.b.silva]
---

# Lexical entry: a search artifact beside the graph, not prose inside it

## Context and Problem Statement

Phase 7's runtime can only start from an IRI you already know. Retrieval needs
the stage before that: **a text question → ranked starting nodes**. Without it
`retrieve()` (Phase 9) has no entry point, and the graph can only be walked by
someone who already knows where to stand.

The obstacle is structural. **The graph carries no prose**, by design: ADR 01008
makes it an index and governance layer, never a corpus. `moose-kg:Document` has
`dcterms:title` and `dcterms:description`; `moose-kg:Section` has *only* a title;
`skos:Concept` has pref/alt labels. A lexical index over that text alone answers
"how do I configure the SP-X100?" (a title match) but cannot answer "what is the
default cache directory?" — the words only exist in the body. That is precisely
the *information evaporation* failure the design research warns about, surfacing
as a concrete product limitation.

So body text must come from somewhere, without violating the graph-as-index
contract and without the runtime fetching every document before it can answer a
single query.

## Decision Drivers

- **Graph-as-index is not negotiable** (ADR 01008): prose must not enter the graph.
- **Hermetic**: entry must work with zero network and zero spend, so it can be a
  default-on feature (ADR 01009) and so Phase 10's eval needs no LLM.
- **Determinism extends to entry ranking** (ADR 01018 invariant 1).
- **Browser weight**: the runtime is a 6 KB drop-in; whatever this adds is paid
  by every consumer.
- **Retrieval granularity**: the design's golden rule — content granularity must
  match node granularity.

## Considered Options

**Where body text comes from:** (a) a build-time search artifact beside the
graph; (b) the runtime fetching documents through the `ContentResolver` and
indexing at page load; (c) prose lifted into the graph; (d) index only graph
metadata and accept that body words are unfindable.

**Scoring engine:** (a) MiniSearch; (b) a hand-rolled BM25.

## Decision Outcome

### Body text: a build-time artifact (option a)

`moose-kg export --format search` emits **`kg/search.json`**, a sibling of
`graph.ttl`/`graph.jsonld` — the Pagefind/VitePress pattern. It is produced in
Node from markdown already on disk, so it stays hermetic; it is a separate
artifact, so the graph remains prose-free and ADR 01008 holds.

Rejected: (b) costs N requests before the first query and re-indexes on every
page load; (c) breaks the graph-as-index contract outright; (d) is the status
quo whose inadequacy motivates this phase.

Like the iiRDS projection (ADR 01017), the exporter walks the built graph and
reads each `moose-kg:path` from disk — the same precedent, so `export` reading
source files is not a new capability.

**Shape** — plain JSON moose-kg owns, *not* MiniSearch's serialized index:

```json
{ "version": 1,
  "entries": [ { "id": "<iri>", "type": "moose-kg:Section",
                 "title": "Options", "labels": "config settings",
                 "text": "## Options\n\n…" } ] }
```

Owning the format keeps determinism our contract rather than a library's
internal representation, keeps the artifact diffable in review, and lets the
engine change without changing the artifact. Building the index at load costs
milliseconds at docs scale. Entries are sorted by `id`, empty fields omitted, no
wall clock — byte-identical across runs.

**Indexed node types:** `moose-kg:Document`, `moose-kg:Section`, `skos:Concept`.
Concepts are worth seeding from (concept → the documents about it);
`iirds:ProductVariant` is not, because a variant is a *scope filter*, not
something to read.

**Granularity rule: every node indexes exactly the text it owns.** A **Section**
carries its text down to the next heading of *any* rank — subsections are their
own nodes. A **Document** carries title + description plus the prose no section
covers — its *preamble*, the text before the first heading — and its whole body
when it has no sections at all.

The rule is "own text", not "no text when sections exist", because both failure
modes are real. If a document repeated its sections' text it would match
everything they match and shadow them in the rankings, while doubling the
artifact. But if it carried nothing, preamble prose would be indexed *nowhere*
and become unfindable — the same evaporation this artifact exists to prevent,
reintroduced at a smaller scale. Owning the complement of its sections avoids
both: no duplication, no gap.

The rule applies at *both* boundaries — Document→Section and Section→Section.
Enforced only at the first, an H1 section carries its whole subtree and outranks
every heading beneath it: the same shadowing, one level down.

Slicing reuses `sectionOwnText`, `documentPreamble`, and `sliceSection` from
[src/runtime/resolve.ts](../src/runtime/resolve.ts) — the runtime's own
functions, so index-time and retrieval-time text cannot drift. One difference is
deliberate: **retrieval** uses `sliceSection`, which keeps the subtree, because
asking for "Configuration" should hand back its subsections too; **indexing**
uses `sectionOwnText`, which does not, because a parent that repeats its
children outranks them. All are fence-aware: a `#` comment in a code block is
not a heading.

A document's body text has its **frontmatter stripped**: the block is machinery,
not prose, and left in, a query for `prefLabel` or `altLabels` would match every
document that has one. Section slices start at their heading and never see it.

### Engine: MiniSearch (option a) — with an explicit cost

Chosen by the maintainer over a hand-rolled BM25, for a battle-tested tokenizer
and fuzzy/prefix matching (typo tolerance a ~100-line BM25 would not have).

The cost is stated plainly: **the runtime loses its zero-dependency property.**
`minisearch` becomes moose-kg's first production runtime dependency, bundled into
`dist/runtime.js` (tsup `noExternal`) to preserve the single-file browser
drop-in — left external, the bundle would carry a bare `import MiniSearch from
"minisearch"` that no browser can resolve without an import map or a bundler.
The bundle-purity gate therefore narrows from "no npm dependency" to **an
allow-list of exactly `minisearch`**, plus an assertion that it is *inlined*
rather than imported; every other dependency, every `node:` specifier, and every
Node-only global still assert absent.

Measured cost, as shipped (unminified, matching the rest of `dist/`):
**22.7 KB gzipped, up from 6.4 KB**. After a consumer's bundler minifies:
**10.6 KB gzipped**. The widely-quoted "~6 KB MiniSearch" figure is its
minified-and-gzipped size in isolation; the real delta here is larger, and worth
knowing before the vector leg adds more in Phase 8b.

Two determinism guards, because a library's scoring is not a stability contract:
ranking ties are **broken by IRI** in our code (MiniSearch does not guarantee tie
order), and the artifact format is ours, so a MiniSearch upgrade can change
ranking but can never change the committed artifact.

### The hybrid seam ships now, unused

`rrfMerge(rankings, k = 60)` (reciprocal rank fusion) lands in this phase with
tests, even though only one ranking exists. With a single list it is an identity
ranking. This is not dead code: it fixes the merge contract before Phase 8b's
vector leg arrives, so adding embeddings cannot reshape the entry API.

### Consequences

- Good: a text question now reaches the right nodes *including by body text*,
  hermetically, with no model and no network.
- Good: `retrieve()` in Phase 9 becomes orchestration over existing parts.
- Neutral: one more artifact to publish alongside the graph, and one more
  determinism gate.
- Bad: the runtime is no longer dependency-free, and grows by roughly the size
  of MiniSearch. Accepted deliberately for tokenizer quality and typo tolerance.
- Bad: `search.json` embeds document text, so publishing it publishes that text.
  Harmless for public docs sites (the same text is already served); worth stating
  for private corpora.

### Confirmation

Unit tests for the artifact (per-type entries, the granularity rule in both
directions, label dedupe across case variants, byte-identical rebuilds); runtime
tests including **a body-only term that is invisible to the graph** — the case
that justifies the artifact's existence; `rrfMerge` fusion tests; an integration
test against a `search.json` golden plus a `moose-kg search` CLI run; and the
updated bundle-purity gate with the new size recorded.

## Pros and Cons of the Options

### (a) Build-time artifact — chosen

- Good: hermetic, deterministic, one fetch, graph stays prose-free.
- Bad: another artifact to ship and keep in sync with the graph.

### (b) Resolve-and-index at load

- Good: no new artifact; always matches the live docs.
- Bad: N fetches before the first query; re-indexes every page load; unusable
  offline.

### (c) Prose into the graph

- Good: one artifact.
- Bad: violates ADR 01008, bloats every graph consumer, and makes the Turtle
  golden a corpus diff.

### (d) Graph metadata only

- Good: zero new anything.
- Bad: body words unfindable — the evaporation failure this phase exists to fix.

### Engine (b) hand-rolled BM25 — not chosen

- Good: keeps zero dependencies and full determinism ownership; matches the four
  hand-rolled serializers already in this repo.
- Bad: no fuzzy/prefix matching, so ordinary typos miss; more scoring code to own.
