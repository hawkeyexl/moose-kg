---
id: persona-information-architect
type: persona
name: Ines
audience: aud-information-architects
role: Information architect who owns the metadata standard
proficiency:
  - designs and governs controlled vocabularies
  - reads SKOS relationships and knows why broader/related conflicts matter
  - has implemented at least one industry standard end to end
  - specifies applicability rules across product lines
prerequisites:
  - SKOS concepts, labels, and hierarchy
  - an existing taxonomy or controlled vocabulary, already agreed
  - iiRDS, DITA, S1000D, or an equivalent standard
  - the product/variant structure their documentation covers
goals:
  - express the existing vocabulary in the files without rewriting it
  - type topics against a real standard, not a bespoke enum
  - state applicability precisely, including what a topic does not cover
  - put metadata on the heading that owns the text, not on the whole file
  - catch vocabulary errors automatically instead of in review
pains:
  - the taxonomy lives in a spreadsheet and the docs drift from it
  - two writers spell the same concept two ways and nobody notices for a year
  - '"does this topic apply to variant X?" is answered by absence, which is not an answer'
  - document-level tagging is too coarse to be true for long pages
content_types:
  - frontmatter-to-triple mapping tables
  - controlled-vocabulary value lists with their standard IRIs
  - worked modeling examples with the resulting graph shown
  - validation rule catalogs explaining what each check protects against
journeys:
  - cuj-model-concepts
  - cuj-scope-by-variant
  - cuj-section-granularity
  - cuj-backfill-metadata
  - cuj-export-to-consumer
  - cuj-query-the-graph
evidence_basis:
  - DESIGN.md's grounding in tekom/iiRDS practice, addressed to this professional community
  - ADR 01012's choice to adopt published iiRDS terms rather than mint moose-kg equivalents
  - ADR 01013's slug-keyed kg.sections map, which exists because document granularity is too coarse
  - ADR 01014's negative-scope predicates, a distinction only an applicability modeler asks for
  - the SKOS cycle and S27 checks in shapes/moose-kg-0.5.ttl, which encode vocabulary-governance rules
---

The person who owns what the words mean, and needs the files to agree with them.

## Who they are

Ines maintains the controlled vocabulary for a documentation set covering several products or
model lines. The vocabulary predates the current publishing platform and will outlive it. They
have spent real time on questions that look pedantic from outside and are not: whether two terms
are one concept, whether a topic type is a task or a procedure, whether a caution applies to a
variant or only to a configuration of it.

They are not the person who runs the build. Someone in
[`persona-docs-engineer`](docs-engineer.md)'s role does that, and Ines files a ticket when
something needs to change in the pipeline.

## What they bring, and what they do not

**Bring:** SKOS, controlled vocabularies, at least one industry standard, and a precise mental
model of their own product taxonomy.

**Do not bring:** Node tooling, CI internals, or comfort debugging a workflow file. They will
not `npm install` their way out of a problem.

This inverts the usual assumption. Pages for Ines can be dense about semantics and must be
gentle about mechanics — the opposite of pages for Priya.

## The two things that win them, and the one that loses them

**Wins:** that moose-kg's typing vocabularies are *published iiRDS terms*, referenced rather than
reinvented — recognition is the credibility moment; and that absence of applicability means
**unknown**, not "does not apply", with explicit negative predicates when they need to say the
stronger thing. That distinction is one they have usually had to argue for elsewhere.

**Loses:** a page that explains SKOS to them, or gets it subtly wrong. They know this material
better than the docs do. The docset's job is to explain **moose-kg's mapping onto vocabulary they
already have** — this frontmatter key becomes that triple — and to be exact about where moose-kg
diverges from the standard and why.

## What success looks like for them

The vocabulary is in the files, `moose-kg check` fails when someone violates it, and a query can
answer "what applies to variant X" correctly — including the negative case, without a human
interpreting silence.

## Their journeys

[`cuj-model-concepts`](../journeys/model-concepts.md) ·
[`cuj-scope-by-variant`](../journeys/scope-by-variant.md) ·
[`cuj-section-granularity`](../journeys/section-granularity.md) ·
[`cuj-backfill-metadata`](../journeys/backfill-metadata.md) ·
[`cuj-export-to-consumer`](../journeys/export-to-consumer.md) ·
[`cuj-query-the-graph`](../journeys/query-the-graph.md)
