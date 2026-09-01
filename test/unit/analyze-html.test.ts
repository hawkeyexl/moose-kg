/**
 * HTML body analysis (ADR 01038).
 *
 * The rules under test that are *not* obvious: an anchor id beats a slugged
 * title because it is what a link in the same corpus actually targets; a
 * heading's own self-permalink is not part of its text; and `href` is read
 * from hyperlink elements only, unlike MDX, because in HTML the element's
 * identity is known and `<link rel="stylesheet">` is on every page.
 */
import { describe, expect, it } from "vitest";
import { analyzeDoc } from "../../src/core/analyze.js";

const NO_PATHS = new Set<string>();

function html(body: string, head = ""): string {
  return `<!doctype html>\n<html lang="en"><head>${head}</head><body>${body}</body></html>\n`;
}

describe("HTML sections", () => {
  it("derives levels, order and parents from h1–h6", () => {
    const doc = analyzeDoc(
      html(`
        <h1>Install</h1>
        <h2>Prerequisites</h2>
        <h3>Node</h3>
        <h2>Steps</h2>
      `),
      "docs/a.html",
      NO_PATHS,
    );
    expect(doc.sections).toEqual([
      {
        slug: "install",
        title: "Install",
        level: 1,
        order: 1,
        parentSlug: null,
      },
      {
        slug: "prerequisites",
        title: "Prerequisites",
        level: 2,
        order: 1,
        parentSlug: "install",
      },
      {
        slug: "node",
        title: "Node",
        level: 3,
        order: 1,
        parentSlug: "prerequisites",
      },
      {
        slug: "steps",
        title: "Steps",
        level: 2,
        order: 2,
        parentSlug: "install",
      },
    ]);
  });

  it("prefers the heading's own id over a slugged title", () => {
    const doc = analyzeDoc(
      html(`<h2 id="install-the-sdk">Install the SDK, quickly</h2>`),
      "docs/a.html",
      NO_PATHS,
    );
    expect(doc.sections[0]).toMatchObject({
      slug: "install-the-sdk",
      title: "Install the SDK, quickly",
    });
  });

  it("falls back to an enclosing section's id (the Sphinx shape)", () => {
    const doc = analyzeDoc(
      html(`
        <section id="install-the-sdk">
          <h1>Install the SDK</h1>
          <p>Body.</p>
          <h2>Second</h2>
        </section>
      `),
      "docs/a.html",
      NO_PATHS,
    );
    // Only the first heading in the sectioning element claims its id; the
    // second is a sibling heading, not that section's title.
    expect(doc.sections.map((s) => s.slug)).toEqual([
      "install-the-sdk",
      "second",
    ]);
  });

  it("slugs the title when nothing carries an id", () => {
    const doc = analyzeDoc(
      html(`<h1>Install the SDK</h1>`),
      "docs/a.html",
      NO_PATHS,
    );
    expect(doc.sections[0]!.slug).toBe("install-the-sdk");
  });

  it("disambiguates repeated ids and titles alike", () => {
    const doc = analyzeDoc(
      html(`<h2 id="x">One</h2><h2 id="x">Two</h2><h2>One</h2>`),
      "docs/a.html",
      NO_PATHS,
    );
    expect(doc.sections.map((s) => s.slug)).toEqual(["x", "x-1", "one"]);
  });

  it("excludes a heading's own permalink from its text", () => {
    const doc = analyzeDoc(
      html(
        `<h1 id="install">Install<a class="headerlink" href="#install">¶</a></h1>`,
      ),
      "docs/a.html",
      NO_PATHS,
    );
    expect(doc.sections[0]!.title).toBe("Install");
    expect(doc.firstH1).toBe("Install");
  });

  it("keeps a real link inside a heading as part of the text", () => {
    const doc = analyzeDoc(
      html(`<h1 id="a">See <a href="./b.html">the guide</a></h1>`),
      "docs/a.html",
      NO_PATHS,
    );
    expect(doc.sections[0]!.title).toBe("See the guide");
  });

  it("collapses whitespace in heading text", () => {
    const doc = analyzeDoc(
      html(`<h1>\n  Install   the\n  SDK\n</h1>`),
      "docs/a.html",
      NO_PATHS,
    );
    expect(doc.sections[0]!.title).toBe("Install the SDK");
  });
});

