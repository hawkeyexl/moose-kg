---
id: cuj-gate-metadata-in-ci
type: cuj
title: Make missing or broken metadata fail a pull request
personas:
  - persona-docs-engineer
trigger: >-
  metadata quality is visible in stats but nothing enforces it, so it decays between
  reviews exactly like every previous attempt
entry_point: /dockg/govern/ci/
success_criteria: >-
  A pull request with a metadata regression goes red, the failure names the responsible
  file, and a contributor who has never seen dockg can fix it without asking Priya.
steps:
  - stage: orient
    doc: /dockg/govern/
    exists: false
    note: "[GAP] Which of the three gates catches what: validate per file, check whole graph, stats thresholds."
  - stage: orient
    doc: /dockg/reference/output-and-exit-codes/
    exists: false
    note: "[GAP] The 0/1/2 contract is what carries the integration; it must be understood before wiring."
  - stage: act
    doc: /dockg/govern/ci/
    exists: false
    note: "[GAP] A complete GitHub Actions workflow, plus a step to add to an existing one."
  - stage: act
    doc: /dockg/govern/coverage/
    exists: false
    note: "[GAP] Set the first coverage threshold below current coverage so the gate holds the line."
  - stage: verify
    doc: /dockg/govern/ci/
    exists: false
    note: "[GAP] Open a PR that regresses metadata on purpose and watch it fail."
  - stage: extend
    doc: /dockg/fix/
    exists: false
    note: "[GAP] The gate's failure message must link here — this is the contributor's destination."
---

Priya turns metadata quality from a review comment into a build failure.

## The journey

Every previous metadata effort this reader tried decayed because nothing enforced it. This
journey is where dockg either becomes permanent or becomes another abandoned convention, and it
is the point at which the tool starts affecting people other than Priya.

The mechanics are small — three commands and an exit code contract. The judgment is not: **which
gate, at what strictness, failing whose pull request.** A gate that is too strict on day one gets
disabled; one that never fails teaches everyone to ignore it.

## What they need to reach, in order

1. **Which gate catches what.** Three distinct layers, and picking wrongly wastes a week:
   `validate` checks each file's frontmatter against a JSON Schema; `check` validates the
   *assembled* graph against SHACL, catching cross-document problems no per-file check can see;
   `stats --check` gates on broken links and coverage thresholds. They are complementary, and
   most teams eventually run all three.
2. **The exit-code contract**, because it is what carries the integration. The counter-intuitive
   parts matter here: `check` warnings are exit 0, `build` warnings are exit 0, and `stats` only
   gates when `--check` is passed. A reader who assumes any finding fails the build will wire it
   wrong and conclude the gate does not work.
3. **A workflow they can paste**, in both shapes — a standalone job, and a step added to a
   workflow that already exists. The second is the common case and is usually the one omitted.
4. **A first threshold set below current coverage.** This is the single most important piece of
   advice in the journey and the least obvious: the threshold's job at first is to hold the line,
   not to express the goal. See [`cuj-backfill-metadata`](backfill-metadata.md) for the ratchet.
5. **A deliberate failure**, to confirm the gate does what they think before they rely on it.

## The handoff that makes or breaks this

The gate's output is read by [`persona-doc-contributor`](../personas/doc-contributor.md), who has
no context at all. If the failure does not name the file and link somewhere actionable, every
failure becomes a question for Priya — and a gate that generates support load gets removed.

So this journey is only complete when [`cuj-fix-failing-check`](fix-failing-check.md) exists and
the failure output points at it. The two journeys ship together or neither works.

## Where it goes next

[`cuj-prove-coverage`](prove-coverage.md) when the requirement is external rather than
self-imposed, and [`cuj-audit-provenance`](audit-provenance.md) when attribution joins coverage
as an obligation.
