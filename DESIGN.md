# dockg long-term design: standards-typed graphs → GraphRAG

Status: living document. This is the roadmap and decision framework, not the
decisions themselves — each phase opens by making its own decisions as ADRs
(MADR, `adrs/`), doing its listed research first. Tackle **one phase at a
time**; do not start a phase while the previous one has open decisions.

## Vision

dockg becomes the standards-typed knowledge layer for documentation
repositories: a deterministic, governed RDF graph derived from docs, exported
in the formats the outside world consumes (Turtle, JSON-LD/schema.org, iiRDS
packages), and — ultimately — the substrate of a full hybrid GraphRAG system
(graph-governed retrieval + vector entry + interlocked answer synthesis),
consumable by agents via MCP.

The design is grounded in the iiRDS × knowledge-graph work published by
Natsuki Wakabayashi (tcworld, "Architecting certainty" parts 1–3, June 2026,
plus companion posts). The load-bearing findings:

- **Vector RAG suffers "edge contamination"** — semantically close chunks let
  LLMs blend content across product/variant boundaries. Graphs prevent this
  *deterministically*: an absent edge is an interlock, forcing disciplined
  silence instead of helpful fabrication.
- **Graphs are irreplaceable for governance jobs** (variant filtering, impact
  analysis, compliance audit), while flat retrieval is adequate for ordinary
  Q&A. dockg's differentiation lives in the governance jobs.
- **"Information evaporation" (the 5 mm silence)**: a system that treats the
  graph as the sole truth surface loses every fact not lifted into a node.
  The countermeasures are hybrid consumption (graph routes, files carry
  content), measurable metadata coverage, and deliberate
  resolution-deepening (LLM-assisted property lifting with audit).
- **Granularity golden rule**: content granularity must match graph node
  granularity — hence section-level metadata.
- **Exception-based auditing**: forced-reasoning generation plus
  confidence-scored verification lets humans review only flagged exceptions.

## Settled direction (decided by the maintainer; not up for re-litigation)

1. **Opinionated defaults.** Every optional *hermetic* feature is on by
   default (git provenance, qualified provenance, new derive sources,
   coverage reporting, all export formats emitted by `dockg build`). The
   boundary: anything that costs network or money (`fill`, future
   `index`/`ask`) stays an explicit invocation — with strict guardrails as
   *its* defaults. Suppression knobs remain (opinionated ≠ non-configurable).
2. **Pre-release: breaking changes are fine.** No staged major releases, no
   migration choreography. Commits still mark breakage honestly
   (`feat!:`/`BREAKING CHANGE:`) because commitlint and semantic-release
   consume them.
3. **iiRDS is in, starting with the Core vocabulary.** Adopt iiRDS Core terms
   wherever a dockg concept maps; research domain extensions (see Phase 2
   research list) before choosing more. Reference published iiRDS IRIs —
   never vendor or modify the spec (CC BY-ND).
4. **iiRDS package export is in scope** — a first-class deliverable, not
   demand-gated.
5. **Section-level metadata is in scope** — the graph already has per-section
   nodes; metadata must be able to attach to them.
6. **GraphRAG is the endgame** — dockg grows a runtime (traversal, hybrid
   entry, synthesis, MCP serving, eval harness) on top of the build tool.

## Standing invariants (unchanged by this roadmap)

- Determinism: byte-identical rebuilds, no wall clock, no blank nodes,
  sorted emission, IRI stability. Runtime features (ask/index/mcp) live
  *outside* the hermetic build; CI never touches the network (mock providers
  only).
- The golden corpus comparison stays the regression gate; goldens change only
  deliberately, diff inspected line by line.
- Published schemas and shapes are immutable; evolve by new version files.
- Custom `dockg:` namespace stays minimal; prefer external vocabularies.
- Exit-code contract: 0 ok · 1 findings · 2 operational.
- Every behavior change: ADR + docs + shapes review in the same change.

---

## Phase 0 — Positioning and hygiene — **done**

**Goal:** ratify the product frame everything else builds on.

Decided:
- **Graph-as-index contract** — ratified as proposed
  ([ADR 01008](adrs/01008-graph-as-index-not-corpus.md)): the graph is an index
  and governance layer, prose never enters it, consumers join graph → files via
  `dockg:path` + section slug. Binds the roadmap in two ways — retrieval
  features need a content resolver, and metadata coverage becomes a
  first-class measurable concern.
- **Opinionated defaults get their own umbrella ADR**
  ([ADR 01009](adrs/01009-opinionated-defaults.md)) rather than per-phase
  argument: hermetic features default on; network and spend stay explicit
  commands; strictness stays the default *inside* those commands; default-on
  features degrade rather than fail; reporting-on-by-default does not imply
  gates-on-by-default. Includes the schedule of which knob flips in which
  phase.

Delivered: both ADRs; README "What the graph is (and isn't)" and "Related
standards" sections (incl. the iiRDS no-vendoring rule); the 01004→01007 ADR
renumbering chore.

## Phase 0b — Default flips for the existing knobs — **done**

**Goal:** apply ADR 01009 to the two opt-ins that predate it. First *behavior*
change of the roadmap; deliberately separated from Phase 0's docs-only scope.

Decided ([ADR 01010](adrs/01010-provenance-defaults-and-degradation.md)):
- **`provenance.git` became tri-state** — `"auto"` (default) derives git
  provenance where git can run and degrades with a warning where it cannot,
  `true` requires it (unavailable git → exit 2), `false` skips the subprocess.
  ADR 01009's leading candidate (distinguish explicit `true` from an inherited
  default) was rejected: identical config values behaving differently by origin
  is invisible in the file and awkward to document.
