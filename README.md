# dockg

Deterministic knowledge graphs derived from documentation frontmatter and formatting, saved as Turtle.

`dockg` reads your docs — Markdown first — and derives an RDF knowledge graph from what is already there: frontmatter fields, heading structure, links between pages, tags, images, and code blocks. The build is **deterministic**: stable IRIs, sorted serialization, byte-identical rebuilds. The emitted `.ttl` diffs cleanly in git, so the graph can live next to the docs it describes.

It pairs with [docmeta](https://github.com/hawkeyexl/docmeta) (which powers `dockg validate`) and follows the same CLI conventions as [docevals](https://github.com/hawkeyexl/docevals). dockg's frontmatter schema is published in this repo at [`schemas/frontmatter-0.8.json`](schemas/frontmatter-0.8.json) — point any JSON Schema tool at it, e.g. `docmeta validate --schema node_modules/dockg/schemas/frontmatter-0.8.json docs/`.

## What the graph is (and isn't)

The graph is an **index and governance layer** over your docs — not a replacement
for them, and not a retrieval corpus ([ADR 01008](adrs/01008-graph-as-index-not-corpus.md)).
Prose never enters the graph; only metadata does. Consume it in two halves:

- **The graph routes, filters, audits, and attributes.** Scope questions ("what
  applies to this variant?"), impact analysis ("what references this doc?"),
  compliance audit (`dockg check`), and provenance are graph jobs — the work a
  typed graph does better than similarity search over text.
- **The files carry the content.** Every Document and Section IRI resolves to an
  exact span on disk: `dockg:path` gives the file, and a Section IRI's fragment
  is the GitHub-style heading slug. Route with the graph, then read the text.

**What isn't in the graph is invisible to anything querying the graph alone.** A
fact that lives only in prose does not exist for a graph-only consumer — so a
retrieval system built on dockg must read the files the graph points at rather
than answering from triples. The more you lift into frontmatter, the more the
graph can route and govern; [`dockg stats`](#metadata-coverage) reports how much
you have lifted so the gaps are a number you can see.

## Install

```bash
npm install -g dockg
```

Requires Node.js 24+. (`dockg` depends on `docmeta` for frontmatter extraction and validation.)

## Quick start

```bash
dockg init            # scaffold dockg.config.yaml
dockg build           # derive the graph -> kg/graph.ttl
dockg stats           # counts, orphan docs, broken links, hubs
dockg query -p dcterms:references   # who links to what
dockg validate        # KG-readiness via docmeta
dockg check           # graph-level SHACL validation
dockg export -f jsonld  # reserialize the graph as JSON-LD
```

Exit codes: `0` ok · `1` findings (validation failures, `check` violations, `stats --check` broken links, `fill` errors) · `2` operational error.

## What gets derived

Standard vocabularies wherever a term exists — Dublin Core (`dcterms:`), SKOS (`skos:`), schema.org (`schema:`), FOAF (`foaf:`), and iiRDS (`iirds:`, `iirdsSft:`) for technical-documentation semantics — plus a minimal custom namespace `dockg: <https://dockg.dev/ns#>` (2 classes, 10 properties).

| Source | Triples |
|---|---|
| every doc | `<doc> a dockg:Document ; dockg:path "docs/x.md"` |
| `title` (fallback: first H1) | `dcterms:title` |
| `description` / `author(s)` / `date` / `updated` / `lang` | `dcterms:description` / `dcterms:creator` / `dcterms:created`^^xsd:date / `dcterms:modified` / `dcterms:language` |
| `tags` / `keywords` | `<doc> dcterms:subject <concept>` ; concept nodes are `skos:Concept` with `skos:prefLabel` and `skos:inScheme` |
| headings | `dockg:Section` nodes with `dcterms:title`, `dockg:level`, `dockg:order`, nested via `dcterms:hasPart` |
| internal links | `dcterms:references` to the target doc (or its section when the anchor resolves). Extensionless relative links try `.md`/`.mdx` and index files. Site-root-absolute routes (`/docs/x/`) resolve via [route mappings](#route-mappings); without a mapping they are skipped |
| broken internal links | `dockg:brokenLink "target.md"` (surfaced by `stats`) |
| broken `kg.sections` refs | `dockg:brokenSectionRef "slug"` — a section key naming no heading (surfaced by `stats`) |
| external links | `dcterms:references <url>` |
| images | `schema:image` |
| code fence languages | `dockg:codeLanguage "python"` |
| `kg.topicType` | `iirds:has-topic-type` → the matching iiRDS Core instance (`iirds:GenericTask`, …) |
| `kg.appliesTo` | `iirds:relates-to-product-variant` → minted `iirds:ProductVariant` nodes (`dcterms:title` label) |
| `kg.softwareLifecyclePhase` / `kg.softwareSubject` | iiRDS Software domain — `iirds:relates-to-product-lifecycle-phase` / `iirds:has-subject` → published `iirdsSft:` instances |
| `kg.notApplicableTo` / `kg.notSoftwareSubject` | explicit negative scope — `dockg:notApplicableToVariant` / `dockg:notSoftwareSubject`, `sh:disjoint` from the positive edge |
| `kg:` frontmatter | see below |

Note: the emitted `schema:` prefix is `https://schema.org/` (the current recommendation); merge legacy `http://schema.org/` data with `owl:sameAs` handling if you need to.

## The `kg:` frontmatter key

**Naming:** the *frontmatter key* is `kg:`; the *RDF namespace prefix* is `dockg:`. The `kg` key holds the SKOS fields dockg owns plus iiRDS typing, validated by the JSON Schema published in this repo (`schemas/frontmatter-0.8.json`). Docs without a `kg` key are fine — everything above still derives.

```yaml
---
title: Configuration Reference
tags: [configuration]
kg:
  prefLabel: Configuration        # -> foaf:primaryTopic concept, skos:prefLabel
  altLabels: [config, settings]   # -> skos:altLabel
  broader: [Administration]       # -> skos:broader
  narrower: [Environment Variables]
  related: [Installation]         # -> skos:related
  subjects: [reference]           # -> dcterms:subject (like tags)
  # iiRDS typing (all optional; values are closed controlled vocabularies):
  topicType: reference            # task|concept|reference|learning|troubleshooting|form
  appliesTo: [SP-X100, SP-X200]   # -> iirds:ProductVariant nodes this doc applies to
  softwareLifecyclePhase: [deployment]  # administration|customization|update|deployment|integration|deinstallation
  softwareSubject: [interface]    # architecture|interface|system-requirement
---
```

The iiRDS values reference published iiRDS instance IRIs directly — dockg never
bundles or alters the iiRDS vocabulary (it is CC BY-ND). `topicType` is a single
value; the other three are lists. See [ADR 01012](adrs/01012-iirds-core-vocabulary.md).

### Per-section metadata (`kg.sections`)

The same iiRDS typing (plus `subjects`) can attach to an individual heading
section, keyed by its GitHub-style slug — the same slug used in section IRIs and
link anchors ([ADR 01013](adrs/01013-section-level-metadata.md)):

```yaml
kg:
  topicType: concept          # the document as a whole
  sections:
    installation:             # matches `## Installation`
      topicType: task
      appliesTo: [SP-X200]
    rest-api:                 # matches `## REST API`
      softwareSubject: [interface]
      subjects: [http]
```

Section metadata is **explicit-only** — a section gets exactly what its block
declares, nothing inherited from the document. A key that matches no heading
(e.g. after a heading is renamed) derives `<doc> dockg:brokenSectionRef "slug"`,
surfaced by [`dockg stats`](#metadata-coverage) and gated by `stats --check`,
just like a broken link — so the metadata is never silently lost.

### Negative scope (`kg.notApplicableTo`, `kg.notSoftwareSubject`)

Content can also assert what it explicitly does **not** apply to — the RDF-safe
form of an interlock ([ADR 01014](adrs/01014-negative-scope.md)). Both fields
work at document and section level and mirror their positive counterparts:

```yaml
kg:
  appliesTo: [SP-X100, SP-X200]
  notApplicableTo: [SP-X300]      # -> dockg:notApplicableToVariant
  softwareSubject: [interface]
  notSoftwareSubject: [architecture]  # -> dockg:notSoftwareSubject
```

A variant or subject listed as both applicable and not-applicable on the **same**
node is a contradiction — `dockg check` fails it via `sh:disjoint`.

**Consumer contract (this matters for retrieval).** RDF is open-world: the
*absence* of an `appliesTo` edge means **unknown**, not "does not apply." A
retrieval interlock that wants to exclude content must query the **negative**
edge (`dockg:notApplicableToVariant`) — it must never infer exclusion from a
missing positive edge. That distinction is what lets a graph-driven assistant
stay correctly silent instead of guessing across a variant boundary. dockg mints
these two `dockg:` predicates because no standard term exists and the OWL
negative-assertion idiom requires blank nodes (which dockg never emits).

## Example output

```turtle
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dockg: <https://dockg.dev/ns#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .

<https://example.com/kg/doc/docs/getting-started.md> a dockg:Document ;
  dcterms:hasPart <https://example.com/kg/doc/docs/getting-started.md#install> ;
  dcterms:references <https://example.com/kg/doc/docs/configuration.md> ;
  dcterms:subject <https://example.com/kg/concept/setup> ;
  dcterms:title "Getting Started" ;
  dockg:path "docs/getting-started.md" .

<https://example.com/kg/concept/setup> a skos:Concept ;
  skos:inScheme <https://example.com/kg/scheme> ;
  skos:prefLabel "setup" .
```

Determinism contract: doc IRIs are `{baseIri}doc/{repo-relative-path}` (OS-independent, percent-encoded), section IRIs use GitHub-style heading slugs, concept IRIs converge on slugified labels, no blank nodes ever, and the Turtle is canonically sorted. `dockg build` twice → identical bytes.

## Provenance (PROV-O)

The `provenance` derive source (on by default) folds W3C PROV-O into the graph:

| Source | Triples |
|---|---|
| every doc | `<doc> a prov:Entity` |
| `author`/`authors` | `dcterms:creator` and `prov:wasAttributedTo` point at `{base}agent/person/{slug}` nodes (`prov:Person` + `foaf:name`) — docs connect by shared authors. Toggle `provenance` off to restore plain creator literals |
| `date` | `prov:generatedAtTime` alongside `dcterms:created` |
| `kg.derivedFrom: [path-or-url]` | `prov:wasDerivedFrom` (unresolved paths surface as `dockg:brokenLink`) |
| `kg.revisionOf: [path-or-url]` | `prov:wasRevisionOf` — this doc supersedes an earlier one (same resolution rules as `derivedFrom`) |
| `kg.generatedBy` (or page-level `generatedBy`) | `prov:wasGeneratedBy` a generation activity `prov:wasAssociatedWith` the model as a `prov:SoftwareAgent` |
| `kg.provenance` (written by `dockg fill`) | a per-doc `#kg-fill` activity linking (`dockg:filledFieldEntry`) one entry node per machine-filled field, each carrying `dockg:filledField` and an optional `dockg:confidence` decimal; the doc's own topic concept is `prov:generated`. Shared tag concepts are never attributed — one doc's LLM must not taint a shared node |
| the build itself | `{base}graph` as a `prov:Entity`, generated by `{base}activity/build`, associated with dockg as a `prov:SoftwareAgent` (with `dockg:version`), `prov:used` every source doc |

**Git history (`provenance.git`, `auto` by default):** one `git log` pass
per build adds per-file facts — creation/modification committer dates as
fallbacks where frontmatter has none (`dcterms:created`/`modified`,
`prov:generatedAtTime`), git authors as agent nodes (names only; emails are
never emitted), renames as `prov:wasRevisionOf` edges to the historical-path
entities (best-effort, git's `-M` heuristic), and `prov:endedAtTime` on the
build activity from the **HEAD committer date**. Frontmatter always wins over
git. Shallow clones yield partial history silently.

The setting has three states:

| Value | Behavior |
|---|---|
| `auto` (default) | Derive git provenance where git can run; where it can't (no repo, no commits, no `git` on PATH), warn on stderr and build without it |
| `true` | Require it — an unavailable git is an operational error (exit 2) |
| `false` | Skip git entirely; no subprocess runs |

**Qualified provenance (`provenance.qualified`, on by default):** adds
PROV qualification nodes alongside the direct properties, with deterministic
IRIs instead of blank nodes — `{doc}#prov.attribution.{agent}` (`prov:Attribution`,
`prov:hadRole dockg:authorRole`) and `{activity}.assoc.{agent}`
(`prov:Association`, roles `dockg:generatorRole` / `dockg:toolRole`).

**Timestamps and determinism:** wall-clock time never enters the graph — all
dates come from frontmatter or git committer times, so rebuilds at the same
commit stay byte-identical.

Provenance node fragments use `.` separators (`#prov.generation`,
`#prov.kg-fill.{model}`), which heading slugs can never produce — a
`## Generation` section can't collide with the generation activity.

**Agent IRIs are segmented by kind** — `{base}agent/person/{slug}`,
`{base}agent/software/{slug}`, and `{base}agent/org/{slug}`, mirroring PROV-O's
three `prov:Agent` subclasses. Without the segment, a human author named
"GPT 4" and a `generatedBy: gpt-4` model would slug alike and merge into one
node typed both `prov:Person` and `prov:SoftwareAgent`. Two people who share a
name still converge, exactly as two identical concept labels do — dockg has no
other information to tell them apart.

`dockg fill` records `kg.provenance` entries — one `{generatedBy, fields, confidence}`
entry **per model**, so multi-model fills keep truthful attribution — on every doc it
fills (disable with `fill.writeProvenance: false`). Fields accumulate across
runs; delete the entry (or fields from it) once a human has reviewed the
values, and the machine-attribution disappears from the graph. That makes
"which parts of my taxonomy did an LLM propose?" a one-liner:
`dockg query -p dockg:filledField`.

These fields are validated by **`schemas/frontmatter-0.8.json`** (bundled with
the package; the default for `dockg validate`). Earlier versions
(`frontmatter-0.1.json` through `frontmatter-0.7.json`) remain published
alongside it.

## Graph validation (SHACL)

`dockg check` validates the **assembled graph** — the thing `dockg validate` structurally cannot see, because per-file JSON Schema runs before N docs merge into shared nodes:

```bash
dockg build && dockg check
```

The rules live in a published SHACL shapes contract, [`shapes/dockg-0.5.ttl`](shapes/dockg-0.5.ttl), bundled with the package (override with `check.shapes` or `--shapes`). Like the frontmatter schemas, published shapes files are immutable — the contract evolves by adding a new version file. Point any SHACL tool at it to validate your own merged graphs against the same rules.

What it catches:

| Finding | Severity |
|---|---|
| `skos:broader`/`skos:narrower` cycles (a concept as its own ancestor) | violation |
| `skos:related` conflicting with `skos:broaderTransitive` (SKOS S27) | violation |
| concepts missing `skos:prefLabel` or `skos:inScheme`; untyped relation targets | violation |
| unexpected predicates on Document/Section/Concept/agent nodes (`sh:closed` — the graph-side `additionalProperties: false`) | violation |
| broken PROV wiring (activities without types, agents without `foaf:name`) | violation |
| one concept carrying two `prefLabel` spellings (slug convergence, e.g. `Configuration` + `configuration`) | warning |
| `dcterms:subject` pointing at a non-`skos:Concept` node | warning |

Violations exit `1`; warnings are reported but exit `0` (spelling convergence is a designed feature — the warning tells you to settle on one spelling, not that the build is broken). Every finding is mapped back to the doc file(s) responsible:

```
violation: concept/beta skos:broader — skos:broader cycle through concept/alpha, concept/beta — a concept cannot be its own ancestor [docs/alpha.md, docs/beta.md]
warning: concept/shared-term skos:prefLabel — concept carries multiple prefLabels … [docs/alpha.md, docs/gamma.md]

1 violation, 1 warning
```

Cycle detection and the transitive SKOS checks run in dockg itself (core SHACL cannot express them); everything else is the shapes file. The same rules power the `dockg fill` guardrail, so LLM hierarchy proposals are verified on write.

## Route mappings

Doc sites (Fern, Starlight, Hugo, Docusaurus) link by *published route* (`/docs/actions/find`), not by source file. Route mappings teach dockg how routes map back to files so those links become real graph edges — and so routes under a mapped prefix with **no** matching file are reported as broken (they name pages that should exist):

```yaml
routes:
  - basePath: /docs               # site prefix this mapping covers
    root: docs/fern/pages/docs    # repo dir routes resolve into
    extensions: [.mdx, .md]       # tried when the route has no extension
    indexFiles: [index, README]   # tried for directory routes (/docs/actions/)
```

Matching is tiered and deterministic: exact path, then case-insensitive, then slug-normalized (so Fern's `/stop-record` finds `stopRecord.mdx`). Ambiguous fallback matches stay unresolved rather than guessing. Root-absolute links outside every mapped `basePath` are skipped, not broken.

On the doc-detective docs corpus (197 files), adding six route mappings took the reference graph from 165 to 720 edges and cut false orphans from 137 to 13.

## AI fill

`dockg fill` has an LLM propose `kg:` fields from each doc's title, headings, tags, and body, and writes them back — body and existing YAML preserved byte-for-byte.

```bash
dockg fill --dry-run          # see proposals without writing
dockg fill                    # write them
dockg fill --min-confidence 0.9   # only write high-confidence proposals
dockg fill --force            # overwrite human-set kg fields too
```

- Providers: **anthropic** (default, `ANTHROPIC_API_KEY`), **openai** (any OpenAI-compatible endpoint via `fill.baseUrl`), **claude-cli** (local `claude` auth, no key), **mock** (offline).
- **Fill proposes every field, gated by confidence** ([ADR 01015](adrs/01015-fill-confidence.md)). The model reasons about each field, proposes a value only when the text supports it, and returns a per-field confidence (0..1). A field scored below `fill.minConfidence` (**default 0.7**, `--min-confidence`) is **reported but not written** — normal operation, so the exit code stays 0. This is the exception-review model: hallucination-prone fields (product variants, negative scope) earn low confidence and self-filter, so nothing is blocked by a static allowlist. Confidence for written fields is recorded in `kg.provenance` and the emitted graph.
- Proposals are cached by content (`.dockg/cache/`) — unchanged docs never re-ask.
- Cost is tracked and budgeted (`fill.maxCostUsd`, `--max-cost`).
- Every surviving proposal is also simulated against the [SHACL shapes contract](#graph-validation-shacl) before writing (`fill.validateGraph`, on by default; `--no-validate-graph` to skip) — a second, structural gate orthogonal to confidence: fields that would create a `broader` cycle, a `related`/`broader` conflict, a second spelling of an existing concept, or an `appliesTo`/`notApplicableTo` contradiction are dropped and reported as `[graph check rejected: …]`. Accepted proposals accumulate within the run, so two docs can't jointly form a cycle.
- Human-set fields always win unless `--force`.

## Commands

| Command | Purpose |
|---|---|
| `dockg init` | Scaffold a starter `dockg.config.yaml` |
| `dockg build [globs]` | Derive the graph and write deterministic Turtle |
| `dockg validate [globs]` | Check KG frontmatter via docmeta (bundled `schemas/frontmatter-0.8.json`) |
| `dockg check` | Validate the built graph against the SHACL shapes (bundled `shapes/dockg-0.5.ttl`) |
| `dockg fill [globs]` | Propose `kg:` fields with an LLM, gated by confidence, and write them back |
| `dockg query` | Triple-pattern match: `-s`/`-p`/`-o`, omit for wildcard |
| `dockg search <query>` | Rank graph nodes for a text query (needs `export --format search`) |
| `dockg traverse <node>` | Walk from a node honoring scope rules, with the full trace; `--impact` for reverse reach |
| `dockg stats` | Counts, orphan docs, broken links, most-connected docs, metadata coverage; `--check` gates CI |
| `dockg export -f jsonld` | Reserialize the built graph as deterministic JSON-LD |
| `dockg export -f iirds` | Package the graph as a conformant, deterministic iiRDS package (`.iirds`) |
| `dockg export -f search` | Emit the lexical search index (`kg/search.json`) the runtime needs for text queries |
| `dockg embed` | Compute local embeddings for the search index → `kg/vectors.bin` (semantic search) |

Shared flags: `-c/--config`, `-f/--format pretty|json`; `build` takes `-o/--out`; `query`/`stats`/`check`/`export`/`search`/`embed`/`traverse` take `-g/--graph`; `check` takes `--shapes`; `stats` takes `--coverage-threshold <pct>`; `export` takes `-f/--format` and `-o/--out`; `search` takes `-i/--index` (default: `search.json` beside the graph), `--limit` (default 10), `--vectors`, and `--mode lexical|vector|hybrid`; `embed` takes `-i/--index`, `-o/--out`, `--model`, `--dtype`, `--no-cache`; `traverse` takes `-d/--depth` (default 1, or 3 under `--impact`, since impact analysis is only useful transitively), `--predicates`, `--reverse`, `--impact`, `--variant`, `--subject`, `--limit`.

### Retrieval runtime (`dockg/runtime`)

`dockg search` and `dockg traverse` are thin CLIs over **`dockg/runtime`** — a
browser-native retrieval layer ([ADR 01018](adrs/01018-graphrag-runtime-architecture.md))
that runs the same code client-side. It uses **no Node APIs**, because the graph
it reads is the plain `JSON.parse`-able JSON-LD export — no RDF parser needed.
Its one dependency is MiniSearch, bundled in, so `dist/runtime.js` stays a
single-file drop-in (~10.6 KB gzipped once your bundler minifies it).

```js
import {
  GraphIndex, createLexicalIndex, findEntry,
  traverse, createFetchResolver, assemble,
} from "dockg/runtime";

const graph = GraphIndex.fromJsonLd(await (await fetch("/kg/graph.jsonld")).text());
const lexical = createLexicalIndex(await (await fetch("/kg/search.json")).text());

// 1. Question → seed nodes, ranked.
const { candidates, trace } = findEntry("how do I configure the SP-X100?", { lexical });

// 2. Walk the graph, honoring product-variant scope (including negative scope).
const { nodes } = traverse(graph, {
  seeds: candidates.map((c) => c.iri),
  depth: 2,
  variant: "SP-X100",
  trace,
});

// 3. Resolve node text and assemble the bundle an inference engine consumes.
const resolver = createFetchResolver(graph, { baseUrl: "/raw/", trace });
const bundle = await assemble(resolver, nodes, { trace, maxChars: 12000 });
// → { context, citations, trace, refusal?, truncated }
```

### Lexical entry

Step 1 above needs `kg/search.json`, produced by `dockg export --format search`.
It exists because the graph is an *index, not a corpus*
([ADR 01008](adrs/01008-graph-as-index-not-corpus.md)): sections carry only
titles, so an index built from the graph alone could never match what a document
actually *says* — "what is the default cache directory?" would find nothing. The
artifact carries the body text, built in Node from local markdown, so entry stays
hermetic ([ADR 01019](adrs/01019-lexical-entry.md)).

**Every node indexes exactly the text it owns** (the granularity golden rule). A
section carries its text down to the next heading of any rank — subsections are
their own nodes. A document carries its title, description, and the prose no
section covers: the preamble before the first heading, or its whole body when it
has no sections. Repeating text would let a node shadow the nodes beneath it in
the rankings; carrying none would leave that prose findable nowhere. Frontmatter
is stripped from document body text: it is machinery, not prose.

Retrieval differs from indexing here on purpose — `createFetchResolver` returns a
section *with* its subsections, because asking for a section should give you
what is under it.

```bash
dockg build
dockg export --format search       # -> kg/search.json
dockg search "default cache directory"
```

Ranking is deterministic: the same query against the same artifact always
returns the same order, with ties broken by IRI.

### Semantic entry (`dockg embed`)

Lexical search finds words; semantic search finds *meaning*. `dockg embed`
computes an embedding per indexed node into `kg/vectors.bin`, and the runtime
ranks a query against it ([ADR 01020](adrs/01020-local-embeddings.md)).

**Embeddings are local — always.** No API, no key, no spend, no corpus text
leaving the machine. The model runs under `@huggingface/transformers`, an
**optional peer dependency** you install only if you want this:

```bash
npm install @huggingface/transformers
dockg build && dockg export --format search
dockg embed                       # -> kg/vectors.bin
dockg search "how do I set this up" --mode hybrid
```

The model is a knob, not a constant — `embed.model` accepts any id, and the
table below is the *tested* set rather than the permitted set. The caveat column
matters, because the cheapest options fail **quietly**:

Ids are the full hub repo paths — that is what `embed.model` and `--model` take,
and a bare name resolves to nothing:

| Model | q8 download | Dims | Notes |
|---|---|---|---|
| **`onnx-community/granite-embedding-small-english-r2-ONNX`** (default) | ~53 MB | 384 | 8192-token context, so sections are never truncated; no prefix convention |
| `Xenova/gte-small` | ~34 MB | 384 | Lighter; 512-token context; no prefixes |
| `Xenova/bge-small-en-v1.5` | ~34 MB | 384 | Needs a query prefix — dockg applies it for you, since omitting it degrades retrieval silently |
| `Xenova/all-MiniLM-L6-v2` | ~23 MB | 384 | Smallest, but truncates at 256 wordpieces (~190 words), so a long section's tail becomes unsearchable |

Weights download once and are cached by the browser; nothing is fetched until
you build an embedder (`createLocalEmbedder`), so a page that never searches
never pays for one. `--model mock` produces deterministic hash vectors for
offline testing — useful for plumbing, meaningless for quality.

**Three modes, each usable on its own.** `--mode lexical|vector|hybrid`, and in
the API `lexical.search()`, `vectors.search()`, and `findEntry()` are
independent. `findEntry` returns each leg *and* the fusion, so a UI can show
"text matches" and "semantic matches" separately:

```js
const embedder = await createLocalEmbedder({ role: "query" });
const { candidates, lexical, vector } = await findEntry(question, {
  lexical: lexicalIndex, vectors, embedder,
});
```

Pass the `embedder`, not a bare embedding function: `findEntry` then verifies its
model and dtype against the sidecar and throws `VectorMismatchError` rather than
ranking against vectors from a different model. (An `embedQuery` function is
accepted too, for a host wiring its own model — but it carries no identity, so
only the dimension check applies.)

Two things dockg does so the vectors are trustworthy:

- **Node and the browser compute the same function.** transformers.js uses a
  native runtime in Node and WASM in the browser, and they disagree measurably —
  which would mean comparing build-time vectors against query-time vectors
  produced by a *different* function. dockg forces WASM on both sides,
  single-threaded, one text per call.
- **A mismatched sidecar is refused, not ranked.** The artifact records its
  model, dtype, dimensions, and a digest of the search index it was built from.
  Model and dtype are checked against the `embedder` you pass; the digest is
  checked when you pass `source`, since the runtime never sees the raw bytes it
  would have to hash. Either way you get a `VectorMismatchError` rather than
  quietly wrong results.

```js
const raw = await (await fetch("/kg/search.json")).text();
const { candidates } = await findEntry(question, {
  lexical: createLexicalIndex(raw), vectors, embedder,
  source: await searchIndexDigest(raw),   // refuses a sidecar built from an older corpus
});
```

`searchIndexDigest` takes the response text exactly as fetched —
`JSON.stringify(parsed)` would produce different bytes and so a digest that
never matches.

`kg/vectors.bin` is gitignored by default: it is derived, binary, and — unlike
every other dockg artifact — cannot be rebuilt in CI, because model weights are
a download. Build it in your deploy pipeline.

Three properties are contractual:

- **Retrieval-only.** The runtime returns `{ context, citations, trace }` and
  **stops** — it never calls a model. Wiring generation (an agent, your backend,
  whatever) is the host's job, which keeps API keys and inference cost outside
  dockg and keeps retrieval fully deterministic.
- **Every result carries its trace.** `trace` records the seeds, every hop
  (`{from, predicate, to, depth}`), every scope exclusion (`{node, rule, value}`),
  and every content resolution — so "why did this come back?" is always
  answerable. `dockg traverse -f json` prints it too.
- **No route ⇒ a structured refusal**, never empty context: `bundle.refusal` is
  `{reason: "no-route" | "no-content", detail}` so a caller can decline honestly
  instead of guessing.

Scope filtering follows [ADR 01014](adrs/01014-negative-scope.md): a node is
dropped when an explicit negative (`kg.notApplicableTo`) names the target, or
when it scoped itself to *other* variants — and the trace says which rule fired.
Schema edges (`rdf:type`) are not traversed by default, since every document
shares its class node and following them would make everything reachable from
everything.

**Custom SPARQL** is supported without adding weight for anyone who doesn't want
it: `rdfjsQuads(graph)` hands out standard RDF/JS quads for any store or engine.

```js
import { Store } from "n3";
import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { rdfjsQuads } from "dockg/runtime";

const bindings = await new QueryEngine().queryBindings(sparql, {
  sources: [new Store(rdfjsQuads(graph))],
});
```

Engine results carry bindings, not the walker's trace — explainability lives in
the walker API.

### Export

`dockg export --format jsonld` reserializes the built graph (default: config
`out`) as [JSON-LD](https://www.w3.org/TR/json-ld11/) — the web-native RDF form
that answer engines, search crawlers, and JSON tooling consume. Because dockg
already emits `schema.org` terms, the export is directly usable with no lossy
remapping: it is a **whole-graph, lossless** rendering — every triple, grouped
by subject, under an `@context` carrying dockg's prefix table.

```bash
dockg build
dockg export --format jsonld          # -> kg/graph.jsonld
dockg export -f jsonld -o out.jsonld  # explicit output path
```

The output holds the same determinism contract as the Turtle: two exports over
the same graph are byte-identical (no blank nodes, no wall clock, canonically
sorted). The default output path is the graph path with a `.jsonld` extension;
`-o/--out` overrides it.

`dockg export --format iirds` packages the graph as an **unrestricted
[iiRDS](https://www.iirds.org/) 1.3 package** (`.iirds`, a ZIP) — the format
tekom's Content Delivery Portals ingest ([ADR 01017](adrs/01017-iirds-package-export.md)).
The package carries `META-INF/metadata.rdf` (RDF/XML): one `iirds:Package`, each
document as an `iirds:Topic` linked via `iirds:is-part-of-package`, each markdown
source embedded as an `iirds:Rendition` (`text/markdown`), and the Phase-2 iiRDS
classification (topic type, subject, product variant, lifecycle phase) carried
across. It is byte-identical across runs (zeroed ZIP timestamps, sorted RDF/XML,
`mimetype` stored first).

```bash
dockg build
dockg export --format iirds           # -> kg/graph.iirds
```

Enrich the package with the optional `export.iirds` config block (below); absent,
a minimal valid package is still produced. `A`/`H` iiRDS variants (which need a
PDF/A or XHTML5 content pipeline) are out of scope.

### Metadata coverage

`dockg stats` reports, for each of seven per-document fields (`title`,
`description`, `creator`, `created`, `modified`, `subject`, `prefLabel`), the
share of docs that carry it. Because the graph is an index over your docs
([ADR 01008](adrs/01008-graph-as-index-not-corpus.md)), a field you never lift is
invisible to anything querying the graph — coverage turns that gap into a number.
It is measured against the graph, so a date dockg derived from git history counts
as covered. `stats.coverageThreshold` (or `--coverage-threshold <pct>` for a
uniform value) makes `stats --check` exit 1 when a gated field falls short; unset,
coverage is reported but never gates.

## Configuration

dockg is **opinionated by default** ([ADR 01009](adrs/01009-opinionated-defaults.md)):
anything it can derive from the files already on disk is on out of the box, and a
default-on feature that can't run in your setup degrades with a warning rather
than failing the build. Anything that needs the network or spends money — today
that is `dockg fill` — is never triggered by a default; you invoke it explicitly.
Every default remains overridable below.

`dockg.config.yaml`, validated against a JSON Schema (`dockg:config:0.1`):

```yaml
version: 1
baseIri: https://example.com/kg/   # default: urn:dockg: placeholder
inputs: ["docs/**/*.md"]
exclude: ["**/node_modules/**"]
out: kg/graph.ttl
build:
  derive: [frontmatter, sections, links, tags, images, code]
provenance:
  git: auto          # auto | true | false — per-file git dates/authors, rename revisions, build endedAtTime
  qualified: true    # qualified attribution/association nodes with roles
stats:
  # Minimum metadata coverage under `stats --check`. A number applies to every
  # field; a map gates named fields only. Default {} gates nothing.
  coverageThreshold:
    title: 100
    description: 50
# validate.schemas defaults to the bundled schemas/frontmatter-0.8.json
# check.shapes defaults to the bundled shapes/dockg-0.5.ttl
fill:
  provider: anthropic
  temperature: 0
  maxCostUsd: 5
  cacheDir: .dockg/cache
  minConfidence: 0.7     # write only fields the model scores >= this
  # fields: defaults to every fillable field; confidence gates what is written
  validateGraph: true    # reject proposals that would violate the shapes
export:
  iirds:                 # optional enrichment for `export --format iirds`
    title: My Docs       # package title (default: "dockg export")
    creator: Acme Corp   # Creator iirds:Party + vcard:Organization (default: none)
    version: "1.3"       # iiRDS version literal: "1.2" | "1.3" (default: "1.3")
```

## Related standards

Beyond the vocabularies dockg already emits (Dublin Core, SKOS, PROV-O,
schema.org, FOAF):

- **[iiRDS](https://iirds.org/)** — the intelligent information Request and
  Delivery Standard (tekom): the technical-communication industry's RDF
  vocabulary for documentation semantics. Namespace
  `http://iirds.tekom.de/iirds#` (Core, stable across versions) plus the
  Software domain `http://iirds.tekom.de/iirds/domain/software#`. dockg emits
  Core topic typing and product-variant applicability, and the Software
  domain's lifecycle-phase and subject classifications (see the `kg:` section),
  and packages the whole graph as an unrestricted iiRDS 1.3 `.iirds` container
  via `dockg export --format iirds`. Only published IRIs are *referenced* — the
  spec is CC BY-ND, so the vocabulary is never vendored, re-serialized, or
  modified in this repo.
- **DIN SPEC 91526** — "Knowledge Graphs for Language Models and Language
  Models for Knowledge Graphs" (DIN Media, 2025): a general pre-standardization
  spec on grounding LLMs with knowledge graphs. It is *not* an iiRDS document
  and does not integrate iiRDS into the Asset Administration Shell (that is the
  separate IDTA iiRDS Submodel, IDTA 02063-1-0). Tracked as conceptual backdrop
  for the graph-grounds-LLM thesis, not a contract dockg conforms to.
- **[QUDT](https://qudt.org/)** — quantities, units, and dimensions. Relevant
  if dockg ever lifts quantitative properties (sizes, tolerances) into the
  graph.

## Contributing

```bash
npm install
```

Use `npm install`, not `npm ci`: the committed lock is generated on Windows and omits the Linux-side optional dependencies of rolldown's wasm binding, so a strict lock check can't pass on both platforms.

### Quality gates

Checks are layered by cost — fast ones on commit, the full loop on push, and everything again in CI, which is the authoritative gate.

| Script | What it checks |
|---|---|
| `npm run format:check` / `npm run format` | Prettier formatting |
| `npm run lint` / `npm run lint:fix` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | tsup bundle into `dist/` |
| `npm test` | vitest, unit + integration |

| Git hook | Runs |
|---|---|
| `pre-commit` | lint-staged (Prettier + ESLint on staged files), then `typecheck` |
| `pre-push` | `typecheck`, `build`, `test` |
| `commit-msg` | commitlint |

Hooks are installed by husky on `npm install`. Build before test — the integration suite executes `dist/cli.js`, not `src/`.

Prettier deliberately ignores `test/fixtures/` and `schemas/`: the corpus and golden graph are byte-exact regression baselines, and published frontmatter schemas are immutable once released. `.gitattributes` pins LF line endings everywhere except those byte-exact fixtures.

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), enforced by the `commit-msg` hook and re-checked across the whole PR range in CI — hooks are bypassable, and semantic-release derives every version bump from these messages. Subjects must be lower-case: `feat: prov-o support`, not `feat: PROV-O support`.

| Type | Release |
|---|---|
| `fix:` | patch |
| `feat:` | minor |
| `feat!:` or a `BREAKING CHANGE:` footer | major |
| `chore:`, `docs:`, `ci:`, `style:`, `test:`, `refactor:`, `build:`, `perf:` | none |

Releases are fully automated by semantic-release. Don't hand-edit `version` in `package.json`, create `v*` tags, or run `npm publish` locally.

## License

MIT