describe("HTML links", () => {
  it("reads hyperlink elements and resolves them against the corpus", () => {
    const doc = analyzeDoc(
      html(
        `<a href="./b.html">b</a>
         <a href="./missing.html">gone</a>
         <a href="https://example.com/x">out</a>
         <a href="#local">anchor</a>`,
      ),
      "docs/a.html",
      new Set(["docs/a.html", "docs/b.html"]),
    );
    expect(doc.links).toEqual([
      { raw: "./b.html", kind: "internal", resolvedPath: "docs/b.html" },
      { raw: "./missing.html", kind: "broken" },
      {
        raw: "https://example.com/x",
        kind: "external",
        url: "https://example.com/x",
      },
    ]);
  });

  it("reads an area's href, since it is a hyperlink element too", () => {
    const doc = analyzeDoc(
      html(`<map><area href="./b.html" /></map>`),
      "docs/a.html",
      new Set(["docs/a.html", "docs/b.html"]),
    );
    expect(doc.links).toHaveLength(1);
  });

  it("ignores href on head elements, which reference resources not documents", () => {
    const doc = analyzeDoc(
      html(
        `<p>text</p>`,
        `<base href="/docs/" /><link rel="stylesheet" href="./theme.css" /><link rel="canonical" href="./b.html" />`,
      ),
      "docs/a.html",
      new Set(["docs/a.html", "docs/b.html"]),
    );
    expect(doc.links).toEqual([]);
  });

  it("carries an anchor through", () => {
    const doc = analyzeDoc(
      html(`<a href="./b.html#install">b</a>`),
      "docs/a.html",
      new Set(["docs/a.html", "docs/b.html"]),
    );
    expect(doc.links[0]).toMatchObject({
      kind: "internal",
      resolvedPath: "docs/b.html",
      anchor: "install",
    });
  });
});

describe("HTML images and code", () => {
  it("reads img src, and nothing else that carries src", () => {
    const doc = analyzeDoc(
      html(
        `<img src="./logo.png" />
         <iframe src="https://video.example/x"></iframe>
         <script src="./analytics.js"></script>`,
      ),
      "docs/a.html",
      NO_PATHS,
    );
    expect(doc.images).toEqual([
      { raw: "./logo.png", target: "docs/logo.png", external: false },
    ]);
  });

  it("reads an external image as external", () => {
    const doc = analyzeDoc(
      html(`<img src="https://cdn.example/logo.png" />`),
      "docs/a.html",
      NO_PATHS,
    );
    expect(doc.images[0]).toMatchObject({ external: true });
  });

  it("reads code languages from language- and lang- classes", () => {
    const doc = analyzeDoc(
      html(
        `<pre><code class="language-ts">x</code></pre>
         <pre><code class="lang-bash">y</code></pre>
         <pre><code class="hljs language-ts">z</code></pre>
         <pre><code>plain</code></pre>`,
      ),
      "docs/a.html",
      NO_PATHS,
    );
    expect(doc.codeLanguages).toEqual(["bash", "ts"]);
  });
});

describe("HTML metadata", () => {
  it("reads title and meta tags through docmeta's extractor", () => {
    const doc = analyzeDoc(
      html(
        `<h1>Heading</h1>`,
        `<title>Install the SDK</title><meta name="type" content="how-to" />`,
      ),
      "docs/a.html",
      NO_PATHS,
    );
    expect(doc.frontmatterPresent).toBe(true);
    expect(doc.frontmatter).toMatchObject({
      title: "Install the SDK",
      type: "how-to",
    });
  });

  it("recovers from malformed markup rather than throwing", () => {
    const doc = analyzeDoc(
      `<html><body><h1>Open<p>Unclosed<a href="./b.html">x</body>`,
      "docs/a.html",
      new Set(["docs/a.html", "docs/b.html"]),
    );
    expect(doc.sections).toHaveLength(1);
    expect(doc.links).toHaveLength(1);
  });
});
