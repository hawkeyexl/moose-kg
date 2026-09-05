---
status: accepted
date: 2026-09-01
decision-makers: hawkeyexl
---

# AsciiDoc, through its own converter

## Context and Problem Statement

AsciiDoc is the last format in the [ADR 01041](01041-every-input-format-is-explicit.md) roadmap
with a parser behind it. It arrives after
[ADR 01044](01044-the-analyzer-pipeline-is-async.md) made the analyzer pipeline async, so that
Asciidoctor 4 could be used at all.

The obvious approach is to walk Asciidoctor's AST the way the Markdown analyzer walks mdast. It
**does not work**, and the reason is structural rather than incidental. A loaded Asciidoctor
document contains *block* nodes only. Inline content is unparsed text until conversion runs the
inline substitutions, so on a loaded document:

```
doc.findBy({ context: 'inline_anchor' })   // → []
doc.getCatalog().links                     // → []
```

Both populate only after `convert()`. Sections, images and listing blocks are available from the
loaded AST, but **links are not available at all** without converting. Links are the single most
valuable thing dockg derives, being the whole "what points at this page before I move it"
question. An approach that cannot see them is not an approach.

## Decision Drivers

- Links are the point. A format whose links dockg cannot see is barely supported at all.
- Determinism. A converter is a much larger surface for nondeterminism than a parser.
- ADR 01033 holds. A finding the author cannot act on is worse than no finding.
- Section anchors must be what a published AsciiDoc site actually serves, or cross-file xrefs
  resolve to nodes nothing points at. That is the ADR 01042 lesson, one format over.
- A document's meaning must not depend on files outside the corpus.

## Considered Options

1. **Walk the loaded AST**, accepting that links are invisible.
2. **Convert to HTML with Asciidoctor, then reuse dockg's HTML extraction.**
3. **Convert to HTML, but write a separate AsciiDoc-specific extractor over it.**
4. **Regex the AsciiDoc source** for `xref:`, `link:` and bare URLs.

## Decision Outcome

Option 2 wins. Asciidoctor is used as an AsciiDoc-to-HTML front end, and the resulting HTML goes
through `analyzeHtmlBody`, the same function the HTML analyzer uses.

This is not a shortcut. Converting is the only way inline structure exists at all. Once the
document is HTML, Asciidoctor has already resolved every question dockg would otherwise have to
answer by reimplementation. What an `xref` points at, which id a section carries, whether a
`<<ref>>` is internal. Asciidoctor is the reference implementation compiled to JavaScript, so its
answers are AsciiDoc's answers.

Option 3 was rejected because a second extractor over the same HTML is a second thing to keep in
step with the first. Sharing `analyzeHtmlBody` also settles the agreement problem that produced a
real bug in *both* previous formats. The analyzer writes a section's `dcterms:title` and the
lexical index looks its slice up by that title. Here they are literally the same function.

Option 4 was rejected for the reasons ADR 01022 already gave. A regex finds targets inside code
blocks, inside prose, and inside commented-out examples. It cannot tell a macro from a string
that looks like one.

**Three settings are load-bearing**, and each exists because its default is wrong for dockg:

- **`relfilesuffix: ".adoc"`.** Asciidoctor rewrites a cross-file xref's `.adoc` to the *output*
  suffix, so `xref:configuration.adoc[]` converts to `href="configuration.html"`. dockg resolves
  links against source files. Unconfigured, **every cross-file xref in every AsciiDoc corpus
  would be a broken link**, a corpus-wide false finding.
- **`showtitle`.** Without it the document title is not rendered into embedded output, so
  `= Title` would produce no section at all while a Markdown `# Title` produces one.
- **`safe: "secure"`.** `include::` is left unresolved. Resolving it would make the graph depend
  on files outside the corpus, and on whether they happened to be readable.

**An unresolved `include::` derives nothing.** This needed an explicit rule, because Asciidoctor
renders one as `<a class="bare include" href="…">`. That is a real anchor in the converted HTML,
pointing at the include path. Read naively, dockg would report a broken link for a directive the
author wrote deliberately. That is exactly the unactionable finding
[ADR 01033](01033-links-to-non-document-files.md) exists to prevent. Anchors carrying
Asciidoctor's `include` class are filtered out before classification.

