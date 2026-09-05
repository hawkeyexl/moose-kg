---
id: cuj-first-graph
type: cuj
title: Get a graph out of my repo and understand what it says
personas:
  - persona-docs-engineer
trigger: evaluating dockg against an existing Markdown docs repo, with no config file
entry_point: /dockg/get-started/
success_criteria: >-
  A graph file exists, the reader can name what each part of it came from, and they
  can rebuild it byte-identically. They have not had to learn RDF to get here.
anchor: true
steps:
  - stage: orient
    doc: /dockg/
    exists: true
    note: "Landing router plus a 30-second proof — one command and its real output."
  - stage: act
    doc: /dockg/get-started/
    exists: true
    note: "Install, run build with no config file, read the docs-and-triples line."
  - stage: verify
    doc: /dockg/get-started/
    exists: true
    note: "Same page: run build twice and diff. Determinism proved, not asserted."
  - stage: orient
    doc: /dockg/concepts/index-not-corpus/
    exists: true
    note: "Answers the first question every reader asks — why is my prose not in here?"
  - stage: act
    doc: /dockg/build/
    exists: true
    note: "What each of the seven derive sources reads, and how to turn one off."
  - stage: verify
    doc: /dockg/build/
    exists: true
    note: "Read the corpus back with stats: counts, orphans, broken links, coverage."
  - stage: extend
    doc: /dockg/reference/configuration/
    exists: true
    note: "Inputs, exclude, out — the first three keys anyone changes."
  - stage: extend
    doc: /dockg/reference/cli/
    exists: true
    note: "The command surface, once the reader wants a flag the on-ramp did not show."
---

Priya points dockg at a repo they already have, and finds out what it knows.

## The journey

This is the **anchor journey of the whole docset.** Every other journey assumes a graph exists,
and this is the one that produces it. If it fails, nothing downstream is reachable.

The reader arrives skeptical, usually having been promised low-effort metadata before. They need
to reach a real artifact in a couple of minutes, from a repo they did not prepare, without
writing a config file. dockg's defaults are built for exactly this. The hermetic derive sources
are all on, and a missing `dockg.config.yaml` is a supported state rather than an error. So the
journey's job is to not get in the way.

## What they need to reach, in order

1. **An artifact, fast.** `dockg build` over an unprepared repo, and the reported document and
   triple count.
2. **An explanation of what they are looking at.** Pitch it at "this line came from your
   heading, this one from your frontmatter `title`, this one from a link in your prose." Not at
   the level of subject-predicate-object theory.
3. **The boundary.** Prose is not in the graph, and that is deliberate. This question arrives
   unprompted within about thirty seconds of opening the Turtle file, and leaving it unanswered
   makes the tool look broken rather than designed.
4. **Proof of the determinism claim**, by running it twice. It costs one command and converts a
   marketing sentence into an observation.
5. **A reading of their own corpus** via `stats`. That is where evaluation actually turns into
   interest, because the numbers are about their content.

## The constraint

**No RDF vocabulary is required to complete this journey.** Turtle is shown, because it is the
product and hiding it would be strange. But the reader must be able to get from arrival to
`stats` without needing to know what a triple, an IRI, or a namespace prefix is. Terms may be
*offered*, as a link into the `concepts/` track, but never required.

This is the constraint from [`persona-docs-engineer`](../personas/docs-engineer.md), and it is
the reason the concepts track sits beside the on-ramp rather than inside it.

## Failure modes to design against

- The reader opens `graph.ttl`, does not find their sentences, and concludes the tool did not
  work. Mitigated by making the index-not-corpus page reachable from the first output.
- The first run needs a config file. It must not.
- The sample output does not match what their terminal prints. Determinism removes any excuse;
  capture output from a committed fixture.

## Where it goes next

[`cuj-map-site-routes`](map-site-routes.md) when their site's links do not resolve, or
[`cuj-gate-metadata-in-ci`](gate-metadata-in-ci.md) once they want the numbers enforced. A
brownfield corpus goes to [`cuj-backfill-metadata`](backfill-metadata.md) instead, and should be
routed there explicitly from the coverage output.
