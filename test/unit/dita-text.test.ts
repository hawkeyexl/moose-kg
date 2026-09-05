/**
 * DITA → indexable text (ADR 01043).
 *
 * The regression this file opens with: prose lives in text nodes on *either
 * side* of an inline element, so an element-only walk indexes the link text and
 * throws the sentence around it away. Nothing about the build fails when that
 * happens — the graph is right and the search results are quietly wrong.
 */
import { describe, expect, it } from "vitest";
import { analyzeDoc } from "../../src/core/analyze.js";
import { analyzerForExtension } from "../../src/core/analyzers/index.js";

const NO_PATHS = new Set<string>();

function textOf(
  content: string,
  path = "docs/indexed.dita",
): ReturnType<NonNullable<ReturnType<typeof analyzerForExtension>>["textOf"]> {
  return analyzerForExtension(".dita")!.textOf(content, path);
}

const TOPIC = `<?xml version="1.0"?>
<task id="install">
  <title>Install the SDK</title>
  <shortdesc>Get the SDK onto a machine.</shortdesc>
  <prolog><metadata><othermeta name="type" content="how-to"/></metadata></prolog>
  <taskbody>
    <context><p>Everything below assumes a clean machine.</p></context>
    <section id="prereq">
      <title>Prerequisites</title>
      <p>Node 24 or later. See <xref href="configuration.dita">the keys</xref> first.</p>
      <codeblock outputclass="language-bash">npm install sdk</codeblock>
    </section>
  </taskbody>
</task>
`;

describe("DITA section text", () => {
  it("keeps the prose either side of an inline element", async () => {
    expect((await textOf(TOPIC)).sectionOwnText("Prerequisites", 2, 0)).toBe(
      "Prerequisites\n\nNode 24 or later. See the keys first.\nnpm install sdk",
    );
  });

  it("gives the root topic its own prose, not its subsections'", async () => {
    const text = (await textOf(TOPIC)).sectionOwnText("Install the SDK", 1, 0);
    expect(text).toBe(
      "Install the SDK\n\nGet the SDK onto a machine.\nEverything below assumes a clean machine.",
    );
    expect(text).not.toContain("Node 24");
  });

  it("finds every section the analyzer minted a node for", async () => {
    // The binding contract: the index looks a slice up by the title the
    // analyzer wrote, so every section must resolve.
    const doc = await analyzeDoc(TOPIC, "docs/install.dita", NO_PATHS);
    const text = await textOf(TOPIC);
    for (const section of doc.sections) {
      expect(
        text.sectionOwnText(section.title, section.level, 0),
        section.slug,
      ).toBeDefined();
    }
  });

  it("omits prolog metadata and index keys", async () => {
    const body = (await textOf(TOPIC)).body;
    expect(body).not.toContain("how-to");
    const indexed = (
      await textOf(
        `<topic id="a"><title>A</title><body><p>Real<indexterm>hidden</indexterm></p></body></topic>`,
      )
    ).body;
    expect(indexed).not.toContain("hidden");
    expect(indexed).toContain("Real");
  });

  it("recovers prose, never markup", async () => {
    expect((await textOf(TOPIC)).body).not.toMatch(/[<>]/);
  });

  it("separates block elements it has never seen", async () => {
    // The inline set is the closed one, so an unfamiliar element ends its line
    // rather than running two sentences together.
    const text = await textOf(
      `<topic id="a"><title>A</title><body>
         <customBlock>First.</customBlock><customBlock>Second.</customBlock>
       </body></topic>`,
    );
    expect(text.sectionOwnText("A", 1, 0)).toBe("A\n\nFirst.\nSecond.");
  });
});

describe("indexing errors name the document", () => {
  /**
   * `textOf` takes the path only so a failure here reads like a failure from
   * `analyze`. Indexing is its own command over a whole corpus, so an error
   * naming no file — it used to say `<indexed document>` — leaves the reader
   * grepping a thousand files for the one that broke. This is reachable in the
   * ordinary way: a source edited between `dockg build` and
   * `dockg export --format search`.
   */
  it("names the file it was given, not a placeholder", async () => {
    await expect(
      textOf(`<topic id="a"><title>A</title>`, "docs/broken.dita"),
    ).rejects.toThrow(/Could not parse XML in docs\/broken\.dita/);
  });

  it("reports the same file from analyze and from textOf", async () => {
    const truncated = `<topic id="a"><title>A</title>`;
    const fromAnalyze = await analyzeDoc(truncated, "docs/x.dita", NO_PATHS)
      .then(() => "no error")
      .catch((e: Error) => e.message);
    const fromText = await textOf(truncated, "docs/x.dita")
      .then(() => "no error")
      .catch((e: Error) => e.message);
    expect(fromText).toBe(fromAnalyze);
  });
});
