import { describe, expect, it } from "vitest";
import { createLexicalIndex } from "../../src/runtime/lexical.js";
import { findEntry, rrfMerge } from "../../src/runtime/entry.js";
import { createTrace, type EntryCandidate } from "../../src/runtime/trace.js";
import type { SearchIndexDoc } from "../../src/core/search-index.js";

const DOC = "https://ex.com/kg/doc/docs/a.md";
const SEC_INSTALL = `${DOC}#install`;
const SEC_OTHER = `${DOC}#other`;
const CONCEPT = "https://ex.com/kg/concept/configuration";

const INDEX: SearchIndexDoc = {
  version: 1,
  entries: [
    {
      id: CONCEPT,
      type: "skos:Concept",
      title: "Configuration",
      labels: "Configuration config settings",
    },
    {
      id: DOC,
      type: "dockg:Document",
      title: "A Document",
      description: "About installing.",
    },
    {
      id: SEC_INSTALL,
      type: "dockg:Section",
      title: "Install",
      text: "## Install\n\nRun the installer. The default cache directory is marmalade.",
    },
    {
      id: SEC_OTHER,
      type: "dockg:Section",
      title: "Other",
      text: "## Other\n\nUnrelated notes.",
    },
  ],
};

const index = () => createLexicalIndex(INDEX);

describe("createLexicalIndex", () => {
  it("accepts a JSON string as well as a parsed document", () => {
    expect(createLexicalIndex(JSON.stringify(INDEX)).size()).toBe(4);
  });

  it("finds a node by its title", () => {
    const [top] = index().search("install");
    expect(top?.iri).toBe(SEC_INSTALL);
    expect(top?.via).toBe("lexical");
  });

  it("finds a concept by an alternative label", () => {
    const hits = index().search("settings");
    expect(hits[0]?.iri).toBe(CONCEPT);
  });

  it("finds a node by body text the graph does not contain", () => {
    // "marmalade" appears only in the section body. The graph carries titles
    // only, so this is the case the search artifact exists to make possible
    // (ADR 01019) — without it, this query returns nothing.
    const hits = index().search("marmalade");
    expect(hits.map((h) => h.iri)).toContain(SEC_INSTALL);
  });

  it("tolerates a typo via fuzzy matching", () => {
    const hits = index().search("instal");
    expect(hits.map((h) => h.iri)).toContain(SEC_INSTALL);
  });

  it("honors the limit", () => {
    expect(index().search("install", { limit: 1 })).toHaveLength(1);
  });

  it("yields an empty index for JSON that is not a search artifact", () => {
    // MiniSearch's addAll throws "documents is not iterable" on this.
    const notAnIndex = JSON.stringify({ "@graph": [], entries: { a: 1 } });
    expect(() => createLexicalIndex(notAnIndex)).not.toThrow();
    expect(createLexicalIndex(notAnIndex).size()).toBe(0);
    expect(createLexicalIndex("null").size()).toBe(0);
  });

  it("returns nothing for an empty query or a term with no match", () => {
    expect(index().search("")).toEqual([]);
    expect(index().search("   ")).toEqual([]);
    expect(index().search("zzzznotpresent")).toEqual([]);
  });

  it("ranks identically across repeated searches", () => {
    const a = index().search("configuration");
    const b = index().search("configuration");
    expect(b).toEqual(a);
  });

  it("exposes the entry behind an IRI", () => {
    expect(index().entry(SEC_INSTALL)?.title).toBe("Install");
    expect(index().entry("urn:nope")).toBeUndefined();
  });
});

describe("rrfMerge", () => {
  const cand = (iri: string, via: EntryCandidate["via"]): EntryCandidate => ({
    iri,
    score: 1,
    via,
  });

  it("is an identity ranking for a single list", () => {
    const list = [cand("urn:a", "lexical"), cand("urn:b", "lexical")];
    expect(rrfMerge([list]).map((c) => c.iri)).toEqual(["urn:a", "urn:b"]);
  });

  it("keeps a single leg's provenance and marks fused seeds hybrid", () => {
    const lexical = [cand("urn:a", "lexical")];
    const vector = [cand("urn:a", "vector"), cand("urn:b", "vector")];
    const merged = rrfMerge([lexical, vector]);
    expect(merged.find((c) => c.iri === "urn:a")?.via).toBe("hybrid");
    expect(merged.find((c) => c.iri === "urn:b")?.via).toBe("vector");
  });

  it("ranks a node both legs agree on above one only a single leg found", () => {
    const lexical = [
      cand("urn:shared", "lexical"),
      cand("urn:onlyA", "lexical"),
    ];
    const vector = [cand("urn:shared", "vector"), cand("urn:onlyB", "vector")];
    expect(rrfMerge([lexical, vector])[0]?.iri).toBe("urn:shared");
  });

  it("does not depend on the order the rankings are passed in", () => {
    const a = [cand("urn:a", "lexical"), cand("urn:b", "lexical")];
    const b = [cand("urn:b", "vector"), cand("urn:c", "vector")];
    expect(rrfMerge([b, a])).toEqual(rrfMerge([a, b]));
  });

  it("breaks ties by IRI", () => {
    const one = [cand("urn:z", "lexical")];
    const two = [cand("urn:a", "vector")];
    // Both are rank 1 in their own list, so scores are equal.
    expect(rrfMerge([one, two]).map((c) => c.iri)).toEqual(["urn:a", "urn:z"]);
  });

  it("returns nothing for no rankings or empty ones", () => {
    expect(rrfMerge([])).toEqual([]);
    expect(rrfMerge([[], []])).toEqual([]);
  });
});

describe("findEntry", () => {
  it("records every candidate in the trace", () => {
    const trace = createTrace();
    const { candidates } = findEntry("install", { lexical: index(), trace });
    expect(candidates.length).toBeGreaterThan(0);
    expect(trace.entry).toEqual(candidates);
    expect(trace.entry[0]?.via).toBe("lexical");
  });

  it("honors the limit and starts its own trace when none is given", () => {
    const result = findEntry("install", { lexical: index(), limit: 1 });
    expect(result.candidates).toHaveLength(1);
    expect(result.trace.entry).toHaveLength(1);
  });

  it("falls back to the default limit when the limit is not a count", () => {
    // `--limit abc` parses to NaN; slice(0, NaN) would report "0 results" for a
    // query that does match.
    const result = findEntry("install", {
      lexical: index(),
      limit: Number.NaN,
    });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(
      findEntry("install", { lexical: index(), limit: 0 }).candidates,
    ).toHaveLength(0);
  });

  it("returns no candidates and no trace entries for an unmatched query", () => {
    const result = findEntry("zzzznotpresent", { lexical: index() });
    expect(result.candidates).toEqual([]);
    expect(result.trace.entry).toEqual([]);
  });
});
