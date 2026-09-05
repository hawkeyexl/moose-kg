# Content strategy

This directory holds dockg's durable answer to three questions. *Who is the documentation for,
what are they trying to accomplish, and how is the docset therefore shaped?* It is an internal
working artifact for contributors and agents. It sits deliberately outside
`docs/src/content/docs/`, so Starlight never publishes it.

## Files

| File | Contents |
|---|---|
| [`audiences/`](audiences/_overview.md) | Five segments on the *who owns the docs × company maturity* axis, plus one cross-cutting lens |
| [`personas/`](personas/_overview.md) | One minimal persona per audience, defined by what the reader already brings |
| [`journeys/`](journeys/_overview.md) | Twelve critical user journeys, and the persona→CUJ coverage matrix |
| [`information_architecture/`](information_architecture/proposed-ia.md) | The proposed CUJ-first nav for `docs/src/content/docs/`, and the gap analysis |

## The ID-linking model

Every file declares a stable `id:` in its frontmatter and refers to other files by that id,
never by path. Three namespaces:

| Prefix | Declared in | Referenced by |
|---|---|---|
| `aud-*` | `audiences/*.md` | a persona's `audience:` |
| `persona-*` | `personas/*.md` | an audience's `personas[]`, a CUJ's `personas[]` |
| `cuj-*` | `journeys/*.md` | a persona's `journeys[]`, the IA's nav mapping |

Two invariants hold, and are checked before any change to this directory lands:

1. **No danglers.** Every referenced id resolves to a defined `id:`.
2. **Mutual coverage.** Every persona has at least one CUJ; every CUJ names at least one persona.

**IDs are stable once committed.** Rename the title freely; never renumber or rename an id.

## Evidence basis, and its limits

dockg has no customers and no call transcripts. **These personas are derived from repo
artifacts, not from user research.** The sources are `README.md`, `DESIGN.md`'s
iiRDS×knowledge-graph thesis, and the ADR set. They also include the CLI, config and frontmatter
surface, plus the sibling project docmeta's already-validated persona set.

Every audience and persona file therefore carries an `evidence_basis:` field naming exactly
what it was derived from. **This is the weakest link in the strategy.** Treat these as
falsifiable hypotheses, and revisit them the first time real user conversations exist. A
persona that survives contact with a user should have its `evidence_basis` updated to say so.

## How to use this during writing tasks

1. **Identify the persona the page serves.** See [`personas/_overview.md`](personas/_overview.md).
   If a page serves everyone, it serves no one. Pick one.
2. **Find the matching CUJ.** See [`journeys/_overview.md`](journeys/_overview.md). The page
   exists to move that persona along that journey.
3. **Structure the content around reaching the outcome, not around document type.** Do not
   impose a Diátaxis tutorial/how-to/explanation/reference split as the organizing principle.
   The nav is journey-voiced; the Reference shelf supports navigation, it does not drive it.
4. **Link into the Reference shelf rather than duplicating it.** Journey pages explain the
   path; they do not restate flag tables or config keys.
5. **Check the page's place and launch status** in
   [`information_architecture/proposed-ia.md`](information_architecture/proposed-ia.md).
6. **Every published page needs `title` and `description` frontmatter.** There are no
   exceptions, because it is a machine-enforced deploy gate.

## Verifying technical claims

The strategy describes intent. Behavior claims in the docset must come from the source:

- **Source files are the contract for behavior.** `src/cli.ts` for the command surface,
  `src/core/config-schema.json` for config, `schemas/frontmatter-0.8.json` for the `kg:` block,
  `shapes/dockg-0.5.ttl` for what `dockg check` catches.
- **The test suite is the contract for exact emitted strings.** Do not hand-write sample
  output. `test/fixtures/golden/` and the integration tests hold the real thing.
- **To capture sample output, build and run the binary** against a committed fixture rather
  than transcribing from memory. Determinism means the output you capture is the output every
  reader will see.
