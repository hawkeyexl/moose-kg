/**
 * HTML → indexable text (ADR 01038).
 *
 * The contract that binds this to the analyzer: sections are looked up in the
 * lexical index *by their `dcterms:title`*, so the heading text produced here
 * must equal the heading text the analyzer wrote. The regression at the top of
 * this file is what happens when it does not.
 */
import { describe, expect, it } from "vitest";
import { analyzeDoc } from "../../src/core/analyze.js";
import { analyzerForExtension } from "../../src/core/analyzers/index.js";

const NO_PATHS = new Set<string>();

function textOf(
  content: string,
): ReturnType<NonNullable<ReturnType<typeof analyzerForExtension>>["textOf"]> {
  return analyzerForExtension(".html")!.textOf(content);
}

/** The Sphinx shape: the anchor id is on the section, the permalink is in the heading. */
const SPHINX = `<!doctype html>
<html><head><title>Install</title></head><body>
<p>Preamble prose.</p>
<section id="install-the-sdk">
  <h1>Install the SDK<a class="headerlink" href="#install-the-sdk">¶</a></h1>
  <p>Start here.</p>
  <h2 id="prerequisites">Prerequisites</h2>
  <p>Node 24 or later.</p>
</section>
</body></html>
`;

describe("HTML section text", () => {
  it("finds a section whose anchor was inherited from its <section>", () => {
    // The analyzer writes the title; the index looks the slice up by it. When
    // the slicer resolved permalinks from the heading's own id instead of the
    // inherited one, its heading read "Install the SDK¶", matched nothing, and
    // the section indexed no text at all — silently.
    const doc = analyzeDoc(SPHINX, "docs/a.html", NO_PATHS);
    const title = doc.sections[0]!.title;
    expect(title).toBe("Install the SDK");
    expect(textOf(SPHINX).sectionOwnText(title, 1, 0)).toBe(
      "Install the SDK\n\nStart here.",
    );
  });

  it("gives a section only its own text, not its subsections'", () => {
    const text = textOf(SPHINX);
    expect(text.sectionOwnText("Install the SDK", 1, 0)).not.toContain(
      "Node 24",
    );
    expect(text.sectionOwnText("Prerequisites", 2, 0)).toBe(
      "Prerequisites\n\nNode 24 or later.",
    );
  });

  it("gives the document only the prose no section owns", () => {
    expect(textOf(SPHINX).preamble()).toBe("Preamble prose.");
  });

  it("recovers prose, never markup", () => {
    const body = textOf(SPHINX).body;
    expect(body).not.toMatch(/[<>]/);
    expect(body).toContain("Install the SDK");
  });

  it("keeps block-level elements on separate lines", () => {
    const text = textOf(
      `<body><ul><li>One</li><li>Two</li></ul><p>After.</p></body>`,
    );
    expect(text.body).toBe("One\nTwo\nAfter.");
  });

  it("omits scripts and styles", () => {
    const text = textOf(
      `<body><style>p{color:red}</style><p>Real prose.</p><script>alert(1)</script></body>`,
    );
    expect(text.body).toBe("Real prose.");
  });

  it("disambiguates repeated headings by occurrence", () => {
    const text = textOf(
      `<body><h2>Notes</h2><p>First.</p><h2>Notes</h2><p>Second.</p></body>`,
    );
    expect(text.sectionOwnText("Notes", 2, 0)).toBe("Notes\n\nFirst.");
    expect(text.sectionOwnText("Notes", 2, 1)).toBe("Notes\n\nSecond.");
  });

  it("returns undefined for a heading that is not there", () => {
    expect(textOf(SPHINX).sectionOwnText("Nonexistent", 2, 0)).toBeUndefined();
  });
});
