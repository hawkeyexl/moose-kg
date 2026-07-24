import { describe, expect, it } from "vitest";
import { GraphIndex } from "../../src/runtime/graph.js";
import {
  createFetchResolver,
  sliceSection,
  splitFragment,
} from "../../src/runtime/resolve.js";
import { assemble } from "../../src/runtime/assemble.js";
import { createTrace } from "../../src/runtime/trace.js";
import { NS } from "../../src/core/vocab.js";

const BASE = "https://ex.com/kg/";
const DOC = `${BASE}doc/docs/a.md`;
const SECTION = `${DOC}#install`;

const MARKDOWN = `# Title

Intro prose.

## Install

Install steps here.

## Other

Not this one.
`;

function fixture(): GraphIndex {
  return GraphIndex.fromQuads([
    {
      s: DOC,
      p: `${NS.dockg}path`,
      o: { kind: "literal", value: "docs/a.md" },
    },
    { s: DOC, p: `${NS.dcterms}title`, o: { kind: "literal", value: "Title" } },
    {
      s: SECTION,
      p: `${NS.dcterms}title`,
      o: { kind: "literal", value: "Install" },
    },
    {
      s: SECTION,
      p: `${NS.dockg}level`,
      o: { kind: "literal", value: "2", datatype: `${NS.xsd}integer` },
    },
  ]);
}

/** A fetch stub serving one document. */
function stubFetch(body: string | undefined, calls: string[] = []) {
  return (url: string) => {
    calls.push(url);
    return Promise.resolve({
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      text: () => Promise.resolve(body ?? ""),
    });
  };
}

describe("splitFragment", () => {
  it("separates a section IRI from its document", () => {
    expect(splitFragment(SECTION)).toEqual({ doc: DOC, fragment: "install" });
    expect(splitFragment(DOC)).toEqual({ doc: DOC });
  });
});

describe("sliceSection", () => {
  it("slices from the matching heading to the next same-or-higher heading", () => {
    expect(sliceSection(MARKDOWN, "Install", 2)).toBe(
      "## Install\n\nInstall steps here.",
    );
  });

  it("runs to end-of-document for the last section", () => {
    expect(sliceSection(MARKDOWN, "Other", 2)).toBe(
      "## Other\n\nNot this one.",
    );
  });

  it("handles CRLF sources", () => {
    const crlf = MARKDOWN.replace(/\n/g, "\r\n");
    expect(sliceSection(crlf, "Install", 2)).toBe(
      "## Install\n\nInstall steps here.",
    );
  });

  it("returns undefined when the heading is absent or at another level", () => {
    expect(sliceSection(MARKDOWN, "Nope", 2)).toBeUndefined();
    expect(sliceSection(MARKDOWN, "Install", 3)).toBeUndefined();
  });
});

describe("createFetchResolver", () => {
  it("resolves a document to its full text via baseUrl", async () => {
    const calls: string[] = [];
    const r = createFetchResolver(fixture(), {
      baseUrl: "https://site/raw/",
      fetch: stubFetch(MARKDOWN, calls),
    });
    const out = await r.resolve(DOC);
    expect(out?.text).toBe(MARKDOWN);
    expect(out?.sourceUrl).toBe("https://site/raw/docs/a.md");
    expect(calls).toEqual(["https://site/raw/docs/a.md"]);
  });

  it("resolves a section to its slice of the parent document", async () => {
    const r = createFetchResolver(fixture(), {
      baseUrl: "https://site/raw/",
      fetch: stubFetch(MARKDOWN),
    });
    const out = await r.resolve(SECTION);
    expect(out?.text).toBe("## Install\n\nInstall steps here.");
    expect(out?.title).toBe("Install");
  });

  it("fetches each document only once across resolutions", async () => {
    const calls: string[] = [];
    const r = createFetchResolver(fixture(), {
      baseUrl: "https://site/raw/",
      fetch: stubFetch(MARKDOWN, calls),
    });
    await r.resolve(DOC);
    await r.resolve(SECTION);
    expect(calls).toHaveLength(1);
  });

  it("honors a custom pathToUrl", async () => {
    const calls: string[] = [];
    const r = createFetchResolver(fixture(), {
      pathToUrl: (p) => `https://cdn/${p.replace(/\.md$/, "")}.txt`,
      fetch: stubFetch(MARKDOWN, calls),
    });
    await r.resolve(DOC);
    expect(calls).toEqual(["https://cdn/docs/a.txt"]);
  });

  it("returns undefined for a node with no content, without fetching", async () => {
    const calls: string[] = [];
    const r = createFetchResolver(fixture(), {
      fetch: stubFetch(MARKDOWN, calls),
    });
    expect(await r.resolve(`${BASE}concept/x`)).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("records failed fetches in the trace and resolves to undefined", async () => {
    const trace = createTrace();
    const r = createFetchResolver(fixture(), {
      baseUrl: "https://site/raw/",
      fetch: stubFetch(undefined),
      trace,
    });
    expect(await r.resolve(DOC)).toBeUndefined();
    expect(trace.resolutions).toEqual([
      {
        iri: DOC,
        sourceUrl: "https://site/raw/docs/a.md",
        ok: false,
        error: "fetch failed",
      },
    ]);
  });

  it("records a missing section heading in the trace", async () => {
    const trace = createTrace();
    const r = createFetchResolver(fixture(), {
      baseUrl: "https://site/raw/",
      fetch: stubFetch("# Title\n\nNo install heading here.\n"),
      trace,
    });
    expect(await r.resolve(SECTION)).toBeUndefined();
    expect(trace.resolutions[0]?.error).toBe("section heading not found");
  });
});

describe("assemble", () => {
  const resolver = (texts: Record<string, string>) => ({
    resolve: (iri: string) =>
      Promise.resolve(
        texts[iri]
          ? { iri, text: texts[iri]!, sourceUrl: `url:${iri}`, title: iri }
          : undefined,
      ),
  });

  it("builds context blocks and a matching citation manifest", async () => {
    const bundle = await assemble(
      resolver({ [DOC]: "alpha", [SECTION]: "beta" }),
      [
        { iri: DOC, depth: 0 },
        { iri: SECTION, depth: 1 },
      ],
    );
    expect(bundle.context.map((b) => b.text)).toEqual(["alpha", "beta"]);
    expect(bundle.context.map((b) => b.depth)).toEqual([0, 1]);
    expect(bundle.citations.map((c) => c.iri)).toEqual([DOC, SECTION]);
    expect(bundle.refusal).toBeUndefined();
    expect(bundle.truncated).toBe(false);
  });

  it("refuses with no-route when traversal returned nothing", async () => {
    const bundle = await assemble(resolver({}), []);
    expect(bundle.refusal?.reason).toBe("no-route");
    expect(bundle.context).toEqual([]);
    expect(bundle.citations).toEqual([]);
  });

  it("refuses with no-content when nothing resolves to text", async () => {
    const bundle = await assemble(resolver({}), [{ iri: DOC, depth: 0 }]);
    expect(bundle.refusal?.reason).toBe("no-content");
    expect(bundle.refusal?.detail).toContain("none of them resolved");
  });

  it("drops blocks over the character budget and flags truncation", async () => {
    const bundle = await assemble(
      resolver({ [DOC]: "12345", [SECTION]: "67890" }),
      [
        { iri: DOC, depth: 0 },
        { iri: SECTION, depth: 1 },
      ],
      { maxChars: 5 },
    );
    expect(bundle.context.map((b) => b.iri)).toEqual([DOC]);
    expect(bundle.truncated).toBe(true);
  });
});
