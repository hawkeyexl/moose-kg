---
type: ia-gap-analysis
status: built
pages_proposed: 35
pages_written: 35
open_gaps: 1
---

What the docset replaced, what it added, and what is still open.

## Where this started

Every user-facing word lived in `README.md` — 686 lines doing the work of overview, concept
explainer, vocabulary reference, frontmatter reference, config reference, command reference,
runtime API guide, embeddings guide, export guide, standards backgrounder, and contributor guide.
No page existed; every proposed page was `[NEW]`.

**All 35 are now written**, and all 76 CUJ steps resolve to a real page. The README is 66 lines and
routes into the site; contributor mechanics live in `CONTRIBUTING.md`. What follows is kept as the
record of where each thing went, and what remains open.

## Current → proposed mapping

Each README section, and the page that inherited it. "Expand" means the README's treatment was a
summary the destination page goes beyond; "split" means one section fed several pages.

| README section | Destination | Disposition |
|---|---|---|
| What the graph is (and isn't) | `concepts/index-not-corpus.mdx` | Expand — this is the highest-value paragraph in the README and deserves a page |
| Install · Quick start | `get-started/index.mdx` | Move, expand with the double-build proof |
| What gets derived | `build/index.mdx` | Move |
| The `kg:` frontmatter key | `reference/frontmatter.mdx` + `model/concepts-skos.mdx` | Split — reference table vs. modeling guidance |
| Per-section metadata | `model/sections.mdx` + `reference/frontmatter.mdx` | Split |
| Negative scope | `model/variants.mdx` + `concepts/open-world.mdx` | Split — the semantics page must come first |
| Example output | `get-started/index.mdx`, `build/index.mdx` | Split, regenerate from a fixture |
| Provenance (PROV-O) | `govern/provenance.mdx` + `reference/vocabulary.mdx` | Split, expand for a non-CLI reader |
| Graph validation (SHACL) | `govern/index.mdx` + `reference/shapes.mdx` | Split |
| Route mappings | `build/routes.mdx` | Move, expand with per-generator examples |
| AI fill | `build/backfill.mdx` | Move, **reframe** as a review workflow rather than a feature |
| Commands | `reference/cli.mdx` | Move, then drift-check |
| Retrieval runtime | `retrieve/runtime.mdx` + `reference/runtime-api.mdx` | Split — guide vs. signatures |
| Lexical entry · Semantic entry | `retrieve/search.mdx` + `reference/embed-models.mdx` | Split |
| Export | `retrieve/export.mdx` | Move |
| Metadata coverage | `govern/coverage.mdx` | Move, expand with the ratchet advice |
| Configuration | `reference/configuration.mdx` | Move |
| Related standards | `concepts/index.mdx`, `reference/glossary.mdx` | Split, compress |
| Contributing · Quality gates · Commit messages | **`CONTRIBUTING.md`** | Out of scope for the site — see below |
| License | `README.md` | Stays |

### One thing that leaves the README and does not go to the site

Contributor mechanics — quality gates, commit conventions, release channels — belong in a
`CONTRIBUTING.md`. Putting them on the published site mixes audiences the IA is trying to separate,
and leaving them in a slimmed README defeats the point of slimming it. The file did not exist and
was created as part of the README slim.

## Content with no source material at all

These are the gaps that are not solved by moving text around, ordered by how much they cost
today. **This list is the deliverable** — it is what the docset adds rather than reorganizes.

### 1. Troubleshooting content — nothing exists

dockg emits numerous well-written operational errors, and they are collected nowhere: a missing
search index, a stale vector sidecar, an unknown variant or software subject, TOML/JSON
frontmatter handed to `fill`, git unavailable under `provenance.git: true`, unsupported file
types under `validate`, a model that will not load.

Every one of these currently sends a reader to the source or to an issue. This is the entire
`fix/` track, it serves the highest-traffic persona, and it is the largest single gap in the set.
**Highest priority.**

### 2. The exit-code contract as a documented set

The individual codes appear in passing; the contract does not appear anywhere as a whole, and its
counter-intuitive cases are precisely the ones that cause misconfiguration:

- `fill` low-confidence drops and SHACL guardrail rejections → **exit 0**, deliberately
  (ADR 01015), so an orchestrating agent does not read routine operation as failure.
- `check` warnings → exit 0; only `sh:Violation` exits 1.
- `build` warnings, including degraded git provenance → exit 0.
- `stats` gates only under `--check`.

A reader wiring CI without this will build a gate that does not gate, or one that fails on
healthy runs. **High priority** — it blocks `cuj-gate-metadata-in-ci`.

### 3. Two different `-f/--format` flags

On `export`, `-f` selects the export format (`jsonld|iirds|search`). On every other command it
selects output rendering (`pretty|json`). Nothing currently warns about this. One sentence on two
pages. **Cheap and high-value.**

### 4. The `inputs` default mismatch

The code default is `["**/*.md"]`; the `dockg init` template writes `["docs/**/*.md"]`. A reader
running without a config file gets different ingestion than one who ran `init`, and nothing says
so. Belongs on `reference/configuration.mdx` and `build/index.mdx`. **Medium priority** — it also
interacts with the empty-graph coverage caution, since a too-narrow glob produces a vacuously
perfect score.

### 5. Page-level frontmatter aliases are undocumented as a set

The README shows `title`, `description`, `author`/`authors`, `date`, `updated`, `lang`. The code
also accepts `created`, `lastmod`, `modified`, `keywords`, and a page-level `generatedBy`. None
of these are schema-validated — the frontmatter schema constrains only the `kg` block — so a
reader has no way to discover them except by reading `src/core/derive.ts`. **Medium priority.**

### 6. Where the two validation layers differ

`validate` (per-file JSON Schema, via docmeta) and `check` (whole assembled graph, SHACL) are
both documented in isolation, and the choice between them is never explained. A cross-document
error — a `broader` cycle spanning three pages — is invisible to `validate` by construction.
**Medium priority** — it blocks confident CI wiring.

### 7. Unbuilt surface that must not be documented as shipping

`dockg retrieve`, `dockg mcp`, and the eval harness are designed but unbuilt. They appear in
`DESIGN.md` and a reader may encounter them there. The docset must not imply they ship.
**Constraint, not a gap** — recorded here so it is not accidentally violated.

## Known limitation, since resolved

**dockg did not parse MDX.** The parsing stack was `remark-parse` + `remark-gfm` +
`remark-frontmatter`, with no `remark-mdx`, so JSX was seen as raw text. Headings and prose links
derived correctly; `href`s inside components such as `<LinkCard>` and `<CardGrid>` **did not become
graph edges**.

It was documented on `build/index.mdx` rather than worked around, and the docs graph was the
evidence: 36 documents, **26 reference edges, 5 orphans** — every orphan a page whose outbound links
were all `<LinkCard>`s.

[ADR 01022](../../../adrs/01022-parse-mdx-and-derive-from-jsx-attributes.md) resolved it. `.mdx`
inputs now go through `remark-mdx`, and a JSX element's `href` is read as a link, `src` as an image,
on any element. The same corpus now reports **129 reference edges and 0 orphans**.

Keeping the record because the sequence is the point: the limitation was found by building a graph
from the docset and reading a number that disagreed with the corpus. Stating it plainly is what made
it fixable — a limitation quietly designed around would still be there.

## Pages that map to no CUJ

Three proposed pages are named by no journey step. Each is justified as navigation, and none
should grow beyond that role:

| Page | Role | Constraint |
|---|---|---|
| `concepts/index.mdx` | Group hub | A router of four cards. If it acquires content, that content belongs on one of the four. |
| `reference/index.mdx` | Shelf index | A card grid and nothing else. |
| `reference/glossary.mdx` | Lookup support | Definitions only. It supports navigation; it must never become the place concepts are explained. |

Every other page — including `model/index.mdx`, which is the orienting step of
[`cuj-model-concepts`](../journeys/model-concepts.md) — is reachable from at least one journey
step.

**No page may exist without a CUJ unless it is one of these three.** A page that serves no
journey and is not on this list is a page the IA does not have a reason for, and the route
cross-check below is what catches it.

## Verifying this IA mechanically

Three properties are checked by `scripts/check-content-strategy.mjs` on every CI run:

1. **No dangling routes** — every `steps[].doc` in `journeys/` names a page the content set plans.
   A journey pointing at a page nobody intends to write is a silent gap.
2. **No unjustified pages** — every planned page is named by a journey step, except the three
   above.
3. **`exists` tracks reality, both ways** — a step may not claim `exists: true` for a route that
   resolves to nothing, *and* may not keep claiming a `[GAP]` for a page that now exists.

The second caught a real defect when it was written: `reference/cli.mdx` was a launch page no
journey reached. The third was added after all 75 steps sat at `exists: false` while 29 pages had
already shipped — the coverage field the journeys overview calls "the live gate" had become
fiction, and nothing noticed.

## Gaps that were closed

All ten of the originally prioritized gaps are addressed. Kept as a record of what the docset was
built to fix:

| # | Gap | Closed by |
|---|---|---|
| 1 | `fix/` track — troubleshooting existed nowhere | `fix/index.mdx`, `fix/faq.mdx` |
| 2 | Exit-code contract as a set | `reference/output-and-exit-codes.mdx` |
| 3 | The on-ramp with no RDF prerequisite | `get-started/index.mdx` |
| 4 | Why prose is not in the graph | `concepts/index-not-corpus.mdx` |
| 5 | Absence means unknown | `concepts/open-world.mdx` |
| 6 | CLI reference plus its drift check | `reference/cli.mdx`, `scripts/check-cli-reference.mjs` |
| 7 | `CONTRIBUTING.md` did not exist | Created with the README slim |
| 8 | `fill` reframed as a review workflow | `build/backfill.mdx` |
| 9 | Provenance for a non-CLI reader | `govern/provenance.mdx` |
| 10 | The metadata dependency stated up front for retrieval | `retrieve/index.mdx` |

Three gaps found later and also closed:

- The Node package entry (`.`) had no planned page at all — only `./runtime` and `./embed` did.
  Now `reference/library-api.mdx`.
- `reference/embed-models.mdx` quoted a model size with no source in the repo. Removed rather than
  left unfalsifiable.
- **`query` and `traverse` had only CLI-reference coverage.** This was first recorded as a
  deliberate non-gap on the grounds that no journey asked for a guide — which inverted the test.
  The IA's rule is that a page needs a journey, not that a command's absence is justified by one
  missing. There *was* an unwritten journey: reading the graph back, and specifically checking what
  depends on a page before changing it, which `concepts/index-not-corpus.mdx` promises the graph is
  for. Now [`cuj-query-the-graph`](../journeys/query-the-graph.md) and `build/query.mdx`.

## What is still open

### 1. Command output on a page is verified by nobody

Automated doc testing was added and then removed, to be re-added separately. The pages show real
output captured from committed fixtures, and determinism means it is reproducible — but **nothing
fails when a command's output changes.**

This is the largest remaining risk in the set, because it degrades silently: a page stays plausible
long after it stops being true. `CLAUDE.md` and `CONTRIBUTING.md` name re-capturing output as a
manual obligation until a runner returns.

### 2. Deliberate non-gaps

Recorded so they are decisions rather than oversights:

- **Route coverage is not content quality.** Every CUJ step resolving to a page says nothing about
  whether the page serves the journey well. The journey walk-through test in
  [`proposed-ia.md`](proposed-ia.md) is the qualitative check, and it is run by a human.
