---
id: cuj-localize-a-docset
type: cuj
title: Label a translated docset and link each page to its source
personas:
  - persona-information-architect
  - persona-docs-engineer
trigger: >-
  the corpus ships in more than one language, and the graph treats every locale as one
  undifferentiated pile — a German question can be answered out of the English page, and
  "which pages are still untranslated?" has no answer at all
entry_point: /dockg/model/localization/
success_criteria: >-
  Every document carries the language of the tree it lives in, each translation names its
  source, the source lists all of its translations, and a page whose language is written as
  free text fails check instead of partitioning the corpus into buckets of one.
steps:
  - stage: orient
    doc: /dockg/concepts/open-world/
    exists: true
    note: "Language is a scope boundary like a product variant: absence still means unknown."
  - stage: act
    doc: /dockg/model/localization/
    exists: true
    note: "routes[].language labels a whole tree; the page's own lang overrides it."
  - stage: act
    doc: /dockg/model/localization/
    exists: true
    note: "translation-of names the source; dockg emits both schema.org directions."
  - stage: verify
    doc: /dockg/govern/
    exists: true
    note: "check rejects a language that is not a BCP-47 tag, before it reaches an index."
  - stage: verify
    doc: /dockg/build/
    exists: true
    note: "stats surfaces a translation-of that names no file, as a broken link."
  - stage: extend
    doc: /dockg/reference/frontmatter/
    exists: true
    note: "lang, language and translation-of in the page-level key table."
---

Ines makes the locale boundary explicit, and Priya declares it once per tree rather than once
per file.

## The journey

A translated docset arrives at dockg as a pile of Markdown that happens to sit in different
directories. Nothing in the graph says which language a page is in unless somebody wrote
`lang:` in its frontmatter, and nothing at all says that `docs/de/install.md` is the German of
`docs/en/install.md`. Both facts are obvious to a human reading the paths and invisible to
every consumer.

The cost lands in two places this docset already promises to serve. Retrieval blends locales,
which is the edge contamination `cuj-scope-by-variant` exists to prevent on the other axis —
except a wrong-language answer is obvious to the reader in a way a wrong-variant answer is not.
And coverage reports one blended number across every locale, so a corpus at 100% English and 0%
German reads as roughly half-done and names neither audience.

## Why two personas

This is a **specify-and-implement** journey of the same shape as `cuj-audit-provenance`.

Ines owns the model: whether a locale is a scope dimension, what the tag vocabulary is, and
which relation carries a translation. Priya owns the declaration: `routes[]` is config, it
already maps directories, and adding `language` to a route is the difference between one line
per locale and one line per file.

The page has to work for both at once. It states the emitted triples — the pair Ines has to
review against the vocabulary she governs — and the route block Priya pastes into
`dockg.config.yaml`, rather than only one.

## Where it stops

The journey ends at a labelled, linked graph. Retrieval that *uses* the label — a
language-scoped traversal, per-locale search and vector indexes — belongs to
`cuj-serve-retrieval`, and the model has to exist before it can be filtered on.
