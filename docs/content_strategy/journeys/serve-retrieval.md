---
id: cuj-serve-retrieval
type: cuj
title: Serve scoped, cited retrieval in the browser
personas:
  - persona-ai-platform-engineer
trigger: >-
  a production RAG pipeline returns semantically close passages from the wrong product or
  variant, and reranking did not fix it because the wrong chunk genuinely is similar
entry_point: /dockg/retrieve/
success_criteria: >-
  A browser-side query returns context, citations, and a trace; a variant filter provably
  excludes out-of-scope material; and a stale artifact is refused rather than silently ranked.
steps:
  - stage: orient
    doc: /dockg/retrieve/
    exists: false
    note: "[GAP] What the runtime does and where it stops. State the metadata dependency here, not later."
  - stage: act
    doc: /dockg/retrieve/search/
    exists: false
    note: "[GAP] Build the artifacts: export --format search, then embed. Name each file and its role."
  - stage: act
    doc: /dockg/retrieve/runtime/
    exists: false
    note: "[GAP] Load the graph and index in the browser; the {context, citations, trace} return shape."
  - stage: act
    doc: /dockg/retrieve/runtime/
    exists: false
    note: "[GAP] Apply a variant or subject filter, and show what it excluded."
  - stage: verify
    doc: /dockg/retrieve/search/
    exists: false
    note: "[GAP] Staleness: mismatched model, dtype, dims, or corpus digest is refused, not degraded."
  - stage: extend
    doc: /dockg/reference/runtime-api/
    exists: false
    note: "[GAP] Exact exports and type signatures; this reader reads signatures faster than prose."
  - stage: extend
    doc: /dockg/reference/embed-models/
    exists: false
    note: "[GAP] Tested models, sizes, context limits, and the truncation trap on short-context models."
---

Kwame puts a deterministic boundary in front of a ranker that cannot see one.

## The journey

The arriving failure is specific: retrieval returns a passage that is genuinely similar and
belongs to a different product, and the model produces a fluent, wrong, correctly-cited answer.
Reranking did not help, because ranking is not the problem.

What dockg offers is a typed filter applied before similarity is considered, plus a citation and
trace trail that survives review. The runtime is retrieval-only — it returns context, citations,
and a trace, then stops, without calling a model — so it drops into an existing stack rather than
competing with it.

## The dependency that goes on the first page

**dockg's value here scales with metadata someone else has to add.** A corpus with no `appliesTo`
values cannot be filtered by variant no matter how good the runtime is.

This is uncomfortable and it belongs in the opening section of the track, not at integration
time. A reader who builds the integration, gets no lift, and *then* discovers the dependency
concludes the tool does not work. A reader who is told up front can go measure their corpus with
`dockg stats` coverage and take a number to the documentation team — which is a better outcome
for everyone, and is the honest version of the pitch.

## What they need to reach, in order

1. **The scope of the runtime**, including where it stops, and the metadata dependency above.
2. **The artifact chain**, with every file named and its role stated: the graph, the search index
   from `export --format search`, and the vector sidecar from `embed`. Three artifacts that must
   stay in sync is a thing to design for, not discover.
3. **A working browser query.** No `node:` imports, one small bundle, and a separate entry point
   for embeddings so the query path stays lean.
4. **A filter that provably excludes.** Showing what came back is not enough — the whole point is
   what did not, so the demonstration has to show the excluded set.
5. **The staleness contract.** A mismatched model, dtype, dimension count, or corpus digest is
   refused with an error rather than ranked with. This reader has been burned by the silent
   version of this failure and will specifically look for how dockg handles it.

## Design notes

- Embeddings are local-only by contract: no API, no key, no spend, no corpus text leaving the
  machine. That is a procurement-relevant fact, not just a technical one, and it should be stated
  where someone can quote it.
- `@huggingface/transformers` is an **optional** peer dependency, so a missing embedder degrades
  to lexical search — unless vector mode was explicitly requested, in which case it errors. The
  distinction between graceful degradation and explicit refusal is exactly what this reader wants
  documented.

## Where it goes next

[`cuj-export-to-consumer`](export-to-consumer.md) when the graph has to leave dockg's runtime
entirely and feed a system that speaks JSON-LD or iiRDS.
