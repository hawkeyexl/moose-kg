---
id: cuj-backfill-metadata
type: cuj
title: Bring an unannotated corpus up to a threshold, and ratchet
personas:
  - persona-docs-engineer
  - persona-information-architect
lens: aud-brownfield-corpora
trigger: >-
  the first stats run over a large existing corpus reports coverage in the single or low
  double digits, and hand-annotating the backlog is not going to happen
entry_point: /dockg/build/backfill/
success_criteria: >-
  Coverage rises measurably, every machine-written field is recorded with its model and
  confidence, a human has reviewed a sample, and a threshold is set that holds the new line.
steps:
  - stage: trigger
    doc: /dockg/build/
    exists: true
    note: "The coverage table is where this starts; a low number must route here, not read as failure."
  - stage: orient
    doc: /dockg/build/backfill/
    exists: true
    note: "fill proposes, humans accept. Frame as a review workflow, never as auto-annotation."
  - stage: act
    doc: /dockg/build/backfill/
    exists: true
    note: "Dry run first, on a subset, with a cost cap. Read the proposals before writing anything."
  - stage: act
    doc: /dockg/build/backfill/
    exists: true
    note: "Write for real, then review kg.provenance entries and delete them as they are cleared."
  - stage: verify
    doc: /dockg/govern/coverage/
    exists: true
    note: "Re-measure, then set the threshold just under the new number to hold the line."
  - stage: extend
    doc: /dockg/reference/frontmatter/
    exists: true
    note: "The kg.provenance block shape, per-field confidence, and what deleting an entry means."
---

The corpus is large, almost none of it is annotated, and nobody is going to fix that by hand.

## The journey

This is the [brownfield lens](../audiences/brownfield-corpora.md) journey, shared by Priya and
Ines — one runs it, the other decides whether the proposals are acceptable. It is also the most
likely real-world entry state, because nobody adopts a knowledge-graph tool before they have too
much documentation.

It starts with a bad number. The first coverage report over an unannotated corpus is
embarrassing, and **if the docset has implied that healthy means near 100%, that number reads as
failure and the reader stops.** The journey's first job is to set the expectation that a low
starting number is normal and that the number is a baseline, not a grade.

## What they need to reach, in order

1. **Permission to have a bad number**, and a route from the coverage table into this journey.
2. **The correct mental model of `fill`: it proposes, a human accepts.** Everything about the
   design says so — proposals below the confidence threshold are dropped and the run still exits
   0, proposals that would corrupt the graph are rejected by the SHACL guardrail, and every
   written field is recorded with its confidence. Describing `fill` as "annotate your corpus
   automatically" would be a misrepresentation and would create exactly the audit problem
   [`persona-compliance-owner`](../personas/compliance-owner.md) is trying to avoid.
3. **A safe first run:** dry run, on a subset, with a cost cap. Reading proposals before writing
   any is the difference between adoption and a large revert.
4. **The review loop.** `kg.provenance` is the outstanding-review queue: each entry names the
   model, the fields it proposed, and the confidence per field. Humans delete entries as they
   clear them, so the block empties as review progresses. This is the most useful and least
   obvious thing in the journey.
5. **A threshold that holds the new line**, set just below the achieved number, then raised as
   the backlog shrinks.

## Three things this page must say plainly

- **Cost is real.** A few thousand pages against a hosted model is a bill. The default
  `fill.maxCostUsd` of 5 exists for this reason, and a demonstration that omits budget is setting
  up a surprise.
- **Exit 0 does not mean everything was written.** Low-confidence drops and guardrail rejections
  are routine operation and leave the exit code at 0 by deliberate design, so an orchestrating
  script does not treat a normal run as a failure. A reader who assumes exit 0 means full
  coverage will not check, and will be wrong.
- **The ratchet is the point.** One large fill run is not the goal; a threshold that goes up
  quarterly is.

## Where it goes next

[`cuj-gate-metadata-in-ci`](gate-metadata-in-ci.md) to enforce the new line, and — for Ines —
[`cuj-model-concepts`](model-concepts.md), since machine-proposed concepts still have to fit a
governed vocabulary.
