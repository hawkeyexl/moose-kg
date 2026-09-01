/**
 * A corpus of HTML and Markdown together (ADR 01038).
 *
 * The point of this fixture is the *seam*, not either format on its own: a
 * link's meaning must not depend on the syntax that expressed it, so an HTML
 * page and a Markdown page pointing at each other must both resolve, and an
 * anchor written in one must reach a section node minted by the other.
 *
 * It carries the same determinism gates as the main corpus — double-build byte
 * comparison, a version-normalized golden, and an n3 round-trip — because a
 * second parser is a second chance to emit unsorted or unstable output.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { DataFactory, Parser, Store } from "n3";
import { NS } from "../../src/core/vocab.js";
import { hermeticEnv } from "../helpers/git-env.js";
import { readZip } from "../helpers/zip.js";

const { namedNode } = DataFactory;

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(root, "dist", "cli.js");
const corpus = join(root, "test", "fixtures", "formats", "mixed");
const goldenDir = join(root, "test", "fixtures", "golden-formats");
const golden = join(goldenDir, "mixed.ttl");
const searchGolden = join(goldenDir, "mixed-search.json");

const HTML_DOC = "https://example.com/kg/doc/docs/install.html";
const MD_DOC = "https://example.com/kg/doc/docs/configuration.md";

function build(outPath: string): void {
  execFileSync(process.execPath, [cli, "build", "--out", outPath], {
    encoding: "utf8",
    cwd: corpus,
    env: hermeticEnv(),
  });
}

function store(ttl: string): Store {
  return new Store(new Parser({ format: "text/turtle" }).parse(ttl));
}

/** The tool version is stamped into the graph; normalize it so version bumps
 *  don't invalidate the golden. */
function normalizeVersion(ttl: string): string {
  return ttl.replace(/dockg:version "[^"]+"/g, 'dockg:version "X"');
}

function objectsOf(s: Store, subject: string, predicate: string): string[] {
  return s
    .getQuads(namedNode(subject), namedNode(predicate), null, null)
    .map((q) => q.object.value)
    .sort();
}

