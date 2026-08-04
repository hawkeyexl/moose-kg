---
id: persona-ai-platform-engineer
type: persona
name: Kwame
audience: aud-ai-platform-teams
role: Engineer who owns a retrieval pipeline over documentation they do not own
proficiency:
  - builds and tunes retrieval pipelines in production
  - reasons about embeddings, dimensionality, and quantization
  - ships to a browser under a bundle-size budget
  - reads a TypeScript type signature faster than prose about it
prerequisites:
  - TypeScript or JavaScript, and a module bundler
  - vector search, chunking, and reranking as working concepts
  - an existing RAG or assistant product in production
  - JSON-LD or RDF exposure is optional and not assumed
goals:
  - stop retrieval from blending content across product or variant boundaries
  - attach citations that survive a reviewer's scrutiny
  - add a deterministic filter without replacing the existing ranker
  - run the query path in a browser, not just in Node
  - keep index, vectors, and graph provably in sync
pains:
  - the wrong chunk genuinely is semantically similar, so reranking does not fix it
  - answers are fluent, wrong, and confidently cited to the wrong product
  - a stale sidecar silently degrades quality with no error
  - the documentation team cannot or will not annotate on their schedule
content_types:
  - API reference with exact type signatures and return shapes
  - end-to-end pipeline examples with each artifact named
  - artifact compatibility and staleness rules
  - honest statements of what the tool does not do
journeys:
  - cuj-serve-retrieval
  - cuj-export-to-consumer
evidence_basis:
  - DESIGN.md's edge-contamination argument, which names this exact production failure
  - ADR 01018's retrieval-only, browser-native, always-traced runtime contract
  - the ./runtime and ./embed entry points in package.json, split so the query path never pulls in the model stack
  - ADR 01020's local-only embeddings and the VectorMismatchError refusal rather than degraded ranking
  - ADR 01016 and 01017 (JSON-LD and iiRDS package export), which exist for downstream consumers
---

The engineer who has to make retrieval correct over documentation they cannot change.

## Who they are

Kwame owns an assistant or search product built on the company's documentation. Vector search is
already in place and mostly works. The failures that remain are the expensive kind: the system
returns a passage that is genuinely similar and belongs to a different product, and the model
produces a confident, wrong, correctly-cited answer.

They have already tried reranking. It did not fix it, because ranking is not the problem — the
wrong chunk really is close in embedding space. What they need is a *filter with a hard
boundary*, applied before similarity is considered.

They do not own the documentation and often have limited influence over the team that does.

## What they bring, and what they do not

**Bring:** TypeScript, embeddings, retrieval plumbing, bundling, and production instincts about
staleness and sync.

**Do not bring:** documentation authoring conventions, iiRDS, or any interest in the tekom
standards landscape. They will use `appliesTo` as a filter key without caring what body
standardized it.

## The dependency that has to be stated early

dockg's value to Kwame **scales with metadata someone else has to add.** A corpus with no
`appliesTo` values cannot be filtered by variant, no matter how good the runtime is. This is
uncomfortable and it belongs on their first page rather than at integration time — otherwise
they build the integration, get no lift, and conclude the tool does not work.

The honest framing: dockg gives them a deterministic scoping and citation layer *to the extent
the corpus is typed*, plus the tooling to find out how typed it actually is
(`dockg stats` coverage) and to argue for more.

## What wins them

- **Retrieval-only.** The runtime returns context, citations, and a trace, then stops. It drops
  into their stack instead of competing with it.
- **Browser-native, small.** No `node:` imports in `dockg/runtime`, and a separate entry point
  for embeddings so the query path stays lean.
- **Refusal over degradation.** A mismatched model, dtype, dimension, or corpus digest is an
  error, not a quietly worse result. They have been burned by the silent version.

## Their journeys

[`cuj-serve-retrieval`](../journeys/serve-retrieval.md) ·
[`cuj-export-to-consumer`](../journeys/export-to-consumer.md)
