---
id: cuj-scope-by-variant
type: cuj
title: Type topics with iiRDS and scope them by product variant
personas:
  - persona-information-architect
trigger: >-
  documentation covers several products or model lines, and "does this topic apply to
  variant X?" is currently answered by the absence of a tag — which is not an answer
entry_point: /dockg/model/variants/
success_criteria: >-
  Topics carry a standard topic type and explicit applicability, a variant-scoped
  traversal returns the right set, and a topic that claims both applies and does-not-apply
  fails check.
steps:
  - stage: orient
    doc: /dockg/concepts/open-world/
    exists: false
    note: "[GAP] Absence means unknown, not excluded. The single most consequential page for this reader."
  - stage: act
    doc: /dockg/model/variants/
    exists: false
    note: "[GAP] topicType, appliesTo, softwareLifecyclePhase, softwareSubject — values and emitted IRIs."
  - stage: act
    doc: /dockg/model/variants/
    exists: false
    note: "[GAP] notApplicableTo and notSoftwareSubject: when the stronger claim is required."
  - stage: verify
    doc: /dockg/model/variants/
    exists: false
    note: "[GAP] traverse --variant to prove the scoped set is right, including what it excludes."
  - stage: verify
    doc: /dockg/govern/
    exists: false
    note: "[GAP] check catches an appliesTo/notApplicableTo contradiction via sh:disjoint."
  - stage: extend
    doc: /dockg/reference/vocabulary/
    exists: false
    note: "[GAP] The full iiRDS Core and Software-domain term set dockg references, with IRIs."
---

Ines makes applicability explicit, including the part that has to be said out loud.

## The journey

This is the journey the whole taxonomy exists to serve, and the one where the expensive mistakes
live. An interlock, a safety caution, or a regulatory statement scoped to the wrong variant is
not a metadata problem; it is the reason the metadata program is funded.

Two things make it hard, and both are semantic rather than mechanical.

## The open-world problem, which comes first

**Absence of `appliesTo` means unknown, not "does not apply."** A query that treats untagged
topics as excluded will silently return a set that is wrong in the dangerous direction, and it
will look right — the results are plausible, the count is reasonable, and nothing errors.

This is why the journey's first step is a concepts page rather than a modeling page. A reader who
starts writing `appliesTo` values without this framing will build a scoping scheme that fails
exactly when it matters. The mitigation is dockg's negative predicates: when the stronger claim
is true, say it explicitly with `notApplicableTo`, and query the negative edge rather than
inferring from silence.

## The recognition problem, which comes second

Ines will judge the tool by whether its vocabularies are real. dockg's `topicType`,
`softwareLifecyclePhase`, and `softwareSubject` are closed sets bound to **published iiRDS
IRIs** — referenced, never vendored or re-serialized. Showing the emitted IRI beside the
frontmatter value is the credibility moment for this reader, and it is cheap to do.

## What they need to reach, in order

1. Open-world semantics, before any modeling advice.
2. The four typing keys, their permitted values, and the exact IRI each emits.
3. The negative predicates, and the rule that they are for explicit exclusion — not for
   tidiness, and not as a default.
4. A scoped traversal that proves the set, including a demonstration of what was excluded and
   why. Verifying only what came back misses the failure this journey exists to prevent.
5. The contradiction check: a node carrying both `appliesTo: X` and `notApplicableTo: X` is a
   violation via SHACL disjointness. This is the defect a human reviewer does not catch and an
   auditor does.

## Design note

`traverse` fails loudly on an unknown variant rather than returning an empty set, because an
unresolvable filter would silently return exactly what it was meant to exclude. That is the same
open-world hazard in a different place, and pointing at the connection makes both easier to
remember.

## Where it goes next

[`cuj-section-granularity`](section-granularity.md), because document-level applicability is a
lie on any page long enough to cover more than one variant.
