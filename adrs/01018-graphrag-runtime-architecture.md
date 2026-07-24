---
status: accepted
date: 2026-07-24
decision-makers: [manuel.r.b.silva]
---

# GraphRAG runtime: browser-native, retrieval-only, explainable

## Context and Problem Statement

Phases 0–6b built the compile side: deterministic derivation, iiRDS semantics,
SHACL contracts, `fill`, and three export formats. What remains is the reason
the graph exists — **serving it**: retrieval that walks the graph instead of
similarity-matching chunks, honoring scope rules, and refusing when no route
exists.

Three constraints shape the design, all set by the maintainer:

1. **Triples compilation stays in Node.** The build side is done and correct.
2. **The serving runtime must be browser-safe — ideally browser-native.**
   Serving may eventually be its own project; the architecture must not
   foreclose that.
3. **Every result must carry its trace.** "I want to understand how and why a
   query led to the result that got returned." Retrieval provenance is a
   requirement, not a nicety.

Plus a scope decision made during planning: **generation is out of scope.** The
runtime returns the bundle an inference engine would consume and stops there.

## Decision Drivers

- **Browser weight**: a docs-site widget cannot ship megabytes.
- **Explainability**: results without their derivation are unauditable.
- **Determinism is the product contract** — it must extend from build into
  retrieval, not stop at the artifact boundary.
- **Don't foreclose SPARQL**: users will legitimately want arbitrary queries.
- **Portability**: no `node:` imports anywhere in the runtime's module graph,
  so extraction to a separate package stays cheap.

## Considered Options

**Query engine:** (a) plain-JS adjacency walker over the JSON-LD artifact;
(b) n3 `Store` in the browser; (c) Comunica-lite SPARQL; (d) Oxigraph WASM.

**Packaging:** (a) `dockg/runtime` subpath export from this repo;
(b) a separate `dockg-runtime` package now.

**Scope:** (a) retrieval-only, terminating at the context bundle;
(b) retrieval + generation behind a `generate()` callback.

## Decision Outcome

**Engine: a plain-JS adjacency walker over `graph.jsonld` (option a), with an
RDF/JS quad export as the SPARQL escape hatch (option c, opt-in).**

`graph.jsonld` (Phase 6) is plain `JSON.parse`-able — deterministic `@context`
plus a sorted, blank-node-free `@graph`. The runtime therefore needs **no RDF
parser at all**; Turtle remains the git-diff source of truth, JSON-LD becomes
the serving format. Phase 6 retroactively becomes the runtime's foundation.

The honest case for hand-rolling, since n3 and Comunica are good software: it
is **not** speed — at docs scale (10²–10³ nodes) a `Map` lookup versus n3's
indexed `getQuads` is a wash. The walker wins on three other axes:

- **Weight**: 0 KB, versus ~49 KB gzip for n3 (which also drags Node stream
  shims and a Turtle parser the runtime never needs) or ~146 KB for
  Comunica-lite. Oxigraph's ~4 MB WASM would also duplicate the graph into
  WASM memory.
- **Explainability**: generic engines return *bindings*, not the path that
  produced them. A recording walker emits every hop and every exclusion by
  construction. Given constraint 3, this is decisive — the trace requirement
  makes the walker the natural engine rather than a compromise.
- **Domain semantics**: variant scoping and the ADR 01014 negative-scope
  predicates are dockg rules no general engine knows; they would be
  reimplemented on top of any engine anyway.

Arbitrary SPARQL is **supported, not foreclosed**: `rdfjsQuads(graph)` hands out
the index as standard RDF/JS quads, which drop into any RDF/JS store and
therefore any engine (`new Store(rdfjsQuads(graph))` → Comunica). A user who
wants SPARQL 1.1 installs an engine themselves; everyone else pays nothing.

Quads rather than a hand-rolled RDF/JS `Source` stream, deliberately: the first
implementation faked Node's `Readable` contract so an engine could stream
directly from the index, and it broke against `asynciterator`'s internals —
fragile emulation for no real gain, since every engine already accepts a store
and stores accept quad arrays. Materializing is trivial at docs scale (the
reference corpus is 139 quads). Stated honestly: SPARQL results carry engine
bindings, not the walker's trace.

