import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { bundledSchemaPath, bundledShapesPath } from "../../src/core/pkg.js";
import { FIELD_SCHEMAS } from "../../src/llm/prompt.js";
import { COVERAGE_FIELD_NAMES } from "../../src/core/coverage.js";
import { PROVIDER_NAMES } from "../../src/core/config.js";
import {
  PAGE_TYPE_TO_TOPIC_TYPE,
  SOFTWARE_LIFECYCLE_IRIS,
  SOFTWARE_SUBJECT_IRIS,
  TOPIC_TYPE_IRIS,
} from "../../src/core/iirds.js";

/**
 * Drift guard: fill's proposal field schemas must stay a subset of the
 * bundled frontmatter schema's kg properties, or `dockg fill` writes
 * frontmatter that `dockg validate` rejects.
 */
describe("prompt FIELD_SCHEMAS ↔ bundled schema", () => {
  const schema = JSON.parse(
    readFileSync(bundledSchemaPath(import.meta.url), "utf8"),
  ) as {
    properties: { kg: { properties: Record<string, unknown> } };
    $defs?: {
      provenanceEntry?: {
        properties?: { fields?: { items?: { enum?: string[] } } };
      };
    };
  };
  const kgProperties = schema.properties.kg.properties;

  it("every fillable field exists in the bundled schema", () => {
    for (const field of Object.keys(FIELD_SCHEMAS)) {
      expect(
        kgProperties,
        `schema is missing fill field "${field}"`,
      ).toHaveProperty(field);
    }
  });

  /**
   * The property the guard exists for, tested directly rather than through a
   * proxy: a `kg` block shaped the way fill proposes must validate. Comparing
   * declared `type` strings stopped working once docmeta:kg put every field
   * behind a $ref — and it was always the weaker check, since it never proved
   * a proposed *value* was legal.
   */
  it("a kg block shaped like fill's proposal validates", () => {
    const sample = (fieldSchema: Record<string, unknown>): unknown => {
      if (Array.isArray(fieldSchema.enum)) return fieldSchema.enum[0];
      if (fieldSchema.type === "string") return "Sample";
      const items = fieldSchema.items as { enum?: string[] } | undefined;
      return [items?.enum ? items.enum[0] : "Sample"];
    };
    const kg = Object.fromEntries(
      Object.entries(FIELD_SCHEMAS).map(([field, fieldSchema]) => [
        field,
        sample(fieldSchema),
      ]),
    );

    const validate = new Ajv2020({
      allErrors: true,
      allowUnionTypes: true,
    }).compile(schema);
    expect(validate({ kg }), JSON.stringify(validate.errors)).toBe(true);
  });

  it("the provenance fields enum covers every fillable field", () => {
    const allowed =
      schema.$defs?.provenanceEntry?.properties?.fields?.items?.enum ?? [];
    for (const field of Object.keys(FIELD_SCHEMAS)) {
      expect(allowed, `provenance enum is missing "${field}"`).toContain(field);
    }
  });
});

/**
 * Drift guard: the coverage field list and the config schema's per-field
 * coverageThreshold map must name exactly the same fields, or a threshold set
 * in config would silently gate nothing (or Ajv would reject a valid field).
 */
describe("COVERAGE_FIELD_NAMES ↔ config schema", () => {
  const configSchema = JSON.parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "..",
        "src",
        "core",
        "config-schema.json",
      ),
      "utf8",
    ),
  ) as {
    properties: {
      stats: {
        properties: {
          coverageThreshold: {
            anyOf: Array<{ properties?: Record<string, unknown> }>;
          };
        };
      };
    };
  };

  it("the per-field threshold map names exactly the measured fields", () => {
    const mapForm =
      configSchema.properties.stats.properties.coverageThreshold.anyOf.find(
        (s) => s.properties,
      );
    expect(mapForm, "no object form in coverageThreshold anyOf").toBeDefined();
    expect(Object.keys(mapForm!.properties!).sort()).toEqual(
      [...COVERAGE_FIELD_NAMES].sort(),
    );
  });
});

/**
 * Drift guard: each iiRDS frontmatter enum in the bundled schema must name
 * exactly the keys of its src/core/iirds.ts map, or a valid frontmatter value
 * would derive no triple (or Ajv would reject a mapped one). ADR 01012.
 */
