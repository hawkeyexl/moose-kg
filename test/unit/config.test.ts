import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, parseConfig } from "../../src/core/config.js";
import { MooseKgError } from "../../src/types.js";
import { underKg } from "../helpers/config.js";

describe("parseConfig", () => {
  it("applies defaults for a minimal config", () => {
    const c = parseConfig("kg:\n  version: 1\n", "/tmp/moose.config.yaml");
    expect(c.baseIri).toBe("urn:moose-kg:");
    expect(c.inputs).toEqual(["**/*.md"]);
    expect(c.exclude).toEqual(["**/node_modules/**"]);
    expect(c.out).toBe("kg/graph.ttl");
    expect(c.build.derive).toEqual([
      "frontmatter",
      "sections",
      "links",
      "tags",
      "images",
      "code",
      "provenance",
    ]);
    // empty = use the schema bundled with moose-kg (schemas/frontmatter-0.5.json)
    expect(c.validate.schemas).toEqual([]);
    // empty = use the shapes bundled with moose-kg (shapes/moose-kg-0.2.ttl)
    expect(c.check.shapes).toEqual([]);
    expect(c.fill.validateGraph).toBe(true);
    // Opinionated defaults (ADR 01009/01010): hermetic provenance ships on;
    // "auto" runs git where it can and degrades with a warning where it can't.
    expect(c.provenance).toEqual({ git: "auto", qualified: true });
    expect(c.fill.writeProvenance).toBe(true);
    expect(c.fill.provider).toBe("anthropic");
    expect(c.fill.temperature).toBe(0);
    expect(c.fill.maxCostUsd).toBe(5);
    expect(c.fill.cacheDir).toBe(".moose-kg/cache");
    // Fill proposes every field now; confidence gates what is written (ADR 01015).
    expect(c.fill.fields).toEqual([
      "prefLabel",
      "altLabels",
      "broader",
      "narrower",
      "related",
      "subjects",
      "topicType",
      "appliesTo",
      "softwareLifecyclePhase",
      "softwareSubject",
      "notApplicableTo",
      "notSoftwareSubject",
    ]);
    expect(c.fill.minConfidence).toBe(0.7);
    // Local embeddings default to granite, configurable (ADR 01020).
    expect(c.embed.model).toContain("granite-embedding-small-english-r2");
    expect(c.embed.dtype).toBe("q8");
    expect(c.embed.out).toBe("kg/vectors.bin");
    expect(c.embed.cacheDir).toBe(".moose-kg/embed-cache");
    // iiRDS export defaults: version 1.3, no title/creator (ADR 01017).
    expect(c.export.iirds).toEqual({
      title: undefined,
      creator: undefined,
      version: "1.3",
    });
  });

  it("parses embed overrides and accepts any model id", () => {
    // `model` is an open string, not an enum: the documented table is the
    // tested set, not the permitted set, so a newer model needs no release.
    const c = parseConfig(
      "kg:\n  version: 1\n  embed:\n    model: some/brand-new-model\n    dtype: fp32\n    out: v/x.bin\n    cacheDir: .c\n",
      "/tmp/moose.config.yaml",
    );
    expect(c.embed).toEqual({
      model: "some/brand-new-model",
      dtype: "fp32",
      out: "v/x.bin",
      cacheDir: ".c",
    });
  });

  it("rejects unknown embed keys", () => {
    expect(() =>
      parseConfig(
        "kg:\n  version: 1\n  embed:\n    bogus: true\n",
        "/tmp/moose.config.yaml",
      ),
    ).toThrow(MooseKgError);
  });

  it("parses export.iirds overrides", () => {
    const c = parseConfig(
      "kg:\n  version: 1\n  export:\n    iirds:\n      title: My Docs\n      creator: Acme\n      version: '1.2'\n",
      "/tmp/moose.config.yaml",
    );
    expect(c.export.iirds).toEqual({
      title: "My Docs",
      creator: "Acme",
      version: "1.2",
    });
  });

  it("rejects an unknown export.iirds version and unknown keys", () => {
    expect(() =>
      parseConfig(
        "kg:\n  version: 1\n  export:\n    iirds:\n      version: '2.0'\n",
        "/tmp/moose.config.yaml",
      ),
    ).toThrow(MooseKgError);
    expect(() =>
      parseConfig(
        "kg:\n  version: 1\n  export:\n    iirds:\n      bogus: true\n",
        "/tmp/moose.config.yaml",
      ),
    ).toThrow(MooseKgError);
  });

  it("normalizes baseIri with a trailing slash", () => {
    const c = parseConfig(
      "kg:\n  version: 1\n  baseIri: https://example.com/kg\n",
      "/tmp/moose.config.yaml",
    );
    expect(c.baseIri).toBe("https://example.com/kg/");
  });

  it("rejects unknown keys at the top of the kg section", () => {
    expect(() =>
      parseConfig(
        "kg:\n  version: 1\n  bogus: true\n",
        "/tmp/moose.config.yaml",
      ),
    ).toThrow(MooseKgError);
  });

  it("rejects a wrong version", () => {
    expect(() =>
      parseConfig("kg:\n  version: 2\n", "/tmp/moose.config.yaml"),
    ).toThrow(MooseKgError);
  });

  it("rejects invalid YAML", () => {
    expect(() =>
      parseConfig("version: [1\n", "/tmp/moose.config.yaml"),
    ).toThrow(MooseKgError);
  });

  it("parses check.shapes and fill.validateGraph overrides", () => {
    const c = parseConfig(
      "kg:\n  version: 1\n  check:\n    shapes: [my-shapes.ttl]\n  fill:\n    validateGraph: false\n",
      "/tmp/moose.config.yaml",
    );
    expect(c.check.shapes).toEqual(["my-shapes.ttl"]);
    expect(c.fill.validateGraph).toBe(false);
  });

  it("rejects unknown check keys", () => {
    expect(() =>
      parseConfig(
        "kg:\n  version: 1\n  check:\n    bogus: true\n",
        "/tmp/moose.config.yaml",
      ),
    ).toThrow(MooseKgError);
  });

  it("rejects an unknown fill provider", () => {
    expect(() =>
      parseConfig(
        "kg:\n  version: 1\n  fill:\n    provider: gemini\n",
        "/tmp/moose.config.yaml",
      ),
    ).toThrow(MooseKgError);
  });

  it("parses route mappings with defaults and normalization", () => {
    const c = parseConfig(
      "kg:\n  version: 1\n  routes:\n    - basePath: /docs/\n      root: docs/pages/\n",
      "/tmp/moose.config.yaml",
    );
    expect(c.routes).toEqual([
      {
        basePath: "/docs",
        root: "docs/pages",
        extensions: [".md", ".mdx"],
        indexFiles: ["index", "README"],
      },
    ]);
  });

  it("defaults routes to an empty list and requires root per mapping", () => {
    expect(parseConfig("kg:\n  version: 1\n", "/tmp/c.yaml").routes).toEqual(
      [],
    );
    expect(() =>
      parseConfig(
        "kg:\n  version: 1\n  routes:\n    - basePath: /docs\n",
        "/tmp/c.yaml",
      ),
    ).toThrow(MooseKgError);
  });

  it("parses fill.writeProvenance overrides", () => {
    const c = parseConfig(
      "kg:\n  version: 1\n  fill:\n    writeProvenance: false\n",
      "/tmp/moose.config.yaml",
    );
    expect(c.fill.writeProvenance).toBe(false);
  });

  it("parses provenance flags and rejects the retired gitTime key", () => {
    const c = parseConfig(
      "kg:\n  version: 1\n  provenance:\n    git: true\n    qualified: true\n",
      "/tmp/moose.config.yaml",
    );
    expect(c.provenance).toEqual({ git: true, qualified: true });
    expect(() =>
      parseConfig(
        "kg:\n  version: 1\n  provenance:\n    gitTime: true\n",
        "/tmp/moose.config.yaml",
      ),
    ).toThrow(MooseKgError);
  });

  it("defaults stats.coverageThreshold to an empty (ungated) map", () => {
    const c = parseConfig("kg:\n  version: 1\n", "/tmp/moose.config.yaml");
    expect(c.stats.coverageThreshold).toEqual({});
  });

  it("expands a uniform coverage threshold across every measured field", () => {
    const c = parseConfig(
      "kg:\n  version: 1\n  stats:\n    coverageThreshold: 80\n",
      "/tmp/moose.config.yaml",
    );
    // Every one of the seven fields gated at the same value.
    expect(c.stats.coverageThreshold.title).toBe(80);
    expect(Object.keys(c.stats.coverageThreshold).sort()).toEqual([
      "created",
      "creator",
      "description",
      "modified",
      "prefLabel",
      "subject",
      "title",
    ]);
  });

  it("parses a per-field coverage threshold map and leaves others ungated", () => {
    const c = parseConfig(
      "kg:\n  version: 1\n  stats:\n    coverageThreshold:\n      title: 100\n      description: 50\n",
      "/tmp/moose.config.yaml",
    );
    expect(c.stats.coverageThreshold).toEqual({ title: 100, description: 50 });
  });

  it("rejects out-of-range and unknown coverage threshold fields", () => {
    for (const bad of [
      "stats:\n  coverageThreshold: 101\n",
      "stats:\n  coverageThreshold: -1\n",
      "stats:\n  coverageThreshold:\n    bogus: 50\n",
      "stats:\n  coverageThreshold:\n    title: 101\n",
    ]) {
      expect(() =>
        parseConfig(
          `kg:\n  version: 1\n${underKg(bad)}`,
          "/tmp/moose.config.yaml",
        ),
      ).toThrow(MooseKgError);
    }
  });

  it("parses all three provenance.git modes and rejects other strings", () => {
    for (const mode of ["auto", true, false] as const) {
      const c = parseConfig(
        `kg:\n  version: 1\n  provenance:\n    git: ${JSON.stringify(mode)}\n`,
        "/tmp/moose.config.yaml",
      );
      expect(c.provenance.git).toBe(mode);
    }
    expect(() =>
      parseConfig(
        "kg:\n  version: 1\n  provenance:\n    git: maybe\n",
        "/tmp/moose.config.yaml",
      ),
    ).toThrow(MooseKgError);
  });

  it("rejects an unknown derive source", () => {
    expect(() =>
      parseConfig(
        "kg:\n  version: 1\n  build:\n    derive: [frontmatter, telepathy]\n",
        "/tmp/moose.config.yaml",
      ),
    ).toThrow(MooseKgError);
  });
});

