/**
 * The `dockg:` vocabulary document, and the guard that keeps it honest
 * (ADR 01030).
 *
 * A vocabulary rots the first time a phase mints a predicate and forgets the
 * document. So the check runs in **both** directions: every term the emitter
 * can produce must be defined here, and nothing may be defined that the emitter
 * cannot produce. A definition for a term that does not exist is as misleading
 * as a term with no definition.
 *
 * The emitter's side is read from source rather than from a hand-kept list,
 * because a hand-kept list is the thing that drifts.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { Parser, Store, DataFactory } from "n3";
import { NS, ROLE } from "../../src/core/vocab.js";

const { namedNode } = DataFactory;
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VOCAB = join(root, "ns", "dockg-1.0.0.ttl");
const ONTOLOGY = "https://hawkeyexl.github.io/dockg/ns";

const store = new Store(
  new Parser().parse(readFileSync(VOCAB, "utf8")) as never,
);

/** Local names defined by the vocabulary document. */
function definedTerms(): Set<string> {
  const out = new Set<string>();
  for (const q of store.getQuads(null, null, null, null)) {
    if (q.subject.value.startsWith(NS.dockg)) {
      out.add(q.subject.value.slice(NS.dockg.length));
    }
  }
  return out;
}

/**
 * Local names the emitter can produce, read out of src/. Every mint goes
 * through the `${NS.dockg}name` template or the ROLE table, so one regex plus
 * the table is exhaustive.
 */
function mintedTerms(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".ts")) {
        for (const m of readFileSync(path, "utf8").matchAll(
          /NS\.dockg\}([A-Za-z][A-Za-z0-9]*)/g,
        )) {
          out.add(m[1]!);
        }
      }
    }
  };
  walk(join(root, "src"));
  for (const iri of Object.values(ROLE)) out.add(iri.slice(NS.dockg.length));
  return out;
}

describe("the dockg vocabulary document", () => {
  it("parses as Turtle", () => {
    expect(store.size).toBeGreaterThan(0);
  });

  it("defines every term the emitter can produce", () => {
    const missing = [...mintedTerms()].filter((t) => !definedTerms().has(t));
    expect(
      missing.sort(),
      `minted but undefined — add them to ns/dockg-1.0.0.ttl`,
    ).toEqual([]);
  });

  it("defines nothing the emitter cannot produce", () => {
    const extra = [...definedTerms()].filter((t) => !mintedTerms().has(t));
    expect(
      extra.sort(),
      `defined but never minted — a definition for a term that does not exist`,
    ).toEqual([]);
  });

  it("gives every term a label, a comment, and a way home", () => {
    for (const term of definedTerms()) {
      const s = namedNode(`${NS.dockg}${term}`);
      const has = (p: string): boolean =>
        store.countQuads(s, namedNode(p), null, null) > 0;
      expect(has("http://www.w3.org/2000/01/rdf-schema#label"), term).toBe(
        true,
      );
      expect(has("http://www.w3.org/2000/01/rdf-schema#comment"), term).toBe(
        true,
      );
      expect(
        has("http://www.w3.org/2000/01/rdf-schema#isDefinedBy"),
        term,
      ).toBe(true);
    }
  });

  it("carries the ontology header a consumer needs to use it", () => {
    const s = namedNode(ONTOLOGY);
    for (const p of [
      "http://purl.org/dc/terms/title",
      "http://purl.org/dc/terms/license",
      "http://www.w3.org/2002/07/owl#versionInfo",
      "http://www.w3.org/2002/07/owl#versionIRI",
      // The prefix the emitter actually writes, so a consumer that fetches
      // this document learns it rather than guessing.
      "http://purl.org/vocab/vann/preferredNamespacePrefix",
      "http://purl.org/vocab/vann/preferredNamespaceUri",
    ]) {
      expect(store.countQuads(s, namedNode(p), null, null), p).toBe(1);
    }
  });

  it("declares the prefix and namespace the emitter uses", () => {
    const objectOf = (p: string): string | undefined =>
      store.getQuads(namedNode(ONTOLOGY), namedNode(p), null, null)[0]?.object
        .value;
    expect(
      objectOf("http://purl.org/vocab/vann/preferredNamespacePrefix"),
    ).toBe("dockg");
    expect(objectOf("http://purl.org/vocab/vann/preferredNamespaceUri")).toBe(
      NS.dockg,
    );
  });

  it("states domain and range non-entailingly", () => {
    // rdfs:domain is an inference rule: it licenses a reasoner to type any
    // subject carrying the property. schema:domainIncludes documents the same
    // intent without entailing anything — which matters here, because ADR 01014
    // exists to refuse inference dockg did not assert.
    for (const p of [
      "http://www.w3.org/2000/01/rdf-schema#domain",
      "http://www.w3.org/2000/01/rdf-schema#range",
    ]) {
      expect(store.countQuads(null, namedNode(p), null, null), p).toBe(0);
    }
    expect(
      store.countQuads(
        null,
        namedNode("https://schema.org/domainIncludes"),
        null,
        null,
      ),
    ).toBeGreaterThan(0);
  });

  it("uses the namespace the emitter uses, not the retired one", () => {
    expect(readFileSync(VOCAB, "utf8")).not.toContain("dockg.dev");
    expect(NS.dockg).toBe("https://hawkeyexl.github.io/dockg/ns#");
  });

  it("is byte-identical to the copy the namespace IRI resolves to", () => {
    // The guard above protects the copy that ships in the npm package. The one
    // a consumer actually reaches by dereferencing
    // https://hawkeyexl.github.io/dockg/ns is docs/public/ns.ttl, and a
    // hand-kept second copy is exactly what this file's docstring warns drifts.
    const published = join(root, "docs", "public", "ns.ttl");
    expect(
      readFileSync(published, "utf8"),
      "docs/public/ns.ttl is stale — copy ns/dockg-1.0.0.ttl over it",
    ).toBe(readFileSync(VOCAB, "utf8"));
  });
});
