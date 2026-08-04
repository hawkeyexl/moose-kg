---
type: audience-overview
segmentation_axis: who owns the docs × company documentation maturity
audiences:
  - aud-docs-as-code-teams
  - aud-information-architects
  - aud-ai-platform-teams
  - aud-compliance-owners
  - aud-doc-contributors
lenses:
  - aud-brownfield-corpora
---

Who dockg's documentation serves, segmented bottom-up from the product surface.

## The segmentation axis

Segments are cut on **who owns the documentation × how mature that organization's
documentation practice is.** That axis was chosen because it is the one that actually predicts
which dockg commands a reader reaches for. A team whose docs are owned by an engineer with a CI
pipeline starts at `build` and `stats`; a team whose docs are owned by an information architect
with an existing controlled vocabulary starts at the `kg:` block and `check`; a team that does
not own the docs at all but consumes them starts at `export` and the runtime.

Note what the axis is *not* cut on: company size, industry, or seat count. Nothing in dockg's
surface varies by those, so segmenting on them would produce distinctions the docset could not
act on.

## The segments

| ID | Segment | Docs owner | Maturity signal | Status |
|---|---|---|---|---|
| [`aud-docs-as-code-teams`](docs-as-code-teams.md) | Docs-as-code teams | Docs engineer / tech writer in an engineering repo | Has docs-as-code and CI; wants metadata to mean something | **Lead** |
| [`aud-information-architects`](information-architects.md) | Standards-driven documentation orgs | Information architect / taxonomist | Has a real metadata standard; needs it enforced and expressed | Core |
| [`aud-ai-platform-teams`](ai-platform-teams.md) | AI platform teams | Nobody on this team — they consume | Has a retrieval pipeline that is leaking across product boundaries | Core |
| [`aud-compliance-owners`](compliance-owners.md) | Regulated documentation owners | Compliance / regulatory documentation owner | Must produce audit evidence on demand | Core |
| [`aud-doc-contributors`](doc-contributors.md) | Individual doc contributors | Owns one page, not the infrastructure | Maturity-independent | Secondary, highest-traffic |

## The cross-cutting lens

[`aud-brownfield-corpora`](brownfield-corpora.md) — **a large existing corpus with no metadata
at all.** This is a lens, not a segment: it overlaps docs-as-code teams and information
architects rather than sitting beside them, and a reader can be in it *and* in one of the five
segments at the same time.

It earns a file of its own because it changes the shape of the advice rather than just the
volume. A greenfield corpus gets metadata as it is written; a brownfield corpus needs
`dockg fill`, a coverage threshold that starts below where it should end up, and a ratchet.
That is a different journey ([`cuj-backfill-metadata`](../journeys/backfill-metadata.md)), not a
longer version of the same one.

It is also the **most likely real-world entry state.** Nobody adopts a knowledge-graph tool
before they have documentation; they adopt it once they have too much.

## What is deliberately not a segment

- **"Beginners."** Proficiency is modeled per-persona as prerequisites the reader brings, not
  as a segment. See [`personas/_overview.md`](../personas/_overview.md).
- **Open-source vs. enterprise.** Nothing in the product surface branches on it.
- **Downstream tool vendors** (someone building *on* `dockg/runtime` rather than *with* dockg).
  Real, but served by `aud-ai-platform-teams`' reference needs; splitting it would produce two
  audiences with one shared journey.
