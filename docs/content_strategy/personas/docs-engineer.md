---
id: persona-docs-engineer
type: persona
name: Priya
audience: aud-docs-as-code-teams
role: Documentation engineer who owns the docs toolchain
proficiency:
  - reads and writes YAML frontmatter fluently
  - writes and debugs CI workflow files unaided
  - comfortable with globs, exit codes, and stderr-vs-stdout
  - has configured a static site generator and its nav
prerequisites:
  - git, branches, and pull requests
  - a Markdown or MDX docs corpus already in a repo
  - Node installed, and npx used without ceremony
  - an existing CI pipeline that already gates on something
goals:
  - get a useful artifact out of the repo on the first run, with no config file
  - answer link and impact questions without grepping
  - make metadata quality a build gate rather than a review comment
  - keep the artifact diffable in git so review stays normal
pains:
  - frontmatter is inconsistent across hundreds of pages and nobody notices
  - moving a page silently breaks links that no linter catches
  - '"what references this?" is currently a grep and a guess'
  - previous metadata efforts died because they needed a separate system to maintain
content_types:
  - task-shaped guides with a runnable command per step
  - copy-pasteable config and workflow files
  - flag and config reference tables
  - literal command output they can compare against
journeys:
  - cuj-first-graph
  - cuj-map-site-routes
  - cuj-gate-metadata-in-ci
  - cuj-backfill-metadata
  - cuj-query-the-graph
  - cuj-audit-provenance
  - cuj-prove-coverage
evidence_basis:
  - README.md's quickstart shape — install, run, read output — which assumes exactly this reader
  - ADR 01009's opinionated defaults, written so a first run needs no configuration
  - the derive source set, all seven of which read artifacts a docs-as-code repo already has
  - dockg init's starter config template, which presumes someone who will edit YAML
  - docmeta's Maya persona, the validated sibling-product equivalent
---

The person who owns the docs pipeline, and gets paged when it breaks.

## Who they are

Priya maintains a documentation site of a few hundred pages that lives in a git repo and
deploys on merge. They wrote the CI workflow, they chose the site generator, and they are the
only person on the team who knows how the whole thing fits together. Content comes from a dozen
contributors; the pipeline comes from Priya.

They have tried to improve metadata before. Usually it went: agree on a set of frontmatter
fields, document them, watch compliance decay over two quarters because nothing enforced it.
They are receptive to dockg specifically because it reads what is already on disk — but they
are also *skeptical for the same reason*, having been promised zero-effort metadata before.

## What they bring, and what they do not

**Bring:** git, YAML, CI, globs, exit codes, a static site generator's nav config.

**Do not bring:** RDF, SPARQL, SHACL, or any prior exposure to Turtle syntax. They may know the
phrase "knowledge graph" from marketing and have no working model behind it.

This gap is the docset's central design constraint. Priya can read `dockg build` output and act
on `dockg stats` without knowing what a triple is, and the on-ramp must let them. Turtle can be
shown — it is the product — but not required reading to proceed.

## What success looks like for them

A gate in CI that fails a PR when metadata regresses, a graph file that diffs cleanly in review,
and a `stats` number that goes up over time. They will consider dockg adopted when someone
*else* on the team hits the gate and fixes their own page without asking Priya anything.

## What loses them

- An on-ramp that explains RDF before producing output.
- A first run that requires a config file.
- Anything that implies a second system of record to keep in sync with the docs.
- Sample output that does not match what their terminal actually prints. Determinism means
  there is no excuse for this, and they will notice.

## Their journeys

[`cuj-first-graph`](../journeys/first-graph.md) ·
[`cuj-map-site-routes`](../journeys/map-site-routes.md) ·
[`cuj-gate-metadata-in-ci`](../journeys/gate-metadata-in-ci.md) ·
[`cuj-backfill-metadata`](../journeys/backfill-metadata.md) ·
[`cuj-query-the-graph`](../journeys/query-the-graph.md)

As the implementer on two of Renata's: [`cuj-audit-provenance`](../journeys/audit-provenance.md) ·
[`cuj-prove-coverage`](../journeys/prove-coverage.md)