describe("iiRDS enums ↔ bundled schema", () => {
  type Node = {
    $ref?: string;
    enum?: string[];
    items?: { enum?: string[] };
    then?: { items?: { enum?: string[] } };
    else?: { enum?: string[] };
  };
  const parsed = JSON.parse(
    readFileSync(bundledSchemaPath(import.meta.url), "utf8"),
  ) as {
    properties: { kg: { properties: Record<string, Node> } };
    $defs: Record<string, Node> & {
      sectionMetadata: { properties: Record<string, Node> };
    };
  };
  const kg = parsed.properties.kg.properties;
  const sec = parsed.$defs.sectionMetadata.properties;

  /**
   * Follow the one $ref level docmeta:kg uses. Resolving rather than reading
   * `$defs` directly is deliberate: it catches a field repointed at the wrong
   * definition, which reading the definition by name never would.
   */
  const deref = (node: Node | undefined): Node | undefined => {
    if (!node?.$ref) return node;
    const name = node.$ref.replace("#/$defs/", "");
    return parsed.$defs[name];
  };

  /**
   * The values a field accepts. Every list field takes the single-string
   * shorthand (docmeta:kg widened these over dockg 0.8), so its enum lives on
   * both branches of a string-or-list conditional — and the two branches must
   * agree, or one spelling would accept a value the other rejects.
   */
  const valuesOf = (node: Node | undefined): string[] => {
    const d = deref(node);
    if (!d) return [];
    if (d.enum) return d.enum;
    const list = d.then?.items?.enum ?? d.items?.enum ?? [];
    const scalar = d.else?.enum;
    if (scalar) expect([...scalar].sort()).toEqual([...list].sort());
    return list;
  };

  // Both the document-level fields and the section-level (sectionMetadata)
  // fields are pinned to the same iirds.ts maps, so they cannot diverge from
  // the source of truth — or from each other. ADR 01012/01013.
  it.each([
    ["kg.type", () => valuesOf(kg["type"]), TOPIC_TYPE_IRIS],
    [
      "kg.about-product-lifecycle",
      () => valuesOf(kg["about-product-lifecycle"]),
      SOFTWARE_LIFECYCLE_IRIS,
    ],
    [
      "kg.about-product-aspect",
      () => valuesOf(kg["about-product-aspect"]),
      SOFTWARE_SUBJECT_IRIS,
    ],
    ["section.type", () => valuesOf(sec["type"]), TOPIC_TYPE_IRIS],
    [
      "section.about-product-lifecycle",
      () => valuesOf(sec["about-product-lifecycle"]),
      SOFTWARE_LIFECYCLE_IRIS,
    ],
    [
      "section.about-product-aspect",
      () => valuesOf(sec["about-product-aspect"]),
      SOFTWARE_SUBJECT_IRIS,
    ],
    // Negative-scope subject enums share the same value set (ADR 01014).
    [
      "kg.not-about-product-aspect",
      () => valuesOf(kg["not-about-product-aspect"]),
      SOFTWARE_SUBJECT_IRIS,
    ],
    [
      "section.not-about-product-aspect",
      () => valuesOf(sec["not-about-product-aspect"]),
      SOFTWARE_SUBJECT_IRIS,
    ],
  ] as const)("%s enum matches its IRI map keys", (_name, getEnum, map) => {
    expect([...getEnum()].sort()).toEqual(Object.keys(map).sort());
  });

  /**
   * The page-type derivation (ADR 01024) targets `kg.type`, so every value it
   * can produce must be a legal one — otherwise a derived type would silently
   * emit no triple.
   */
  it("every derived page type is a legal kg.type value", () => {
    for (const derived of Object.values(PAGE_TYPE_TO_TOPIC_TYPE)) {
      expect(valuesOf(kg["type"])).toContain(derived);
    }
  });
});

describe("documented bundled defaults ↔ pkg.ts", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const configPage = readFileSync(
    join(
      root,
      "docs",
      "src",
      "content",
      "docs",
      "reference",
      "configuration.mdx",
    ),
    "utf8",
  );
  const schemaFile = basename(bundledSchemaPath(import.meta.url));
  const shapesFile = basename(bundledShapesPath(import.meta.url));

  it("names the current bundled schema file", () => {
    expect(configPage).toContain(`schemas/${schemaFile}`);
  });

  it("names the current bundled shapes file", () => {
    expect(configPage).toContain(`shapes/${shapesFile}`);
  });
});

describe("PROVIDER_NAMES ↔ config schema", () => {
  it("names exactly the providers the schema accepts", () => {
    // One source of truth for the provider list. `--provider` is validated
    // against PROVIDER_NAMES and `fill.provider` against the JSON schema enum;
    // if the two drift, one path admits a name the other refuses, and
    // `providerSpecFor`'s cast to ProviderName stops being sound.
    const schema = JSON.parse(
      readFileSync(
        join(
          dirname(fileURLToPath(import.meta.url)),
          "..",
          "..",
          "src",
          "core",
          "config-schema.json",
        ),
        "utf8",
      ),
    ) as {
      properties: {
        fill: { properties: { provider: { enum: string[] } } };
      };
    };
    expect([...PROVIDER_NAMES].sort()).toEqual(
      [...schema.properties.fill.properties.provider.enum].sort(),
    );
  });
});
