---
id: cuj-model-concepts
type: cuj
title: Express my taxonomy as SKOS, and keep it cycle-free
personas:
  - persona-information-architect
trigger: >-
  a governed vocabulary exists in a spreadsheet, the docs drift from it, and nothing
  catches two writers spelling the same concept two ways
entry_point: /dockg/model/concepts-skos/
success_criteria: >-
  The vocabulary is expressed in frontmatter, the emitted concepts match the intended
  hierarchy, and check fails on a cycle, a broader/related conflict, or a second spelling.
steps:
  - stage: orient
    doc: /dockg/model/
    exists: false
    note: "[GAP] What dockg models and what it does not — a mapping, not a SKOS tutorial."
  - stage: act
    doc: /dockg/model/concepts-skos/
    exists: false
    note: "[GAP] prefLabel establishes the concept; altLabels/broader/narrower/related depend on it."
  - stage: verify
    doc: /dockg/model/concepts-skos/
    exists: false
    note: "[GAP] Inspect the emitted concept nodes with query; confirm IRIs converged as intended."
  - stage: verify
    doc: /dockg/govern/
    exists: false
    note: "[GAP] Run check: cycles, S27 broader/related conflicts, and the two-spellings warning."
  - stage: extend
    doc: /dockg/reference/shapes/
    exists: false
    note: "[GAP] Every rule the shapes enforce, its severity, and what error it is protecting against."
  - stage: extend
    doc: /dockg/reference/vocabulary/
    exists: false
    note: "[GAP] Which standard term each kg: key emits, with the published IRI."
---

Ines gets the vocabulary out of the spreadsheet and into the files, with enforcement.

## The journey

The vocabulary already exists and is not in question. What is in question is whether the
documentation agrees with it — and today nothing checks, so it does not.

The reader is an expert in the semantics and a novice at the mechanics, which inverts the usual
page design. **This journey must not teach SKOS.** It must show the mapping: which frontmatter
key becomes which triple, what dockg does when two labels slugify to the same concept, and which
rules are enforced at which severity. A page that explains what `skos:broader` means wastes their
time; one that gets it subtly wrong loses their trust permanently.

## What they need to reach, in order

1. **The mapping table.** `prefLabel` establishes the concept this document is primarily about;
   `altLabels`, `broader`, `narrower`, and `related` describe it. This is the whole surface, and
   it is small — say so, because they are braced for more.
2. **The dependency rule.** The four relationship fields require `prefLabel`, enforced in the
   schema and again in `fill`'s proposal gate. Without it there is no subject for the
   relationship to hang from.
3. **How concept IRIs converge.** Concepts are minted from slugified labels, so two spellings of
   the same term become the *same node* — which is usually what they want and occasionally a
   surprise. dockg reports the double-spelling case as a **warning, not a violation**, because
   convergence is a designed feature rather than a defect. That severity choice is worth
   explaining rather than just documenting.
4. **The enforcement catalog.** Cycles in `broader`/`narrower`, SKOS S27 conflicts between
   `related` and `broaderTransitive`, concepts missing a label or scheme, untyped relation
   targets. These are the errors their review process misses, and this list is the argument for
   the tool.
5. **Which findings block and which inform.** Violations exit 1, warnings and info exit 0. Ines
   will be specifying obligations for other people, so they need to know what will actually stop
   a build.

## Design notes

- Cycle detection and transitive SKOS checks run in TypeScript because core SHACL cannot express
  them. Worth a sentence: it explains why the checks exist despite not appearing in the shapes
  file, and this reader is precisely the one who would go looking.
- Every finding maps back to the responsible document, which is what makes the output actionable
  for a person who did not write the offending page.

## Where it goes next

[`cuj-scope-by-variant`](scope-by-variant.md) — concepts answer *what this is about*,
applicability answers *what it applies to*, and the second is where the expensive mistakes live.