describe("loadConfig", () => {
  it("falls back to defaults when no config file exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "moose-kg-config-"));
    const c = loadConfig(undefined, dir);
    expect(c.baseIri).toBe("urn:moose-kg:");
  });

  it("loads moose.config.yaml from cwd", () => {
    const dir = mkdtempSync(join(tmpdir(), "moose-kg-config-"));
    writeFileSync(
      join(dir, "moose.config.yaml"),
      "kg:\n  version: 1\n  out: graph.ttl\n",
    );
    const c = loadConfig(undefined, dir);
    expect(c.out).toBe("graph.ttl");
  });

  it("throws for an explicit missing path", () => {
    expect(() => loadConfig("Z:/nope/moose.config.yaml")).toThrow(MooseKgError);
  });
});

/**
 * moose.config.yaml is shared across the moose tool family: each tool reads its
 * own top-level section. That makes the root open (a sibling's section is not
 * an error) while the `kg:` subtree stays closed (our own typos still fail).
 */
describe("the shared moose.config.yaml", () => {
  it("ignores sibling tools' root sections", () => {
    const c = parseConfig(
      "lint:\n  rules: [no-passive]\nkg:\n  version: 1\n  out: g.ttl\n",
      "/tmp/moose.config.yaml",
    );
    expect(c.out).toBe("g.ttl");
  });

  it("applies defaults for a discovered file that has no kg section", () => {
    const dir = mkdtempSync(join(tmpdir(), "moose-kg-config-"));
    writeFileSync(join(dir, "moose.config.yaml"), "lint:\n  rules: []\n");
    // A repo may use other moose tools and not this one — that is not an error.
    const c = loadConfig(undefined, dir);
    expect(c.baseIri).toBe("urn:moose-kg:");
    expect(c.out).toBe("kg/graph.ttl");
  });

  it("throws when a file named explicitly has no kg section", () => {
    const dir = mkdtempSync(join(tmpdir(), "moose-kg-config-"));
    const path = join(dir, "moose.config.yaml");
    writeFileSync(path, "lint:\n  rules: []\n");
    // Naming the file states the intent, so silence would hide the mistake.
    expect(() => loadConfig(path)).toThrow(/no `kg:` section/);
  });
});
