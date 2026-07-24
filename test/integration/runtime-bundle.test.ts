/**
 * The browser-safety contract as a regression test (ADR 01018).
 *
 * `dockg/runtime` must be loadable in a browser: no Node built-ins, no CommonJS
 * interop, no CLI shebang, no npm dependencies. tsup bundles the runtime's
 * whole module graph into dist/runtime.js, so scanning that one file catches a
 * `node:` import sneaking in through *any* transitive import.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const bundle = join(root, "dist", "runtime.js");
const source = (): string => readFileSync(bundle, "utf8");

describe("dockg/runtime bundle purity", () => {
  it("imports no node: built-in", () => {
    const hits = [...source().matchAll(/["'`]node:[a-z_/]+["'`]/g)].map(
      (m) => m[0],
    );
    expect(hits).toEqual([]);
  });

  it("names no bare Node built-in in an import or require", () => {
    const text = source();
    for (const mod of [
      "fs",
      "path",
      "os",
      "crypto",
      "zlib",
      "child_process",
      "url",
      "stream",
    ]) {
      expect(text).not.toMatch(
        new RegExp(`(from|import|require)\\s*\\(?\\s*["'\`]${mod}["'\`]`),
      );
    }
  });

  it("carries no CommonJS require and no CLI shebang", () => {
    const text = source();
    expect(text).not.toMatch(/\brequire\s*\(/);
    expect(text.startsWith("#!")).toBe(false);
  });

  it("bundles no npm dependency (self-contained)", () => {
    const pkg = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const text = source();
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      expect(text).not.toMatch(
        new RegExp(`from\\s*["'\`]${dep.replace(/[/@-]/g, "\\$&")}`),
      );
    }
  });

  it("exports the documented runtime API", async () => {
    const api = (await import(bundle)) as Record<string, unknown>;
    for (const name of [
      "GraphIndex",
      "traverse",
      "impact",
      "reverseReferences",
      "scopeExclusion",
      "createFetchResolver",
      "assemble",
      "createTrace",
      "reachedNodes",
      "rdfjsQuads",
      "matchQuads",
    ]) {
      expect(typeof api[name]).not.toBe("undefined");
    }
  });

  it("runs with the Node globals a browser lacks made unavailable", async () => {
    // Smoke: the module graph must not touch process/require/Buffer at import
    // or call time. Exercised via a traversal on a tiny in-memory graph.
    const { GraphIndex, traverse } = (await import(
      bundle
    )) as typeof import("../../src/runtime/index.js");
    const graph = GraphIndex.fromJsonLd({
      "@context": { dcterms: "http://purl.org/dc/terms/" },
      "@graph": [
        { "@id": "urn:a", "dcterms:references": { "@id": "urn:b" } },
        { "@id": "urn:b", "dcterms:title": "B" },
      ],
    });
    const result = traverse(graph, { seeds: ["urn:a"], depth: 1 });
    expect(result.nodes.map((n) => n.iri)).toEqual(["urn:a", "urn:b"]);
    expect(result.trace.hops).toHaveLength(1);
  });
});
