---
status: accepted
date: 2026-08-31
decision-makers: hawkeyexl
---

# Every input format is explicit

## Context and Problem Statement

`analyzeDoc` parsed whatever it was handed with remark. It never asked what the file was. The MDX
processor was selected by extension (ADR 01022), but that was a two-way branch inside one
Markdown analyzer, not a decision about what dockg can read.

`inputs` is a user-settable glob, so pointing dockg at another format has always been possible.
What happened then was not an error. Measured against the installed parser, remark reduces an
HTML file to a single opaque `html` node and an AsciiDoc file to bare paragraphs:

```
HTML     → node types: html        (0 sections, 0 links, 0 images)
AsciiDoc → paragraph, text, ...    (0 headings, 0 links)
```

The build succeeded, exited `0`, and wrote a well-formed graph with no sections, no links and no
images. Every downstream number agreed with it: `stats` reported no orphans because it found no
edges, `--check` passed because there was nothing to fail, and `traverse --reverse` answered
"nothing points here" for every page.

That is the failure mode dockg exists to remove. [ADR 01008](01008-graph-as-index-not-corpus.md)
frames the product as making information evaporation visible, and
[ADR 01022](01022-parse-mdx-and-derive-from-jsx-attributes.md) already ruled on the identical
question one level down — an edge missing for a parser reason is worse than an error, because it
looks like a complete answer.

The asymmetry made it plainer. `dockg validate` **already guards this**: it intersects the
discovered corpus with docmeta's `supportedExtensions()` and refuses anything outside it. Two
commands over one corpus therefore disagreed about whether that corpus was readable — `validate`
said no, `build` said yes and emitted nothing.

## Decision Drivers

- Silence is the failure mode dockg exists to remove (ADR 01008). A graph that is empty for a
  parser reason must not be indistinguishable from a corpus with no structure.
- `build` and `validate` must agree about what dockg can read.
- Exit codes are contract: `2` for an operational error, `1` reserved for findings.
- Markdown behavior must not change. Six byte-exact goldens and the doc/triple counts asserted
  across `build`, `validate`, `query-stats` and `runtime-sparql` are the proof.
- Adding a format later must be an isolated change, not a fourth branch inside one parser.
- A reader hitting the refusal needs to know which of two different things to do: fix a glob, or
  wait for dockg.

## Considered Options

1. **Do nothing; document the limitation.**
2. **Guard `build` with docmeta's `supportedExtensions()`,** mirroring `validate`.
3. **A dockg-side analyzer registry** keyed by extension, with roadmap formats registered as
   stubs, and `analyzeDoc` reduced to a dispatcher.
4. **Detect the format by sniffing content** rather than by extension.

## Decision Outcome

Chosen: **option 3** — `src/core/analyzers/`, a registry mirroring docmeta's
`MetadataExtractor` contract (`name`, `extensions`, `implemented`, `writable`, `analyze`), with
`analyzeDoc` reduced to a dispatcher that resolves an analyzer by extension and refuses when
none is implemented.

Option 2 is the smaller change and was rejected because it answers the wrong question. docmeta's
supported set is *metadata* support — it reads `.html`, `.adoc`, `.rst`, `.xml`, `.dita` and
`.ditamap` today, none of which dockg can derive a **body** from. Gating `build` on it would
admit exactly the files that produce an empty graph. The two registries answer different
questions and both are needed.

Option 4 was rejected outright: sniffing makes the corpus's meaning depend on its contents rather
than its names, which is neither deterministic to explain nor stable under editing.

**Roadmap formats are registered as stubs, not omitted.** HTML, DITA, DITA maps, AsciiDoc, RST
and generic XML each get a named entry with `implemented: false`. This is the load-bearing part
of the decision rather than a placeholder: an unregistered extension and an unimplemented format
lead a reader to different next actions, and both messages are captured from the built binary:

```
dockg: The "html" input format is not yet implemented (headings, links, images and code blocks are not derived yet).
dockg: No input format is registered for docs/notes.txt (".txt") — narrow your inputs globs. Supported: .markdown, .md, .mdx.
```

Both exit `2`. Neither writes a graph.

**Generic XML is a permanent stub, not a pending one.** Arbitrary XML declares no headings, links
or images, so there is nothing to derive a body from without a per-vocabulary mapping. DITA is
supported as its own format precisely because it *does* answer those questions.

