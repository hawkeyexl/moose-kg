import { describe, expect, it } from "vitest";
import { GraphIndex } from "../../src/runtime/graph.js";
import {
  impact,
  resolveVariant,
  reverseReferences,
  scopeExclusion,
  traverse,
} from "../../src/runtime/traverse.js";
import { reachedNodes } from "../../src/runtime/trace.js";
import { NS, RDF_TYPE } from "../../src/core/vocab.js";
import {
  DOCKG_NOT_APPLICABLE_TO_VARIANT,
  IIRDS_RELATES_TO_PRODUCT_VARIANT,
} from "../../src/core/iirds.js";

const BASE = "https://ex.com/kg/";
const A = `${BASE}doc/a.md`;
const B = `${BASE}doc/b.md`;
const C = `${BASE}doc/c.md`;
const X100 = `${BASE}product/sp-x100`;
const X300 = `${BASE}product/sp-x300`;
const REFERENCES = `${NS.dcterms}references`;

/**
 * a → b → c over dcterms:references.
 * a: applies to X100. b: explicitly NOT applicable to X100. c: no scope claim.
 */
function fixture(): GraphIndex {
  return GraphIndex.fromQuads([
    { s: A, p: RDF_TYPE, o: { kind: "iri", value: `${NS.dockg}Document` } },
    { s: A, p: REFERENCES, o: { kind: "iri", value: B } },
    {
      s: A,
      p: IIRDS_RELATES_TO_PRODUCT_VARIANT,
      o: { kind: "iri", value: X100 },
    },
    { s: B, p: RDF_TYPE, o: { kind: "iri", value: `${NS.dockg}Document` } },
    { s: B, p: REFERENCES, o: { kind: "iri", value: C } },
    {
      s: B,
      p: DOCKG_NOT_APPLICABLE_TO_VARIANT,
      o: { kind: "iri", value: X100 },
    },
    { s: C, p: RDF_TYPE, o: { kind: "iri", value: `${NS.dockg}Document` } },
    {
      s: X100,
      p: RDF_TYPE,
      o: { kind: "iri", value: `${NS.iirds}ProductVariant` },
    },
    {
      s: X100,
      p: `${NS.dcterms}title`,
      o: { kind: "literal", value: "SP-X100" },
    },
    {
      s: X300,
      p: RDF_TYPE,
      o: { kind: "iri", value: `${NS.iirds}ProductVariant` },
    },
    {
      s: X300,
      p: `${NS.dcterms}title`,
      o: { kind: "literal", value: "SP-X300" },
    },
  ]);
}

describe("traverse", () => {
  it("walks outbound edges breadth-first with depth bounds", () => {
    const g = fixture();
    // Predicate IRIs sort iirds: < dcterms:, so X100 precedes B.
    const one = traverse(g, { seeds: [A], depth: 1 });
    expect(one.nodes.map((n) => n.iri)).toEqual([A, X100, B]);
    const two = traverse(g, { seeds: [A], depth: 2, predicates: [REFERENCES] });
    expect(two.nodes).toEqual([
      { iri: A, depth: 0 },
      { iri: B, depth: 1 },
      { iri: C, depth: 2 },
    ]);
  });

  it("does not follow rdf:type into class nodes by default", () => {
    const g = fixture();
    const r = traverse(g, { seeds: [A], depth: 2 });
    // Without this guard every document would be two hops from every other
    // via the shared dockg:Document class node — edge contamination.
    expect(r.nodes.map((n) => n.iri)).not.toContain(`${NS.dockg}Document`);
    expect(r.trace.hops.some((h) => h.predicate === RDF_TYPE)).toBe(false);
  });

  it("follows rdf:type when explicitly asked to", () => {
    const g = fixture();
    const r = traverse(g, { seeds: [A], depth: 1, includeTypeEdges: true });
    expect(r.nodes.map((n) => n.iri)).toContain(`${NS.dockg}Document`);
  });

  it("restricts to the requested predicates", () => {
    const g = fixture();
    const r = traverse(g, { seeds: [A], depth: 1, predicates: [REFERENCES] });
    expect(r.nodes.map((n) => n.iri)).toEqual([A, B]);
  });

  it("honors a node limit", () => {
    const g = fixture();
    const r = traverse(g, {
      seeds: [A],
      depth: 3,
      predicates: [REFERENCES],
      limit: 2,
    });
    expect(r.nodes).toHaveLength(2);
  });

  it("is deterministic across repeated runs and seed orderings", () => {
    const g = fixture();
    const a = traverse(g, { seeds: [A, C], depth: 2 });
    const b = traverse(g, { seeds: [C, A], depth: 2 });
    expect(b.nodes).toEqual(a.nodes);
    expect(b.trace.hops).toEqual(a.trace.hops);
  });

  it("ignores seeds that are not in the graph", () => {
    const g = fixture();
    const r = traverse(g, { seeds: [`${BASE}nope`], depth: 1 });
    expect(r.nodes).toEqual([]);
  });
});

