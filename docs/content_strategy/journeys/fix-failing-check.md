---
id: cuj-fix-failing-check
type: cuj
title: Decode a failing check and fix my page
personas:
  - persona-doc-contributor
trigger: >-
  a pull request is red because of a dockg finding, and the reader has never seen this
  tool before
entry_point: /dockg/fix/
success_criteria: >-
  The reader identifies which of their frontmatter caused the failure, applies a fix,
  and merges — without reading anything about knowledge graphs.
anchor: true
highest_traffic: true
steps:
  - stage: trigger
    doc: /dockg/fix/
    exists: false
    note: "[GAP] Must work cold, as the landing page for a link in CI output. No prior context."
  - stage: orient
    doc: /dockg/fix/
    exists: false
    note: "[GAP] Error-line anatomy, part by part: which is the file, the field, the rule."
  - stage: orient
    doc: /dockg/fix/
    exists: false
    note: "[GAP] Whose fault is it: exit 1 is your page, exit 2 is the pipeline. Hand it back."
  - stage: act
    doc: /dockg/fix/
    exists: false
    note: "[GAP] Common-failures catalog, each fix shown as a frontmatter diff."
  - stage: act
    doc: /dockg/fix/
    exists: false
    note: "[GAP] One reproduce-locally command, or an honest statement that pushing is faster."
  - stage: extend
    doc: /dockg/fix/faq/
    exists: false
    note: "[GAP] Question-shaped headings for the cases that are not schema failures."
---

Sam's pull request is red and they want to merge.

## The journey

This will be the most-read track in the docset, by the people who care about it least. It is the
destination of every error message dockg emits and every gate the other personas install.

Two properties define it, and both are unusual:

**It must work cold.** This page is the landing page for a link in machine output. No "as we saw
above", no assumed installation, no assumed config knowledge, and no assumption that the reader
knows what dockg is. Every other track can assume arrival from the top; this one cannot.

**Success is a short visit.** The reader leaving quickly is the goal, not a failure of
engagement. The temptation to route them into the concepts track should be resisted — one link
out, at the bottom, is enough.

## What they need, in order of how fast it helps

1. **Error-line anatomy.** Which part is the file, which is the field, which is the rule that
   fired. A part-by-part table does more here than any amount of prose.
2. **Whose fault is it.** Exit 1 means a finding in their page. Exit 2 means the pipeline is
   broken and they should hand it back rather than debug it. Getting this wrong costs an
   escalation in both directions, and it is the single highest-leverage sentence on the page.
3. **A catalog of common failures**, each with the fix shown as a diff on frontmatter. This
   reader scans for the shape that matches theirs and copies it — so the catalog should be
   organized by what the error *looks like*, not by which subsystem produced it.
4. **Reproduce locally, or don't.** One command if it is genuinely one command; an honest
   statement that setting up locally is slower than pushing a fix if that is the truth. Pretending
   local reproduction is easy when it is not wastes the visit.

## The failures this catalog has to cover

Drawn from what dockg actually emits, not from what seems likely:

- A required frontmatter field missing, or the wrong type.
- A `kg` relationship field used without `prefLabel`, which the schema requires as its subject.
- A value outside a closed vocabulary — `topicType`, `softwareLifecyclePhase`, `softwareSubject`.
- A `kg.sections` key matching no heading, usually because someone renamed the heading.
- A `broader`/`narrower` cycle, or a `related` conflict, introduced by one page in a chain.
- An `appliesTo` and `notApplicableTo` contradiction on the same node.
- A broken internal link or an unresolvable derivation target.
- Exit-2 cases they should hand back: TOML or JSON frontmatter, a missing graph, git unavailable
  under a required provenance setting.

The last group deserves visual separation from the rest. It is the difference between "fix your
page" and "this is not your problem."

## Design note

The graph-level findings — cycles, conflicts — are the hard case for this persona, because the
violation may be *caused* by a page they did not touch. The catalog entry has to say so and give
them somewhere to escalate, rather than implying their page is wrong.

## Where it goes next

Nowhere, ideally. One link to the landing page at the bottom, for the reader who turns out to be
curious.
