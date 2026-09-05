/**
 * AsciiDoc analysis (ADR 01045).
 *
 * The decisions under test: `= Title` is a level-1 section so it lines up with
 * a Markdown `# Title`; anchors are Asciidoctor's own generated ids, because
 * those are what a real AsciiDoc toolchain publishes and what an `xref`
 * targets; and cross-file xrefs keep their `.adoc` suffix rather than being
 * rewritten to the `.html` a published site would serve.
 */
import { describe, expect, it } from "vitest";
import { analyzeDoc } from "../../src/core/analyze.js";

const NO_PATHS = new Set<string>();

const CORPUS = new Set([
  "docs/install.adoc",
  "docs/configuration.adoc",
  "docs/images/architecture.png",
]);

const DOC = `= Install the SDK
:type: how-to

Everything below assumes a clean machine.

[[prereq]]
== Prerequisites

Node 24 or later. See xref:configuration.adoc#keys[the keys].

[source,bash]
----
npm install sdk
----

image::images/architecture.png[Architecture]

=== Deeper

Nested detail.

== Verify

Run link:missing.adoc[the smoke test] and see https://example.com/x[the site].
`;

describe("AsciiDoc sections", () => {
  it("makes the document title a level-1 section, like a Markdown h1", async () => {
    const doc = await analyzeDoc(DOC, "docs/install.adoc", CORPUS);
    expect(doc.firstH1).toBe("Install the SDK");
    expect(doc.sections.map((s) => [s.slug, s.level, s.parentSlug])).toEqual([
      ["install-the-sdk", 1, null],
      ["prereq", 2, "install-the-sdk"],
      ["_deeper", 3, "prereq"],
      ["_verify", 2, "install-the-sdk"],
    ]);
  });

  it("uses Asciidoctor's own generated id, underscore prefix and all", async () => {
    // `_verify`, not `verify`. That is the anchor a published AsciiDoc site
    // serves and the one an xref resolves against, so inventing a prettier
    // slug would mint a node nothing points at.
    const doc = await analyzeDoc(DOC, "docs/install.adoc", CORPUS);
    expect(doc.sections.map((s) => s.slug)).toContain("_verify");
  });

  it("honors an explicit [[anchor]]", async () => {
    const doc = await analyzeDoc(DOC, "docs/install.adoc", CORPUS);
    expect(doc.sections.map((s) => s.slug)).toContain("prereq");
  });
});

describe("AsciiDoc links", () => {
  it("keeps a cross-file xref pointing at the source file", async () => {
    // Asciidoctor rewrites `.adoc` to the output suffix by default, so an
    // unconfigured run would look for `configuration.html` — a file the corpus
    // does not contain, making every cross-file xref a broken link.
    const doc = await analyzeDoc(DOC, "docs/install.adoc", CORPUS);
    expect(doc.links).toContainEqual({
      raw: "configuration.adoc#keys",
      kind: "internal",
      resolvedPath: "docs/configuration.adoc",
      anchor: "keys",
    });
  });

  it("reads link: macros and bare URLs", async () => {
    const doc = await analyzeDoc(DOC, "docs/install.adoc", CORPUS);
    expect(doc.links).toContainEqual({ raw: "missing.adoc", kind: "broken" });
    expect(doc.links).toContainEqual({
      raw: "https://example.com/x",
      kind: "external",
      url: "https://example.com/x",
    });
  });

  it("does not treat an internal cross-reference as an outbound link", async () => {
    // `<<prereq>>` is a same-document anchor; it addresses no other document.
    const doc = await analyzeDoc(
      `= T\n\nSee <<prereq>>.\n\n[[prereq]]\n== P\n`,
      "docs/a.adoc",
      NO_PATHS,
    );
    expect(doc.links).toEqual([]);
  });
});

describe("AsciiDoc images, code and metadata", () => {
  it("reads block images and source-block languages", async () => {
    const doc = await analyzeDoc(DOC, "docs/install.adoc", CORPUS);
    expect(doc.images).toEqual([
      {
        raw: "images/architecture.png",
        target: "docs/images/architecture.png",
        external: false,
      },
    ]);
    expect(doc.codeLanguages).toEqual(["bash"]);
  });

  it("reads an inline image too", async () => {
    const doc = await analyzeDoc(
      `= T\n\nAn image:icon.png[icon] inline.\n`,
      "docs/a.adoc",
      NO_PATHS,
    );
    expect(doc.images.map((i) => i.raw)).toEqual(["icon.png"]);
  });

  it("reads document attributes through docmeta's extractor", async () => {
    const doc = await analyzeDoc(DOC, "docs/install.adoc", CORPUS);
    expect(doc.frontmatterPresent).toBe(true);
    expect(doc.frontmatter.type).toBe("how-to");
    expect(doc.frontmatter.title).toBe("Install the SDK");
  });

  it("accepts YAML frontmatter, which some generators put on .adoc", async () => {
    const doc = await analyzeDoc(
      `---\ntitle: From frontmatter\ntype: reference\n---\n= Heading\n\nBody.\n`,
      "docs/a.adoc",
      NO_PATHS,
    );
    expect(doc.frontmatter.title).toBe("From frontmatter");
    expect(doc.frontmatter.type).toBe("reference");
  });
});

describe("AsciiDoc determinism", () => {
  it("does not resolve include:: directives", async () => {
    // Resolving one would make the graph depend on a file outside the corpus,
    // and on whether that file happened to be readable. `safe: secure` leaves
    // the directive as literal text instead.
    const doc = await analyzeDoc(
      `= T\n\ninclude::../../../etc/passwd[]\n`,
      "docs/a.adoc",
      NO_PATHS,
    );
    expect(doc.links).toEqual([]);
    expect(doc.sections.map((s) => s.title)).toEqual(["T"]);
  });

  it("derives the same model twice for the same input", async () => {
    const a = await analyzeDoc(DOC, "docs/install.adoc", CORPUS);
    const b = await analyzeDoc(DOC, "docs/install.adoc", CORPUS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