describe("scope filtering", () => {
  it("excludes a node whose explicit negative names the variant", () => {
    const g = fixture();
    const r = traverse(g, {
      seeds: [A],
      depth: 2,
      predicates: [REFERENCES],
      variant: "SP-X100",
    });
    expect(r.nodes.map((n) => n.iri)).toEqual([A]);
    expect(r.trace.exclusions).toEqual([
      { node: B, rule: DOCKG_NOT_APPLICABLE_TO_VARIANT, value: X100 },
    ]);
  });

  it("excludes a node that scoped itself to other variants", () => {
    const g = fixture();
    // A declares X100 only, so under an X300 filter it is out of scope —
    // recorded under the positive predicate, not the negative one.
    const exclusion = scopeExclusion(g, A, { variantIri: X300 });
    expect(exclusion).toEqual({
      node: A,
      rule: IIRDS_RELATES_TO_PRODUCT_VARIANT,
      value: X300,
    });
  });

  it("keeps a node that makes no scope claim at all", () => {
    const g = fixture();
    expect(scopeExclusion(g, C, { variantIri: X100 })).toBeUndefined();
    expect(scopeExclusion(g, C, { variantIri: X300 })).toBeUndefined();
  });

  it("keeps everything when no scope filter is given", () => {
    const g = fixture();
    const r = traverse(g, { seeds: [A], depth: 2, predicates: [REFERENCES] });
    expect(r.nodes.map((n) => n.iri)).toEqual([A, B, C]);
    expect(r.trace.exclusions).toEqual([]);
  });

  it("resolves a variant by title, by slug, and by IRI", () => {
    const g = fixture();
    expect(resolveVariant(g, "SP-X100")).toBe(X100);
    expect(resolveVariant(g, "sp-x100")).toBe(X100);
    expect(resolveVariant(g, X100)).toBe(X100);
    expect(resolveVariant(g, "nope")).toBeUndefined();
  });
});

describe("reverseReferences and impact", () => {
  it("finds who links to a node", () => {
    const g = fixture();
    const r = reverseReferences(g, B);
    expect(r.nodes.map((n) => n.iri)).toEqual([B, A]);
  });

  it("reports transitive inbound reach, excluding the node itself", () => {
    const g = fixture();
    const r = impact(g, C, { predicates: [REFERENCES] });
    expect(r.nodes.map((n) => n.iri)).toEqual([B, A]);
  });
});

describe("trace completeness (the explainability contract)", () => {
  it("reaches every returned node through recorded entry or hop events", () => {
    const g = fixture();
    const r = traverse(g, { seeds: [A], depth: 2 });
    const reached = reachedNodes(r.trace);
    for (const node of r.nodes) expect(reached.has(node.iri)).toBe(true);
  });

  it("records an exclusion for every node filtered out of the results", () => {
    const g = fixture();
    const r = traverse(g, {
      seeds: [A],
      depth: 2,
      predicates: [REFERENCES],
      variant: "SP-X100",
    });
    const returned = new Set(r.nodes.map((n) => n.iri));
    const excluded = new Set(r.trace.exclusions.map((e) => e.node));
    // B was walked (a hop exists) but is absent from results — so it must have
    // an exclusion explaining why.
    const walked = new Set(r.trace.hops.map((h) => h.to));
    for (const iri of walked) {
      if (!returned.has(iri)) expect(excluded.has(iri)).toBe(true);
    }
    expect(excluded.has(B)).toBe(true);
  });

  it("records the hop even when the target is then excluded", () => {
    const g = fixture();
    const r = traverse(g, {
      seeds: [A],
      depth: 1,
      predicates: [REFERENCES],
      variant: "SP-X100",
    });
    expect(r.trace.hops).toEqual([
      { from: A, predicate: REFERENCES, to: B, depth: 1, direction: "out" },
    ]);
  });
});
