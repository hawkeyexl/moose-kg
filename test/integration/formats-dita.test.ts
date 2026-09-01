/**
 * A DITA corpus: two topics and a map (ADR 01039).
 *
 * The claims that only an end-to-end run can make: a `#topic/element` fragment
 * reaches the section node dockg minted for that element, a map contributes
 * reference edges and no sections, a `keyref` contributes nothing rather than
 * a guess, and the whole thing survives the determinism gates a second parser
 * puts at risk.
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
import { NS, RDF_TYPE } from "../../src/core/vocab.js";
import { hermeticEnv } from "../helpers/git-env.js";

const { namedNode } = DataFactory;

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(root, "dist", "cli.js");
const corpus = join(root, "test", "fixtures", "formats", "dita");
const goldenDir = join(root, "test", "fixtures", "golden-formats");
const golden = join(goldenDir, "dita.ttl");
const searchGolden = join(goldenDir, "dita-search.json");

const BASE = "https://example.com/kg/doc/docs";
const INSTALL = `${BASE}/install.dita`;
const CONFIG = `${BASE}/configuration.dita`;
const MAP = `${BASE}/sdk.ditamap`;

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

describe("a DITA corpus", () => {
  it("matches the golden output byte-for-byte (modulo tool version)", () => {
    const out = join(mkdtempSync(join(tmpdir(), "dockg-dita-")), "graph.ttl");
    build(out);
    expect(normalizeVersion(readFileSync(out, "utf8"))).toBe(
      normalizeVersion(readFileSync(golden, "utf8")),
    );
  });

  it("is byte-identical across two runs (determinism gate)", () => {
    const dir = mkdtempSync(join(tmpdir(), "dockg-dita-"));
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
    expect(quads.length).toBe(64);
  });

  it("resolves a #topic/element fragment to that element's section node", () => {
    const s = store();
    // Written `configuration.dita#configuration/keys`; the section dockg minted
    // for `<section id="keys">` is `configuration.dita#keys`.
    expect(objectsOf(s, INSTALL, `${NS.dcterms}references`)).toEqual([
      `${CONFIG}#keys`,
    ]);
    expect(objectsOf(s, CONFIG, `${NS.dcterms}references`)).toEqual([
      `${INSTALL}#prereq`,
    ]);
  });

  it("nests sections by depth, since DITA has no heading levels", () => {
    const s = store();
    expect(objectsOf(s, INSTALL, `${NS.dcterms}hasPart`)).toEqual([
      `${INSTALL}#install`,
    ]);
    expect(objectsOf(s, `${INSTALL}#install`, `${NS.dcterms}hasPart`)).toEqual([
      `${INSTALL}#prereq`,
      `${INSTALL}#verify`,
    ]);
    expect(objectsOf(s, `${INSTALL}#install`, `${NS.dockg}level`)).toEqual([
      "1",
    ]);
    expect(objectsOf(s, `${INSTALL}#prereq`, `${NS.dockg}level`)).toEqual([
      "2",
    ]);
  });

  it("gives a map references and no sections — a map has no prose", () => {
    const s = store();
    expect(objectsOf(s, MAP, `${NS.dcterms}references`)).toEqual([
      CONFIG,
      INSTALL,
    ]);
    expect(objectsOf(s, MAP, `${NS.dcterms}hasPart`)).toEqual([]);
    expect(objectsOf(s, MAP, `${NS.dcterms}title`)).toEqual([
      "SDK documentation",
    ]);
    // The map is still a Document — it is a file in the corpus with a path.
    expect(
      s.getQuads(
        namedNode(MAP),
        namedNode(RDF_TYPE),
        namedNode(`${NS.dockg}Document`),
        null,
      ),
    ).toHaveLength(1);
  });

  it("derives nothing from a keyref rather than guessing its target", () => {
    // The map's third topicref carries only `keyref="glossary"`. Resolving it
    // needs a keydef dockg has not read, so the honest result is no edge — and
    // no broken-link finding either, which would blame the author for dockg's
    // limitation.
    const s = store();
    expect(objectsOf(s, MAP, `${NS.dcterms}references`)).toHaveLength(2);
    expect(objectsOf(s, MAP, `${NS.dockg}brokenLink`)).toEqual([]);
  });

  it("reads othermeta, shortdesc, images and codeblock languages", () => {
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
      "missing.dita",
    ]);
  });

  it("passes dockg check — the shapes did not need to learn a new predicate", () => {
    const out = join(mkdtempSync(join(tmpdir(), "dockg-dita-")), "graph.ttl");
    build(out);
    const report = execFileSync(
      process.execPath,
      [cli, "check", "--graph", out],
      { encoding: "utf8", cwd: corpus, env: hermeticEnv() },
    );
    expect(report).toContain("0 violations");
  });

  it("indexes DITA prose, never DITA markup", () => {
    const dir = mkdtempSync(join(tmpdir(), "dockg-dita-"));
    const graph = join(dir, "graph.ttl");
    const search = join(dir, "search.json");
    build(graph);
    execFileSync(
      process.execPath,
      [cli, "export", "--format", "search", "--graph", graph, "--out", search],
      { encoding: "utf8", cwd: corpus, env: hermeticEnv() },
    );
    const written = readFileSync(search, "utf8");
    expect(written).toBe(readFileSync(searchGolden, "utf8"));
    expect(written).not.toMatch(/<\/?(?:p|section|taskbody|xref)\b/);
    // The dropped-prose regression, at the level a reader would notice it.
    expect(written).toContain(
      "One key per line. Set these before you install.",
    );
  });

  it("fails loudly on malformed XML instead of deriving a partial graph", () => {
    // XML has no recovery mode. A truncated topic would otherwise yield a
    // plausible, complete-looking graph, and exit 2 is the contract for an
    // operational failure — not 1, which is reserved for findings.
    const dir = mkdtempSync(join(tmpdir(), "dockg-dita-"));
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(
      join(dir, "docs", "broken.dita"),
      `<topic id="a"><title>A</title>`,
      "utf8",
    );
    writeFileSync(
      join(dir, "dockg.config.yaml"),
      `version: 1\ninputs: ["docs/**/*.dita"]\nprovenance:\n  git: false\n`,
      "utf8",
    );

    const run = spawnSync(
      process.execPath,
      [cli, "build", "--out", join(dir, "g.ttl")],
      { encoding: "utf8", cwd: dir, env: hermeticEnv() },
    );
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/Could not parse XML in docs\/broken\.dita/);
    expect(existsSync(join(dir, "g.ttl"))).toBe(false);
  });
});
