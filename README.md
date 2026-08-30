# dockg

**Deterministic knowledge graphs derived from documentation you already wrote.**

`dockg` reads your docs — Markdown first — and derives an RDF knowledge graph from what is
already there: frontmatter fields, heading structure, links between pages, tags, images, and code
blocks. There is no authoring step and no second system of record. The build is **deterministic**
— stable IRIs, sorted serialization, byte-identical rebuilds — so the emitted `.ttl` diffs cleanly
in git and lives next to the docs it describes.

It pairs with [docmeta](https://github.com/hawkeyexl/docmeta), which powers `dockg validate`, and
follows the same CLI conventions as [docevals](https://github.com/hawkeyexl/docevals).

## Install

```bash
npm install -g @hawkeyexl/dockg
```

Requires Node.js 24+.

## Quick start

```bash
dockg build           # derive the graph -> kg/graph.ttl
dockg stats           # counts, orphan docs, broken links, metadata coverage
dockg check           # graph-level SHACL validation
```

```
Wrote kg/graph.ttl (5 docs, 167 triples)
```

No config file needed for the first run. Exit codes: `0` ok · `1` findings · `2` operational
error.

## Documentation

**<https://hawkeyexl.github.io/dockg/>**

| Track | What it covers |
|---|---|
| [Get started](https://hawkeyexl.github.io/dockg/get-started/) | Install, build a graph from a repo you already have, prove the build is reproducible |
| [Understand the model](https://hawkeyexl.github.io/dockg/concepts/) | Why prose never enters the graph, what determinism buys, what a missing value means |
| [Build your graph](https://hawkeyexl.github.io/dockg/build/) | The seven derive sources, route mappings, backfilling an unannotated corpus |
| [Model your metadata](https://hawkeyexl.github.io/dockg/model/) | SKOS concepts, iiRDS topic types, product-variant scope, section-level metadata |
| [Govern it in CI](https://hawkeyexl.github.io/dockg/govern/) | Make a metadata regression fail a pull request; coverage and provenance evidence |
| [Retrieve & export](https://hawkeyexl.github.io/dockg/retrieve/) | Browser-native retrieval with citations, JSON-LD and iiRDS export |
| [Fix a failing check](https://hawkeyexl.github.io/dockg/fix/) | Decode an error and fix the page |
| [Reference](https://hawkeyexl.github.io/dockg/reference/) | CLI, configuration, frontmatter, exit codes, embedding models |

The frontmatter schema and SHACL shapes ship in the package, so any JSON Schema or SHACL tool can
be pointed at them directly. The `kg` block is [`docmeta:kg`](https://hawkeyexl.github.io/docmeta/),
a common vocabulary docmeta publishes and dockg implements against:

```bash
docmeta validate --schema node_modules/@hawkeyexl/dockg/schemas/docmeta-kg-1.0.0-proposal.1.json docs/
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Design decisions are recorded as ADRs in [`adrs/`](adrs);
the design rationale is in [DESIGN.md](DESIGN.md).

## License

MIT
