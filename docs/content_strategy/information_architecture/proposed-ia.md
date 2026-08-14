---
type: information-architecture
status: proposal
scope: docs/src/content/docs/
generator: Astro + Starlight
base_path: /moose-kg
groups: 9
pages_total: 36
pages_phase_1: 15
pages_written: 36
---

The proposed structure of moose-kg's published documentation set. **A proposal only** — it
describes what should exist; it does not build it.

## Scope

This IA covers exactly one subtree: **`docs/src/content/docs/`**, the Starlight content
collection published to `https://hawkeyexl.github.io/moose-kg`. It does not cover `adrs/`,
`DESIGN.md`, `CLAUDE.md`, or `README.md`, except to say what moves out of the README and where
it lands.

## Design principle

**Organized by what the reader is trying to accomplish, not by document type.**

Sidebar groups are journey-voiced and map one-to-one onto the journeys in
[`journeys/_overview.md`](../journeys/_overview.md). Do not impose a Diátaxis
tutorial/how-to/explanation/reference split as the organizing principle — the Reference shelf
supports navigation, it does not drive it, and the landing page is a router rather than an
introduction.

**Frontmatter requirement:** every page carries `title` and `description`. No exceptions — it is
a machine-enforced deploy gate.

## Navigation tree

```
Home — "What are you trying to do?" router + a 30-second proof
├─ Get started            (universal on-ramp)          → cuj-first-graph
├─ Understand the model   (cross-cutting; see note)    → supports every journey
├─ Build your graph       (Priya)                      → cuj-first-graph, cuj-map-site-routes,
│                                                        cuj-backfill-metadata, cuj-query-the-graph
├─ Model your metadata    (Ines)                       → cuj-model-concepts, cuj-scope-by-variant,
│                                                        cuj-section-granularity
├─ Govern it in CI        (Priya + Renata)             → cuj-gate-metadata-in-ci,
│                                                        cuj-audit-provenance, cuj-prove-coverage
├─ Retrieve & export      (Kwame)                      → cuj-serve-retrieval,
│                                                        cuj-export-to-consumer
├─ Fix a failing check    (Sam)                        → cuj-fix-failing-check  [highest traffic]
└─ Reference              (lookup shelf)               → nine pages, journey-agnostic
```

### Directory mapping

Group labels are journey-voiced; directories stay short and URL-friendly. Every group
autogenerates from its directory, with an `index.mdx` doubling as the group's landing page and
journey hub — no hand-maintained page lists in `astro.config.mjs`.

| Nav group | Directory |
|---|---|
| *(landing)* | `index.mdx` |
| Get started | `get-started/` |
| Understand the model | `concepts/` |
| Build your graph | `build/` |
| Model your metadata | `model/` |
| Govern it in CI | `govern/` |
| Retrieve & export | `retrieve/` |
| Fix a failing check | `fix/` |
| Reference | `reference/` |

### The one group not owned by a persona

**"Understand the model" (`concepts/`) is cross-cutting**, and that is a deliberate exception to
CUJ-first structure rather than an oversight.

It exists because moose-kg's single most load-bearing idea — *the graph is an index and governance
layer, not a retrieval corpus; prose never enters it* — is also its most counter-intuitive, and
every persona's first journey stalls without it. The question "why aren't my sentences in here?"
arrives within about thirty seconds of opening the Turtle output, and an unanswered version of it
makes the tool look broken rather than designed.

The mitigation for it becoming a dumping ground: **every concepts page must be named by at least
one CUJ step.** A concepts page nothing links to is a page that should not exist. All five
currently qualify.

## Content set

`★` marks Phase 1 launch. Every page's `CUJ` column names the journey it serves; a page serving
none is flagged in [`ia-gap-analysis.md`](ia-gap-analysis.md).

### Landing

| Page | CUJ | ★ | Notes |
|---|---|:--:|---|
| `index.mdx` | `cuj-first-graph` | ★ | Splash. Hero, a 30-second proof (one command, its real output), a "what are you trying to do?" router card grid, and a checks/doesn't-check pair. |

### Get started (`get-started/`)

| Page | CUJ | ★ | Notes |
|---|---|:--:|---|
| `index.mdx` | `cuj-first-graph` | ★ | Install, `build` with no config file, read the docs-and-triples line, run it twice and diff. **No RDF vocabulary required to complete.** |