**Asciidoctor's document attributes are never read.** `docdate`, `doctime` and `localdate` are
synthesized from the system clock, so a single `getAttributes()` call would put the wall clock
into the graph. Page metadata comes from docmeta's AsciiDoc extractor instead, which reads the
`:key:` entries out of the source text. It also accepts a YAML frontmatter fence, as some static
site generators put on `.adoc` files.

**Anchors are Asciidoctor's own generated ids**, underscore prefix and all. It is `_verify`, not
`verify`. That is the anchor a published AsciiDoc site serves and what an xref resolves against.
A prettier slug would mint a node nothing points at.

**`DocAnalyzer.textOf` takes the document's path.** It was added for this format and initially did
not. AsciiDoc passed the literal `"<document>"`, so a conversion failure during indexing named a
placeholder while the identical failure during `build` named the file. Indexing is its own command
over a whole corpus, so that difference is the difference between a fixable error and grepping a
thousand files. DITA had the same hole with `"<indexed document>"`, and that is where it is
tested. Asciidoctor recovers from essentially any input, so its own failure branch is not
reachable without faking one. A test that mocks its way to a conclusion proves nothing.

### Consequences

- Good. AsciiDoc derives sections, cross-file xrefs with anchors, images, code languages and
  prose. That is the same shape every other format produces.
- Good. One body extraction serves HTML and AsciiDoc, so the analyzer and the index cannot
  disagree about a heading.
- Good. `@asciidoctor/core` is depended on directly rather than the `asciidoctor` wrapper, which
  ships no type declarations for its root export.
- Bad. Dockg now runs a converter over every AsciiDoc file, which is slower than parsing and a
  larger surface for upstream change. The determinism gates are what hold it.
- Bad. Anything Asciidoctor does not render into embedded HTML is invisible. A document
  attribute used only for conditional inclusion, for instance.
- Neutral. No new predicates; the SHACL shapes are unchanged and the clean-corpus `dockg check`
  gate passes on the new fixture.

### Confirmation

`test/unit/analyze-asciidoc.test.ts` pins each decision separately. That includes the ones that
would otherwise pass for the wrong reason. `_verify` keeps its underscore, `<<prereq>>` produces
no outbound link, a YAML frontmatter fence is read, and `include::../../../etc/passwd[]` produces
neither a link nor a section.

`test/fixtures/formats/asciidoc/` is a two-document corpus with its own two goldens, held in
`test/integration/formats-asciidoc.test.ts` to the determinism gates. It adds the cross-file xref
resolution, `dockg check`, and the search golden with a no-markup backstop. Two assertions aim
squarely at the converter. The graph contains no date at all, and an `include::` yields neither a
reference nor a broken link.

Real-dependency exercise ([ADR 01026](01026-exercise-every-third-party.md)): Asciidoctor is
called for real throughout, never mocked.

## Pros and Cons of the Options

### 1. Walk the loaded AST

- Good. No conversion step; smaller surface; sections, images and listings are all directly
  available.
- Bad. **links are invisible**, because inline nodes do not exist until conversion. That is most
  of the value of ingesting the format.

### 2. Convert, then reuse dockg's HTML extraction (chosen)

- Good. Asciidoctor answers every resolution question authoritatively.
- Good. One extraction for two formats, so the analyzer and the lexical index cannot drift.
- Bad. A converter runs per file, and its output shape is now something dockg depends on.
- Bad. Needed three non-default settings and one filter, each of which is a thing to know.

### 3. Convert, then write a separate extractor

- Good. Could read AsciiDoc-specific classes (`sect1`, `listingblock`) more precisely.
- Bad. A second extractor over the same HTML, to be kept in step with the first. That is the
  exact drift that caused a silent bug in both earlier formats.

### 4. Regex the source

- Good. No dependency at all.
- Bad. Finds targets inside code blocks, prose and commented-out examples; cannot distinguish a
  macro from text that resembles one. Rejected for MDX in ADR 01022 for the same reasons.
