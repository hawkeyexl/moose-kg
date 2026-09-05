---
status: accepted
date: 2026-08-31
decision-makers: hawkeyexl
---

# HTML as an input format

## Context and Problem Statement

[ADR 01041](01041-every-input-format-is-explicit.md) built the registry and made every
unsupported format fail loudly. HTML is the first format to land in it.

HTML is the right one to do first, and not only because it is easy. A large share of the
documentation that exists at all exists *only* as HTML: published Sphinx and MkDocs sites whose
sources are gone or unavailable, vendor documentation portals, exported help centers, generated
API references. Those corpora are exactly the ones where nobody can answer "what points at this
page before I move it", because there is no source repository to grep.

The format questions HTML forces are not the ones Markdown asked, because HTML says more:

- Markdown has no anchor syntax, so a section's slug can only be derived from its title. HTML
  carries explicit ids — and a link elsewhere in the corpus targets *the id*, not a slug.
- Markdown headings contain only their text. Real HTML headings contain a permalink widget:
  Sphinx appends `<a class="headerlink" href="#install">¶</a>`, MkDocs and Docusaurus do the
  same with different glyphs. `textContent` reads "Install the SDK¶".
- MDX reads `href` from *any* element, because a component's identity is unknowable
  ([ADR 01022](01022-parse-mdx-and-derive-from-jsx-attributes.md)). HTML element identity is
  knowable, and every page has a `<link rel="stylesheet">` in its head.

## Decision Drivers

- Determinism is the product contract. A second parser is a second chance to emit unstable
  output, so the new corpus carries the same gates the old one does.
- Section IRIs are `doc#slug` and must be what links in the corpus actually address.
- dockg reads structure, not semantics: no rule may require knowing that a page came from Sphinx.
- ADR 01022's asymmetry stands — a missing edge is silent, an extra edge is visible. But a
  *systematic* extra edge on every page is a different thing from an occasional one.
- The lexical index (ADR 01019) must contain prose. Indexing markup would be worse than not
  indexing at all.

## Considered Options

For the anchor: **(1a)** always slug the title, as Markdown does; **(1b)** the heading's own
`id`, falling back to a slug; **(1c)** the heading's own `id`, then an enclosing sectioning
element's `id`, then a slug.

For `href`: **(2a)** any element, matching ADR 01022; **(2b)** hyperlink elements only.

For heading text: **(3a)** `textContent` verbatim; **(3b)** drop a link from the heading back to
its own anchor.

## Decision Outcome

Chosen: **1c, 2b, 3b.**

**1c — an explicit id beats a slugged title, and a sectioning ancestor's id counts.** Sphinx
emits `<section id="install-the-sdk"><h1>Install the SDK…`, putting the anchor on the section
rather than the heading; Docusaurus and MkDocs put it on the heading. Both are common enough
that supporting only one would leave half of real corpora minting section IRIs that nothing
points at. The ancestor's id is claimed by the *first* heading inside it only — a later sibling
heading is not that section's title, and letting it claim the same id would collapse two
sections onto one IRI. Explicit ids still pass through the same disambiguator as slugs, because
nothing guarantees a document's ids are unique.

**An explicit id is preserved verbatim, case and dots included.** This is the whole point and it
was got wrong first time round: the id was handed to the slugger, which lowercases and strips
punctuation, so `id="Install.SDK"` became `installsdk` while a link to `#Install.SDK` kept its
anchor verbatim. `derive` matches the two with `===`, so the reference silently degraded from a
section edge to a document edge — and `stats` reported nothing broken, because nothing *was*
broken, only imprecise. Re-slugging the id reintroduces exactly the failure that preferring the
id over the title was meant to remove.

The exception is IRI safety. `mintSectionIri` does not percent-encode — it has always relied on
the slug already being safe — so an id is preserved only when it is made of characters an IRI
fragment accepts unchanged, which is the XML NCName charset plus `:`. That covers what HTML,
DITA and AsciiDoc actually put in an `id`. Anything stranger (a space, a quote, non-ASCII) still
falls back to slugging: losing the match is the lesser harm against emitting Turtle that does
not parse.

**2b — `href` is read from `<a>` and `<area>` only.** This is a deliberate divergence from ADR
01022, and the reasoning that ADR gave is what justifies it. Over-reading was accepted there
because a spurious edge from an unusual `href` is *occasional*, visible, and correctable. In
HTML it would not be occasional: `<link rel="stylesheet" href="./theme.css">` and
`<link rel="canonical">` sit in the head of every single page, so reading `href` from any
element would add a broken-link finding to every document in the corpus — systematic noise that
makes the broken-link gate useless, which is the outcome ADR 01033 was written to prevent. The
distinction is HTML's own: `<a>` and `<area>` are hyperlink elements, `<link>` and `<base>`
declare resource relationships. Element identity is knowable here, so it is used.

