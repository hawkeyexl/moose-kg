---
id: aud-information-architects
type: audience
segment: Standards-driven documentation organizations
maturity: has a real, governed metadata standard; needs it enforced and expressed as a graph
docs_owner: information architect, taxonomist, or documentation standards lead
status: core
firmographics:
  - a controlled vocabulary or taxonomy that predates the tooling
  - product documentation spanning multiple products, variants, or model lines
  - familiarity with an industry standard — iiRDS, DITA, S1000D, or an internal equivalent
  - often industrial, manufacturing, medical-device, or enterprise-software documentation
  - a content set large enough that "which topics apply to which product" is a real question
relationship_stages:
  - evaluating: can this express my existing taxonomy without me rewriting it?
  - "adopting: encoding the vocabulary as kg fields and getting check to enforce it"
  - operating: evolving the vocabulary without breaking the graph
personas:
  - persona-information-architect
evidence_basis:
  - DESIGN.md's grounding thesis (Natsuki Wakabayashi's iiRDS × knowledge-graph work, tcworld 2026), which is addressed directly to this professional community
  - ADR 01012 (adopt iiRDS Core and the Software domain) — a standard chosen for interoperability with an existing practice, not invented
  - ADR 01013 (section-level iiRDS metadata via a slug-keyed kg.sections map) and DESIGN.md's granularity golden rule
  - ADR 01014 (explicit negative scope) — a distinction only someone modeling applicability cares about
  - the SKOS surface in schemas/frontmatter-0.8.json (prefLabel, altLabels, broader, narrower, related) and the SKOS S27 / cycle checks in shapes/moose-kg-0.5.ttl
---

Information architects who already have a metadata standard, and need it enforced by something
other than review comments.

## What they own

The vocabulary. They decide what a topic type means, which product variants exist, what the
concept hierarchy looks like, and whether two terms are the same term. That work usually
predates any tool decision and often predates the current documentation platform.

They bring SKOS, controlled vocabularies, and at least one industry standard — most often iiRDS
or DITA. What they typically do **not** bring is Node tooling or CI internals; someone in
[`aud-docs-as-code-teams`](docs-as-code-teams.md) runs the pipeline for them.

## What they want

Their standard, expressed in the files, enforced automatically, and readable by something other
than a human. Specifically:

- **Typing that maps to a real standard**, not a bespoke enum. moose-kg's `topicType`,
  `softwareLifecyclePhase`, and `softwareSubject` are closed vocabularies bound to published
  iiRDS IRIs — this audience recognizes them on sight, and that recognition is the credibility
  moment.
- **Applicability modeling with teeth.** Which topics apply to which product variant is the
  question their whole taxonomy exists to answer, and the one most often answered wrongly.
  moose-kg's open-world default (absence means *unknown*, not *does not apply*) plus explicit
  negative scope is unusually precise about this, and precision is what they are shopping for.
- **Granularity that matches the content.** A 40-page document tagged as one node is a lie.
  `kg.sections` lets metadata sit on the heading that owns the text.
- **Enforcement that catches vocabulary errors, not just typos.** `moose-kg check` finding a
  `skos:broader` cycle, a `related`/`broader` conflict, or a concept with two spellings is
  catching the errors their review process misses.

## What makes them hard to serve

They are the audience most likely to know more about the standard than the docs do. A page that
explains SKOS to them wastes their time; a page that gets SKOS subtly wrong loses them. The
docset's job is to explain **moose-kg's mapping onto vocabulary they already know** — this
frontmatter key becomes that triple — and to be precise about where moose-kg deliberately diverges.

They are also the audience for whom the single most important sentence in the docset is the
open-world one, because the failure it prevents is silent: an interlock query that returns
everything it was meant to exclude.

## Where the docset serves them

The whole `model/` track, plus `concepts/` for the semantics. See
[`persona-information-architect`](../personas/information-architect.md) and journeys
[`cuj-model-concepts`](../journeys/model-concepts.md),
[`cuj-scope-by-variant`](../journeys/scope-by-variant.md), and
[`cuj-section-granularity`](../journeys/section-granularity.md).
