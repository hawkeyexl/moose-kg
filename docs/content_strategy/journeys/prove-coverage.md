---
id: cuj-prove-coverage
type: cuj
title: Prove every variant and field has coverage, and nothing contradicts
personas:
  - persona-compliance-owner
  - persona-docs-engineer
trigger: >-
  coverage obligations exist per product variant and per metadata field, and gaps are
  currently found by auditors rather than by the team
entry_point: /dockg/govern/coverage/
success_criteria: >-
  Coverage is a number per field with a threshold behind it, a gap fails the build, a
  self-contradictory topic fails check, and the same report regenerates identically.
steps:
  - stage: orient
    doc: /dockg/govern/
    exists: false
    note: "[GAP] The obligation-to-mechanism map, shared with the provenance journey."
  - stage: act
    doc: /dockg/govern/coverage/
    exists: false
    note: "[GAP] The per-field coverage table; what counts as covered for each of the seven fields."
  - stage: act
    doc: /dockg/govern/coverage/
    exists: false
    note: "[GAP] Thresholds as a uniform number or a per-field map, and why per-field is usually right."
  - stage: act
    doc: /dockg/govern/coverage/
    exists: false
    note: "[GAP] Gate with stats --check. Without --check nothing fails, which surprises people."
  - stage: verify
    doc: /dockg/govern/
    exists: false
    note: "[GAP] check catches appliesTo/notApplicableTo contradictions the same build."
  - stage: extend
    doc: /dockg/build/backfill/
    exists: false
    note: "[GAP] When the gap is too large to close by hand — the brownfield route out."
---

Renata converts a coverage spreadsheet into a build failure.

## The journey

The obligation is external: some fraction of topics must carry a given field, some set of
variants must be covered, and a gap is a finding. Today that is tracked by hand and discovered
late.

Like [`cuj-audit-provenance`](audit-provenance.md), Renata specifies and Priya implements, so the
pages must work as something forwarded to an engineer.

## What they need to reach, in order

1. **What "covered" means per field.** Coverage is computed over seven specific fields, and a
   reader specifying an obligation needs to know exactly what is being counted before they can
   agree to a number. Ambiguity here produces a threshold nobody trusts.
2. **Uniform threshold versus per-field map.** A single number applies across all seven fields,
   which is almost never what a real obligation looks like — `title` at 100% and `prefLabel` at
   40% is a coherent policy, and one number cannot express it. The per-field map is config-only,
   so this decision has to be made in the config file rather than a flag.
3. **The `--check` requirement.** `stats` reports without gating; only `--check` makes it fail.
   This trips people, and it is a deliberate split — reporting and gating are different jobs.
4. **The contradiction check, in the same build.** A topic claiming both `appliesTo: X` and
   `notApplicableTo: X` is caught by SHACL disjointness. This is the defect a human reviewer does
   not catch and an auditor does, and it belongs in the coverage conversation even though it is a
   different command.
5. **A route out when the gap is too large.** If current coverage is far below the obligation,
   the answer is not a stricter threshold — it is
   [`cuj-backfill-metadata`](backfill-metadata.md) and a ratchet. Sending a reader from here to
   there is one of the more valuable links in the set.

## Two things to be careful about

- **The threshold's first job is to hold the line, not express the goal.** Set at the eventual
  target on day one, the build is permanently red and the team learns to ignore it. Set just
  below current coverage, it prevents regression immediately and can be raised. This advice is
  repeated from [`cuj-gate-metadata-in-ci`](gate-metadata-in-ci.md) deliberately — both readers
  need it and neither reliably reads the other's track.
- **An empty graph is vacuously 100% covered.** A gate that passes because nothing was ingested
  is worse than no gate, and a misconfigured `inputs` glob produces exactly that. Worth a caution
  next to the threshold advice.

## Where it goes next

[`cuj-audit-provenance`](audit-provenance.md), or [`cuj-backfill-metadata`](backfill-metadata.md)
when the gap is structural rather than incidental.
