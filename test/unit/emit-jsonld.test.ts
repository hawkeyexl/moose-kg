import { describe, expect, it } from "vitest";
import { emitJsonLd } from "../../src/core/emit-jsonld.js";
import type { Quad } from "../../src/core/derive.js";
import { MOOSE_KG, NS, RDF_TYPE } from "../../src/core/vocab.js";

const iri = (value: string): Quad["o"] => ({ kind: "iri", value });
const lit = (value: string, datatype?: string): Quad["o"] => ({
  kind: "literal",
  value,
  ...(datatype ? { datatype } : {}),
});

type Node = Record<string, unknown>;

function parse(ttl: string): {
  context: Record<string, string>;
  graph: Node[];
} {
  const doc = JSON.parse(ttl) as {
    "@context": Record<string, string>;
    "@graph": Node[];
  };
  return { context: doc["@context"], graph: doc["@graph"] };
}

describe("emitJsonLd", () => {
  it("carries the full prefix table as @context", () => {
    const { context } = parse(emitJsonLd([]));
    expect(context["moose-kg"]).toBe(MOOSE_KG);
    expect(context.iirds).toBe(NS.iirds);
    expect(context.xsd).toBe(NS.xsd);
    // Keys are in prefix (alphabetical) order.
    expect(Object.keys(context)).toEqual([...Object.keys(context)].sort());
  });

  it("folds rdf:type into a compacted @type", () => {
    const s = `${MOOSE_KG}doc/a`;
    const quads: Quad[] = [
      { s, p: RDF_TYPE, o: iri(`${MOOSE_KG}Document`) },
      { s, p: RDF_TYPE, o: iri(`${NS.prov}Entity`) },
    ];
    const { graph } = parse(emitJsonLd(quads));
    expect(graph).toHaveLength(1);
    // Multiple types → sorted array of compacted class IRIs.
    expect(graph[0]!["@type"]).toEqual(["moose-kg:Document", "prov:Entity"]);
  });

  it("emits a single @type as a scalar, not an array", () => {
    const s = `${MOOSE_KG}doc/a`;
    const quads: Quad[] = [{ s, p: RDF_TYPE, o: iri(`${MOOSE_KG}Document`) }];
    const { graph } = parse(emitJsonLd(quads));
    expect(graph[0]!["@type"]).toBe("moose-kg:Document");
  });

  it("renders IRI objects as {@id}, plain literals as strings, typed as {@value,@type}", () => {
    const s = `${MOOSE_KG}doc/a`;
    const quads: Quad[] = [
      { s, p: `${NS.dcterms}references`, o: iri(`${MOOSE_KG}doc/b`) },
      { s, p: `${NS.dcterms}title`, o: lit("Hello") },
      { s, p: `${MOOSE_KG}wordCount`, o: lit("42", `${NS.xsd}integer`) },
    ];
    const { graph } = parse(emitJsonLd(quads));
    const node = graph[0]!;
    expect(node["dcterms:references"]).toEqual({ "@id": `${MOOSE_KG}doc/b` });
    expect(node["dcterms:title"]).toBe("Hello");
    expect(node["moose-kg:wordCount"]).toEqual({
      "@value": "42",
      "@type": "xsd:integer",
    });
  });

  it("treats an xsd:string datatype as a plain literal", () => {
    const s = `${MOOSE_KG}doc/a`;
    const quads: Quad[] = [
      { s, p: `${NS.dcterms}title`, o: lit("Hi", `${NS.xsd}string`) },
    ];
    const { graph } = parse(emitJsonLd(quads));
    expect(graph[0]!["dcterms:title"]).toBe("Hi");
  });

  it("collapses a single value to a scalar and keeps multiples as a sorted array", () => {
    const s = `${MOOSE_KG}doc/a`;
    const quads: Quad[] = [
      { s, p: `${NS.dcterms}references`, o: iri(`${MOOSE_KG}doc/c`) },
      { s, p: `${NS.dcterms}references`, o: iri(`${MOOSE_KG}doc/b`) },
      { s, p: `${NS.dcterms}title`, o: lit("One") },
    ];
    const { graph } = parse(emitJsonLd(quads));
    expect(graph[0]!["dcterms:title"]).toBe("One");
    expect(graph[0]!["dcterms:references"]).toEqual([
      { "@id": `${MOOSE_KG}doc/b` },
      { "@id": `${MOOSE_KG}doc/c` },
    ]);
  });

  it("sorts @graph nodes by @id and predicate keys within a node", () => {
    const quads: Quad[] = [
      { s: `${MOOSE_KG}doc/z`, p: `${NS.dcterms}title`, o: lit("Z") },
      { s: `${MOOSE_KG}doc/a`, p: `${MOOSE_KG}path`, o: lit("a.md") },
      { s: `${MOOSE_KG}doc/a`, p: `${NS.dcterms}title`, o: lit("A") },
    ];
    const { graph } = parse(emitJsonLd(quads));
    expect(graph.map((n) => n["@id"])).toEqual([
      `${MOOSE_KG}doc/a`,
      `${MOOSE_KG}doc/z`,
    ]);
    // Within the first node, @id leads, then predicate keys sorted.
    const keys = Object.keys(graph[0]!);
    expect(keys[0]).toBe("@id");
    expect(keys.slice(1)).toEqual([...keys.slice(1)].sort());
  });

  it("is byte-identical regardless of input quad order", () => {
    const s = `${MOOSE_KG}doc/a`;
    const forward: Quad[] = [
      { s, p: RDF_TYPE, o: iri(`${MOOSE_KG}Document`) },
      { s, p: `${NS.dcterms}title`, o: lit("A") },
      { s, p: `${NS.dcterms}references`, o: iri(`${MOOSE_KG}doc/b`) },
    ];
    const reversed = [...forward].reverse();
    expect(emitJsonLd(reversed)).toBe(emitJsonLd(forward));
  });

  it("ends with exactly one trailing newline and is valid JSON", () => {
    const out = emitJsonLd([
      { s: `${MOOSE_KG}doc/a`, p: `${NS.dcterms}title`, o: lit("A") },
    ]);
    expect(out.endsWith("}\n")).toBe(true);
    expect(out.endsWith("}\n\n")).toBe(false);
    expect(() => JSON.parse(out)).not.toThrow();
  });
});