- **`provenance.qualified` flipped to `true`** outright — no external
  dependency, no degradation path, stable output.
- **Builds gained a warnings channel** — `BuildResult.warnings`, rendered to
  stderr by the CLI, never affecting the exit code. dockg had no diagnostic
  path between "silent" and "fatal" before this; later phases can use it.
- **The regression corpus pins `provenance.git: false`.** Discovered during
  implementation: the build activity's `prov:endedAtTime` is HEAD's committer
  date, so a git-on golden would fail on *every commit* to this repo. The
  golden's job is derivation regression, not repo-state capture.

Delivered: config schema + defaults, degradation path, warnings channel, golden
regenerated (8 qualified-provenance triples, diff inspected), CLAUDE.md
determinism invariant amended, README provenance section + config sample +
opinionated-defaults statement, `dockg init` template.

## Phase 1 — Metadata coverage in `stats` — **done**

**Goal:** make the lifted/unlifted boundary measurable (the evaporation
countermeasure), before new vocabulary lands.

Decided ([ADR 01011](adrs/01011-metadata-coverage-in-stats.md)):
- **Seven fixed fields** — `title`, `description`, `creator`, `created`,
  `modified`, `subject`, `prefLabel` (`language` dropped as near-universally
  0% noise). Measured against the graph, so git-derived values count. A fixed
  list, not a dynamic census, so an absent-everywhere field still shows 0%.
- **Report shape**: counts + one-decimal percentages, empty graph vacuously
  100%. Pretty block + ordered JSON array.
- **Per-field thresholds** with a uniform number as shorthand; a uniform-only
  gate would be dominated by whichever field a corpus legitimately never sets
  (`prefLabel`/`creator` at 25% in the corpus). CLI `--coverage-threshold`
  sets the uniform form; the map is config-only.
- **No gate by default** (`{}`) — reporting is on, enforcement is opt-in per
  ADR 01009.

Delivered: `src/core/coverage.ts` (shared field list), coverage in `stats`
(pretty + JSON) and its `--check` gate, `stats.coverageThreshold` config knob,
`--coverage-threshold` flag, a schema-sync drift guard pinning the field list
to the config schema, corpus-exact tests, README (coverage subsection, config
sample, commands table) + `dockg init` template + `--help`. Shapes and golden
untouched — `stats` only reads the graph.

## Phase 2 — iiRDS Core (+ Software domain) vocabulary adoption — **done**

**Goal:** dockg graphs speak the tech-comm industry's RDF dialect where a
term fits.

Research findings (three parallel agents, byte-verified against
`iirds-consortium/models`) that shaped or corrected the plan:
- Namespace `http://iirds.tekom.de/iirds#` is **stable across versions** —
  hardcoded, not version-pinned.
- License is **CC BY-ND 4.0**: reference published IRIs; never vendor or
  re-serialize the vocabulary.
- A **Software domain exists** (`.../domain/software#`, iiRDS 1.2) — the earlier
  assumption that none did was wrong. Its 9 values split across two predicates
  (6 lifecycle phases, 3 subjects). Adopted this phase.
- **No official SHACL** — dockg authors its own (as it already does).
- **DIN SPEC 91526 was mischaracterized** here and in the README: it is a
  general KG-for-LLMs DIN SPEC, not iiRDS and not the AAS integration (that is
  IDTA 02063-1-0). Corrected.

Decided ([ADR 01012](adrs/01012-iirds-core-vocabulary.md)):
- **Topic types** (`kg.topicType`, closed enum of 6) → `iirds:has-topic-type`
  referencing the published `iirds:Generic*` IRIs. No `a iirds:Topic`, no
  `skos:Concept` mirror.
- **Product applicability** (`kg.appliesTo`, list) → minted
  `iirds:ProductVariant` nodes via `iirds:relates-to-product-variant`, labeled
  with `dcterms:title`.
- **Software domain** — two keys mirroring the two predicates:
  `kg.softwareLifecyclePhase` (6) → `iirds:relates-to-product-lifecycle-phase`,
  `kg.softwareSubject` (3) → `iirds:has-subject`, both referencing `iirdsSft:`
  IRIs.

Delivered: `src/core/iirds.ts` (byte-verified IRI maps), `iirds:`/`iirdsSft:`
namespaces, schema `frontmatter-0.5.json`, shapes `dockg-0.2.ttl` (four new
closed Document predicates + a ProductVariant shape, `sh:in`-constrained),
derive support, schema-sync drift guards for all three enums, corpus
permutations + regenerated golden, and the README/init/DIN-SPEC-correction
docs. Node-level `rdf:type iirds:Topic` and the information-unit hierarchy were
deliberately not adopted (see the ADR).

## Phase 3 — Section-level metadata — **done**

**Goal:** metadata attaches at the granularity the graph already models.

Decided ([ADR 01013](adrs/01013-section-level-metadata.md)):
- **Authoring: slug-keyed `kg.sections` map** — `kg.sections.<heading-slug>:
  {…}`, keyed by the GitHub-style slug section IRIs and link anchors already
  use. Inline body directives rejected (would break the frontmatter-only
  contract).
- **Fields: iiRDS typing + `subjects`** — `topicType`, `appliesTo`,
  `softwareLifecyclePhase`, `softwareSubject`, `subjects`. Not
  `prefLabel`/hierarchy (a "primary topic per section" is meaningless).
