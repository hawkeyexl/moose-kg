# moose-kg

**Deterministic knowledge graphs derived from documentation you already wrote.**

`moose-kg` reads your docs — Markdown first — and derives an RDF knowledge graph from what is
already there: frontmatter fields, heading structure, links between pages, tags, images, and code
blocks. There is no authoring step and no second system of record. The build is **deterministic**
— stable IRIs, sorted serialization, byte-identical rebuilds — so the emitted `.ttl` diffs cleanly
in git and lives next to the docs it describes.

It pairs with [docmeta](https://github.com/hawkeyexl/docmeta), which powers `moose-kg validate`, and
follows the same CLI conventions as [docevals](https://github.com/hawkeyexl/docevals).

## Install

```bash
npm install -g moose-kg
```

Requires Node.js 24+.

## Quick start

```bash
moose-kg build           # derive the graph -> kg/graph.ttl
moose-kg stats           # counts, orphan docs, broken links, metadata coverage
moose-kg check           # graph-level SHACL validation
```

```
Wrote kg/graph.ttl (4 docs, 139 triples)
```

No config file needed for the first run. Exit codes: `0` ok · `1` findings · `2` operational
error.

## Documentation

**<https://hawkeyexl.github.io/moose-kg/>**

| Track | What it covers |
|---|---|
| [Get started](https://hawkeyexl.github.io/moose-kg/get-started/) | Install, build a graph from a repo you already have, prove the build is reproducible |
| [Understand the model](https://hawkeyexl.github.io/moose-kg/concepts/) | Why prose never enters the graph, what determinism buys, what a missing value means |
| [Build your graph](https://hawkeyexl.github.io/moose-kg/build/) | The seven derive sources, route mappings, backfilling an unannotated corpus |
| [Model your metadata](https://hawkeyexl.github.io/moose-kg/model/) | SKOS concepts, iiRDS topic types, product-variant scope, section-level metadata |
| [Govern it in CI](https://hawkeyexl.github.io/moose-kg/govern/) | Make a metadata regression fail a pull request; coverage and provenance evidence |
| [Retrieve & export](https://hawkeyexl.github.io/moose-kg/retrieve/) | Browser-native retrieval with citations, JSON-LD and iiRDS export |
| [Fix a failing check](https://hawkeyexl.github.io/moose-kg/fix/) | Decode an error and fix the page |
| [Reference](https://hawkeyexl.github.io/moose-kg/reference/) | CLI, configuration, frontmatter, exit codes, embedding models |

moose-kg's frontmatter schemas and SHACL shapes ship in the package, so any JSON Schema or SHACL
tool can be pointed at them directly:

```bash
docmeta validate --schema node_modules/moose-kg/schemas/frontmatter-0.8.json docs/
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Design decisions are recorded as ADRs in [`adrs/`](adrs);
the design rationale is in [DESIGN.md](DESIGN.md).

## License

MIT
