---
status: "accepted"
date: 2026-08-13
decision-makers: [hawkeyexl]
---

# Rename dockg to moose-kg, and read one shared moose.config.yaml

## Context and Problem Statement

The project shipped as `dockg`: the npm package `@hawkeyexl/dockg`, the `dockg` binary, the
`dockg.config.yaml` config file, the `dockg:` RDF prefix bound to `https://dockg.dev/ns#`, and
the `dockg-N.N.ttl` SHACL shapes. It is being renamed to **moose-kg**, and it is no longer meant
to stand alone: it is the knowledge-graph tool in a family of `moose` tools that should be
configurable from one file rather than one file each.

Renaming a tool is mechanical. Three things about this one are not:

1. **The RDF namespace is a published identifier, not a label.** `dockg:Document` appears in every
   emitted graph, in the SHACL shapes contract, and in the JSON Schema `$id`s. Changing it changes
   what every consumer's queries must match.
2. **The frontmatter key was already `kg:`**, and the config file is about to grow a `kg:` section
   too. The two must not be conflated in the docs.
3. **A shared config file cannot have a closed root.** `additionalProperties: false` everywhere is
   an invariant of this codebase ([CLAUDE.md](../CLAUDE.md)); a file whose other sections belong to
   sibling tools breaks it by construction.

## Decision Drivers

- The rename must be total. A half-renamed tool with `dockg:` still in its output is worse than
  either name.
- Determinism is the product contract: the golden corpus must still reproduce byte-for-byte, and
  the change to it must be provably rename-only.
- Unknown keys must still fail loudly wherever the key is plausibly ours.
- Sharing a config file must not require moose-kg to know anything about its sibling tools.
- Nothing was ever published: `@hawkeyexl/dockg` is a 404 on the registry and the repo carries no
  `v*` tags, so no consumer exists to break.

## Considered Options

### The namespace and the published files

1. **Rewrite the namespace, schemas, and shapes in place** — one name, no history.
2. **Version up**: keep `dockg-0.5.ttl` and `frontmatter-0.8.json` byte-frozen, add
   `moose-kg-0.6.ttl` and `frontmatter-0.9.json` carrying the new IRIs.
3. **Rename the tool, keep the `dockg:` namespace** — cheapest diff.

### The config file

1. **`moose.config.yaml` with a `kg:` section**, root open, `kg:` subtree closed.
2. **`moose-kg.config.yaml`**, one file per tool, root closed as today.
3. **`moose.config.yaml` with a flat root**, tools sharing one namespace of keys.

## Decision Outcome

**Namespace: option 1 — rewrite in place.** The immutability rule exists to protect consumers of a
published contract. There are none: the package has never been published and the repo has never
been tagged, so "published" is counterfactual here. Freezing `dockg-0.5.ttl` forever would preserve
a name the project no longer uses, in a file no one has ever downloaded, and would leave the shapes
directory permanently half-renamed. The new identifiers are:

| Thing | Was | Is |
|---|---|---|
| npm package | `@hawkeyexl/dockg` | `moose-kg` (unscoped) |
| binary | `dockg` | `moose-kg` |
| RDF prefix | `dockg:` | `moose-kg:` |
| namespace IRI | `https://dockg.dev/ns#` | `https://moose-tools.dev/kg/ns#` |
| schema `$id` | `https://dockg.dev/schemas/…` | `https://moose-tools.dev/kg/schemas/…` |
| shapes | `shapes/dockg-0.5.ttl` | `shapes/moose-kg-0.5.ttl` |
| default base IRI | `urn:dockg:` | `urn:moose-kg:` |
| cache dirs | `.dockg/cache`, `.dockg/embed-cache` | `.moose-kg/…` |

`moose-kg` is a legal Turtle prefix — `PN_PREFIX` admits `-` after the first character — and a
legal XML `NCName`, so it serializes in Turtle, JSON-LD, and the iiRDS package's RDF/XML alike.
It is *not* a legal JS identifier, so `NS` in [src/core/vocab.ts](../src/core/vocab.ts) carries it
as a quoted key (the key stays the single source of truth for what is emitted) with a `MOOSE_KG`
alias for the ~145 call sites that build terms from it.

