---
status: accepted
date: 2026-07-24
decision-makers: [manuel.r.b.silva]
---

# iiRDS package export (unrestricted, deterministic)

## Context and Problem Statement

Phase 6 shipped JSON-LD export. The export arc's other target is the format
tekom's ecosystem actually ingests: an **iiRDS package** — a ZIP (`.iirds`)
carrying `META-INF/metadata.rdf` (RDF/XML) plus the source content files exposed
as `iirds:Rendition`s. This is what lets a Content Delivery Portal consume
dockg's graph, and it is the payoff of the Phase 2 iiRDS mapping: the
classification dockg already derives (topic-type, subject, product-variant,
lifecycle-phase) lands in the package metadata rather than staying trapped in a
Turtle file. `dockg export --format iirds` has existed as a stub since Phase 6;
this makes it real.

The hard question is scope and conformance: which iiRDS variant to target, what
plays the content role, and how to keep the package inside dockg's determinism
contract (byte-identical rebuilds).

## Decision Drivers

- **Achievability without a content pipeline.** dockg has markdown sources and a
  graph; it has no PDF/A or XHTML5 renderer.
- **Conformance.** The package must validate against the iiRDS rules (anchored to
  the plusmeta iiRDS Validation Tool, the de-facto gate).
- **Determinism is the product contract.** Two exports over an unchanged graph
  must be byte-identical — no wall clock, no blank nodes, no random UUIDs.
- **No heavy dependencies.** dockg hand-rolls its serializers so formatting is
  controlled; it has no ZIP or XML library and should not grow one.
- **The "support everything optional" mandate** — enrichment (title, creator,
  product) should be possible, but absence must still yield a valid package.

## Considered Options

1. **Unrestricted iiRDS 1.3**, markdown-source renditions, hand-rolled RDF/XML +
   ZIP, optional `export.iirds` config for enrichment.
2. **iiRDS/A** (archiving) — needs self-contained PDF/A or a constrained
   iiRDS-XHTML5 content profile, i.e. a markdown→XHTML5/PDF converter.
3. **iiRDS/H** (handover, VDI 2770) — needs PDF/A per Document, a root
   `index.html`, a mandatory JSON-LD twin, and mandatory Creator `Party` +
   `ProductVariant` + `Identity` metadata.
4. **A ZIP/RDF library** (`jszip`, `rdflib`) instead of hand-rolling.

## Decision Outcome

Chosen: **option 1 — unrestricted iiRDS 1.3, hand-rolled**.

Research against the spec and the validator's own `min_requirements.rdf` pass
fixture established that unrestricted iiRDS has a **thin** mandatory metadata set:
one `iirds:Package` with exactly one `iirds:iiRDSVersion`; information units as
subclasses with IRIs (no blank nodes) linked via `iirds:is-part-of-package`
(dockg types each document `iirds:Topic`, the subclass that carries the Phase-2
`has-topic-type`/`has-subject` classification); and each content file as an
`iirds:Rendition` with
`iirds:source` + `iirds:format`. Creator `Party` and `ProductVariant`/`Identity`
are **iiRDS/H-only** MUSTs — optional here. Unrestricted also permits any content
format, so the raw markdown source ships directly as `text/markdown`, with no
renderer.

Three new hand-rolled, deterministic pieces mirror the existing emitters:
`src/core/zip.ts` (`writeZip` — `mimetype` first + stored, others deflated via the
native `zlib`, zeroed DOS timestamps, fixed entry order), `src/core/emit-rdfxml.ts`
(`emitRdfXml(quads, prefixes)` — sorted `rdf:RDF`, no blank nodes, XML-escaped),
and `src/core/iirds-package.ts` (`projectPackage` — the graph→iiRDS projection).
An optional `export.iirds` config block (`title`, `creator`, `version`) adds a
package title, a Creator `iirds:Party`→`vcard:Organization`, and the version
literal; absent, the package is still minimally valid.

Determinism holds end to end: deterministic IRIs (baseIri-derived, never a random
UUID), sorted RDF/XML, zeroed ZIP metadata, fixed entry order.

### Consequences

- Good: a conformant, semantically rich iiRDS package with zero new runtime
  dependencies and the same determinism guarantees as the Turtle/JSON-LD output.
- Good: the `export` command's `--format` surface is now fully populated
  (`jsonld` + `iirds`).
- Neutral: three more serializers to maintain (ZIP, RDF/XML, projection); covered
  by unit + golden + double-build regression gates.
- Bad: `iirds:A`/`iirds:H` remain out of reach until dockg grows a content
  pipeline. Explicitly deferred.

### Confirmation

- Unit tests: `writeZip` (mimetype stored-first, deflate round-trip, entry order,
  double-write identity); `emitRdfXml` (sorted, escaped, well-formed);
  `projectPackage` (Package/Document/Rendition/classification, creator config,
  missing-file error, n3 round-trip of the projected quads).
- Integration: `dockg export --format iirds` over the corpus — `mimetype` first,
  `META-INF/metadata.rdf` matches a text golden, content files present,
  double-export byte-identical.
- The Turtle and JSON-LD goldens are untouched; the built graph, `dockg check`,
  and the frontmatter schema are unaffected (the package is a projection).

## Pros and Cons of the Options

### Option 1 — unrestricted 1.3, hand-rolled

- Good: achievable now; conformant; deterministic by construction; no deps.
- Good: markdown ships as-is — no renderer, no determinism risk from HTML output.
- Bad: not archival/handover-grade (no PDF/A).

### Option 2 — iiRDS/A

- Good: archival-grade, self-contained.
- Bad: requires a markdown→PDF/A or iiRDS-XHTML5 converter dockg doesn't have.

### Option 3 — iiRDS/H

- Good: VDI 2770 handover conformance.
- Bad: largest scope — PDF/A pipeline, mandatory JSON-LD twin, mandatory
  Party/Product/Identity. Far beyond this phase.

### Option 4 — ZIP/RDF library

- Good: less code to own.
- Bad: library output order/formatting is not a stability contract; pinning
  determinism means post-processing anyway — most of the hand-rolled work plus a
  dependency. Consistent with the Turtle/JSON-LD emitter precedent to avoid.