- **Inheritance: explicit-only** — a section gets exactly what its block
  declares; nothing from the doc. Keeps the graph small and provenance clear.
- **Slug drift: `dockg:brokenSectionRef`** — a key naming no heading derives
  `<doc> dockg:brokenSectionRef "slug"`, surfaced by `stats` and gated by
  `stats --check`, mirroring `brokenLink`. Never a silent drop.

Delivered: schema `frontmatter-0.6.json` (a `sectionMetadata` `$def`), shapes
`dockg-0.3.ttl` (Section learns four iiRDS predicates + `dcterms:subject`,
Document learns `brokenSectionRef`), a shared `emitIirdsTyping` helper in
`derive.ts` (doc + section share one mapping), `stats` reporting + `--check`
gating of broken section refs, corpus permutations (matched section, broken
key, absent, sections-source-off) + regenerated golden, drift guards pinning
both doc- and section-level enums to `iirds.ts`, and the README/init docs. The
`dockg:` namespace grew by one property (`brokenSectionRef`).

## Phase 4 — Negative scope and closed-world semantics — **done**

**Goal:** make the "absent edge as interlock" pattern *expressible* in an
open-world RDF graph — explicitly, never by inference from absence.

Research settled ([ADR 01014](adrs/01014-negative-scope.md)): no standard
negative-applicability term exists (iiRDS is affirmative-only; schema.org's
`negativeNotes` is pro/con review text); `owl:NegativePropertyAssertion` is the
"pure" idiom but mandates a blank node (invariant violation), gives SHACL
nothing to validate, and has weak consumer support. So Wakabayashi's
`what_it_is_not` was necessarily custom.

Decided:
- **Mint two `dockg:` predicates** — `dockg:notApplicableToVariant` and
  `dockg:notSoftwareSubject`, as `kg.notApplicableTo` (variant labels) and
  `kg.notSoftwareSubject` (enum), at **document and section** level via the
  shared `emitIirdsTyping` helper. Plain triples, no blank nodes.
- **Conflict = `sh:disjoint` violation** — a variant/subject on both the
  positive and negative predicate of one node fails `check` (per-focus-node, so
  a doc/section scope difference is legitimately not flagged).
- **Open-world consumer contract** in the README: absence = unknown; a
  retrieval interlock queries the negative edge, never infers from a missing
  positive one.

Delivered: schema `frontmatter-0.7.json`, shapes `dockg-0.4.ttl` (Document +
Section learn both negative predicates with `sh:disjoint`), the two predicate
constants in `iirds.ts`, `emitIirdsTyping` extended (one place, both levels),
drift guards pinning the negative-subject enum, corpus permutations +
regenerated golden, and README/init docs. The `dockg:` namespace grew by two
properties (6 → 8). Lifecycle-phase and topic-type negation were left out of
scope.

## Phase 5 — Fill as resolution-deepening — **done**

**Goal:** `fill` becomes the deliberate lift-facts-into-the-graph phase, with
exception-based human review.

Decided ([ADR 01015](adrs/01015-fill-confidence.md)):
- **Fill proposes every fillable field** (SKOS + all Phase 2–4 iiRDS fields).
  The old `broader`/`narrower`-off allowlist is retired — **confidence** gates
  what is written, not a static list. Maintainer steer: nothing blocked by a
  hard rule; hallucination-prone fields self-filter via low confidence.
- **Forced reasoning + per-field confidence.** The model returns `confidence`
  (0..1) and `reasoning` sibling maps. `fill.minConfidence` (default **0.7**,
  `--min-confidence`) drops below-threshold fields — reported, not written.
- **Dropped-for-confidence is exit 0** — normal operation; an orchestrating
  agent must not read routine drops as failure. Exit 1 stays for real errors.
- **Confidence persisted** in `kg.provenance` (schema 0.8) and the emitted
  graph: the fill activity reifies each field into an entry node
  (`dockg:filledFieldEntry` → `dockg:filledField` + `dockg:confidence`).
- **Section-level fill deferred** (fill is doc-level).

Delivered: all-fields config + `fill.minConfidence` + `--min-confidence`; the
confidence/reasoning prompt contract (`PROMPT_VERSION` bump); the `fillOne`
confidence gate + report surface; the fill-guard extended to the iiRDS
`sh:disjoint` conflict; schema `frontmatter-0.8.json`; the reified emitter +
`shapes/dockg-0.5.ttl`; drift guards; README/init docs. `dockg:` namespace grew
by two (`filledFieldEntry`, `confidence`, 8 → 10). Golden unchanged (no corpus
doc carries `kg.provenance`). MockProvider-only tests; build determinism intact.

## Phase 6 — JSON-LD export — **done**

**Goal:** the graph reaches web-native consumers as JSON-LD, losslessly and
deterministically.

Delivered ([ADR 01016](adrs/01016-jsonld-export.md)):
- **`dockg export --format jsonld`** — a standalone command that reads the built
  graph (like `stats`/`check`) and reserializes it as JSON-LD. Not a default
  `build` output; the standalone command is the chosen delivery.
- **Whole-graph, lossless** rendering: `{ "@context": <PREFIXES>, "@graph":
  [nodes] }`, grouped by subject, `rdf:type` → `@type`, compacted CURIE keys,
  IRI objects `{@id}`, typed literals `{@value,@type}`. No lossy schema.org
  projection; consumers read the `schema:` terms already present. No `HowTo`
  step synthesis (out of scope).