**Packaging: `dockg/runtime` subpath (option a).** One repo, one CI, one
determinism gate, and it version-locks runtime semantics to graph semantics —
the negative-scope predicates and IRI shapes must not drift apart. A
**bundle-purity gate** asserts the built `dist/runtime.js` contains no `node:`
specifier, no `require(`, and no CLI banner, which both enforces browser safety
and keeps later extraction to a standalone package mechanical.

**Scope: retrieval-only (option a).** The runtime terminates at
`{ context, citations, trace, refusal? }` — exactly what an inference engine
consumes — and never performs or wires inference. This keeps the runtime 100%
deterministic (no nondeterministic stage exists at all), keeps API keys and
inference cost entirely out of dockg's blast radius, makes the eventual MCP
surface what agents actually want (retrieval results, not someone else's
answers), and lets the Phase 10 eval harness run with no LLM whatsoever.

### Schema edges are not traversed by default

Discovered while implementing: following `rdf:type` makes every document
reachable from every other in two hops through the shared class node
(`a → dockg:Document → b`). That is precisely the edge contamination
graph-governed retrieval exists to avoid, so the walker skips `rdf:type` unless
`includeTypeEdges` is set. Class membership stays queryable through
`instancesOf`/`types` — it is just not a *path* between documents.

### Standing invariants

1. **Deterministic end to end**: same graph + same query ⇒ identical entry
   ranking, traversal order, context bytes, citations, and trace.
2. **Every result is explainable**: no API returns results without the trace
   that produced them — retrieval provenance parallels PROV build provenance.
3. **Hermetic by default**: zero network beyond artifacts/content the host
   explicitly points the runtime at.
4. **No route ⇒ structured refusal**, never empty context a caller could
   mistake for "nothing exists, proceed anyway."
5. **The runtime never writes the graph.** `fill` remains the only
   LLM→frontmatter path.

### Consequences

- Good: a docs-site can run graph-governed retrieval fully client-side with no
  server and no SaaS — which no commercial docs widget (kapa, Algolia Ask AI,
  Mintlify) currently offers; they all do server-side retrieval.
- Good: the trace makes retrieval auditable and gives Phase 10 evals a target
  richer than "did the right citation appear."
- Good: zero new runtime dependencies in this phase.
- Neutral: a walker is code we own. Bounded by the deterministic-emitter
  precedent already set by three hand-rolled serializers.
- Bad: no SPARQL out of the box — users wanting it install Comunica-lite and
  accept that its results bypass the trace.

### Confirmation

Unit tests per module (graph construction, traversal + every scope
permutation, resolver, assembly); a **trace-completeness test** (every returned
node reachable via recorded hops, every filtered node has a recorded
exclusion); a **JSON-LD ⇄ Turtle equivalence gate** (a GraphIndex built from
either artifact yields identical traversals); a **bundle-purity gate**; and an
integration test running real Comunica-lite SPARQL over `rdfjsQuads()` to
prove the seam.

## Pros and Cons of the Options

### Engine (a) plain-JS walker — chosen

- Good: 0 KB; native trace; dockg scope semantics first-class.
- Bad: we own the traversal code; no SPARQL without the adapter.

### Engine (b) n3 Store

- Good: mature, RDF-correct, already a build-side dependency.
- Bad: ~49 KB gzip plus Node shims for a `getQuads` primitive we need anyway;
  still no SPARQL; returns matches without derivation paths.

### Engine (c) Comunica-lite — chosen as the opt-in

- Good: real SPARQL 1.1 over any RDF/JS source.
- Bad: ~146 KB gzip forced on every consumer if made the core; execution plans
  are not the graph story the trace requirement asks for.

### Engine (d) Oxigraph WASM

- Good: the most complete in-browser SPARQL engine.
- Bad: ~4 MB WASM; duplicates the graph into WASM memory; widget-hostile.

### Packaging (b) separate package now

- Good: cleanest story if the runtime grows its own UI ecosystem.
- Bad: re-creates the cross-repo coordination pain dockg just escaped when the
  `file:../docmeta` dependency was removed. Revisit at 1.0.

### Scope (b) retrieval + generation callback

- Good: one call from question to answer.
- Bad: drags key handling, cost, and nondeterminism into a runtime whose entire
  value proposition is being deterministic and auditable; duplicates what the
  calling agent or host already does well.
