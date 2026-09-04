---
type: persona-overview
model: qualified reader, defined by prerequisites brought rather than proficiency levels
personas:
  - persona-docs-engineer
  - persona-information-architect
  - persona-ai-platform-engineer
  - persona-compliance-owner
  - persona-doc-contributor
---

One minimal persona per audience, each defined by what the reader already brings to the page.

## The qualified-reader model

There are **no beginner, intermediate, or advanced labels anywhere in this strategy**, and
there should be none in the docset. Those labels describe a reader's self-image rather than
their situation, and they are unfalsifiable. An "advanced" reader who has never seen SKOS is
a beginner at the page they are actually on.

Instead each persona declares two things:

- **`prerequisites`.** What this reader already brings, and can be assumed without explanation.
- **The explicit non-prerequisites**, stated in the body as *what they do not bring*. These
  are load-bearing: they are the things a page must not assume, and they are where docsets
  usually fail.

A page serves a persona when it assumes exactly their prerequisites and explains everything
else.

## The personas

| Persona | Name | Audience | Brings | Does **not** bring |
|---|---|---|---|---|
| [`persona-docs-engineer`](docs-engineer.md) | Priya | [`aud-docs-as-code-teams`](../audiences/docs-as-code-teams.md) | git, YAML, CI, a static site generator | RDF, SPARQL, SHACL |
| [`persona-information-architect`](information-architect.md) | Ines | [`aud-information-architects`](../audiences/information-architects.md) | SKOS, controlled vocabularies, iiRDS or DITA | Node tooling, CI internals |
| [`persona-ai-platform-engineer`](ai-platform-engineer.md) | Kwame | [`aud-ai-platform-teams`](../audiences/ai-platform-teams.md) | TypeScript, embeddings, RAG plumbing, bundling | docs-authoring conventions, iiRDS |
| [`persona-compliance-owner`](compliance-owner.md) | Renata | [`aud-compliance-owners`](../audiences/compliance-owners.md) | audit standards, evidence obligations | CLI comfort; they do not run commands |
| [`persona-doc-contributor`](doc-contributor.md) | Sam | [`aud-doc-contributors`](../audiences/doc-contributors.md) | Markdown, the content they wrote | config knowledge, the graph model |

Personas use they/them throughout.

## The constraint that shapes the whole docset

**`persona-docs-engineer` must reach value before learning RDF.**

This is the single most binding constraint in the set, and it follows from the lead audience
rather than from taste. If the on-ramp requires understanding triples, IRIs, or SHACL before
`dockg build` returns something useful, the lead persona leaves. Every other persona depends on
someone in that role having stayed.

In practice, `get-started/` and `build/index` must be completable with no RDF vocabulary at
all. Turtle output can be *shown*, since it is the product, but the reader must not have to parse
it to proceed. The `concepts/` track is where the model is explained, and it is deliberately
reachable rather than mandatory.

## The one persona who never arrives at the landing page

`persona-doc-contributor` enters through an error message, always. Their track has to work as a
**landing page for a link in CI output**, with no preceding context. No "as we saw in the
previous section", no assumed config knowledge, and no assumption they have dockg installed.

Every other persona can be assumed to have arrived at the top.
