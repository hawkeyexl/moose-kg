---
id: aud-ai-platform-teams
type: audience
segment: AI platform teams
maturity: has a retrieval pipeline in production that is returning subtly wrong context
docs_owner: nobody on this team — they consume documentation they do not own
status: core
firmographics:
  - an existing RAG or assistant product built on the company's documentation
  - vector search already in place, and already known to be imperfect
  - answers must carry citations, and often must be explainable to a reviewer
  - the documentation corpus spans products or variants that must not be blended
  - frequently shipping to a browser, where a Node-only toolchain is not an option
relationship_stages:
  - evaluating: does this fix boundary leakage without replacing my retrieval stack?
  - adopting: wiring build, export, and the runtime into an existing pipeline
  - operating: keeping vectors, index, and graph in sync as the corpus changes
personas:
  - persona-ai-platform-engineer
evidence_basis:
  - DESIGN.md's edge-contamination argument — semantically close chunks let a model blend content across product boundaries, and a typed graph prevents it deterministically
  - ADR 01018 (GraphRAG runtime — browser-native, retrieval-only, explainable) and the moose-kg/runtime entry point
  - ADR 01019 (a lexical search artifact beside the graph) and ADR 01020 (vector entry with local-only embeddings)
  - the three published package entry points in package.json exports (., ./runtime, ./embed) — a deliberate split so the runtime never pulls in the model stack
  - the runtime's {context, citations, trace} return contract, which stops before calling a model
---

Engineers who own a retrieval pipeline over documentation they did not write, and have
discovered that semantic similarity is not the same thing as correctness.

## What they own

The retrieval system, not the content. They cannot change how the docs are written and often
cannot get anyone to annotate them; they can only change what happens between the corpus and
the model. Their relationship to the documentation team ranges from close to nonexistent.

They bring TypeScript, embeddings, and RAG plumbing, and frequently a browser bundle-size
budget. They do **not** bring documentation-authoring conventions and have usually never heard
of iiRDS.

## What they want

The specific failure they arrive with is **edge contamination**: their vector search returns
chunks that are semantically close but belong to the wrong product, the wrong variant, or the
wrong version, and the model blends them into an answer that is fluent and wrong. Reranking does
not fix it, because the problem is not ranking — the wrong chunk genuinely is similar.

What they want from moose-kg is a **deterministic filter to put in front of or beside the ranker**:
typed edges that let them exclude by variant or subject before similarity is ever considered, and
a citation trail that survives review. moose-kg's retrieval-only contract matters here — the runtime
returns context, citations, and a trace, then stops. It does not call a model, so it drops into
an existing stack rather than replacing it.

Three secondary requirements shape their reference needs sharply:

- **Browser-native.** `moose-kg/runtime` has no `node:` imports and is a single small bundle.
  A tool that only runs in Node is not usable in their product.
- **Explainability.** Every result carries a trace. This is often a compliance requirement
  arriving from a different department, not an engineering preference.
- **Sync safety.** A stale vector sidecar produces plausible garbage, so moose-kg refuses a
  mismatched model, dtype, dimension, or corpus digest rather than ranking with it. This
  audience has been burned by the silent version of this failure.

## What makes them different from the other audiences

They are the only segment consuming an artifact rather than producing one, which inverts the
documentation problem. They do not need to be persuaded to annotate — they cannot annotate. So
their track cannot depend on a well-annotated corpus, and must be honest that moose-kg's value to
them scales with metadata someone *else* has to add. That dependency is worth stating plainly on
their pages rather than discovering at integration time.

## Where the docset serves them

The `retrieve/` track and the runtime and embedding reference pages. See
[`persona-ai-platform-engineer`](../personas/ai-platform-engineer.md) and journeys
[`cuj-serve-retrieval`](../journeys/serve-retrieval.md) and
[`cuj-export-to-consumer`](../journeys/export-to-consumer.md).