### Understand the model (`concepts/`)

| Page | CUJ | ★ | Notes |
|---|---|:--:|---|
| `index.mdx` | — *(hub)* | ★ | Four-card router. Deliberately short; nobody should linger here. |
| `index-not-corpus.mdx` | `cuj-first-graph` | ★ | ADR 01008. Prose never enters the graph; route with the graph, then read the text. Answers the first question every reader asks. |
| `determinism.mdx` | `cuj-audit-provenance` | ★ | Byte-identical rebuilds, stable IRIs, no blank nodes, no wall clock. Why this is what makes graph output *evidence*. |
| `open-world.mdx` | `cuj-scope-by-variant` | ★ | Absence means unknown, not excluded. Query the negative edge. The most consequential page for Ines. |
| `granularity.mdx` | `cuj-section-granularity` | | Node granularity must match content granularity; the information-evaporation cost of getting it wrong. |

### Build your graph (`build/`)

| Page | CUJ | ★ | Notes |
|---|---|:--:|---|
| `index.mdx` | `cuj-first-graph` | ★ | The seven derive sources and what each reads; `inputs`/`exclude`; reading the corpus back with `stats`. |
| `query.mdx` | `cuj-query-the-graph` | | Match triple patterns and walk edges; the impact check to run before moving a page. |
| `routes.mdx` | `cuj-map-site-routes` | ★ | Route mappings per generator. Ends by reframing the remaining broken links as the valuable output. |
| `backfill.mdx` | `cuj-backfill-metadata` | | `fill` as a review workflow, never as auto-annotation. Dry run, subset, cost cap, then the `kg.provenance` review queue. |

### Model your metadata (`model/`)

| Page | CUJ | ★ | Notes |
|---|---|:--:|---|
| `index.mdx` | — *(hub)* | | What moose-kg models and what it does not. A mapping, not a SKOS tutorial. |
| `concepts-skos.mdx` | `cuj-model-concepts` | | `prefLabel` and its four dependents; how concept IRIs converge; why two spellings is a warning, not a violation. |
| `variants.mdx` | `cuj-scope-by-variant` | | The four iiRDS typing keys with their published IRIs shown; negative scope; the disjointness check. |
| `sections.mdx` | `cuj-section-granularity` | | The slug-keyed map; **nothing is inherited**; `brokenSectionRef` as the reason it is safe to rely on. |

### Govern it in CI (`govern/`)

| Page | CUJ | ★ | Notes |
|---|---|:--:|---|
| `index.mdx` | `cuj-gate-metadata-in-ci` | ★ | Which gate catches what: `validate` per file, `check` whole graph, `stats --check` thresholds. Obligation-to-mechanism table for Renata. |
| `ci.mdx` | `cuj-gate-metadata-in-ci` | ★ | A complete workflow and a step for an existing one. Must link its failure output at `fix/`. |
| `coverage.mdx` | `cuj-prove-coverage` | | Per-field coverage, thresholds as ratchet not target, the `--check` requirement, the empty-graph caution. |
| `provenance.mdx` | `cuj-audit-provenance` | | Tri-state `provenance.git`; qualified attribution and roles; `kg.provenance` as review queue; **what the evidence does not prove**. |

### Retrieve & export (`retrieve/`)

| Page | CUJ | ★ | Notes |
|---|---|:--:|---|
| `index.mdx` | `cuj-serve-retrieval` | | What the runtime does and where it stops. **States the metadata dependency up front**, not at integration time. |
| `search.mdx` | `cuj-serve-retrieval` | | The artifact chain: graph → search index → vector sidecar. Staleness is refused, not degraded. |
| `runtime.mdx` | `cuj-serve-retrieval` | | Browser-side query; the `{context, citations, trace}` shape; a filter demonstrated by what it excluded. |
| `export.mdx` | `cuj-export-to-consumer` | | Three formats by destination; the `-f` flag trap; lossy projection warnings on stderr; the iiRDS CC BY-ND note. |

### Fix a failing check (`fix/`)

| Page | CUJ | ★ | Notes |
|---|---|:--:|---|
| `index.mdx` | `cuj-fix-failing-check` | ★ | **Must work cold** — the landing page for a link in CI output. Error anatomy, whose-fault-is-it, failure catalog with frontmatter diffs. |
| `faq.mdx` | `cuj-fix-failing-check` | | Question-shaped H2s for the cases that are not schema failures. |