describe("a corpus of HTML and Markdown", () => {
  it("matches the golden output byte-for-byte (modulo tool version)", () => {
    const out = join(mkdtempSync(join(tmpdir(), "dockg-mixed-")), "graph.ttl");
    build(out);
    expect(normalizeVersion(readFileSync(out, "utf8"))).toBe(
      normalizeVersion(readFileSync(golden, "utf8")),
    );
  });

  it("is byte-identical across two runs (determinism gate)", () => {
    const dir = mkdtempSync(join(tmpdir(), "dockg-mixed-"));
    const a = join(dir, "a.ttl");
    const b = join(dir, "b.ttl");
    build(a);
    build(b);
    expect(readFileSync(a, "utf8")).toBe(readFileSync(b, "utf8"));
  });

  it("round-trips through the n3 Turtle parser (escaping/syntax gate)", () => {
    const quads = new Parser({ format: "text/turtle" }).parse(
      readFileSync(golden, "utf8"),
    );
    // Must equal the triple count `build` reports for this fixture.
    expect(quads.length).toBe(56);
  });

  it("resolves links in both directions across the format boundary", () => {
    const s = store(readFileSync(golden, "utf8"));
    // HTML → Markdown.
    expect(objectsOf(s, HTML_DOC, `${NS.dcterms}references`)).toEqual([MD_DOC]);
    // Markdown → an HTML *section*, so the anchor resolved against a node the
    // HTML analyzer minted.
    expect(objectsOf(s, MD_DOC, `${NS.dcterms}references`)).toEqual([
      `${HTML_DOC}#prerequisites`,
    ]);
  });

  it("reports a missing HTML target as broken, not as a static asset", () => {
    // ADR 01033 skips links to non-document extensions. `.html` only counts as
    // a document extension because the HTML analyzer is implemented — the two
    // lists are pinned to each other in analyzers.test.ts.
    const s = store(readFileSync(golden, "utf8"));
    expect(objectsOf(s, HTML_DOC, `${NS.dockg}brokenLink`)).toEqual([
      "./missing.html",
    ]);
  });

  it("takes a section's anchor from the enclosing element's id", () => {
    const s = store(readFileSync(golden, "utf8"));
    const sections = objectsOf(s, HTML_DOC, `${NS.dcterms}hasPart`);
    // Not `#install-the-sdk-1` or a slugged duplicate: the <section> id is
    // claimed once, by its first heading.
    expect(sections).toEqual([`${HTML_DOC}#install-the-sdk`]);
  });

  it("derives images, code languages and meta-tag metadata from HTML", () => {
    const s = store(readFileSync(golden, "utf8"));
    expect(objectsOf(s, HTML_DOC, `${NS.dockg}codeLanguage`)).toEqual(["bash"]);
    expect(objectsOf(s, HTML_DOC, `${NS.schema}image`)).toEqual([
      "https://example.com/kg/file/docs/images/architecture.png",
    ]);
    expect(objectsOf(s, HTML_DOC, `${NS.dcterms}description`)).toEqual([
      "Get the SDK onto a machine.",
    ]);
    // `type: how-to` from a <meta> tag, through the same harvest rule Markdown
    // frontmatter uses.
    expect(objectsOf(s, HTML_DOC, `${NS.iirds}has-topic-type`)).toEqual([
      `${NS.iirds}GenericTask`,
    ]);
  });

  it("passes dockg check — the shapes did not need to learn a new predicate", () => {
    const out = join(mkdtempSync(join(tmpdir(), "dockg-mixed-")), "graph.ttl");
    build(out);
    const report = execFileSync(
      process.execPath,
      [cli, "check", "--graph", out],
      { encoding: "utf8", cwd: corpus, env: hermeticEnv() },
    );
    expect(report).toContain("0 violations");
  });

  it("indexes HTML prose, never HTML markup", () => {
    const dir = mkdtempSync(join(tmpdir(), "dockg-mixed-"));
    const graph = join(dir, "graph.ttl");
    const search = join(dir, "search.json");
    build(graph);
    execFileSync(
      process.execPath,
      [cli, "export", "--format", "search", "--graph", graph, "--out", search],
      { encoding: "utf8", cwd: corpus, env: hermeticEnv() },
    );
    expect(readFileSync(search, "utf8")).toBe(
      readFileSync(searchGolden, "utf8"),
    );
    // The blunt version of the same claim, in case the golden is ever
    // regenerated from a broken build.
    expect(readFileSync(search, "utf8")).not.toMatch(/<\/?(?:p|h1|section)\b/);
  });

  it("labels each iiRDS rendition with its own media type", () => {
    // A consumer picks a renderer from `iirds:format`, so an HTML rendition
    // shipped as text/markdown is a wrong claim about the bytes in the package.
    const dir = mkdtempSync(join(tmpdir(), "dockg-mixed-"));
    const graph = join(dir, "graph.ttl");
    const pkg = join(dir, "package.zip");
    build(graph);
    execFileSync(
      process.execPath,
      [cli, "export", "--format", "iirds", "--graph", graph, "--out", pkg],
      { encoding: "utf8", cwd: corpus, env: hermeticEnv() },
    );
    const metadata = readZip(readFileSync(pkg))
      .get("META-INF/metadata.rdf")
      ?.toString("utf8");
    expect(metadata).toContain("text/html");
    expect(metadata).toContain("text/markdown");
  });

  it("emits no timestamp — a parser reaching for the clock would show here", () => {
    // `provenance.git: false` in this fixture, so the graph should carry no
    // dates at all. A new parser that stamped one would surface right here
    // rather than as an intermittent golden mismatch on someone else's machine.
    const s = store(readFileSync(golden, "utf8"));
    expect(
      s.getQuads(null, namedNode(`${NS.prov}generatedAtTime`), null, null),
    ).toHaveLength(0);
  });
});
