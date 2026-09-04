---
id: cuj-audit-provenance
type: cuj
title: Answer who wrote this, when, from what, and which model touched it
personas:
  - persona-compliance-owner
  - persona-docs-engineer
trigger: >-
  an auditor asks for authorship and derivation evidence, and today the answer is
  assembled by hand from git history and a meeting
entry_point: /dockg/govern/provenance/
success_criteria: >-
  A single reproducible command produces attribution, timing, derivation, and
  machine-authorship evidence for any document, and the same command produces the same
  answer next quarter.
steps:
  - stage: orient
    doc: /dockg/govern/
    exists: true
    note: "Which obligation maps to which mechanism. Written to be handed to an engineer."
  - stage: orient
    doc: /dockg/concepts/determinism/
    exists: true
    note: "Why reproducibility is what makes this evidence rather than an anecdote."
  - stage: act
    doc: /dockg/govern/provenance/
    exists: true
    note: "What is derived by default, what git adds, and the tri-state provenance.git setting."
  - stage: act
    doc: /dockg/govern/provenance/
    exists: true
    note: "Qualified attribution and association: agents, roles, and why they are separate nodes."
  - stage: act
    doc: /dockg/govern/provenance/
    exists: true
    note: "kg.provenance as the machine-authorship record and the human review queue."
  - stage: verify
    doc: /dockg/govern/provenance/
    exists: true
    note: "Query one document's full provenance; show the report an auditor would receive."
  - stage: extend
    doc: /dockg/reference/vocabulary/
    exists: true
    note: "The PROV-O term set dockg emits, and what each assertion does and does not prove."
---

Renata answers the authorship question without a manual audit.

## The journey

Renata does not run this. [`persona-docs-engineer`](../personas/docs-engineer.md) does, at
Renata's request. That shapes every page in the journey. **Success criteria are artifacts to
receive, not commands to run,** and the pages must be handable to an engineer without
translation. Showing the resulting report and naming the command that produced it serves both
readers. Showing only the command serves neither.

## What they need to reach, in order

1. **An obligation-to-mechanism map.** Renata thinks in requirements, such as *authorship must be
   attributable* and *machine-generated content must be identifiable*. Each one needs binding to
   something dockg actually produces. This table is the page that gets forwarded.
2. **Why determinism makes this evidence.** For everyone else, byte-identical rebuilds keep diffs
   clean. Here it is the difference between a submittable report and an anecdote: a report that
   changes between runs over unchanged inputs cannot be used. This connection is not obvious from
   outside and should be stated rather than implied.
3. **What is derived without asking, and what git adds.** Frontmatter authorship and dates come
   free. Committer history is a tri-state setting that can be required, attempted, or refused. A
   compliance reader specifically needs to know that "attempted" degrades with a warning and
   still exits 0. A degraded build that looks successful is an evidence gap.
4. **Qualified attribution, and why it is not just a name field.** Attribution and association
   are separate nodes carrying roles, so the graph distinguishes the person who authored, the
   tool that generated, and the model that proposed. That distinction is the answer to the
   AI-authorship question, and the reason the modeling beats a `creator` string.
5. **The `kg.provenance` block as a review queue.** Each entry names the model, the fields it
   proposed, and the per-field confidence. Humans delete entries as they clear them, so the
   block empties as review progresses. This is the single most useful thing to tell this reader
   about AI-assisted authoring. It reframes it from an audit liability into a tracked queue.

## What the evidence does not prove

Worth an explicit section, because overclaiming here is worse than underclaiming. dockg records
what the files and git history assert. It does not verify that the named author wrote the text.
A `kg.provenance` entry a human deleted without actually reviewing is indistinguishable
from one that was reviewed properly. The mechanism supports an audit; it does not replace one.

Stating this plainly protects the reader and the tool.

## Where it goes next

[`cuj-prove-coverage`](prove-coverage.md), since attribution and completeness are usually asked
for in the same conversation.