`src` follows ADR 01022 unchanged: an image only on `<img>`, never on `iframe`, `video` or
`script`.

**3b — a heading's self-permalink is not part of its text.** The rule is structural rather than
tool-specific, which is what makes it acceptable: a link from a heading *to itself* carries no
information for a reader or a graph, whatever glyph it uses. It matches no ordinary link,
because an ordinary link in a heading points somewhere else — the test suite pins that case too.

**The text slicer and the analyzer share their heading primitives** (`html-dom.ts`). This is not
tidiness. `dcterms:title` is written by the analyzer, and the lexical index looks a section's
slice up *by that title* — so when the slicer resolved permalinks from the heading's own id
while the analyzer used the inherited one, every Sphinx-shaped section indexed no text at all,
silently, while the build stayed green. That bug is why the primitives are one module.

### Consequences

- Good: an HTML-only corpus derives sections, links, images and code languages, and its lexical
  index carries prose.
- Good: links resolve across the format boundary in both directions — a `.md` page and a `.html`
  page can reference each other, and an anchor written in one reaches a section node minted by
  the other.
- **`DEFAULT_LINK_EXTENSIONS` changes**, from `[".md", ".mdx"]` to every readable extension in
  candidate-precedence order. It has to: under ADR 01033 a link to `./missing.html` was a link
  to a *static asset*, so an HTML corpus would have reported none of its broken links. Markdown
  stays ahead of HTML in the order, so a corpus holding both a source and its build output
  resolves a pretty URL to the source.
- Neutral: no new predicates, so the SHACL shapes are unchanged. The clean-corpus `dockg check`
  gate passes on the new fixture.
- Bad: `dockg fill --apply` refuses HTML. docmeta's HTML extractor exposes `apply`, so this is a
  dockg limitation with a clear path out, not a property of the format.
- Known gap: `<img srcset>` and `<picture><source>` are not read. Under ADR 01022's rule `src`
  on a `<source>` element is not necessarily an image, and a missing image is a visible absence
  rather than a wrong type assertion.

### Confirmation

`test/unit/analyze-html.test.ts` covers the derivation rules case by case, including the
negatives that would otherwise pass for the wrong reason: `<link rel="canonical">` producing no
edge, `<iframe src>` producing no image, and a real link inside a heading surviving while the
permalink is dropped. `test/unit/html-text.test.ts` covers the slicer, opening with the
inherited-anchor regression.

`test/fixtures/formats/mixed/` is an HTML-and-Markdown corpus with its own two goldens, and
`test/integration/formats-mixed.test.ts` holds it to the same gates as the main corpus —
double-build byte comparison, version-normalized golden, n3 round-trip — plus the cross-format
link assertions, `dockg check`, the search-index golden with a blunt "no markup" backstop, the
per-format iiRDS media type, and the absence of any timestamp.

Real-dependency exercise ([ADR 01026](01026-exercise-every-third-party.md)): parse5 is called
for real throughout, never mocked, so no `test/real/` addition is needed.

## Pros and Cons of the Options

### 1a. Always slug the title

- Good: identical to Markdown; one rule to explain.
- Bad: mints section IRIs nothing links to. Every anchor link in an HTML corpus targets an id,
  so `traverse` and `--reverse` would miss all of them — the ADR 01022 failure again.

### 1b. The heading's own id, else a slug

- Good: covers Docusaurus, MkDocs Material and hand-written HTML.
- Bad: misses Sphinx, which is the single most common generator of HTML-only documentation.

### 1c. Own id, then an enclosing section's id, then a slug (chosen)

- Good: covers both conventions, and falls back safely for neither.
- Bad: the "first heading only" qualifier is a rule a reader has to be told about.

### 2a. Read `href` from any element

- Good: consistent with ADR 01022 on its face.
- Bad: a stylesheet link on every page becomes a broken link on every page. It converts the
  broken-link gate from a signal into noise.

### 2b. Hyperlink elements only (chosen)

- Good: uses a distinction HTML itself makes; no tool-specific knowledge.
- Bad: a hyperlink expressed some other way (a `data-href` on a clickable div) is missed. That is
  an absence, which is the direction ADR 01022 called conservative.

### 3a. `textContent` verbatim

- Good: no rule at all; whatever a renderer shows is what dockg reads.
- Bad: titles read "Install the SDK¶" across every Sphinx and MkDocs corpus, and the slug
  derived from such a title is wrong too.

### 3b. Drop the self-permalink (chosen)

- Good: structural, tool-agnostic, and cannot misfire — a heading linking to itself has no
  content to lose.
- Bad: one more rule; a permalink that points at a *different* anchor is still read as a link,
  which is correct but may surprise.
