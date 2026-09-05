/**
 * An AsciiDoc corpus (ADR 01045).
 *
 * The claims worth making end-to-end: a cross-file `xref` resolves to the
 * **source** `.adoc` rather than the `.html` a published site would serve,
 * anchors are Asciidoctor's own generated ids, an `include::` contributes
 * nothing at all, and running the whole thing through a converter has not
 * introduced any of the nondeterminism a converter easily could.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { DataFactory, Parser, Store } from "n3";
import { NS } from "../../src/core/vocab.js";
import { hermeticEnv } from "../helpers/git-env.js";

const { namedNode } = DataFactory;

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(root, "dist", "cli.js");
const corpus = join(root, "test", "fixtures", "formats", "asciidoc");
const goldenDir = join(root, "test", "fixtures", "golden-formats");
const golden = join(goldenDir, "asciidoc.ttl");
const searchGolden = join(goldenDir, "asciidoc-search.json");

const BASE = "https://example.com/kg/doc/docs";
const INSTALL = `${BASE}/install.adoc`;
const CONFIG = `${BASE}/configuration.adoc`;

function build(outPath: string): void {
  execFileSync(process.execPath, [cli, "build", "--out", outPath], {
    encoding: "utf8",
    cwd: corpus,
    env: hermeticEnv(),
  });
}

function store(): Store {
  return new Store(
    new Parser({ format: "text/turtle" }).parse(readFileSync(golden, "utf8")),
  );
}

function normalizeVersion(ttl: string): string {
  return ttl.replace(/dockg:version "[^"]+"/g, 'dockg:version "X"');
}

function objectsOf(s: Store, subject: string, predicate: string): string[] {
  return s
    .getQuads(namedNode(subject), namedNode(predicate), null, null)
    .map((q) => q.object.value)
    .sort();
}

describe("an AsciiDoc corpus", () => {
  it("matches the golden output byte-for-byte (modulo tool version)", () => {
    const out = join(mkdtempSync(join(tmpdir(), "dockg-adoc-")), "graph.ttl");
    build(out);
    expect(normalizeVersion(readFileSync(out, "utf8"))).toBe(
      normalizeVersion(readFileSync(golden, "utf8")),
    );
  });

  it("is byte-identical across two runs (determinism gate)", () => {
    const dir = mkdtempSync(join(tmpdir(), "dockg-adoc-"));
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
    expect(quads.length).toBe(56);
  });

  it("resolves a cross-file xref to the source .adoc, not a published .html", () => {
    // Asciidoctor rewrites `.adoc` to the output suffix by default. Left alone,
    // every cross-file xref in every corpus would point at a `.html` that is
    // not in the corpus, and so would be reported broken.
    const s = store();
    expect(objectsOf(s, INSTALL, `${NS.dcterms}references`)).toEqual([
      `${CONFIG}#keys`,
    ]);
    expect(objectsOf(s, CONFIG, `${NS.dcterms}references`)).toEqual([
      `${INSTALL}#prereq`,
    ]);
  });

  it("uses Asciidoctor's own anchors, generated and explicit alike", () => {
    const s = store();
    const top = objectsOf(s, INSTALL, `${NS.dcterms}hasPart`);
    expect(top).toEqual([`${INSTALL}#install-the-sdk`]);
    // `_verify` carries Asciidoctor's underscore prefix because that is the
    // anchor a published AsciiDoc site serves; `prereq` came from [[prereq]].
    expect(
      objectsOf(s, `${INSTALL}#install-the-sdk`, `${NS.dcterms}hasPart`),
    ).toEqual([`${INSTALL}#_verify`, `${INSTALL}#prereq`]);
  });

  it("makes the document title a level-1 section, like a Markdown h1", () => {
    const s = store();
    expect(
      objectsOf(s, `${INSTALL}#install-the-sdk`, `${NS.dockg}level`),
    ).toEqual(["1"]);
    expect(objectsOf(s, `${INSTALL}#prereq`, `${NS.dockg}level`)).toEqual([
      "2",
    ]);
  });

  it("reads document attributes, images, code languages and broken links", () => {
    const s = store();
    expect(objectsOf(s, INSTALL, `${NS.iirds}has-topic-type`)).toEqual([
      `${NS.iirds}GenericTask`,
    ]);
    expect(objectsOf(s, INSTALL, `${NS.dcterms}description`)).toEqual([
      "Get the SDK onto a machine.",
    ]);
    expect(objectsOf(s, INSTALL, `${NS.dockg}codeLanguage`)).toEqual(["bash"]);
    expect(objectsOf(s, INSTALL, `${NS.schema}image`)).toEqual([
      "https://example.com/kg/file/docs/images/architecture.png",
    ]);
    expect(objectsOf(s, INSTALL, `${NS.dockg}brokenLink`)).toEqual([
      "missing.adoc",
    ]);
  });

  it("passes dockg check — the shapes did not need to learn a new predicate", () => {
    const out = join(mkdtempSync(join(tmpdir(), "dockg-adoc-")), "graph.ttl");
    build(out);
    const report = execFileSync(
      process.execPath,
      [cli, "check", "--graph", out],
      { encoding: "utf8", cwd: corpus, env: hermeticEnv() },
    );
    expect(report).toContain("0 violations");
  });

  it("indexes AsciiDoc prose, never the converter's HTML", () => {
    const dir = mkdtempSync(join(tmpdir(), "dockg-adoc-"));
    const graph = join(dir, "graph.ttl");
    // `export --format search` writes a directory of per-locale artifacts
    // (ADR 01038). These corpora declare no route language, so everything
    // lands in the `und` bucket.
    const searchDir = join(dir, "search");
    build(graph);
    execFileSync(
      process.execPath,
      [
        cli,
        "export",
        "--format",
        "search",
        "--graph",
        graph,
        "--out",
        searchDir,
      ],
      { encoding: "utf8", cwd: corpus, env: hermeticEnv() },
    );
    const written = readFileSync(join(searchDir, "search.und.json"), "utf8");
    expect(written).toBe(readFileSync(searchGolden, "utf8"));
    expect(written).not.toMatch(/<\/?(?:div|h2|pre|code)\b/);
    expect(written).not.toContain("sectionbody");
  });

  it("neither resolves an include:: nor reports it as a broken link", () => {
    // Resolving it would make the graph depend on a file outside the corpus.
    // Reporting the unresolved directive as a broken link would blame the
    // author for a limitation of dockg's (ADR 01033) — and Asciidoctor renders
    // exactly that shape, `<a class="bare include">`, into the HTML.
    const dir = mkdtempSync(join(tmpdir(), "dockg-adoc-"));
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(
      join(dir, "docs", "a.adoc"),
      `= A\n\nBody.\n\ninclude::../../../etc/passwd[]\n`,
      "utf8",
    );
    writeFileSync(
      join(dir, "dockg.config.yaml"),
      `version: 1\nbaseIri: https://example.com/kg/\ninputs: ["docs/**/*.adoc"]\nprovenance:\n  git: false\n`,
      "utf8",
    );
    const out = join(dir, "g.ttl");
    const run = spawnSync(process.execPath, [cli, "build", "--out", out], {
      encoding: "utf8",
      cwd: dir,
      env: hermeticEnv(),
    });
    expect(run.status).toBe(0);
    const s = new Store(
      new Parser({ format: "text/turtle" }).parse(readFileSync(out, "utf8")),
    );
    expect(
      s.getQuads(null, namedNode(`${NS.dockg}brokenLink`), null, null),
    ).toHaveLength(0);
    expect(
      s.getQuads(null, namedNode(`${NS.dcterms}references`), null, null),
    ).toHaveLength(0);
    expect(existsSync(out)).toBe(true);
  });

  it("emits no timestamp — the converter never reached for the clock", () => {
    // Asciidoctor synthesizes `docdate`, `doctime` and `localdate` from the
    // system clock into document attributes. dockg never reads them, and this
    // is what would notice if it started to.
    const s = store();
    expect(
      s.getQuads(null, namedNode(`${NS.prov}generatedAtTime`), null, null),
    ).toHaveLength(0);
    expect(readFileSync(golden, "utf8")).not.toMatch(/20\d\d-\d\d-\d\d/);
  });
});
