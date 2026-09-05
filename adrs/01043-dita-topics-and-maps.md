---
status: accepted
date: 2026-08-31
decision-makers: hawkeyexl
---

# DITA topics and maps

## Context and Problem Statement

DITA is the third format in the [ADR 01041](01041-every-input-format-is-explicit.md) registry,
and the first that is not a document format in the sense the others are. It is an XML
architecture with a specialization mechanism, and it separates *content* (topics) from
*structure* (maps) as a matter of design.

That separation is the interesting part, and it is why DITA is worth supporting rather than
being folded into generic XML. A DITA corpus is a graph already: a map is a navigation tree of
references, and topics cross-reference each other by element. dockg's job is to read that graph
rather than invent one.

Four questions had to be answered:

- **How do sections nest?** DITA has no `h1`–`h6`. Structure is nesting: topics inside topics,
  `<section>` inside a topic's body. But the body wrapper (`<taskbody>`, `<conbody>`,
  `<refbody>`) sits between them and is not itself a section.
- **What does a `#topic/element` fragment address?** DITA's fragment syntax names the topic *and*
  the element within it. dockg's section IRIs are `doc#slug`.
- **What is a map?** It has references and a title, and no prose at all.
- **How are elements recognized?** DITA's whole point is specialization: a document set renames
  `<section>` to `<myProcedureStep>` and declares its ancestry in `@class`.

## Decision Drivers

- dockg reads structure, not semantics — but DITA *publishes* its structure in `@class`, so
  reading that is reading structure, not encoding tool knowledge.
- Determinism, as always. A third parser is a third chance to emit unstable output.
- ADR 01022's rule: a missing edge is a visible absence, a wrong edge is confident nonsense.
  Prefer the absence.
- A finding the author cannot act on is worse than no finding (ADR 01033).

## Considered Options

Section nesting: **(1a)** raw tree depth; **(1b)** depth counted over section-bearing elements
only.

Fragments: **(2a)** use the whole fragment as the anchor; **(2b)** use its last segment.

Maps: **(3a)** derive nothing, treating a map as not-a-document; **(3b)** links only, no
sections; **(3c)** links plus a section per `<topicref>`, mirroring the navigation tree.

Element recognition: **(4a)** tag names; **(4b)** `@class` ancestry, with tag names as fallback.

## Decision Outcome

Chosen: **1b, 2b, 3b, 4b.**

**1b — depth over section-bearing elements.** Counting raw tree depth would make every level
wrong by one *and* make it vary with which body wrapper a topic type uses, so a `<section>` in a
`<task>` and the same section in a `<concept>` would land at different levels for no reason a
reader could see.

**2b — the fragment's last segment is the anchor.** `install.dita#install/prereq` addresses
`<section id="prereq">`, and dockg minted `install.dita#prereq` for it. Taking the last segment
is right for both forms: a bare `#install` addresses the root topic, whose section slug is its
own `@id`. The link's `raw` value stays what the author wrote — a broken-link report naming a
target that appears nowhere in the source is unactionable.

**Scheme-bearing targets are exempt.** `topicid/elementid` describes fragments *inside a DITA
topic*, and applying it to every href — as this first did — corrupts external URLs whose
fragment merely happens to contain a slash:
`<xref href="https://example.com/docs#section/subsection" scope="external">` emitted
`dcterms:references <https://example.com/docs#subsection>`, a plausible IRI pointing at a
different anchor on a real site. That is a wrong assertion rather than a missing one, the
direction [ADR 01022](01022-parse-mdx-and-derive-from-jsx-attributes.md) rules out.

**3b — a map is links with no sections.** A map contains no prose, so giving it sections would
assert content that does not exist, and every one of those section nodes would index no text.
Option 3a was rejected because the map *is* the corpus's navigation structure, which is precisely
the information a "what points at this page" question needs. Option 3c was rejected because a
`<topicref>` is a reference, and modelling it as both a section and a reference would double-count
every edge in the corpus.

**4b — `@class` ancestry, tag names as fallback.** This is how a DITA processor identifies an
element, and it is published in the document itself: `class="- topic/section concept/section "`.
Matching tag names alone would work on textbook DITA and derive nothing at all from a real
specialized document set — which is most of them, since specialization is the reason
organizations choose DITA. Tag names remain the fallback because hand-written DITA routinely
omits `@class`, and `@class` wins wherever present so an element that merely shares a name with a
DITA base but declares different ancestry is not mistaken for it.

