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

## The GraphRAG runtime (Phases 7–10)

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

## Phase 8b — Vector entry (embeddings sidecar)

**Goal:** semantic entry alongside the lexical leg, behind the network/spend
boundary.

Decisions to make (ADRs):
- `dockg embed` (Node, explicit spend per the defaults mandate) precomputes
  embeddings into a gitignored sidecar; the runtime does brute-force cosine and
  fuses through the existing `rrfMerge`.
- Sidecar format and location, staleness/invalidation keying (graph hash + model
  + dimensions), and what happens when the graph moves on.
- Embedding provider seam: Anthropic has no embeddings API, so this is not
  `fill`'s provider set — openai-compatible plus a deterministic mock at
  minimum. `Pricing` is input/output-token shaped; embeddings are input-only and
  need a variant.
- Query-time embedding requires a host-supplied `embedQuery`; absent, lexical
  entry must keep working unchanged.

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
| MCP server conventions for doc/knowledge tools | Phase 9 |

## Process per phase

1. Do the phase's research items; capture findings in the phase ADR(s).
2. Write the ADR(s); get maintainer sign-off on contested decisions.
3. Red→green TDD; corpus permutations for every user-visible behavior.
4. Schema/shapes version bumps as needed (immutable published files).
5. Docs (README, init template, `--help`) in the same change; golden diffs
   inspected line by line.
6. Full verification loop green; PR per phase (or per coherent slice).