**`path` and `contentHash` are the dispatcher's job, not an analyzer's.** The content digest
(ADR 01036) is computed once, over the bytes as read, for every format — so it cannot drift as
formats are added, and no future analyzer can normalize line endings out of it by accident.

**Link resolution and section bookkeeping are shared, not per-format** (`analyzers/links.ts`,
`analyzers/sections.ts`). A link's meaning must not depend on the syntax that expressed it. If
each analyzer resolved its own, `dcterms:references` would become format-dependent and
cross-format links would silently stop resolving — the same class of bug as the one this ADR
closes.

**`writable` is separate from `implemented`.** dockg's frontmatter writer re-serializes a YAML
fence and *creates* one when a file has none, which on a format with no frontmatter is a
corruption rather than an edit. `dockg fill` therefore checks the whole corpus for unwritable
formats immediately after discovery — before the graph guard analyzes anything and long before a
provider is constructed — because the answer is a property of the inputs, not of one document,
and fields that could never be applied are not worth paying for. Note this is a dockg
limitation, not a docmeta one: every docmeta extractor exposes `apply`, so writing metadata into
HTML or AsciiDoc is available later without a new dependency.

### Consequences

- Good: an unreadable corpus fails loudly, at exit `2`, naming the file and the format.
- Good: `build` and `validate` no longer disagree about the same corpus.
- Good: adding a format is one file plus one registry line; nothing downstream of `DocModel`
  changes.
- Bad: a corpus that globbed non-Markdown files and tolerated the empty result now fails. That
  is intended — the previous success was the bug — but it is a breaking change for anyone whose
  `inputs` were wider than their corpus.
- Neutral: no new predicates, so the SHACL shapes are unchanged.

### Confirmation

`test/unit/analyzers.test.ts` pins the registry: extension resolution (case-insensitively), the
implemented set, that every extension is claimed exactly once, and that both refusal messages
name what the reader needs. `test/integration/input-formats.test.ts` runs the built CLI over a
one-file HTML corpus and asserts exit `2` **and that no graph file was written** — the assertion
that would have caught the original bug.

The `fill` gate is covered in `test/unit/fill.test.ts` by the two facts that make it a gate
rather than a message: the source file is byte-identical afterwards, and the `MockProvider`'s
`requests` array is empty, so the refusal provably preceded the provider.

The six byte-exact goldens under `test/fixtures/golden/` are the proof that Markdown behavior is
unchanged: the extraction of `links.ts`, `sections.ts` and `markdown.ts` out of `analyze.ts` is a
pure refactor, and any drift in slug disambiguation, sibling ordering or link classification
would move `graph.ttl`.

## Pros and Cons of the Options

### 1. Do nothing; document the limitation

- Good: no code change.
- Bad: leaves a silent wrong answer in the product, which is the one failure mode dockg exists to
  remove.
- Bad: a documented limitation is invisible at the moment it bites — the build says nothing.

### 2. Guard `build` with docmeta's `supportedExtensions()`

- Good: smallest possible change; reuses a list that already exists.
- Good: makes `build` and `validate` agree by construction.
- Bad: **admits the exact files that fail.** docmeta supports `.html`, `.adoc`, `.rst`, `.xml`,
  `.dita` and `.ditamap` for metadata; dockg can derive a body from none of them. The guard would
  pass and the graph would still be empty.
- Bad: no place for a format to land later.

### 3. A dockg-side analyzer registry (chosen)

- Good: refuses precisely what dockg cannot read, for the reason it cannot read it.
- Good: distinguishes "not registered" from "not yet implemented", which are different problems
  for the reader.
- Good: makes each future format an isolated change, with the shared link and section semantics
  factored out so they cannot diverge.
- Bad: a second registry alongside docmeta's, which must be kept in step by hand.
- Bad: larger diff — `analyze.ts` splits into five files.

### 4. Sniff the content

- Good: tolerates misnamed files.
- Bad: the corpus's meaning depends on its contents, not its names — hard to explain, unstable
  under editing, and a file that sniffs differently after an edit changes its IRIs.
- Bad: ambiguous by nature. Markdown is a superset of plain text and permits raw HTML.
