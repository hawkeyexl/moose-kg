---
id: aud-docs-as-code-teams
type: audience
segment: Docs-as-code teams
maturity: has docs-as-code and CI; metadata exists but is unenforced and unused
docs_owner: documentation engineer or technical writer working inside an engineering repo
status: lead
firmographics:
  - documentation lives in git alongside or beside code
  - Markdown or MDX, published by a static site generator
  - an existing CI pipeline that already gates on something (lint, links, build)
  - frontmatter is already present but inconsistent and machine-unreadable
  - team size small enough that one person owns the docs toolchain
relationship_stages:
  - evaluating: can this produce something useful from the repo I already have?
  - adopting: wiring build and validate into the existing pipeline
  - operating: keeping the gate green as the corpus grows
personas:
  - persona-docs-engineer
evidence_basis:
  - README.md quickstart, which assumes a Markdown repo and a working git checkout
  - the derive source set (frontmatter, sections, links, tags, images, code, provenance) — every one reads what a docs-as-code repo already has on disk
  - ADR 01009 (hermetic features ship on), which is written for someone who wants value without configuration
  - ADR 01011 (metadata coverage in moose-kg stats), which presumes an existing corpus with partial metadata
  - docmeta's validated lead persona (Maya, documentation engineer) — the sibling product's on-ramp segment
---

Documentation engineers who already run docs as code, and now want the metadata in their
frontmatter to be worth something.

## What they own

The docs toolchain, end to end. They chose the static site generator, they wrote the CI
workflow, and they are the person who gets pinged when the docs build goes red. Documentation
content may be written by many people, but exactly one person owns the pipeline, and that
person is this audience.

They are comfortable in git, YAML, and a CI config file. They are **not** RDF people. Most have
never written a SPARQL query and have no reason to want to.

## What they want

Something that turns the frontmatter they already have into an answer to questions they already
ask and currently answer by hand: *what links to this page? what did we break when we moved it?
which pages have no owner? how much of the corpus is actually annotated?*

The decisive quality is that moose-kg reads what is already on disk. There is no authoring step,
no separate metadata database, and no migration — `moose-kg build` over an existing repo produces
a graph on the first run. That is the entire pitch to this audience, and it is why they are the
lead: they are the segment that can get value before understanding the model.

## Why they are the lead audience

Three reasons, in order of weight:

1. **They are the only audience that can adopt moose-kg alone.** Every other segment needs someone
   in this role to wire it up. The information architect needs the build running before their
   `kg:` block means anything; the AI platform team needs a graph to consume; the compliance
   owner needs a gate someone else maintains.
2. **The product's defaults are built for them.** ADR 01009's rule — hermetic features on by
   default, network and spend always explicit — is a bet that the first run should just work
   without a config file. That is this persona's first run.
3. **Their failure mode is the one that kills adoption.** If they conclude moose-kg requires
   learning RDF before it returns anything, they leave. Every page in the on-ramp is
   constrained by that.

## Where the docset serves them

The `build/` and `govern/` tracks, plus the whole of `get-started/`. See
[`persona-docs-engineer`](../personas/docs-engineer.md) and journeys
[`cuj-first-graph`](../journeys/first-graph.md),
[`cuj-map-site-routes`](../journeys/map-site-routes.md),
[`cuj-gate-metadata-in-ci`](../journeys/gate-metadata-in-ci.md), and — through the brownfield
lens — [`cuj-backfill-metadata`](../journeys/backfill-metadata.md).
