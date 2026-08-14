/**
 * `moose-kg init` — scaffold the `kg:` section of moose.config.yaml.
 *
 * The file is shared with the rest of the moose tools, so "already exists" is
 * not the same as "already configured": a repo that runs another moose tool has
 * the file but no `kg:` section, and init must extend it rather than refuse.
 * Only an existing `kg:` section is refused. Extending appends, leaving every
 * other byte — including sibling sections and their comments — untouched.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { MooseKgError } from "../types.js";
import { DEFAULT_CONFIG_FILENAME } from "../core/config.js";

const STARTER = `kg:
  version: 1

  # Base IRI for every minted node. Set this to a namespace you control;
  # without it, IRIs fall back to the urn:moose-kg: placeholder.
  # baseIri: https://example.com/kg/

  inputs:
    - "docs/**/*.md"
  exclude:
    - "**/node_modules/**"

  # Output of \`moose-kg build\`.
  out: kg/graph.ttl

  # Map published-site routes back to source files so route-style links
  # (/docs/actions/find) become graph edges. Uncomment and adjust:
  # routes:
  #   - basePath: /docs
  #     root: docs
  #     extensions: [.md, .mdx]
  #     indexFiles: [index, README]

  # What to derive triples from. Remove entries to opt out.
  build:
    derive: [frontmatter, sections, links, tags, images, code, provenance]

  # PROV-O settings.
  # git: derive per-file provenance from git history (creation/modification
  #   dates as fallbacks, author agents, rename -> prov:wasRevisionOf) and
  #   stamp the build activity with the HEAD committer date. Deterministic
  #   per commit; wall-clock time never enters the graph.
  #   "auto" (default) derives it wherever git can run and warns where it
  #   cannot; true requires git, so an unavailable one fails the build; false
  #   skips git entirely.
  # qualified: emit prov:qualifiedAttribution/qualifiedAssociation nodes
  #   with roles alongside the direct properties.
  provenance:
    git: auto
    qualified: true

  # Schemas \`moose-kg validate\` checks via docmeta. Default: the frontmatter
  # schema bundled with moose-kg (schemas/frontmatter-0.8.json). Override with
  # file paths, URLs, or docmeta built-in ids:
  # validate:
  #   schemas: ["./my-schema.json"]

  # SHACL shapes \`moose-kg check\` validates the built graph against. Default:
  # the shapes contract bundled with moose-kg (shapes/moose-kg-0.5.ttl).
  # check:
  #   shapes: ["./my-shapes.ttl"]

  # Metadata coverage gate for \`moose-kg stats --check\`. A number applies to
  # every measured field; a map gates named fields only. Unset gates nothing.
  # stats:
  #   coverageThreshold:
  #     title: 100
  #     description: 50

  # LLM settings for \`moose-kg fill\` (SKOS frontmatter proposals).
  fill:
    provider: anthropic          # anthropic | openai | claude-cli | mock
    # model: claude-sonnet-4-5   # provider default when omitted
    # apiKeyEnv: ANTHROPIC_API_KEY
    temperature: 0
    maxCostUsd: 5
    cacheDir: .moose-kg/cache
    # fill proposes every field; confidence (0..1 per field) gates what is
    # written. Fields scored below minConfidence are reported, not written.
    minConfidence: 0.7
    # fields: defaults to every fillable field — uncomment to restrict.
    # Record kg.provenance (model + fields + confidence) on filled docs.
    writeProvenance: true
    # Reject proposals that would violate the SHACL shapes contract
    # (broader/narrower cycles, conflicting labels).
    validateGraph: true

  # Local embeddings for semantic search (\`moose-kg embed\`). Needs the optional
  # peer: npm install @huggingface/transformers
  # embed:
  #   model: onnx-community/granite-embedding-small-english-r2-ONNX
  #   dtype: q8            # q8 keeps embedding reproducible across platforms
  #   out: kg/vectors.bin  # gitignored: derived, binary, not CI-regenerable
  #   cacheDir: .moose-kg/embed-cache

  # Optional enrichment for \`moose-kg export --format iirds\` (the iiRDS package).
  # Absent, a minimal valid package is still produced.
  # export:
  #   iirds:
  #     title: My Docs        # package title (default: "moose-kg export")
  #     creator: Acme Corp     # Creator iirds:Party + vcard:Organization
  #     version: "1.3"         # iiRDS version literal: "1.2" | "1.3"
`;

export interface InitResult {
  path: string;
  /** `created` wrote a new file; `extended` appended `kg:` to a shared one. */
  mode: "created" | "extended";
}

export function runInit(cwd = process.cwd()): InitResult {
  const path = resolve(cwd, DEFAULT_CONFIG_FILENAME);
  if (!existsSync(path)) {
    writeFileSync(path, STARTER, "utf8");
    return { path, mode: "created" };
  }

  const existing = readFileSync(path, "utf8");
  let root: unknown;
  try {
    root = parseYaml(existing);
  } catch (e) {
    throw new MooseKgError(
      `Invalid YAML in ${DEFAULT_CONFIG_FILENAME}: ${
        e instanceof Error ? e.message : "parse error"
      } — fix it before running init.`,
    );
  }
  if (root != null && typeof root === "object" && "kg" in root) {
    throw new MooseKgError(
      `${DEFAULT_CONFIG_FILENAME} already has a \`kg:\` section — not overwriting.`,
    );
  }

  // Append rather than re-serialize: re-emitting parsed YAML would strip the
  // sibling tools' comments and reorder their keys.
  const separator = existing.endsWith("\n") ? "\n" : "\n\n";
  writeFileSync(path, existing + separator + STARTER, "utf8");
  return { path, mode: "extended" };
}
