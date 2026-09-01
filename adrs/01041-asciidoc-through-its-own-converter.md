---
status: accepted
date: 2026-09-01
decision-makers: hawkeyexl
---

# AsciiDoc, through its own converter

## Context and Problem Statement

AsciiDoc is the last format in the [ADR 01037](01037-every-input-format-is-explicit.md) roadmap
with a parser behind it, and it arrives after
[ADR 01040](01040-the-analyzer-pipeline-is-async.md) made the analyzer pipeline async so
Asciidoctor 4 could be used at all.

The obvious approach — walk Asciidoctor's AST the way the Markdown analyzer walks mdast —
**does not work**, and the reason is structural rather than incidental. A loaded Asciidoctor
document contains *block* nodes only. Inline content is unparsed text until conversion runs the
inline substitutions, so on a loaded document:

```
doc.findBy({ context: 'inline_anchor' })   // → []
doc.getCatalog().links                     // → []
```

Both populate only after `convert()`. Sections, images and listing blocks are available from the
loaded AST; **links are not available at all** without converting. Since links are the single
most valuable thing dockg derives — the whole "what points at this page before I move it"
question — an approach that cannot see them is not an approach.

## Decision Drivers

- Links are the point. A format whose links dockg cannot see is barely supported at all.
- Determinism: a converter is a much larger surface for nondeterminism than a parser.
- ADR 01033: a finding the author cannot act on is worse than no finding.
- Section anchors must be what a published AsciiDoc site actually serves, or cross-file xrefs
  resolve to nodes nothing points at (the ADR 01038 lesson, one format over).
- A document's meaning must not depend on files outside the corpus.

## Considered Options

1. **Walk the loaded AST**, accepting that links are invisible.
2. **Convert to HTML with Asciidoctor, then reuse dockg's HTML extraction.**
3. **Convert to HTML, but write a separate AsciiDoc-specific extractor over it.**
4. **Regex the AsciiDoc source** for `xref:`, `link:` and bare URLs.

## Decision Outcome

Chosen: **option 2** — Asciidoctor is used as an AsciiDoc-to-HTML front end, and the resulting
HTML goes through `analyzeHtmlBody`, the same function the HTML analyzer uses.

This is not a shortcut. Converting is the only way inline structure exists at all, and once the
document is HTML, Asciidoctor has already resolved every question dockg would otherwise have to
answer by reimplementation: what an `xref` points at, which id a section carries, whether a
`<<ref>>` is internal. Asciidoctor is the reference implementation compiled to JavaScript, so its
answers are AsciiDoc's answers.

Option 3 was rejected because a second extractor over the same HTML is a second thing to keep in
step with the first. Sharing `analyzeHtmlBody` also settles, by construction, the agreement
problem that produced a real bug in *both* previous formats: the analyzer writes a section's
`dcterms:title` and the lexical index looks its slice up by that title, and here they are
literally the same function.

Option 4 was rejected for the reasons ADR 01022 already gave: a regex finds targets inside code
blocks, inside prose, and inside commented-out examples, and cannot tell a macro from a string
that looks like one.

**Three settings are load-bearing**, and each exists because its default is wrong for dockg:

- **`relfilesuffix: ".adoc"`.** Asciidoctor rewrites a cross-file xref's `.adoc` to the *output*
  suffix, so `xref:configuration.adoc[]` converts to `href="configuration.html"`. dockg resolves
  links against source files. Unconfigured, **every cross-file xref in every AsciiDoc corpus
  would be a broken link** — a corpus-wide false finding.
- **`showtitle`.** Without it the document title is not rendered into embedded output, so
  `= Title` would produce no section at all while a Markdown `# Title` produces one.
- **`safe: "secure"`.** `include::` is left unresolved. Resolving it would make the graph depend
  on files outside the corpus, and on whether they happened to be readable.

**An unresolved `include::` derives nothing.** This needed an explicit rule, because Asciidoctor
renders one as `<a class="bare include" href="…">` — a real anchor in the converted HTML,
pointing at the include path. Read naively, dockg would report a broken link for a directive the
author wrote deliberately, which is exactly the unactionable finding
[ADR 01033](01033-links-to-non-document-files.md) exists to prevent. Anchors carrying
Asciidoctor's `include` class are filtered out before classification.

**Asciidoctor's document attributes are never read.** `docdate`, `doctime` and `localdate` are
synthesized from the system clock, so a single `getAttributes()` call would put the wall clock
into the graph. Page metadata comes from docmeta's AsciiDoc extractor, which reads the `:key:`
entries out of the source text — and which also accepts a YAML frontmatter fence, as some static
site generators put on `.adoc` files.

**Anchors are Asciidoctor's own generated ids**, underscore prefix and all: `_verify`, not
`verify`. That is the anchor a published AsciiDoc site serves and what an xref resolves against.
A prettier slug would mint a node nothing points at.

### Consequences

- Good: AsciiDoc derives sections, cross-file xrefs with anchors, images, code languages and
  prose — the same shape every other format produces.
- Good: one body extraction serves HTML and AsciiDoc, so the analyzer and the index cannot
  disagree about a heading.
- Good: `@asciidoctor/core` is depended on directly rather than the `asciidoctor` wrapper, which
  ships no type declarations for its root export.
- Bad: dockg now runs a converter over every AsciiDoc file, which is slower than parsing and a
  larger surface for upstream change. The determinism gates are what hold it.
- Bad: anything Asciidoctor does not render into embedded HTML is invisible — a document
  attribute used only for conditional inclusion, for instance.
- Neutral: no new predicates; the SHACL shapes are unchanged and the clean-corpus `dockg check`
  gate passes on the new fixture.

### Confirmation

`test/unit/analyze-asciidoc.test.ts` pins each decision separately, including the ones that would
otherwise pass for the wrong reason: `_verify` keeping its underscore, `<<prereq>>` producing no
outbound link, a YAML frontmatter fence being read, and `include::../../../etc/passwd[]`
producing neither a link nor a section.

`test/fixtures/formats/asciidoc/` is a two-document corpus with its own two goldens, held in
`test/integration/formats-asciidoc.test.ts` to the determinism gates, the cross-file xref
resolution, `dockg check`, the search golden with a no-markup backstop, and two assertions aimed
squarely at the converter: that the graph contains no date at all, and that an `include::`
yields neither a reference nor a broken link.

Real-dependency exercise ([ADR 01026](01026-exercise-every-third-party.md)): Asciidoctor is
called for real throughout, never mocked.

## Pros and Cons of the Options

### 1. Walk the loaded AST

- Good: no conversion step; smaller surface; sections, images and listings are all directly
  available.
- Bad: **links are invisible**, because inline nodes do not exist until conversion. That is most
  of the value of ingesting the format.

### 2. Convert, then reuse dockg's HTML extraction (chosen)

- Good: Asciidoctor answers every resolution question authoritatively.
- Good: one extraction for two formats, so the analyzer and the lexical index cannot drift.
- Bad: a converter runs per file, and its output shape is now something dockg depends on.
- Bad: needed three non-default settings and one filter, each of which is a thing to know.

### 3. Convert, then write a separate extractor

- Good: could read AsciiDoc-specific classes (`sect1`, `listingblock`) more precisely.
- Bad: a second extractor over the same HTML, to be kept in step with the first — the exact drift
  that caused a silent bug in both earlier formats.

### 4. Regex the source

- Good: no dependency at all.
- Bad: finds targets inside code blocks, prose and commented-out examples; cannot distinguish a
  macro from text that resembles one. Rejected for MDX in ADR 01022 for the same reasons.
