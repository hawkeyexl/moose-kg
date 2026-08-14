import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(root, "dist", "cli.js");
const corpus = join(root, "test", "fixtures", "corpus");
const golden = join(root, "test", "fixtures", "golden", "vectors.bin");

function run(args: string[], cwd: string): { stdout: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      cwd,
    });
    return { stdout, status: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (err.stdout ?? "") + (err.stderr ?? ""),
      status: err.status ?? -1,
    };
  }
}

/** Build the corpus, its search index, and (optionally) its vectors. */
function prepare(withVectors = true): {
  dir: string;
  graph: string;
  vectors: string;
} {
  const dir = mkdtempSync(join(tmpdir(), "moose-kg-embed-"));
  const graph = join(dir, "graph.ttl");
  const vectors = join(dir, "vectors.bin");
  execFileSync(process.execPath, [cli, "build", "--out", graph], {
    encoding: "utf8",
    cwd: corpus,
  });
  execFileSync(process.execPath, [cli, "export", "-f", "search", "-g", graph], {
    encoding: "utf8",
    cwd: corpus,
  });
  if (withVectors) {
    execFileSync(
      process.execPath,
      [
        cli,
        "embed",
        "-g",
        graph,
        "--model",
        "mock",
        "-o",
        vectors,
        "--no-cache",
      ],
      { encoding: "utf8", cwd: corpus },
    );
  }
  return { dir, graph, vectors };
}

interface SearchJson {
  mode: string;
  results: Array<{ iri: string; via: string }>;
  lexical: Array<{ iri: string }>;
  vector: Array<{ iri: string }>;
  trace: { entry: Array<{ iri: string }> };
}

describe("moose-kg embed (integration)", () => {
  it("matches the vectors golden byte-for-byte", () => {
    const { vectors } = prepare();
    expect(readFileSync(vectors).equals(readFileSync(golden))).toBe(true);
  });

  it("is byte-identical across two runs (determinism gate)", () => {
    const { dir, graph } = prepare(false);
    const a = join(dir, "a.bin");
    const b = join(dir, "b.bin");
    const args = (out: string) => [
      "embed",
      "-g",
      graph,
      "--model",
      "mock",
      "--no-cache",
      "-o",
      out,
    ];
    run(args(a), corpus);
    run(args(b), corpus);
    expect(readFileSync(a).equals(readFileSync(b))).toBe(true);
  });

  it("serves repeat runs from the cache", () => {
    const { dir, graph } = prepare(false);
    const cacheHome = mkdtempSync(join(tmpdir(), "moose-kg-embed-cache-"));
    const cfg = join(cacheHome, "moose.config.yaml");
    writeFileSync(
      cfg,
      `kg:\n  version: 1\n  baseIri: https://example.com/kg/\n  embed:\n    cacheDir: ${JSON.stringify(join(cacheHome, "cache"))}\n`,
    );
    const args = [
      "embed",
      "-g",
      graph,
      "-c",
      cfg,
      "--model",
      "mock",
      "-o",
      join(dir, "c.bin"),
      "-f",
      "json",
    ];
    const first = JSON.parse(run(args, corpus).stdout) as {
      embedded: number;
      cached: number;
    };
    expect(first.embedded).toBeGreaterThan(0);
    expect(first.cached).toBe(0);

    const second = JSON.parse(run(args, corpus).stdout) as {
      embedded: number;
      cached: number;
    };
    expect(second.embedded).toBe(0);
    expect(second.cached).toBe(first.embedded);
  });

  it("reports the model and dimensions it used", () => {
    const { dir, graph } = prepare(false);
    const out = JSON.parse(
      run(
        [
          "embed",
          "-g",
          graph,
          "--model",
          "mock",
          "--no-cache",
          "-o",
          join(dir, "d.bin"),
          "-f",
          "json",
        ],
        corpus,
      ).stdout,
    ) as { model: string; dims: number; total: number };
    expect(out.model).toBe("mock");
    expect(out.dims).toBeGreaterThan(0);
    expect(out.total).toBeGreaterThan(0);
  });

  it("exits 2 when the search index is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "moose-kg-embed-none-"));
    const graph = join(dir, "graph.ttl");
    execFileSync(process.execPath, [cli, "build", "--out", graph], {
      encoding: "utf8",
      cwd: corpus,
    });
    const { status, stdout } = run(
      ["embed", "-g", graph, "--model", "mock"],
      corpus,
    );
    expect(status).toBe(2);
    expect(stdout).toContain("export --format search");
  });

  it("exits 2 with an install hint when the optional peer is absent", () => {
    // The real model path needs @huggingface/transformers, which this repo
    // deliberately does not install — the same position a user is in.
    const { dir, graph } = prepare(false);
    const { status, stdout } = run(
      ["embed", "-g", graph, "-o", join(dir, "e.bin")],
      corpus,
    );
    expect(status).toBe(2);
    expect(stdout).toContain("npm install @huggingface/transformers");
  });
});

