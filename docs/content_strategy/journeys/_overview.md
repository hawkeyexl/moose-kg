---
type: cuj-overview
journeys:
  - cuj-first-graph
  - cuj-map-site-routes
  - cuj-gate-metadata-in-ci
  - cuj-backfill-metadata
  - cuj-query-the-graph
  - cuj-model-concepts
  - cuj-scope-by-variant
  - cuj-section-granularity
  - cuj-localize-a-docset
  - cuj-serve-retrieval
  - cuj-export-to-consumer
  - cuj-audit-provenance
  - cuj-prove-coverage
  - cuj-fix-failing-check
anchors:
  - cuj-first-graph
  - cuj-fix-failing-check
---

The fourteen end-to-end outcomes dockg's documentation must let someone reach, and which persona
reaches each.

## What a CUJ is here

A complete outcome a persona can reach using dockg and its documentation. Not a feature, not a
page, and not a command. A journey is done when the persona has the result they came for. That is
why several journeys end in a verification step rather than a final command.

Journeys are named from the persona's mouth, in their words rather than the product's.

## Coverage matrix

Rows are personas, columns are journeys. `●` primary, `○` secondary participant.

| Journey | Priya<br>docs eng | Ines<br>info arch | Kwame<br>AI platform | Renata<br>compliance | Sam<br>contributor |
|---|:--:|:--:|:--:|:--:|:--:|
| [`cuj-first-graph`](first-graph.md) | ● | | | | |
| [`cuj-map-site-routes`](map-site-routes.md) | ● | | | | |
| [`cuj-gate-metadata-in-ci`](gate-metadata-in-ci.md) | ● | | | | |
| [`cuj-backfill-metadata`](backfill-metadata.md) | ● | ○ | | | |
| [`cuj-query-the-graph`](query-the-graph.md) | ● | ○ | | | |
| [`cuj-model-concepts`](model-concepts.md) | | ● | | | |
| [`cuj-scope-by-variant`](scope-by-variant.md) | | ● | | | |
| [`cuj-section-granularity`](section-granularity.md) | | ● | | | |
| [`cuj-localize-a-docset`](localize-a-docset.md) | ○ | ● | | | |
| [`cuj-serve-retrieval`](serve-retrieval.md) | | | ● | | |
| [`cuj-export-to-consumer`](export-to-consumer.md) | | ○ | ● | | |
| [`cuj-audit-provenance`](audit-provenance.md) | ○ | | | ● | |
| [`cuj-prove-coverage`](prove-coverage.md) | ○ | | | ● | |
| [`cuj-fix-failing-check`](fix-failing-check.md) | | | | | ● |

**Every persona has at least one journey; every journey has at least one persona.** Both
invariants hold.

## The two anchors

[`cuj-first-graph`](first-graph.md) and [`cuj-fix-failing-check`](fix-failing-check.md) carry
disproportionate weight and should be finished first.

`cuj-first-graph` is the **structural anchor**: every other journey assumes a graph exists, so if
this one fails nothing downstream is reachable. `cuj-fix-failing-check` is the **traffic anchor**:
it is the destination of every error message dockg emits, and every gate the other personas
install generates visits to it.

They fail in opposite ways. The first fails by demanding too much before returning value, such
as an RDF explanation before a build. The second fails by assuming context that a reader arriving
from a CI log does not have.

## The specify-and-implement pattern

Four journeys have two personas because one specifies and another executes:

- [`cuj-audit-provenance`](audit-provenance.md) and [`cuj-prove-coverage`](prove-coverage.md).
  Renata states the obligation, Priya wires the gate.
- [`cuj-backfill-metadata`](backfill-metadata.md). Priya runs `fill`, Ines decides whether the
  proposals are acceptable against the governed vocabulary.
- [`cuj-localize-a-docset`](localize-a-docset.md). Ines settles the locale model, Priya declares
  it once per route rather than once per file.

Pages serving these journeys have to work for both readers at once. State the requirement so it
can be forwarded, and the mechanism so it can be implemented. In practice that means
showing the resulting artifact *and* naming the command that produced it, rather than only one.

## Route coverage

**Every journey is fully backed: all 83 `steps[].doc` entries resolve to a real page.**

That field is the live coverage gate. A step carries `exists: false` and a `[GAP]` note while its
page is unwritten, and flips to `true` once the route resolves. `scripts/check-content-strategy.mjs`
fails the build both ways, so a step cannot claim a page that does not exist *or* keep claiming a
gap that has been filled.

Coverage of the routes is not coverage of the *content*: a page can exist and still serve its
journey badly. The [journey walk-through
test](../information_architecture/proposed-ia.md) is the qualitative check, and it is run by a
human.
