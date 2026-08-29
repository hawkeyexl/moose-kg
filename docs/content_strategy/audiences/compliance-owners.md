---
id: aud-compliance-owners
type: audience
segment: Regulated documentation owners
maturity: documentation is already an audited deliverable; evidence is produced manually
docs_owner: compliance, regulatory affairs, or quality documentation owner
status: core
firmographics:
  - documentation is a regulated deliverable, not a courtesy
  - an external or internal auditor periodically asks who wrote what, when, and from what
  - AI-assisted authoring is in use, and its output must be distinguishable from human work
  - coverage obligations exist per product variant, and gaps are findings
  - evidence is currently assembled by hand from git history and spreadsheets
relationship_stages:
  - evaluating: can this produce audit evidence without a new system of record?
  - adopting: turning coverage and contradiction obligations into a gate someone else runs
  - operating: producing the same evidence, reproducibly, at every audit
personas:
  - persona-compliance-owner
evidence_basis:
  - the PROV-O surface — qualified attribution and association with role individuals (ADR 01002), collision-proof provenance IRIs and per-model fill attribution (ADR 01003), agent IRIs segmented by PROV agent kind (ADR 01004)
  - ADR 01015 (fill proposes all fields, gated by model confidence) plus the kg.provenance frontmatter block with per-field confidence — a machine-vs-human authorship record
  - ADR 01011 (metadata coverage in dockg stats, gated by per-field thresholds) and the --check exit-1 contract
  - the sh:disjoint contradiction checks between applies-to and not-applicable-to in shapes/dockg-0.5.ttl
  - the determinism contract itself — reproducible output is what makes graph-derived evidence admissible rather than anecdotal
---

The person who has to answer an auditor, using documentation someone else wrote.

## What they own

The obligation, not the pipeline. They are accountable for the documentation being complete,
attributable, and internally consistent — and they usually cannot write a CLI invocation to
prove it. Today the evidence is assembled by hand: git blame, a spreadsheet of which topics
cover which variant, and a meeting.

They bring regulatory context and evidence standards. They do **not** bring CLI comfort. They
consume reports and JSON, and they want gates that **other people** run and cannot quietly skip.

## What they want

Four questions, answered without a manual audit:

1. **Who wrote this, when, and from what?** PROV-O qualified attribution with role individuals
   gives a real answer rather than a git log they must interpret.
2. **Which parts were machine-generated?** As soon as AI-assisted authoring enters a regulated
   corpus, "did a human write this?" becomes a finding. dockg's `kg.provenance` block records
   which model proposed which fields at what confidence, per model, and humans delete entries as
   they review them — so the block itself is the review queue.
3. **Is every variant covered?** Coverage thresholds per field, gated by `stats --check`,
   convert a spreadsheet into a build failure.
4. **Does anything contradict itself?** A topic claiming both "applies to X" and "does not apply
   to X" is exactly the defect an audit finds and a human reviewer does not. SHACL disjointness
   catches it every build.

## Why determinism matters more to them than to anyone else

For every other audience, byte-identical rebuilds are a nice property that makes diffs clean.
For this audience it is the thing that makes the output **evidence**. A report that changes
between runs over unchanged inputs cannot be submitted; one that does not can be regenerated in
front of an auditor. Any page written for this persona should make that connection explicitly,
because it is not obvious from the outside that a docs tool would care.

## What makes them hard to serve

They are the audience least able to act on what they read. Every journey they have ends in
someone else running something — so their pages have to be written so they can be *handed to*
an engineer, and their success criteria have to be phrased as artifacts to receive rather than
commands to run. A page that assumes this reader will open a terminal has misjudged them.

## Where the docset serves them

The `govern/` track, shared with [`aud-docs-as-code-teams`](docs-as-code-teams.md), who
implement what this audience requires. See
[`persona-compliance-owner`](../personas/compliance-owner.md) and journeys
[`cuj-audit-provenance`](../journeys/audit-provenance.md) and
[`cuj-prove-coverage`](../journeys/prove-coverage.md).
