---
id: persona-compliance-owner
type: persona
name: Renata
audience: aud-compliance-owners
role: Regulatory or quality documentation owner accountable for audit evidence
proficiency:
  - specifies evidence requirements and defends them to an auditor
  - reads a report and finds the gap in it quickly
  - distinguishes a finding from an observation
  - writes obligations that other teams must implement
prerequisites:
  - the regulatory framework their documentation is audited against
  - the product variant structure and its coverage obligations
  - enough git literacy to read a history someone else exports
  - no CLI fluency is assumed
goals:
  - answer who wrote this, when, and from what — without a manual audit
  - separate machine-generated content from human-authored content
  - prove every variant is covered, per field, with a number
  - catch self-contradictory applicability before an auditor does
  - regenerate the same evidence, identically, on demand
pains:
  - evidence is assembled by hand from git blame and a spreadsheet
  - AI-assisted authoring arrived with no record of what it touched
  - coverage gaps are found by auditors rather than by the team
  - a report that changes between runs cannot be submitted
content_types:
  - obligation-to-mechanism mapping tables
  - report shapes with each field explained
  - requirements phrased so they can be handed to an engineer
  - explicit statements of what the evidence does and does not prove
journeys:
  - cuj-audit-provenance
  - cuj-prove-coverage
evidence_basis:
  - the PROV-O qualified attribution and association design in ADRs 01002, 01003, and 01004
  - the kg.provenance frontmatter block with per-field confidence (ADR 01015), which functions as a human review queue over machine output
  - ADR 01011's per-field coverage thresholds and the stats --check exit-1 gate
  - the sh:disjoint contradiction checks between applies-to and not-applicable-to in shapes/dockg-0.5.ttl
  - the determinism contract, which is what makes a generated report submittable rather than anecdotal
---

The person who has to prove the documentation is complete and attributable, using documentation
someone else wrote.

## Who they are

Renata is accountable for a documentation set that is a regulated deliverable. Periodically
someone external asks questions the team cannot answer quickly: who authored this procedure,
when was it last reviewed, what was it derived from, does every product variant have coverage
for this class of topic. Today the answers come from git history, a spreadsheet, and a meeting.

Two things have made this worse recently. The corpus grew past the point where manual coverage
tracking is honest, and AI-assisted authoring arrived without a record of what it touched.

## What they bring, and what they do not

**Bring:** the regulatory framework, evidence standards, the variant structure, and the
authority to make coverage an obligation on other teams.

**Do not bring:** CLI fluency. Renata does not open a terminal. They consume reports, JSON
someone else pipes to them, and CI results — and they specify gates that
[`persona-docs-engineer`](docs-engineer.md) implements.

**This changes how their pages must be written.** Every journey Renata has ends with someone
else running something. Their success criteria are artifacts to receive, not commands to run,
and their pages need to be handable to an engineer. A page that assumes this reader will run
`dockg query` has misjudged them; a page that shows the resulting report and names the command
that produced it has not.

## Why determinism is their headline, not a footnote

For every other persona, byte-identical rebuilds are a convenience that keeps diffs clean. For
Renata it is what makes the output **evidence**. A report that changes between runs over
unchanged inputs cannot be submitted; one that does not can be regenerated in front of an
auditor with the inputs on screen.

This connection is not obvious from outside — a documentation tool caring about reproducibility
looks like engineering fastidiousness until you are the one being audited. Pages for this
persona should make it explicit.

## The provenance block is a review queue

The most useful thing to tell Renata about `dockg fill` is not that it annotates a corpus. It is
that everything it writes is recorded in `kg.provenance` with the model that proposed it and the
confidence it had — and that **humans delete entries as they review them**. The block is the
outstanding-review list. That reframing turns AI-assisted authoring from an audit liability into
a tracked queue, which is exactly the answer they need.

## Their journeys

[`cuj-audit-provenance`](../journeys/audit-provenance.md) ·
[`cuj-prove-coverage`](../journeys/prove-coverage.md)
