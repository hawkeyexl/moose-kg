---
id: cuj-section-granularity
type: cuj
title: Put metadata on the heading that owns the text
personas:
  - persona-information-architect
trigger: >-
  a long page covers several variants or topic types, so any document-level tag on it is
  false for part of the page
entry_point: /dockg/model/sections/
success_criteria: >-
  Section nodes carry their own metadata, a scoped query returns sections rather than whole
  documents, and a kg.sections key that matches no heading is reported rather than ignored.
steps:
  - stage: orient
    doc: /dockg/concepts/granularity/
    exists: false
    note: "[GAP] Node granularity must match content granularity, and what it costs when it does not."
  - stage: act
    doc: /dockg/model/sections/
    exists: false
    note: "[GAP] The slug-keyed kg.sections map; how a heading becomes a GitHub-style slug."
  - stage: act
    doc: /dockg/model/sections/
    exists: false
    note: "[GAP] Explicit-only: sections inherit nothing from the document. State it early and plainly."
  - stage: verify
    doc: /dockg/model/sections/
    exists: false
    note: "[GAP] Query a section IRI; show the fragment resolving to an exact span on disk."
  - stage: verify
    doc: /dockg/fix/
    exists: false
    note: "[GAP] brokenSectionRef: a sections key matching no heading, usually a renamed heading."
  - stage: extend
    doc: /dockg/reference/frontmatter/
    exists: false
    note: "[GAP] Which keys are permitted per section, and which are meaningless there."
---

Ines pushes metadata down to the heading that actually owns the text.

## The journey

A forty-page document tagged as one node is a lie about most of its content. This journey is the
fix, and it comes from a principle worth stating before the mechanics: **content granularity must
match node granularity.** Every node should index exactly the text it owns, and no more.

The reader arrives already believing this — it is a standing complaint in their profession — so
the page does not need to argue for it. It needs to show the mechanism and be exact about three
rules that are easy to get wrong.

## The three rules

1. **The map is keyed by heading slug.** Keys are GitHub-style slugs of the heading text, which
   means the key is derived from prose the writer may edit without thinking about metadata.
2. **Nothing is inherited.** Section metadata is explicit-only: a section does not pick up the
   document's `appliesTo` or `topicType`. This surprises people, and it is the right default —
   inherited applicability would silently re-create the document-level lie at section level. Say
   it early, in bold, before the examples.
3. **Not every key is meaningful per section.** `prefLabel` and the SKOS hierarchy are document
   concerns; a section carries typing, applicability, subjects, and their negative forms. The
   reference page should mark the boundary rather than leaving it to be inferred from an example.

## The failure mode that defines the journey

Someone renames a heading. The slug changes. The `kg.sections` key now matches nothing, and the
metadata that was protecting that section silently stops applying.

dockg reports this as `dockg:brokenSectionRef` rather than ignoring it — which is the entire
reason section metadata is safe to rely on. That link between "keys are derived from editable
prose" and "so the tool tells you when they stop matching" should be made explicitly on the page,
because it is the answer to the objection this reader will raise.

## Design note

A section IRI is the document IRI plus the heading slug as a fragment, so it resolves to an exact
span on disk. That is what makes *route with the graph, then read the text* work at section
granularity, and it is worth demonstrating once rather than asserting.

## Where it goes next

[`cuj-prove-coverage`](prove-coverage.md), since coverage measured at document level over a
section-annotated corpus will understate what is actually there.
