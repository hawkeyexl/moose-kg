---
status: "accepted"
date: 2026-08-04
decision-makers: [hawkeyexl]
---

# Parse MDX, and derive links and images from JSX attributes

## Context and Problem Statement

moose-kg parses every input with `remark-parse` + `remark-gfm` + `remark-frontmatter`. There is no
`remark-mdx`, so in an `.mdx` file every JSX element is parsed as raw text or an `html` node with no
structure. Headings, prose, and Markdown links inside such a file still derive correctly; anything
expressed as a component does not.

That gap is not hypothetical, and moose-kg's own documentation is the proof. The site is Starlight, so
a large share of its navigation is written as components:

```mdx
<LinkCard title="Map your site's routes" href="/moose-kg/build/routes/" />
```

Building a graph from it reports **36 documents, 26 `dcterms:references` edges, and 5 orphans** —
and every one of those orphans is a page whose outbound links are all `<LinkCard>`s. The numbers are
not wrong about what moose-kg saw; they are wrong about the corpus. A reader running `moose-kg stats`
against any component-heavy MDX site gets a broken-link count, an orphan list, and an impact
traversal that all silently understate reality.

Understating is the dangerous direction. `traverse --reverse` exists to answer *what points at this
page before I move it*, and an answer that omits every component-authored link is worse than an
error, because it looks like a complete answer.

Should moose-kg parse MDX, and if so, what should it derive from a JSX element?

## Decision Drivers

- Silence is the failure mode moose-kg exists to remove ([ADR 01008](01008-graph-as-index-not-corpus.md)).
  An edge that is missing because of a parser limitation is exactly the "information evaporation"
  the tool measures elsewhere.
- MDX is the default authoring format for Starlight, Docusaurus, Nextra, and Fumadocs. Component
  links are the norm in that ecosystem, not an edge case.
- Determinism is the product contract. Any new derivation must be order-stable and free of wall
  clock, blank nodes, and hash-map iteration.
- `.md` files must not change behavior. MDX treats `{` as an expression delimiter, so parsing plain
  Markdown as MDX would turn ordinary prose braces into syntax errors.
- moose-kg reads structure, not semantics. It must not need to know what `<LinkCard>` means.

## Considered Options

1. **Do nothing; document the limitation.** What shipped in #25.
2. **Parse MDX, and derive from `href` and `src` attributes on any JSX element.**
3. **Parse MDX, and derive only from a configured allowlist of component/attribute pairs.**
4. **Regex `href="…"` out of the raw text without parsing MDX.**

## Decision Outcome

Chosen: **option 2** — add `remark-mdx`, applied to `.mdx` inputs only, and treat an `href`
attribute on any JSX element as a link. `src` is read as an image only on an image element.

`href` is HTML's hyperlink attribute wherever it appears — `a`, `area`, `link`, `base` — so reading
it from any element requires no knowledge of any particular component, and over-reading it only ever
yields an extra `dcterms:references` edge. That keeps moose-kg structural, the same way it already
reads a Markdown link without knowing what the link means.

**`src` is not analogous, and treating it as such was wrong.** It is HTML's generic
external-resource attribute, shared by `iframe`, `video`, `script`, `audio`, `source`, and `embed`.
Emitting `schema:image` for an embedded video or an analytics script is a wrong *type* assertion,
not a merely extra edge — the graph would assert that a YouTube embed is an image. So `src` is read
only from `img` and `Image` elements, which covers plain HTML and the Astro/Next image components.
A custom `<Screenshot src="…" />` is missed; that is the conservative direction, and unlike a wrong
type it is visible as an absence rather than as false data.

Option 3 was rejected because it makes the common case require configuration: a reader with a broken
orphan list would first have to discover that an allowlist exists, then enumerate their component
library. That is a worse default than over-reading, and over-reading here is cheap — a spurious edge
from an unusual `href` is visible in the graph and correctable, whereas a missing edge is silent.

Option 4 was rejected outright. It would find `href` inside code fences, inside prose, and inside
commented-out examples, and it cannot tell an attribute from a string that looks like one.

Only attributes whose value is a plain string literal are read. An expression attribute —
`href={someVar}` — is skipped rather than guessed at, because its value is not knowable without
evaluating the module, and a wrong edge asserted confidently is worse than an absent one.

### Consequences

- Component-authored links become `dcterms:references` edges. Reference counts, orphan lists,
  broken-link detection, and `traverse --impact` all become correct on MDX corpora.
- **Existing MDX graphs will gain triples.** This is a minor version bump, and anyone with a
  committed `graph.ttl` over an MDX corpus will see a large one-time diff. That diff is the bug
  being fixed, but it is not a no-op upgrade and the release notes must say so.
- `.md` parsing is byte-identical: the MDX processor is selected by extension, so the golden corpus
  is untouched.
- New broken links may appear where a component pointed at a route that never resolved. That is a
  real finding surfacing for the first time, and it can fail a `stats --check` gate on upgrade.
- **Parse failures become possible.** `remark-parse` accepts anything; the MDX extension does not,
  so an unclosed tag or an unparseable `{…}` expression now aborts the file. Left raw, the micromark
  throw escapes `cli.ts`'s `fail()` — which only converts `MooseKgError` — and the CLI would dump a
  stack trace, exit `1` (the code the contract reserves for findings), and never name the file.
  `analyzeDoc` therefore converts it to a `MooseKgError` naming the path, so it exits `2` like every
  other operational error. Only the MDX path converts; a `.md` throw would be a genuine internal
  bug and still propagates.
- moose-kg now depends on `remark-mdx`.

### Confirmation

- `test/unit/analyze-mdx.test.ts` covers: an `href` on a JSX element becoming a link; `src` becoming
  an image on `img`/`Image` and **not** on `iframe`/`video`/`script`; a nested JSX child being
  reached; an expression attribute being skipped; an unparseable `.mdx` raising a `MooseKgError` that
  names the file; and a `.md` file with braces in prose parsing exactly as before.
- The golden determinism gate (`test/fixtures/golden/graph.ttl`) is unchanged, proving `.md`
  behavior did not move.
- The docs graph gate in `.github/workflows/docs.yml` builds moose-kg's own MDX site; its orphan count
  drops from 5 to 0, which is the regression test for the motivating case.

## Pros and Cons of the Options

### 1. Do nothing

- Good, because it is free and the limitation is documented.
- Bad, because the documented limitation is "this tool's headline feature is wrong on your corpus",
  and the wrongness is silent.

### 2. `href`/`src` on any element

- Good, because it needs no configuration and works on first run.
- Good, because it stays structural — no component vocabulary enters moose-kg.
- Bad, because an `href` on something that is not a navigation element yields a spurious edge.
  Visible and correctable, unlike the alternative.

### 3. Configured allowlist

- Good, because it is exact.
- Bad, because it defaults to the broken behavior and puts the burden on the reader least equipped
  to notice.

### 4. Regex over raw text

- Good, because it needs no dependency.
- Bad, because it cannot distinguish an attribute from prose, a code sample, or a comment. It would
  trade silent under-reading for noisy over-reading, which is not an improvement.
