/**
 * The input-format registry.
 *
 * Every extension dockg ingests must resolve to a named analyzer, and an
 * extension with no *implemented* analyzer must fail loudly. The bug this
 * replaces was silence: `analyzeDoc` parsed anything as Markdown, so an HTML
 * corpus produced a clean, green, empty graph rather than an error.
 */
import { describe, expect, it } from "vitest";
import {
  ANALYZERS,
  analyzerForExtension,
  implementedExtensions,
} from "../../src/core/analyzers/index.js";
import { DOCUMENT_EXTENSIONS } from "../../src/core/analyzers/extensions.js";
import { analyzeDoc } from "../../src/core/analyze.js";
import { byCodeUnit } from "../../src/core/sort.js";
import { DockgError } from "../../src/types.js";

const NO_PATHS = new Set<string>();

describe("analyzer registry", () => {
  it("resolves Markdown and MDX to implemented, writable analyzers", () => {
    for (const ext of [".md", ".markdown"]) {
      const a = analyzerForExtension(ext);
      expect(a?.name, ext).toBe("markdown");
      expect(a?.implemented, ext).toBe(true);
      expect(a?.writable, ext).toBe(true);
    }
    const mdx = analyzerForExtension(".mdx");
    expect(mdx?.name).toBe("mdx");
    expect(mdx?.implemented).toBe(true);
    expect(mdx?.writable).toBe(true);
  });

  it("registers the roadmap formats as named, unimplemented analyzers", () => {
    const expected: Record<string, string> = {
      ".dita": "dita",
      ".ditamap": "ditamap",
      ".adoc": "asciidoc",
      ".asciidoc": "asciidoc",
      ".rst": "rst",
      ".xml": "xml",
    };
    for (const [ext, name] of Object.entries(expected)) {
      const a = analyzerForExtension(ext);
      expect(a?.name, ext).toBe(name);
      expect(a?.implemented, ext).toBe(false);
    }
  });

  it("matches extensions case-insensitively", () => {
    expect(analyzerForExtension(".MD")?.name).toBe("markdown");
    expect(analyzerForExtension(".HTML")?.name).toBe("html");
  });

  it("reports only implemented extensions as supported", () => {
    expect(implementedExtensions()).toEqual([
      ".htm",
      ".html",
      ".markdown",
      ".md",
      ".mdx",
    ]);
  });

  /**
   * Link resolution decides what a *document* looks like from its own ordered
   * list (candidate precedence, not alphabetical), so the two cannot simply be
   * the same constant. This is what keeps them from drifting: a format that
   * lands without being added to `DOCUMENT_EXTENSIONS` would resolve its own
   * internal links as links to static assets (ADR 01033) and report none of
   * them as broken.
   */
  it("resolves links for exactly the extensions it can read", () => {
    expect([...DOCUMENT_EXTENSIONS].sort(byCodeUnit)).toEqual(
      implementedExtensions(),
    );
  });

  it("declares every extension exactly once across the registry", () => {
    const seen = new Set<string>();
    for (const a of ANALYZERS) {
      for (const ext of a.extensions) {
        expect(seen.has(ext), `${ext} declared twice`).toBe(false);
        seen.add(ext);
        expect(ext, `${ext} must be lowercase with a leading dot`).toBe(
          ext.toLowerCase(),
        );
        expect(ext.startsWith("."), `${ext} needs a leading dot`).toBe(true);
      }
    }
  });
});

describe("analyzeDoc dispatch", () => {
  it("still analyzes Markdown through the registry", () => {
    const doc = analyzeDoc("# Title\n\nBody.\n", "docs/a.md", NO_PATHS);
    expect(doc.firstH1).toBe("Title");
    expect(doc.sections).toHaveLength(1);
  });

  it("names the format when an analyzer is registered but unimplemented", () => {
    const rst = ".. _label:\n\nTitle\n=====\n";
    expect(() => analyzeDoc(rst, "docs/a.rst", NO_PATHS)).toThrow(DockgError);
    // The message must name the format, not merely the file: the reader's next
    // action differs between "dockg cannot read this yet" and "typo in a glob".
    expect(() => analyzeDoc(rst, "docs/a.rst", NO_PATHS)).toThrow(
      /\brst\b.*not yet implemented/i,
    );
  });

  it("rejects an extension no analyzer claims", () => {
    expect(() => analyzeDoc("hello", "docs/a.txt", NO_PATHS)).toThrow(
      DockgError,
    );
    expect(() => analyzeDoc("hello", "docs/a.txt", NO_PATHS)).toThrow(
      /docs\/a\.txt/,
    );
  });

  it("rejects a file with no extension at all", () => {
    expect(() => analyzeDoc("hello", "docs/LICENSE", NO_PATHS)).toThrow(
      DockgError,
    );
  });
});
