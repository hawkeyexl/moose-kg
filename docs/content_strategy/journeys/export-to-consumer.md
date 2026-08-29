---
id: cuj-export-to-consumer
type: cuj
title: Get the graph into JSON-LD or an iiRDS package
personas:
  - persona-ai-platform-engineer
  - persona-information-architect
trigger: >-
  a downstream system — a triple store, a content delivery portal, a partner's ingest —
  needs the graph in a format that is not Turtle
entry_point: /dockg/retrieve/export/
success_criteria: >-
  The exported artifact loads in the target system, is byte-identical across rebuilds, and
  the reader knows which parts of the graph each format carries and which it drops.
steps:
  - stage: orient
    doc: /dockg/retrieve/export/
    exists: true
    note: "Three formats, three consumers: jsonld, iirds, search. Pick by destination."
  - stage: act
    doc: /dockg/retrieve/export/
    exists: true
    note: "Export to JSON-LD; note the -f flag here selects format, unlike everywhere else."
  - stage: act
    doc: /dockg/retrieve/export/
    exists: true
    note: "Export an iiRDS package; the metadata.rdf and rendition structure inside the zip."
  - stage: verify
    doc: /dockg/retrieve/export/
    exists: true
    note: "Rebuild and compare bytes; projection warnings go to stderr and do not fail the run."
  - stage: extend
    doc: /dockg/reference/vocabulary/
    exists: true
    note: "Package-only terms that appear in an iiRDS export but never in the built graph."
  - stage: extend
    doc: /dockg/ns/
    exists: true
    note: "What each dockg: term means, for a consumer that hit one and needs a definition — the RDFS document the namespace IRI resolves to, machine-readable at /dockg/ns.ttl."
  - stage: extend
    doc: /dockg/reference/library-api/
    exists: true
    note: "For a consumer wiring export into a Node pipeline rather than shelling out to the CLI."
---

Kwame or Ines hands the graph to a system that does not speak Turtle.

## The journey

Shared between two personas with different destinations. Kwame is feeding a triple store,
a search backend, or an ingest endpoint and wants JSON-LD. Ines is producing an iiRDS package
because a partner, a content delivery portal, or a contractual obligation requires one. The
mechanics overlap enough to be one journey; the framing has to serve both without pretending they
want the same thing.

## What they need to reach, in order

1. **Pick by destination, not by preference.** Three formats, three consumers: `jsonld` for
   anything RDF-native, `iirds` for a standards-conformant package, `search` for the lexical
   index the runtime consumes. A one-line decision table does more work here than description.
2. **The flag trap.** On `export`, `-f/--format` selects the *export format*; on every other
   command it selects output rendering. This will bite someone, and it costs one sentence to
   prevent.
3. **What each format carries and what it drops.** A projection is lossy by definition, and
   projection warnings go to stderr without failing the run — so a reader who does not check
   stderr will not know something was dropped. That is worth an explicit callout.
4. **Determinism across formats.** JSON-LD is emitted by a hand-rolled deterministic serializer,
   and the iiRDS package is a deterministic zip, precisely so exports diff and can be pinned. For
   Kwame this means cacheable artifacts; for Ines it means a package that can be resubmitted
   identically.

## The iiRDS licensing note

iiRDS is CC BY-ND. dockg only *references* published IRIs — it never vendors, re-serializes, or
modifies the vocabulary, and the IRIs in the source are byte-verified against the consortium's
published models.

Ines may need to state this to a legal or standards reviewer, so it should appear somewhere
quotable rather than only as an implementation note. It is also a differentiator worth being
plain about: tools that copy the vocabulary into their own namespace create an obligation their
users inherit.

## Design note

Package-only terms exist — the iiRDS package's `metadata.rdf` carries classes and properties that
never appear in the built graph. A reader comparing the export to the Turtle will notice the
difference and should find it explained rather than have to work it out.

## Where it goes next

Back to [`cuj-serve-retrieval`](serve-retrieval.md) if the destination turns out to be dockg's own
runtime after all, which is the common discovery for a reader who arrived wanting JSON-LD.
