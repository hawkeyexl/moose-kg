---
id: cuj-query-the-graph
type: cuj
title: Answer a question about my corpus without grepping for it
personas:
  - persona-docs-engineer
  - persona-information-architect
trigger: >-
  about to move, rename, or delete a page and needing to know what depends on it —
  or needing to confirm what the graph actually asserts, rather than what it was
  meant to assert
entry_point: /dockg/build/query/
success_criteria: >-
  The reader can list every assertion about a node, find everything that points at
  a page before changing it, and read a scope filter's exclusions rather than only
  its results.
steps:
  - stage: trigger
    doc: /dockg/build/
    exists: true
    note: "stats gives aggregate numbers; the next question is always about one specific node."
  - stage: orient
    doc: /dockg/build/query/
    exists: true
    note: "Two commands, two shapes of question: query matches patterns, traverse walks edges."
  - stage: act
    doc: /dockg/build/query/
    exists: true
    note: "query with any term omitted as a wildcard; CURIEs rather than full IRIs."
  - stage: act
    doc: /dockg/build/query/
    exists: true
    note: "traverse --reverse and --impact: what points here, and what a change reaches."
  - stage: verify
    doc: /dockg/build/query/
    exists: true
    note: "Read the exclusions line, not just the node list — the filter's value is what it removed."
  - stage: extend
    doc: /dockg/reference/cli/
    exists: true
    note: "Every flag on both commands, including the depth default that changes under --impact."
  - stage: extend
    doc: /dockg/reference/vocabulary/
    exists: true
    note: "Which predicate to ask for, once the reader knows what they are looking for."
---

Priya needs to know what depends on a page before touching it, and Ines needs to confirm what the
graph actually says.

## The journey

Every other journey produces a graph or gates on one. This is the one where somebody *asks it
something* — and it is the payoff for the work the rest of them do.

It is reached two ways. Priya arrives from `stats`, which answers aggregate questions ("how many
orphans?") and immediately provokes specific ones ("which pages point at *this* one?"). Ines arrives
from [`cuj-model-concepts`](model-concepts.md) needing to verify that the vocabulary landed the way
it was written — slug convergence in particular is silent, and a query is the only way to see it.

## What they need to reach, in order

1. **Which command answers which shape of question.** `query` matches a triple pattern with any
   term omitted as a wildcard — good for "show me every X". `traverse` walks edges from a node —
   good for "what is connected to this". Readers reach for the wrong one first, and the distinction
   costs one sentence.
2. **CURIEs, not full IRIs.** `dcterms:title` rather than the expanded form. The prefix table is
   fixed and emitted with every graph, so this is safe to rely on.
3. **The two questions worth teaching by name.** *What points at this page?*
   (`traverse --reverse --predicates dcterms:references`) and *what does changing this reach?*
   (`traverse --impact`). These are the impact-analysis jobs
   [`concepts/index-not-corpus`](../../src/content/docs/concepts/index-not-corpus.mdx) promises the
   graph is for, and this is where the promise is cashed.
4. **Read the exclusions.** A scoped traversal prints what it removed and why. A reader who checks
   only the returned nodes cannot tell a working filter from one that matched nothing — the same
   open-world hazard as [`cuj-scope-by-variant`](scope-by-variant.md), one layer up.
5. **`--impact` changes the depth default** from 1 to 3. Worth stating, because a reader comparing
   two runs will otherwise think the flag did more than it did.

## Design notes

- **Show real output.** Both commands print a compact, stable format, and a reader matching their
  terminal against the page is the fastest way to confirm they ran it right.
- **`rdf:type` is not traversed by default.** Every document shares `dockg:Document`, so following
  type edges makes everything reachable from everything in two hops. Mention it where a reader might
  wonder why a traversal looks narrower than expected.
- **Both commands are read-only and always exit 0** on a successful run, including when nothing
  matched. They are for exploration, not gating — `stats --check` and `check` do the gating.

## Where it goes next

[`cuj-map-site-routes`](map-site-routes.md) when the answer reveals that half the expected edges are
missing, and [`cuj-audit-provenance`](audit-provenance.md) when the question is about authorship
rather than structure.