- **Determinism**: a hand-rolled serializer (`src/core/emit-jsonld.ts`) mirroring
  the Turtle emitter — everything sorted via `byCodeUnit`, byte-stable across
  exports, gated by a version-normalized golden (`graph.jsonld`).
- **iiRDS ingest**: deferred (export-only this phase).
- **`--format iirds`**: recognized but fails with a Phase-6b pointer, keeping the
  flag surface stable.

## Phase 6b — iiRDS package export — **done**

**Goal:** `dockg export --format iirds` produces a conformant iiRDS package.

Delivered ([ADR 01017](adrs/01017-iirds-package-export.md)):
- **Unrestricted iiRDS 1.3** target — the only variant achievable without a
  content pipeline. Research (spec + plusmeta validator rules) established the
  thin mandatory set: `iirds:Package` + `iiRDSVersion`, IUs as subclasses
  (`iirds:Topic`) linked via `is-part-of-package`, renditions with
  `source`/`format`. Creator/ProductVariant are iiRDS/H-only MUSTs, optional here.
- **Package layout**: `mimetype` (stored, first) + `META-INF/metadata.rdf`
  (RDF/XML) + markdown sources under `content/` as `iirds:Rendition`s
  (`text/markdown`).
- **Two new hand-rolled deterministic serializers**: `src/core/zip.ts` (ZIP —
  zeroed timestamps, fixed order, native `zlib`) and `src/core/emit-rdfxml.ts`
  (RDF/XML — sorted, no blank nodes). Projection in `src/core/iirds-package.ts`.
- **Optional `export.iirds` config** (`title`, `creator`, `version`): a Creator
  `iirds:Party`→`vcard:Organization` and package title; absent → a minimal valid
  package.
- **Classification carried**: the Phase-2 iiRDS edges + ProductVariant nodes land
  in the package metadata.
- Byte-identical across exports; `metadata.rdf` golden-gated; validated with
  Python `zipfile` during development.

Out of scope (later): iiRDS/A and iiRDS/H (content converters / PDF-A + JSON-LD
twin); rendered-HTML renditions; iiRDS **ingest**; a `DirectoryNode` ToC tree.

## The GraphRAG runtime (Phases 7–8b, then 9–10)

Phases 8c and 8d interrupt this arc. They are compile-side work — the
serve side is not built on top of integrations nothing exercises.

**Constraint set by the maintainer:** triples compilation stays in Node; the
layer that *serves* the graph must be **browser-safe**, ideally browser-native,
and may eventually become its own project. Plus two scope decisions:
**every result carries its trace**, and **generation is out of scope** — dockg
returns the bundle an inference engine consumes and stops.

The pipeline therefore splits at the artifact boundary:

```
   compile side (Node)                 │   serve side (browser-safe)
 docs ─ build ─→ graph.ttl ────────────┼─→ (git-diff source of truth)
        export → graph.jsonld ─────────┼─→ GraphIndex (JSON.parse, 0 deps)
        index  → embeddings sidecar ───┼─→ vector entry (Phase 8, optional)
        [docs published on a site] ────┼─→ ContentResolver (fetch)
```

`graph.jsonld` is the runtime's native format: deterministic, blank-node-free,
and plain `JSON.parse`-able, so the browser needs **no RDF parser**. Phase 6
retroactively became the runtime's foundation.

### Standing invariants ([ADR 01018](adrs/01018-graphrag-runtime-architecture.md))

1. Deterministic end to end — same graph + query ⇒ same nodes, context, and trace.
2. Every result is explainable: no API returns results without the trace.
3. Hermetic by default: zero network beyond what the host points it at.
4. No route ⇒ a *structured refusal*, never empty context.
5. The runtime never writes the graph; `fill` stays the only LLM→frontmatter path.

## Phase 7 — Browser-native runtime core — **done**

**Goal:** traversal over the built graph plus node→text resolution, running
identically in a browser and in the CLI.

Delivered ([ADR 01018](adrs/01018-graphrag-runtime-architecture.md)):
- **`dockg/runtime` subpath export** — `platform: neutral`, no `node:` imports,
  no dependencies, 21 KB raw / ~6 KB gzipped, enforced by a **bundle-purity
  gate** that scans the built bundle.
- **`GraphIndex`** (`fromJsonLd` / `fromQuads`), **`traverse`** (BFS, depth- and
  predicate-bounded, in/out/both), **`reverseReferences`**, **`impact`**.
- **Scope filtering** honoring iiRDS variants and the ADR 01014 negative
  predicates, with the firing rule recorded in the trace.
- **`QueryTrace`** — entry, hops, exclusions, resolutions — plus a
  trace-completeness test (every result reachable via recorded events; every
  filtered node has a recorded exclusion).
- **`ContentResolver`** (fetch-based, injectable; sections slice their parent
  document by heading, so no line-span predicates were added to the graph) and
  **`assemble`** → `{ context, citations, trace, refusal?, truncated }`.
- **`dockg traverse`** CLI; **JSON-LD ⇄ Turtle equivalence gate**; custom SPARQL
  proven by running real Comunica over `rdfjsQuads()`.

Decided during implementation: **`rdf:type` is not traversed by default** —
every document shares its class node, so following schema edges makes everything
reachable from everything (the edge contamination this project exists to avoid).

## Phase 8 — Lexical entry — **done**

**Goal:** a text question reaches the right nodes, hermetically.