**Config: option 1 — `moose.config.yaml`, settings under `kg:`.** The root is open because sibling
tools own the other sections; the `kg:` subtree keeps `additionalProperties: false`. That leaves
exactly one gap — misspelling `kg:` itself is indistinguishable from a sibling's section — and it
is closed by making the two access paths differ:

- **Discovered** in the working directory with no `kg:` section → run on defaults. A repo may use
  other moose tools and not this one; that is not an error.
- **Named** with `--config <path>` with no `kg:` section → `MooseKgError`, exit 2. Naming the file
  states the intent, so silence would hide the mistake.

`moose-kg init` follows the same logic: "the file exists" is no longer "moose-kg is configured".
It creates the file when absent, **appends** a `kg:` section when one exists without it, and
refuses only when a `kg:` section is already present. Appending is textual rather than a
parse-and-reserialize, so sibling sections keep their comments and key order verbatim.

Option 2 was rejected because it defeats the purpose: a family of tools with a family config file
is the point, and one file per tool is what exists today. Option 3 was rejected because a flat
shared root makes every tool's keys collide and makes closed validation impossible for anyone.

### Consequences

- Good: one name everywhere, and one config file for the family.
- Good: the emitted vocabulary is self-describing again — `moose-kg:Document` names the tool that
  minted it.
- Bad: a misspelled `kg:` in a discovered config silently yields defaults. Mitigated by the
  explicit-path rule above and documented in the configuration reference.
- Bad: `moose-kg:` is three characters longer than `dockg:` in every triple of every emitted graph.
  Accepted: the graph is machine-read, and the prefix is declared once.
- Neutral: the prefix header reorders, because `moose-kg` sorts after `iirdsSft` where `dockg`
  sorted after `dcterms`. The emitter sorts prefixes, so this is automatic.

### Confirmation

- The corpus golden was **regenerated by running the built CLI**, not edited. A verification pass
  substituted the new names back to the old ones and compared line-sorted output against
  `HEAD`'s goldens: `graph.ttl`, `graph.jsonld`, `metadata.rdf`, and `search.json` are all
  rename-only. `traverse.json` is byte-identical (it names no `moose-kg:` term).
- The determinism gates are unchanged and green: double-build byte comparison, golden comparison
  (version-normalized), and the n3 Turtle round-trip.
- `dockg check` → `moose-kg check` passes on the clean corpus and on moose-kg's own docs graph, so
  the closed shapes learned the renamed predicates.
- New tests cover the shared config: sibling root sections are ignored, unknown keys inside `kg:`
  still throw, a discovered file without `kg:` falls back to defaults, an explicitly named one
  without `kg:` throws, and `init` extends a sibling-only file while refusing a `kg:`-bearing one.
- The three docs gates (`docs:check-strategy`, `docs:check-cli`, `docs:check-links`) pass, as does
  the full docs dogfood: `validate` → `build` → `check` → `stats --check` over `moose.docs.yaml`.

## Pros and Cons of the Options

### Namespace: rewrite in place

- Good, because the repo ends up with exactly one name in it.
- Good, because `shapes/` and `schemas/` stay legible instead of accumulating a dead generation.
- Bad, because it suspends a stated invariant — justified only by there being no published artifact.

### Namespace: version up

- Good, because it honors the immutability rule literally.
- Bad, because it freezes the old name into the package forever for zero consumers.
- Bad, because `dockg-0.5.ttl` shipping inside a package called `moose-kg` invites the question on
  every future read.

### Namespace: keep `dockg:`

- Good, because the diff is small and no golden changes.
- Bad, because every graph the tool emits would still announce a name the project abandoned.

### Config: `moose.config.yaml` with `kg:`

- Good, because one file serves the family and each tool's subtree stays closed.
- Bad, because the root cannot be closed, so a misspelled section name is not caught by schema
  validation alone.

### Config: `moose-kg.config.yaml` per tool

- Good, because the root stays closed and validation is unchanged.
- Bad, because it is the status quo under a new name, and leaves users with one config file per
  tool in the family.

### Config: flat shared root

- Good, because it is the shortest file to write.
- Bad, because tool key namespaces collide (`out`, `version`, and `inputs` are nobody's in
  particular), and no tool can validate strictly.