**`@conref`, `@conkeyref` and `@keyref` are not resolved.** Each is an indirection resolvable
only through a map or another topic, and dockg analyzes one file at a time. A keyref-only
reference therefore derives **no edge and no broken-link finding**. Both halves matter: the
missing edge is the conservative direction ADR 01022 established, and suppressing the finding is
required by ADR 01033, since blaming the author for dockg's limitation produces exactly the
unactionable finding that ADR was written to prevent. This is the largest known gap in DITA
support and is stated as such in the docs.

**Malformed XML is an operational error.** XML has no recovery mode, unlike HTML. @xmldom/xmldom
surfaces a problem two different ways — a fatal error *throws*, a well-formedness violation is
reported through a handler and leaves a partial tree — and both are converted. The throw has to
be, or it escapes `cli.ts`'s `fail()`, dumps a stack trace and exits 1, the code reserved for
findings; that is the same failure ADR 01022 closed for MDX. The non-throwing case matters more:
left alone, dockg would derive a plausible, complete-looking graph from a truncated file and say
nothing.

### Consequences

- Good: a DITA corpus derives sections, cross-topic anchors, images, code languages and its map's
  navigation edges, and indexes prose.
- Good: `<othermeta>` and `<shortdesc>` reach the graph as `type` and `dcterms:description`
  through docmeta's XML extractor, so DITA metadata participates in the harvest rule
  ([ADR 01024](01024-the-harvest-rule.md)) like any other page's.
- Neutral: no new predicates; the SHACL shapes are unchanged and the clean-corpus `dockg check`
  gate passes on the new fixture.
- Bad: keyref and conref indirection is invisible. A corpus that addresses most of its targets by
  key will derive far fewer edges than it has.
- Bad: `dockg fill --apply` refuses DITA. docmeta's XML extractor exposes `apply`, so writing
  into a `<prolog>` is reachable later.

### Confirmation

`test/unit/analyze-dita.test.ts` covers the derivation rules including the negatives — a keyref
deriving nothing, a specialized element recognized by `@class` alone, malformed XML naming the
file. `test/unit/dita-text.test.ts` opens with the slicer regression this work uncovered: prose
lives in text nodes on *either side* of an inline element, and an element-only walk indexed the
link text while throwing the sentence around it away, with nothing about the build failing.

`test/fixtures/formats/dita/` is a two-topic-and-a-map corpus with its own two goldens, held to
the determinism gates in `test/integration/formats-dita.test.ts`, plus the cross-topic fragment
resolution, the map's no-sections shape, `dockg check`, the search golden with a no-markup
backstop, and the exit-2 behavior on malformed XML.

Real-dependency exercise ([ADR 01026](01026-exercise-every-third-party.md)): @xmldom/xmldom is
called for real throughout, never mocked.

## Pros and Cons of the Options

### 1a. Raw tree depth

- Good: no bookkeeping.
- Bad: the body wrapper counts, so every level is off by one and differs between topic types.

### 1b. Depth over section-bearing elements (chosen)

- Good: levels mean what a reader expects and do not vary with the topic type.
- Bad: the walk has to carry a depth separate from its recursion depth.

### 2a. The whole fragment as the anchor

- Good: verbatim; nothing to explain.
- Bad: `#configuration/keys` matches no section IRI, so every element-level xref in a corpus —
  the normal way to link precisely in DITA — resolves to nothing.

### 2b. The fragment's last segment (chosen)

- Good: correct for both `#topic` and `#topic/element`.
- Bad: a topic and a section sharing an id in one file would collide. DITA requires ids unique
  within a file, so this is a malformed-input case, and the slug disambiguator handles it.

### 3a. Derive nothing from a map

- Good: nothing to get wrong.
- Bad: throws away the corpus's navigation structure, which is the most valuable thing a DITA
  corpus has to offer a graph.

### 3b. Links only (chosen)

- Good: asserts exactly what a map contains.
- Bad: the nesting of the navigation tree is flattened — a chapter and its child topics are both
  just references.

### 3c. Links plus a section per topicref

- Good: preserves the tree shape.
- Bad: double-counts every edge, and mints section nodes that own no text and index nothing.

### 4a. Tag names

- Good: simple, and enough for hand-written DITA.
- Bad: derives nothing from a specialized document set, silently — the ADR 01041 failure mode,
  reintroduced one level down.

### 4b. `@class` ancestry with a tag-name fallback (chosen)

- Good: matches how DITA itself identifies elements; works on both specialized and hand-written
  corpora.
- Bad: two mechanisms to keep in step, and the fallback list has to enumerate the structural
  specializations that ship with DITA.
