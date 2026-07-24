import { describe, expect, it } from "vitest";
import {
  buildSearchIndex,
  emitSearchIndex,
  type SearchEntry,
} from "../../src/core/search-index.js";
import { GraphIndex } from "../../src/runtime/graph.js";
import type { Quad } from "../../src/core/derive.js";
import { NS, RDF_TYPE } from "../../src/core/vocab.js";

const BASE = "https://ex.com/kg/";
const DOC = `${BASE}doc/docs/a.md`;
const SEC_INSTALL = `${DOC}#install`;
const LOOSE = `${BASE}doc/docs/loose.md`;
const CONCEPT = `${BASE}concept/configuration`;

const iri = (value: string): Quad["o"] => ({ kind: "iri", value });
const lit = (value: string, datatype?: string): Quad["o"] =>
  datatype ? { kind: "literal", value, datatype } : { kind: "literal", value };

const A_MD = `# A

Preamble prose.

## Install

Run the installer. The default cache directory is .dockg/cache.

## Other

Other things.
`;

const LOOSE_MD = `# Loose

No headings besides the title. Mentions marmalade.
`;

function fixture(): GraphIndex {
  return GraphIndex.fromQuads([
    { s: DOC, p: RDF_TYPE, o: iri(`${NS.dockg}Document`) },
    { s: DOC, p: `${NS.dockg}path`, o: lit("docs/a.md") },
    { s: DOC, p: `${NS.dcterms}title`, o: lit("A Document") },
    { s: DOC, p: `${NS.dcterms}description`, o: lit("About installing.") },

    { s: SEC_INSTALL, p: RDF_TYPE, o: iri(`${NS.dockg}Section`) },
    { s: SEC_INSTALL, p: `${NS.dcterms}title`, o: lit("Install") },
    {
      s: SEC_INSTALL,
      p: `${NS.dockg}level`,
      o: lit("2", `${NS.xsd}integer`),
    },

    { s: LOOSE, p: RDF_TYPE, o: iri(`${NS.dockg}Document`) },
    { s: LOOSE, p: `${NS.dockg}path`, o: lit("docs/loose.md") },
    { s: LOOSE, p: `${NS.dcterms}title`, o: lit("Loose") },

    { s: CONCEPT, p: RDF_TYPE, o: iri(`${NS.skos}Concept`) },
    { s: CONCEPT, p: `${NS.skos}prefLabel`, o: lit("Configuration") },
    { s: CONCEPT, p: `${NS.skos}prefLabel`, o: lit("configuration") },
    { s: CONCEPT, p: `${NS.skos}altLabel`, o: lit("config") },
    { s: CONCEPT, p: `${NS.skos}altLabel`, o: lit("settings") },
  ]);
}

const SOURCES: Record<string, string> = {
  "docs/a.md": A_MD,
  "docs/loose.md": LOOSE_MD,
};
const readDoc = (path: string): string | undefined => SOURCES[path];

function build(
  overrides: Partial<Parameters<typeof buildSearchIndex>[2]> = {},
) {
  return buildSearchIndex(fixture(), "/nowhere", { readDoc, ...overrides });
}

function byId(entries: SearchEntry[], id: string): SearchEntry | undefined {
  return entries.find((e) => e.id === id);
}

describe("buildSearchIndex", () => {
  it("emits an entry per indexable node type with its compacted type", () => {
    const { entries } = build();
    expect(byId(entries, DOC)?.type).toBe("dockg:Document");
    expect(byId(entries, SEC_INSTALL)?.type).toBe("dockg:Section");
    expect(byId(entries, CONCEPT)?.type).toBe("skos:Concept");
  });

  it("gives a section its own body slice", () => {
    const section = byId(build().entries, SEC_INSTALL);
    expect(section?.text).toContain("Run the installer");
    expect(section?.text).toContain(".dockg/cache");
    // The slice stops at the next same-level heading.
    expect(section?.text).not.toContain("Other things");
  });

  it("withholds body text from a document that has sections", () => {
    const doc = byId(build().entries, DOC);
    // Otherwise the document shadows every section inside it (granularity rule).
    expect(doc?.text).toBeUndefined();
    expect(doc?.title).toBe("A Document");
    expect(doc?.description).toBe("About installing.");
  });

  it("gives body text to a document that has no sections", () => {
    const loose = byId(build().entries, LOOSE);
    expect(loose?.text).toContain("marmalade");
  });

  it("dedupes labels case-insensitively and sorts them", () => {
    const concept = byId(build().entries, CONCEPT);
    // "Configuration" and "configuration" collapse to one.
    expect(concept?.labels).toBe("Configuration config settings");
    expect(concept?.title).toBe("Configuration");
  });

  it("sorts entries by id", () => {
    const ids = build().entries.map((e) => e.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("omits absent fields rather than emitting undefined", () => {
    const concept = byId(build().entries, CONCEPT)!;
    expect("text" in concept).toBe(false);
    expect("description" in concept).toBe(false);
  });

  it("warns and indexes without text when a source file is missing", () => {
    const warnings: string[] = [];
    const index = buildSearchIndex(fixture(), "/nowhere", {
      readDoc: () => undefined,
      warnings,
    });
    expect(warnings.some((w) => w.includes("docs/a.md"))).toBe(true);
    expect(byId(index.entries, SEC_INSTALL)?.text).toBeUndefined();
    // The node is still findable by title.
    expect(byId(index.entries, SEC_INSTALL)?.title).toBe("Install");
  });

  it("is byte-identical across two builds", () => {
    expect(emitSearchIndex(build())).toBe(emitSearchIndex(build()));
  });

  it("ends with exactly one trailing newline and is valid JSON", () => {
    const out = emitSearchIndex(build());
    expect(out.endsWith("}\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
    expect(() => JSON.parse(out)).not.toThrow();
  });
});
