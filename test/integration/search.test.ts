import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(root, "dist", "cli.js");
const corpus = join(root, "test", "fixtures", "corpus");
const golden = join(root, "test", "fixtures", "golden", "search.json");

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

/** Build the corpus and its search index into a fresh temp dir. */
function buildIndexed(): { dir: string; graph: string; index: string } {
  const dir = mkdtempSync(join(tmpdir(), "moose-kg-search-"));
  const graph = join(dir, "graph.ttl");
  execFileSync(process.execPath, [cli, "build", "--out", graph], {
    encoding: "utf8",
    cwd: corpus,
  });
  execFileSync(process.execPath, [cli, "export", "-f", "search", "-g", graph], {
    encoding: "utf8",
    cwd: corpus,
  });
  return { dir, graph, index: join(dir, "search.json") };
}

interface SearchJson {
  results: Array<{ iri: string; score: number; via: string; title?: string }>;
  trace: { entry: Array<{ iri: string }> };
}

function search(args: string[], cwd = corpus): SearchJson {
  return JSON.parse(run(args, cwd).stdout) as SearchJson;
}

describe("moose-kg export --format search (integration)", () => {
  it("matches the search golden byte-for-byte", () => {
    const { index } = buildIndexed();
    expect(readFileSync(index, "utf8")).toBe(readFileSync(golden, "utf8"));
  });

  it("is byte-identical across two exports (determinism gate)", () => {
    const { graph, dir } = buildIndexed();
    const a = join(dir, "a.json");
    const b = join(dir, "b.json");
    run(["export", "-f", "search", "-g", graph, "-o", a], corpus);
    run(["export", "-f", "search", "-g", graph, "-o", b], corpus);
    expect(readFileSync(a, "utf8")).toBe(readFileSync(b, "utf8"));
  });

  it("defaults the output to search.json beside the graph", () => {
    const { index } = buildIndexed();
    // Not graph.json — that would sit confusingly next to graph.jsonld.
    expect(index.endsWith("search.json")).toBe(true);
    expect(() => readFileSync(index, "utf8")).not.toThrow();
  });

  it("gives repeated headings their own text, not the first one's", () => {
    const { index } = buildIndexed();
    const doc = JSON.parse(readFileSync(index, "utf8")) as {
      entries: Array<{ id: string; text?: string }>;
    };
    const find = (suffix: string) =>
      doc.entries.find((e) => e.id.endsWith(suffix))?.text ?? "";
    // getting-started.md has two `## Install` headings.
    expect(find("#install")).toContain("Run the installer");
    expect(find("#install-1")).toContain("duplicate heading");
  });
});

describe("moose-kg search (integration)", () => {
  it("ranks the configuration nodes first for a title query", () => {
    const { graph } = buildIndexed();
    const out = search(["search", "configuration", "-g", graph, "-f", "json"]);
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results[0]!.iri).toContain("configuration");
    expect(out.results[0]!.via).toBe("lexical");
  });

  it("finds a section by body text the graph does not contain", () => {
    const { graph } = buildIndexed();
    // "installer" appears only in getting-started.md's body — the case the
    // search artifact exists to make findable (ADR 01019).
    const out = search(["search", "installer", "-g", graph, "-f", "json"]);
    expect(out.results.map((r) => r.iri)).toContain(
      "https://example.com/kg/doc/docs/getting-started.md#install",
    );
  });

  it("records every result in the trace and honors --limit", () => {
    const { graph } = buildIndexed();
    const out = search([
      "search",
      "configuration",
      "-g",
      graph,
      "--limit",
      "2",
      "-f",
      "json",
    ]);
    expect(out.results).toHaveLength(2);
    expect(out.trace.entry.map((e) => e.iri)).toEqual(
      out.results.map((r) => r.iri),
    );
  });

  it("reports no matches without failing", () => {
    const { graph } = buildIndexed();
    const { stdout, status } = run(
      ["search", "zzzznotpresent", "-g", graph],
      corpus,
    );
    expect(status).toBe(0);
    expect(stdout).toContain("(no matches)");
  });

  it("is deterministic across two runs", () => {
    const { graph } = buildIndexed();
    const args = ["search", "install", "-g", graph, "-f", "json"];
    expect(run(args, corpus).stdout).toBe(run(args, corpus).stdout);
  });

  it("exits 2 when the index is unreadable or the wrong file", () => {
    const { dir, graph } = buildIndexed();
    const corrupt = join(dir, "corrupt.json");
    writeFileSync(corrupt, "not json", "utf8");
    const parse = run(
      ["search", "anything", "-g", graph, "-i", corrupt],
      corpus,
    );
    expect(parse.status).toBe(2);
    expect(parse.stdout).toContain("Failed to parse");

    // A real file of the wrong shape — `-i` pointed at graph.jsonld — must not
    // report a confident "0 results" either.
    const wrong = join(dir, "wrong.json");
    writeFileSync(wrong, JSON.stringify({ "@graph": [] }), "utf8");
    const shape = run(["search", "anything", "-g", graph, "-i", wrong], corpus);
    expect(shape.status).toBe(2);
    expect(shape.stdout).toContain("Not a moose-kg search index");
  });

  it("exits 2 when the search index is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "moose-kg-search-none-"));
    const graph = join(dir, "graph.ttl");
    execFileSync(process.execPath, [cli, "build", "--out", graph], {
      encoding: "utf8",
      cwd: corpus,
    });
    const { status, stdout } = run(["search", "anything", "-g", graph], corpus);
    expect(status).toBe(2);
    expect(stdout).toContain("export --format search");
  });
});