### Reference (`reference/`)

| Page | CUJ | ★ | Notes |
|---|---|:--:|---|
| `index.mdx` | — *(shelf index)* | | A card grid and nothing else. |
| `cli.mdx` | all | ★ | Every command, argument, option, default. **Mechanically drift-checked** against commander. |
| `configuration.mdx` | all | ★ | Every config key with type and default. Note the `inputs` default differs from the `init` template. |
| `frontmatter.mdx` | `cuj-model-concepts` | ★ | The `kg:` block, plus the page-level aliases that are accepted but unvalidated. |
| `output-and-exit-codes.mdx` | `cuj-gate-metadata-in-ci` | ★ | The 0/1/2 contract and its counter-intuitive cases. Two different `-f` flags. |
| `vocabulary.mdx` | `cuj-scope-by-variant` | | Namespace table, the minimal `moose-kg:` namespace, every standard term emitted, package-only terms. |
| `shapes.mdx` | `cuj-model-concepts` | | Every rule `check` enforces, its severity, and what error it protects against. |
| `runtime-api.mdx` | `cuj-serve-retrieval` | | Exact exports and signatures for `moose-kg/runtime`. |
| `library-api.mdx` | `cuj-export-to-consumer` | | The Node package entry: every command as a function, plus IRI minting, derivation, and the emitters. |
| `embed-models.mdx` | `cuj-serve-retrieval` | | Tested models, sizes, context limits, the short-context truncation trap. |
| `glossary.mdx` | — *(support)* | | Term definitions as H2s. Supports navigation; drives none. |

## Source-of-truth mapping

Each reference page is bound to the code it may not contradict. When that code changes, the page
is part of the change's definition of done.

| Reference page | Source of truth |
|---|---|
| `reference/cli.mdx` | `src/cli.ts` — enforced by `scripts/check-cli-reference.mjs` |
| `reference/configuration.mdx` | `src/core/config-schema.json`, `src/core/config.ts` |
| `reference/frontmatter.mdx` | `schemas/frontmatter-0.8.json`, `src/core/derive.ts` |
| `reference/vocabulary.mdx` | `src/core/vocab.ts`, `src/core/iirds.ts` |
| `reference/shapes.mdx` | `shapes/moose-kg-0.5.ttl` |
| `reference/output-and-exit-codes.mdx` | `src/cli.ts` `fail()`, each `src/commands/*.ts` core |
| `reference/runtime-api.mdx` | `src/runtime.ts` exports, `package.json` `exports` |
| `reference/library-api.mdx` | `src/index.ts` exports |
| `reference/embed-models.mdx` | `src/embed.ts` `MODEL_PROFILES` |
| `concepts/*.mdx` | The ADRs each cites — 01008, 01010, 01014, and the DESIGN.md thesis |

Behavior claims come from source and the test suite, never from memory. Sample output is captured
by running the built binary against a committed fixture — determinism means the output captured
is the output every reader will see.

## Phased rollout

**All three phases are written.** The ordering is kept as the record of why the set was built in
this sequence, and as the template for the next tranche of pages.

**Phase 1 — Launch (15 ★ pages).** Both anchors complete end to end, plus the reference pages
that the anchors link into. Landing · get-started · four concepts pages · `build/index` ·
`build/routes` · `govern/index` · `govern/ci` · `fix/index` · four reference pages. This is a
coherent set: Priya can adopt and gate, and Sam can self-serve.

**Phase 2 — Depth.** The `model/` track in full, `govern/coverage` and `govern/provenance`,
`build/backfill`, `concepts/granularity`. Completes Ines and Renata.

**Phase 3 — Breadth.** The `retrieve/` track, remaining reference pages, `fix/faq`. Completes
Kwame.

Phase order follows audience dependency, not page count: nothing else is reachable until Priya
can build, and every gate Priya installs generates traffic to Sam's track.

## Journey walk-through test

Run before declaring any ★ journey complete:

1. **The persona reaches the outcome without leaving the track.** Following only the links a page
   offers, in order, arrives at the journey's `success_criteria`.
2. **Every code example uses a committed fixture that CI actually runs.** No invented paths, no
   hand-written output.
3. **Every page has `title` and `description`.**
4. **The journey's `steps[]` all read `exists: true`,** and each named route resolves to a real
   file.