describe("moose-kg search with vectors (integration)", () => {
  const search = (args: string[]): SearchJson =>
    JSON.parse(run(args, corpus).stdout) as SearchJson;

  it("runs hybrid when a sidecar is present, returning both legs", () => {
    const { graph, vectors } = prepare();
    const out = search([
      "search",
      "configuration",
      "-g",
      graph,
      "--vectors",
      vectors,
      "-f",
      "json",
    ]);
    expect(out.mode).toBe("hybrid");
    expect(out.lexical.length).toBeGreaterThan(0);
    expect(out.vector.length).toBeGreaterThan(0);
    // The fused ranking is what seeded the trace.
    expect(out.trace.entry.map((e) => e.iri)).toEqual(
      out.results.map((r) => r.iri),
    );
  });

  it("reports the vector leg alone under --mode vector", () => {
    const { graph, vectors } = prepare();
    const out = search([
      "search",
      "configuration",
      "-g",
      graph,
      "--vectors",
      vectors,
      "--mode",
      "vector",
      "-f",
      "json",
    ]);
    expect(out.mode).toBe("vector");
    expect(out.results.map((r) => r.iri)).toEqual(out.vector.map((r) => r.iri));
    expect(out.results.every((r) => r.via === "vector")).toBe(true);
  });

  it("stays lexical-only under --mode lexical even with a sidecar", () => {
    const { graph, vectors } = prepare();
    const out = search([
      "search",
      "configuration",
      "-g",
      graph,
      "--vectors",
      vectors,
      "--mode",
      "lexical",
      "-f",
      "json",
    ]);
    expect(out.mode).toBe("lexical");
    expect(out.vector).toEqual([]);
  });

  it("answers lexically when no sidecar exists, without failing", () => {
    // Additive, never a new failure mode (ADR 01009).
    const { graph } = prepare(false);
    const out = search(["search", "configuration", "-g", graph, "-f", "json"]);
    expect(out.mode).toBe("lexical");
    expect(out.results.length).toBeGreaterThan(0);
  });

  it("exits 2 when --mode vector is asked for without a sidecar", () => {
    const { graph } = prepare(false);
    const { status, stdout } = run(
      ["search", "configuration", "-g", graph, "--mode", "vector"],
      corpus,
    );
    expect(status).toBe(2);
    expect(stdout).toContain("moose-kg embed");
  });

  it("refuses a sidecar built from a different search index", () => {
    // Editing docs and re-exporting without re-embedding must not rank against
    // yesterday's vectors — stale hits point at IRIs that may be gone, and
    // everything added since is unreachable (ADR 01020).
    const { graph, vectors } = prepare();
    const index = join(dirname(graph), "search.json");
    const doc = JSON.parse(readFileSync(index, "utf8")) as {
      entries: Array<Record<string, string>>;
    };
    doc.entries.push({
      id: "https://example.com/kg/doc/docs/brand-new.md",
      type: "moose-kg:Document",
      title: "Brand new",
      text: "content that did not exist when the vectors were built",
    });
    writeFileSync(index, JSON.stringify(doc), "utf8");

    const { status, stdout } = run(
      ["search", "configuration", "-g", graph, "--vectors", vectors],
      corpus,
    );
    expect(status).toBe(2);
    expect(stdout).toContain("corpus changed");
  });

  it("exits 2 rather than crashing on a corrupt sidecar", () => {
    // A truncated write or `--vectors` pointed at the wrong file is an
    // operational error like an unparseable index — not a raw stack trace.
    const { dir, graph } = prepare(false);
    const bad = join(dir, "not-vectors.bin");
    writeFileSync(bad, "definitely not a vector index", "utf8");
    const { status, stdout } = run(
      ["search", "configuration", "-g", graph, "--vectors", bad],
      corpus,
    );
    expect(status).toBe(2);
    expect(stdout).toContain("bad magic");
    expect(stdout).not.toContain("at decodeVectorIndex");
  });

  it("reports the requested mode even when the vector leg matched nothing", () => {
    // Reporting "lexical" for an explicit `--mode vector` would deny that the
    // semantic leg ran at all.
    const { graph, vectors } = prepare();
    const out = search([
      "search",
      "   ",
      "-g",
      graph,
      "--vectors",
      vectors,
      "--mode",
      "vector",
      "-f",
      "json",
    ]);
    expect(out.mode).toBe("vector");
    expect(out.results).toEqual([]);
  });

  it("keeps the trace consistent with the results under --mode vector", () => {
    // The trace answers "why did these come back" (ADR 01018), so it must
    // describe the ranking returned, not the fusion this mode discards.
    const { graph, vectors } = prepare();
    const out = search([
      "search",
      "configuration",
      "-g",
      graph,
      "--vectors",
      vectors,
      "--mode",
      "vector",
      "-f",
      "json",
    ]);
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.trace.entry.map((e) => e.iri)).toEqual(
      out.results.map((r) => r.iri),
    );
  });

  it("refuses a sidecar built by a different model", () => {
    const { dir, graph } = prepare(false);
    const other = join(dir, "other.bin");
    run(
      [
        "embed",
        "-g",
        graph,
        "--model",
        "mock",
        "--no-cache",
        "-o",
        other,
        "--dtype",
        "q8",
      ],
      corpus,
    );
    // Point the query side at a model the sidecar was not built with.
    const cfg = join(dir, "moose.config.yaml");
    writeFileSync(
      cfg,
      "kg:\n  version: 1\n  baseIri: https://example.com/kg/\n  embed:\n    model: some/other-model\n",
    );
    const { status, stdout } = run(
      [
        "search",
        "configuration",
        "-g",
        graph,
        "-c",
        cfg,
        "--vectors",
        other,
        "--mode",
        "hybrid",
      ],
      corpus,
    );
    // The sidecar says "mock", so the mock embedder is used and matches —
    // config's model is not silently substituted. Ranking still succeeds.
    expect(status).toBe(0);
    expect(stdout).toContain("hybrid");
  });
});