Delivered ([ADR 01019](adrs/01019-lexical-entry.md)):
- **`dockg export --format search` → `kg/search.json`** — the artifact that
  makes body text findable. Forced by the graph-as-index contract: sections
  carry only titles, so an index built from the graph alone can never match what
  a document *says*. Built in Node from local markdown, so entry stays hermetic.
  Plain JSON dockg owns (not MiniSearch's serialized index), sorted, byte-stable.
- **Granularity golden rule enforced — every node indexes the text it owns**: a
  section carries its text down to the next heading of any rank; a document
  carries title + description
  plus the prose no section covers (its preamble, or the whole body when it has
  no sections). Duplicating would shadow sections in the rankings; carrying
  nothing would leave preamble prose findable nowhere.
- **`createLexicalIndex` / `findEntry`** in the runtime, with ties broken by IRI
  so ranking is a dockg contract rather than a library's.
- **`rrfMerge`** shipped and tested though only one ranking exists — it fixes the
  fusion contract before the vector leg arrives.
- **`dockg search <query>`** CLI; `EntryCandidate.via` tightened to a union.

Traded deliberately: the runtime is no longer dependency-free. MiniSearch is
bundled in (6.4 → 22.7 KB gzipped as shipped, ~10.6 KB minified), and the
bundle-purity gate narrowed from "no npm dependency" to an allow-list of exactly
`minisearch` plus an assertion that it is inlined rather than imported.

Found and fixed while implementing: **repeated headings resolved to the wrong
text.** The corpus has two `## Install` headings, and slicing matched by title,
so both sections got the *first* one's body — wrong content under a confident
citation, in the Phase 7 resolver as well as the new index. Sections now derive
their occurrence from true document order (the `dcterms:hasPart` tree ordered by
`dockg:order`).

## Phase 8b — Vector entry with local embeddings — **done**

**Goal:** semantic entry alongside the lexical leg, computed by local models.

Delivered ([ADR 01020](adrs/01020-local-embeddings.md)):
- **`dockg embed` → `kg/vectors.bin`** — embeds the text already in
  `search.json`, so both ranking legs score the same units. Deterministic binary
  layout (magic + JSON header + L2-normalized float32), header recording model,
  dtype, dims, sorted IRIs, and a digest of the search index.
- **Local-only, hard requirement.** No API, no key, no spend. Model runs under
  `@huggingface/transformers` as an **optional peer** behind `dockg/embed`, so
  the runtime never grows a model stack and most users never install it.
- **Node and browser rank the same; they do not compute the same floats.**
  Written here first as "compute the same function", forced WASM on both sides —
  which was reasoned from the WASM spec and never measured. transformers.js
  accepts *different* `device` values on each platform, so no single value forces
  one backend everywhere; measured, the two agree to cosine 0.999914. Corrected
  in Phase 8c ([ADR 01025](adrs/01025-embedder-cross-platform-reality.md)): the
  guarantee is **decisive ordering** within a bounded noise floor, gated against
  the real model in a real browser. Still pinned: single-threaded on the WASM
  side, q8, one text per call.
- **Model is configurable**, defaulting to granite-embedding-small-english-r2
  (8192 ctx, no prefixes). Open string, not an enum; prefix conventions applied
  automatically for models that need them.
- **Three modes, each standalone**: `lexical.search()`, `vectors.search()`, and
  `findEntry()` which returns **each leg and the fusion**. The retrieval bundle
  carries an `entry` block beside `nodes`/`context`/`citations`, so a consumer
  sees text matches, semantic matches, and graph results as distinct things.
- **Mismatch is refused, not ranked** — wrong model, dims, or a stale corpus
  digest errors rather than returning quietly wrong results.

Corrected during planning: an earlier draft specified int8 vectors as
"effectively lossless". At **384 dimensions int8 retains only ~91%** of float32
retrieval — the 97–100% figures widely quoted are 1024-dim models. Storing
L2-normalized float32 instead costs ~1.1 MB per 1000 sections and makes cosine a
bare dot product.

No vector-search library was adopted, on evidence: the dedicated ones are ~3
years stale, no maintained micro-package handles typed arrays (the popular one
throws on `Float32Array`), and Orama — the credible alternative — runs
`Date.now()` at module load, which collides with the no-wall-clock invariant.

Unlike every other dockg artifact, `kg/vectors.bin` **cannot be regenerated in
CI** (weights are a download), so it is gitignored, built in the deploy
pipeline, and gated in tests with a deterministic mock embedder.

## Landed outside the phase structure — **done**

Work that arrived between Phase 8b and Phase 8c without a roadmap slot. Recorded
because a living document that stops recording is just an old document — two of
these are breaking changes, and one redefines what frontmatter dockg reads.

- **[ADR 01021](adrs/01021-take-inference-from-the-shared-library.md)** — the
  inference layer moved to `@hawkeyexl/inference`. `src/llm/` keeps only the SKOS
  prompt, the cache-key composition, and the config → `ProviderSpec` mapping.
  Three copies of provider code had already drifted apart once.
- **[ADR 01022](adrs/01022-parse-mdx-and-derive-from-jsx-attributes.md)** — `.mdx`
  parses through `remark-mdx`, and a JSX element's `href`/`src` derive links and
  images. Found by building a graph from dockg's own docs and reading a number
  that disagreed: 26 reference edges and 5 orphans became 129 and 0.
- **[ADR 01023](adrs/01023-adopt-docmetas-common-kg-vocabulary.md)** — breaking.
  The `kg` block is now `docmeta:kg`, vendored byte-verbatim; docmeta publishes
  the vocabulary and dockg implements graph behavior against it.
- **[ADR 01024](adrs/01024-the-harvest-rule.md)** — deeper wins, per fact. Five
  page-level keys became graph inputs, so a page with no `kg` block at all can
  now derive iiRDS triples. Phase 8d closes the validation hole this opened.

## Phase 8c — Exercise every third party, on every platform — **done**

**Goal:** every integration dockg has with code it does not own is driven for
real by something in CI, on every platform the tool claims to support.

Placed before the runtime endgame deliberately. Phase 9 is orchestration over
parts whose real-path behavior is currently unproven — and one of those parts
does not work.

**Why now.** `dockg embed` against a real model has never run in CI, and it fails
at pipeline construction: `createLocalEmbedder` hardcodes `device: "wasm"`, which
transformers.js v4 rejects in Node. It shipped that way because the only embedder
coverage was its *absence* path plus a mock that validates nothing about the
library — and the `options.transformers` seam that would have caught it
hermetically exists but is used by no test.

A survey of all 55 third parties — dependencies, external binaries, network
endpoints, and file-format contracts — found the same shape in four more places,
and found the suite in better condition than assumed in two: git is genuinely
exercised (real `git init`, real commits, real subprocess), and docmeta is real
on two independent paths rather than a stub.

**The rule (ADR):** *every third party is driven for real by something in CI;
where that is impossible the exception is named in the ADR, with its reason and
its compensating hermetic seam.* A mock with no real counterpart is an untested
integration wearing a green check. A byte-golden of our own output is not a
consumer — it locks in whatever we emit today, correct or not.

Slices, in the priority order they were planned in — kept in the future tense
they were written in, because the record of what the phase set out to do is the
point. What each one actually became is under *Delivered*, below.

1. **The embedder repair.** Land the unmerged `test/real-embedder` branch,
   renumbering its ADR 01021 → **01025** (main took 01021 while it sat). It
   supersedes ADR 01020's determinism section: the guarantee is decisive
   ordering within a bounded noise floor, not bit-identity.
2. **The format consumers.** `metadata.rdf` is never parsed by any RDF/XML
   parser; the `.iirds` ZIP is read back only by hand-rolled readers inside the
   tests; `graph.jsonld` is never expanded by a JSON-LD processor; and the
   plusmeta validator that ADR 01017 names as the de-facto iiRDS gate is not in
   the repo. Turtle is the one emitter with a real consumer check.
3. **Documented command output.** doc-detective returns, with the guard that
   makes a silently-skipped step fail rather than pass. Eight documented outputs
   have already drifted, and one was wrong the day it was written.
4. **The installed package.** `npm pack` → install → run, so a `files` omission
   or a broken `exports` map fails here rather than for a user.
5. **The platform matrix.** ubuntu × macos × windows, with a cross-OS byte
   comparison rather than three independent golden checks — three per-OS passes
   prove three platforms each match one golden; the join is what proves they
   match each other.
6. **LLM providers.** Lowest priority. Exercised through Ollama and the local
   provider rather than paid keys; no Claude Code auth in the test path.

Decided ([ADR 01026](adrs/01026-exercise-every-third-party.md), the rule and its
exception list; [ADR 01031](adrs/01031-exercising-the-llm-providers.md), the
providers):

- **A golden is not a consumer**, and the difference is demonstrable: drop a
  namespace declaration from the RDF/XML emitter and the golden comparison
  fails, as designed — but regenerate the golden the way any deliberate emitter
  change would, and all 13 export tests pass while the file is no longer
  parseable RDF.
- **Ollama covers the `openai` provider for real** and cannot cover `anthropic`.
  It compiles `response_format: json_schema` to a GBNF grammar, so the mechanism
  under test is genuinely applied; its Anthropic-compatible endpoint accepts
  `tool_choice` and never reads it, which is the entire forcing mechanism that
  provider depends on. A test there would be green, hollow, and intermittently
  red — importing the failure this phase exists to remove, not removing it.
- **`claude-cli` keeps its provider and stays uncovered**, named as an exception.
  No Claude Code auth in the test path was the constraint; the exec seam is worth
  adding when someone needs it.
- **`--max-cost` was inert** for every model outside the six in the price table —
  which is every `claude-cli` model, every local model, and any model newer than
  the table, while the cap is on by default. Now reported as
  `budget: "unpriceable"` rather than as a cost of zero
  ([ADR 01027](adrs/01027-unenforceable-cost-caps.md)).

Delivered: the embedder repair rebased and renumbered
([ADR 01025](adrs/01025-embedder-cross-platform-reality.md)); RDF/XML, ZIP and
JSON-LD read by independent consumers, each verified against a deliberate
mutation of the emitter it guards; doc-detective back with `--exit-on-fail` and a
guard that fails on both a skipped step and a failing one; the packed tarball run
as a consumer receives it; the three-platform matrix with a cross-OS digest join;
the local `llama-cpp` provider and a live `openai` run against Ollama.

Two of the gates found defects the moment they were pointed at something real,
which is the whole argument for building them:

- **Documented output is now executed, not trusted**
  ([ADR 01035](adrs/01035-executing-documented-command-output.md)). The
  interesting part is not the runner but its failure modes: it exits 0 on a
  failing step unless told otherwise, and silently *skips* a step with a schema
  error — which is how an earlier attempt ran 11 of 33 steps and reported green.
  The declared-vs-executed guard is what makes that visible.
- **The live `fill` run failed on its first real call**, and the bug was dockg's:
  a malformed self-reported confidence score discarded an otherwise good
  proposal, and an out-of-range one (a percentage where a fraction was asked for)
  was trusted as certainty. GBNF cannot express `minimum`/`maximum`, so no
  grammar stops the second on any provider
  ([ADR 01034](adrs/01034-advisory-scores-do-not-fail-a-proposal.md)).

## Phase 8d — Vocabulary integrity — **done**

**Goal:** every fact dockg claims to read is validated, every fact it lifts is
measured, and every term it mints is defined.

The vocabulary grew through Phases 2–5 and again in ADRs 01023–01024; the
machinery around it did not follow.

Decided:

- **Validating the harvest rule's inputs.** ADR 01024 made five page-level keys
  load-bearing, and `validate` checks only the `kg` block. A page carrying
  `type: how to`, `applies_to:`, `concept:` and `supersede:` passes clean and
  derives nothing — four facts the author believed they declared, silently
  absent, while the same typos *inside* `kg` are hard errors. The constraint: the
  harvested keys belong to vocabularies dockg deliberately does not implement, so
  validating them must not become adopting them.
- **Coverage catching up.** The seven measured fields are all pre-Phase-2. The
  evaporation countermeasure measures none of the iiRDS typing, variants,
  lifecycle phases or negative scope added since, and no section-level coverage
  at all — though the graph has had section nodes since Phase 3.
- **`fill` reaching sections.** Deferred in Phase 5; now the binding constraint
  on the brownfield lens, which is the audience `fill` exists for.
- **A vocabulary document for `dockg:`.** Two classes, twelve properties and three
  role individuals are minted and defined nowhere: the shapes constrain them, no
  file says what they mean, and the namespace IRI resolves to nothing. It moves
  to the docs origin in the same change — breaking, and therefore free now and
  expensive later.

The vocabulary document is **RDFS, not OWL**: dockg emits nothing that depends on
reasoning, and OWL axioms would duplicate the shapes while inviting exactly the
inference [ADR 01014](adrs/01014-negative-scope.md) refuses. The split to hold is
*RDFS defines what a term means; SHACL says what a valid graph looks like.*
Domain and range are stated with `schema:domainIncludes`/`schema:rangeIncludes`
rather than `rdfs:domain`, which is an entailment rule rather than documentation.
It is versioned and immutable like schemas and shapes (`ns/dockg-1.1.0.ttl`),
ships in the package, is dereferenceable as a hash namespace, and is pinned by a
drift guard in both directions — every emitted term defined, and no term defined
that the emitter cannot produce.

Delivered: near-miss warnings for the harvest rule's page-level keys
([ADR 01028](adrs/01028-near-miss-warnings-for-harvested-keys.md)) — a schema
cannot catch these, because rejecting unknown page keys would reject every page;
coverage over the iiRDS typing plus a second, ungated table over sections
([ADR 01029](adrs/01029-coverage-catches-up-with-the-vocabulary.md)); the
vocabulary document and the namespace move
([ADR 01030](adrs/01030-the-dockg-vocabulary-document.md)); and section-level
fill, riding in the document's own call and dropping any slug that matches no
heading rather than manufacturing a brokenSectionRef
([ADR 01032](adrs/01032-fill-reaches-sections.md)).

The namespace move then produced a finding of its own: dockg's docs gate started
failing on `/dockg/ns.ttl`, a link that works. A link whose explicit extension is
not one a route's documents use is a static asset, not a document dockg failed to
find, and reporting it was a finding no author could act on — there is no
Markdown file they could add
([ADR 01033](adrs/01033-links-to-non-document-files.md)).

## Landed outside the phase structure, again — **done**

- **[ADR 01036](adrs/01036-document-content-hash.md)** — breaking. Every document node carries a
  sha256 of its content, so a consumer pairing the graph with a store it holds separately can
  answer "has this changed since I indexed it?" without re-reading every file. Proposed in #7 on
  2026-07-22 and re-taken against the current tree after eleven other changes landed on top of it.

  The predicate is unconditional — intrinsic like `dockg:path`, not gated behind a derive source —
  because a hash present only sometimes cannot tell "unchanged" from "not stamped". `shapes/
  dockg-0.7.ttl` therefore requires it, and a graph built by an older dockg fails `check` until
  rebuilt.

  The runtime does not consume it yet: `ContentResolver` still fetches whatever the host points it
  at and never compares. Closing that is the natural companion to the staleness refusal
  `vectors.bin` already has, and it is unscheduled.

## Phase 8e — Localization

**Goal:** a translated corpus is a first-class corpus — every page labelled with its language,
every translation linked to its source, and retrieval that honors the boundary.

Language was the one axis where dockg had a fact and did nothing with it. `dcterms:language`
came from a page-level `lang` key, reached the iiRDS package, and was read by nothing else: no
corpus fixture set it, no golden contained it, and `grep language src/runtime/` returned nothing.
Meanwhile product variant — structurally the same kind of boundary — had positive edges,
negative edges, `sh:disjoint` conflicts, and a scope filter that records its firing rule in the
trace. A German question could be answered out of the English page with a confident citation,
which is the edge contamination this project exists to prevent, on the axis where a wrong answer
is most obvious to the reader.

Decided ([ADR 01037](adrs/01037-language-as-a-scope-dimension.md)):

- **Language is declared per tree, not per file.** `routes[]` already maps directories, so it
  gains an optional `language`; the nearest enclosing route that declares one applies, and a
  page's own `lang` outranks it. One line per locale is what makes this adoptable on a corpus
  that is already translated.
- **The relation is schema.org's**, `schema:translationOfWork` / `schema:workTranslation`, from a
  page-level `translation-of` key — page-level because docmeta's `kg` block is closed to dockg
  and cannot gain one. **Both directions are materialized** from the one authored fact: dockg's
  runtime has an inbound index, and no other consumer does.
- **A language tag is a partition key.** `dcterms:language` gains a BCP-47 `sh:pattern` in
  `shapes/dockg-1.0.0.ttl` — the first three-segment version file, MAJOR because `lang: English`
  validated before and does not now.
- **No negative-language predicate**, deliberately: a document has one language, `sh:maxCount 1`
  already says so, and "not in German" is not a claim an author makes. The asymmetry with
  ADR 01014 is the point.
- **`language` re-enters coverage**, reversing ADR 01011's drop of it — correct on monolingual
  evidence, wrong the moment language means something.

Slices: **(1) the graph** — route language, translation edges, shapes 1.0.0, near-miss warnings
for the three localization keys, corpus permutations, all goldens regenerated; **(2) measurement**
— per-language coverage tables and the untranslated backlog, so one blended number stops
describing an audience that does not exist; **(3) per-locale artifacts** — `search.<lang>.json`,
`vectors.<lang>.bin`, per-language embedding models, and a `localizations.json` manifest a browser
fetches before it downloads anything large; **(4) runtime + CLI** — `dcterms:language` joins the
`scopeExclusion` table and `--lang` joins `search` and `traverse`.

Placed before Phase 9 deliberately: `retrieve` should orchestrate over a language-aware runtime
rather than have one retrofitted underneath it.

## Phase 9 — `retrieve` + MCP serving

**Goal:** one call from a question to a citation-bearing context bundle, and the
same thing exposed to agents.

Decisions to make (ADRs):
- `retrieve()` orchestration: entry → traversal (scope honored) → resolution →
  assembly, with mandatory citations and structured refusal. **No generation.**
- `dockg retrieve <question>` printing the bundle as JSON.
- `dockg mcp`: which tools (`retrieve`, `traverse`, `impact`), transport, auth —
  each returning `{context, citations, trace}` for the *agent* to reason over.
- A browser integration example wiring the runtime to a docs site.

## Phase 10 — Evaluation harness

**Goal:** retrieval behavior becomes a regression-gated contract, like the
golden Turtle.

Decisions to make (ADRs):
- Fixtures over the corpus: question → expected citation IRIs; *unanswerable*
  question → expected structured refusal.
- Metrics: citation precision/recall, refusal correctness, scope-honoring.
- **Fully hermetic** — with generation out of scope, eval needs no LLM at all,
  not even mocks.

## Stretch (post-10) — client-side retrieval widget

A web component: search box → sources + a rendered trace view, retrieval-only.
No commercial docs widget (kapa, Algolia Ask AI, Mintlify) does client-side
retrieval today; all are SaaS-retrieval script embeds.

---

## Cross-phase research backlog

Items referenced above, gathered for scheduling (research lands at the start
of the phase that needs it, not before):

| Item | Needed by |
|---|---|
| iiRDS Core term-by-term mapping survey | Phase 2 |
| Software-specific iiRDS extensions/profiles (existing or emerging); machinery extension as reference | Phase 2 |
| iiRDS/H and DIN SPEC 91526 relationship to Core; what to track vs. adopt | Phase 2 |
| Official iiRDS SHACL/validation assets | Phase 2 |
| Negative-scope precedent in iiRDS/schema.org (verify none before minting `dockg:` term) | Phase 4 |
| iiRDS 1.3 package conformance rules; CDP intake validation practices | Phase 6b |
| QUDT adoption for quantitative properties (sizes, torques) lifted by fill | Phase 5/6 |
| Browser vector-search options if the sidecar outgrows brute-force cosine | Phase 8b |
| RDF/XML, JSON-LD and ZIP readers suitable for a hermetic consumer check | Phase 8c — **done**: rdfxml-streaming-parser, jsonld, yauzl |
| The plusmeta iiRDS minimum-requirements graph: vendor it, or drive the hosted validator out-of-band | Phase 8c — **done**: out-of-band; the mandatory set is asserted against the parsed graph |
| Ollama's OpenAI- and Anthropic-compatibility endpoints | Phase 8c — **done**: `json_schema` compiles to a GBNF grammar; `tool_choice` is accepted and never read |
| npm versions shipped by each GitHub runner image; Playwright install cost on macOS/Windows | Phase 8c — npm pinned explicitly rather than surveyed; Playwright stays Linux-only |
| Vocabulary-publishing conventions: VANN, `owl:versionIRI`, serving a hash namespace from GitHub Pages | Phase 8d — **done** |
| MCP server conventions for doc/knowledge tools | Phase 9 |

## Process per phase

1. Do the phase's research items; capture findings in the phase ADR(s).
2. Write the ADR(s); get maintainer sign-off on contested decisions.
3. Red→green TDD; corpus permutations for every user-visible behavior.
4. Schema/shapes version bumps as needed (immutable published files).
5. Docs (README, init template, `--help`) in the same change; golden diffs
   inspected line by line.
6. Full verification loop green; PR per phase (or per coherent slice).
