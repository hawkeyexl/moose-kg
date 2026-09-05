---
id: aud-brownfield-corpora
type: audience-lens
segment: Brownfield corpora, a large existing docs set with little or no metadata
maturity: content maturity is high; metadata maturity is near zero
docs_owner: whoever already owns the docs; this lens does not change ownership
status: cross-cutting lens
overlaps:
  - aud-docs-as-code-teams
  - aud-information-architects
firmographics:
  - hundreds to thousands of existing pages
  - frontmatter present but sparse, inconsistent, or purely presentational
  - no realistic prospect of hand-annotating the backlog
  - the corpus predates any metadata standard the org now has
  - often the result of a platform migration that dropped whatever metadata existed
relationship_stages:
  - evaluating: how far from useful is my corpus, in a number?
  - adopting: backfilling with fill, reviewing what the model proposed, setting a first threshold
  - operating: ratcheting the threshold up as the backlog shrinks
personas:
  - persona-docs-engineer
  - persona-information-architect
evidence_basis:
  - dockg fill's entire existence, since a backfill tool is only necessary for a corpus that was not annotated as it was written
  - ADR 01015 (fill proposes all fields, gated by model confidence) and the kg.provenance review-queue design, which presume a human reviewing machine output at volume
  - ADR 01011's per-field coverage thresholds, whose value is as a ratchet, a number you raise over time
  - DESIGN.md's information-evaporation argument ("the 5 mm silence"), which describes what an unannotated corpus costs
  - the fill.maxCostUsd default of 5 USD, which presumes a run large enough that cost is a real constraint
---

A cross-cutting lens: the corpus already exists, it is large, and almost none of it is
annotated.

## Why this is a lens and not a segment

It does not sit beside the five segments. It sits *across* two of them. A reader is a
docs-as-code team **and** brownfield, or an information architect **and** brownfield. The lens
changes what the advice has to say without changing who is receiving it. Folding it into either
segment would lose it, and giving it its own persona would duplicate one that exists.

It earns a file because it inverts the default advice. Everything else in the docset assumes
metadata arrives as pages are written. This lens assumes it does not, and never will, for the
backlog.

## What changes under this lens

**The starting number is bad, and that has to be said out loud.** The first `dockg stats` run
over a brownfield corpus reports coverage in the single or low double digits. If the docs have
implied that a healthy corpus is near 100%, that first run reads as failure and the reader
stops. Pages written under this lens should lead with the expectation that the first number is
low and that this is the normal starting condition.

**Backfill is a review workflow, not a generation step.** `dockg fill` proposes; a human
accepts. The design reflects this everywhere. Proposals below the confidence threshold are
dropped silently and the run still exits 0. Proposals that would corrupt the graph are rejected
by the SHACL guardrail. Every written field is recorded in `kg.provenance` with its
confidence, so a reviewer can find it later. Documenting `fill` as "annotate your corpus
automatically" would misrepresent it and set up exactly the audit problem
[`aud-compliance-owners`](compliance-owners.md) is trying to avoid.

**The threshold is a ratchet, not a target.** Set the coverage threshold just below current
coverage so the gate holds the line, then raise it as the backlog shrinks. Setting it at the eventual goal on day one makes the build permanently red, which
teaches the team to ignore it.

**Cost is a real constraint.** A few thousand pages against a hosted model is a bill. The
default `fill.maxCostUsd` of 5 exists because of this, and a page that demonstrates `fill`
without mentioning budget is setting up a surprise.

## Where the docset serves this lens

Primarily [`cuj-backfill-metadata`](../journeys/backfill-metadata.md), which lives in the
`build/` track. It also colors the framing of
[`cuj-gate-metadata-in-ci`](../journeys/gate-metadata-in-ci.md) and
[`cuj-prove-coverage`](../journeys/prove-coverage.md). Both otherwise read as though the corpus
starts healthy.
