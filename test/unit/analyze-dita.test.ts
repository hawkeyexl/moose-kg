/**
 * DITA topic and map analysis (ADR 01043).
 *
 * The rules worth pinning: nesting depth is the section level (DITA has no
 * `h2`), a `#topic/element` fragment addresses the *element*, elements are
 * recognized by `@class` so specializations work, and a map is links with no
 * sections because it has no prose.
 */
import { describe, expect, it } from "vitest";
import { analyzeDoc } from "../../src/core/analyze.js";

const NO_PATHS = new Set<string>();

const TOPIC = `<?xml version="1.0" encoding="UTF-8"?>
<topic id="install" xml:lang="en">
  <title>Install the SDK</title>
  <shortdesc>Get the SDK onto a machine.</shortdesc>
  <prolog><metadata><othermeta name="type" content="how-to"/></metadata></prolog>
  <body>
    <p>Start with <xref href="configuration.dita#configuration/keys">the keys</xref>.</p>
    <section id="prereq">
      <title>Prerequisites</title>
      <p>Node 24 or later.</p>
      <codeblock outputclass="language-bash">npm install sdk</codeblock>
      <image href="images/architecture.png" alt="Architecture"/>
    </section>
    <section>
      <title>Verify</title>
      <p>Run the smoke test.</p>
    </section>
  </body>
  <related-links>
    <link href="troubleshooting.dita"/>
  </related-links>
</topic>
`;

const CORPUS = new Set([
  "docs/install.dita",
  "docs/configuration.dita",
  "docs/troubleshooting.dita",
]);

describe("DITA topics", () => {
  it("makes the root topic a level-1 section and nests by depth", async () => {
    const doc = await analyzeDoc(TOPIC, "docs/install.dita", CORPUS);
    expect(doc.sections).toEqual([
      {
        slug: "install",
        title: "Install the SDK",
        level: 1,
        order: 1,
        parentSlug: null,
      },
      {
        slug: "prereq",
        title: "Prerequisites",
        level: 2,
        order: 1,
        parentSlug: "install",
      },
      {
        slug: "verify",
        title: "Verify",
        level: 2,
        order: 2,
        parentSlug: "install",
      },
    ]);
  });

  it("nests a subtopic one level below its parent", async () => {
    const doc = await analyzeDoc(
      `<topic id="a"><title>A</title><body/>
         <topic id="b"><title>B</title><body>
           <section id="c"><title>C</title></section>
         </body></topic>
       </topic>`,
      "docs/a.dita",
      NO_PATHS,
    );
    expect(doc.sections.map((s) => [s.slug, s.level, s.parentSlug])).toEqual([
      ["a", 1, null],
      ["b", 2, "a"],
      ["c", 3, "b"],
    ]);
  });

  it("supplies title and description the derive layer can read", async () => {
    const doc = await analyzeDoc(TOPIC, "docs/install.dita", CORPUS);
    expect(doc.firstH1).toBe("Install the SDK");
    expect(doc.frontmatter.title).toBe("Install the SDK");
    expect(doc.frontmatter.description).toBe("Get the SDK onto a machine.");
    // Through docmeta's extractor, from <othermeta>.
    expect(doc.frontmatter.type).toBe("how-to");
  });

  it("resolves an xref, taking the element id as the anchor", async () => {
    const doc = await analyzeDoc(TOPIC, "docs/install.dita", CORPUS);
    expect(doc.links).toEqual([
      {
        raw: "configuration.dita#configuration/keys",
        kind: "internal",
        resolvedPath: "docs/configuration.dita",
        // Not "configuration/keys": the fragment addresses the element within
        // the topic, and that is the section dockg minted a node for.
        anchor: "keys",
      },
      {
        raw: "troubleshooting.dita",
        kind: "internal",
        resolvedPath: "docs/troubleshooting.dita",
      },
    ]);
  });

  it("takes a bare topic-id fragment as the anchor", async () => {
    const doc = await analyzeDoc(
      `<topic id="a"><title>A</title><body>
         <p><xref href="configuration.dita#configuration">c</xref></p>
       </body></topic>`,
      "docs/a.dita",
      CORPUS,
    );
    expect(doc.links[0]).toMatchObject({ anchor: "configuration" });
  });

  it("reads images and code languages", async () => {
    const doc = await analyzeDoc(TOPIC, "docs/install.dita", CORPUS);
    expect(doc.images).toEqual([
      {
        raw: "images/architecture.png",
        target: "docs/images/architecture.png",
        external: false,
      },
    ]);
    expect(doc.codeLanguages).toEqual(["bash"]);
  });

  it("recognizes specialized elements by @class", async () => {
    // A specialization renames the element but keeps the class ancestry, which
    // is exactly how a DITA processor identifies it.
    const doc = await analyzeDoc(
      `<myTopic class="- topic/topic " id="a">
         <myTitle class="- topic/title ">A</myTitle>
         <myBody class="- topic/body ">
           <mySection class="- topic/section " id="s">
             <myTitle class="- topic/title ">S</myTitle>
             <myXref class="- topic/xref " href="configuration.dita">c</myXref>
           </mySection>
         </myBody>
       </myTopic>`,
      "docs/a.dita",
      CORPUS,
    );
    expect(doc.sections.map((s) => s.slug)).toEqual(["a", "s"]);
    expect(doc.links).toHaveLength(1);
  });

  it("derives nothing from a keyref, rather than guessing its target", async () => {
    const doc = await analyzeDoc(
      `<topic id="a"><title>A</title><body>
         <p><xref keyref="config">c</xref></p>
       </body></topic>`,
      "docs/a.dita",
      CORPUS,
    );
    expect(doc.links).toEqual([]);
  });

  it("slugs the title when a section carries no id", async () => {
    const doc = await analyzeDoc(
      `<topic id="a"><title>A</title><body>
         <section><title>No Id Here</title></section>
       </body></topic>`,
      "docs/a.dita",
      NO_PATHS,
    );
    expect(doc.sections[1]!.slug).toBe("no-id-here");
  });

  it("fails with an operational error on malformed XML", async () => {
    await expect(
      analyzeDoc(`<topic id="a"><title>A</title>`, "docs/a.dita", NO_PATHS),
    ).rejects.toThrow(/docs\/a\.dita/);
  });
});

const MAP = `<?xml version="1.0" encoding="UTF-8"?>
<map>
  <title>SDK documentation</title>
  <topicref href="install.dita">
    <topicref href="configuration.dita"/>
  </topicref>
  <topichead navtitle="Reference">
    <topicref href="troubleshooting.dita"/>
  </topichead>
  <keydef keys="config" href="configuration.dita"/>
  <topicref keyref="config"/>
  <topicref href="https://example.com/x" scope="external" format="html"/>
</map>
`;

describe("DITA maps", () => {
  it("derives links with no sections — a map has no prose", async () => {
    const doc = await analyzeDoc(MAP, "docs/sdk.ditamap", CORPUS);
    expect(doc.sections).toEqual([]);
    expect(doc.links.map((l) => l.raw)).toEqual([
      "install.dita",
      "configuration.dita",
      "troubleshooting.dita",
      "configuration.dita",
      "https://example.com/x",
    ]);
  });

  it("takes the map's title, so it is not an untitled node", async () => {
    const doc = await analyzeDoc(MAP, "docs/sdk.ditamap", CORPUS);
    expect(doc.frontmatter.title).toBe("SDK documentation");
  });
});

describe("DITA hrefs that are not DITA", () => {
  it("leaves an external URL's fragment alone", async () => {
    // `topicid/elementid` describes fragments *inside a DITA topic*. An
    // external URL's fragment is an opaque anchor that may happen to contain a
    // slash, and rewriting it emits an edge pointing at a different place on a
    // real site — a wrong IRI rather than a missing one.
    const doc = await analyzeDoc(
      `<topic id="a"><title>A</title><body>
         <p><xref href="https://example.com/docs#section/subsection" scope="external">e</xref></p>
       </body></topic>`,
      "docs/a.dita",
      NO_PATHS,
    );
    expect(doc.links).toEqual([
      {
        raw: "https://example.com/docs#section/subsection",
        kind: "external",
        url: "https://example.com/docs#section/subsection",
      },
    ]);
  });

  it("still normalizes a DITA-internal fragment", async () => {
    const doc = await analyzeDoc(
      `<topic id="a"><title>A</title><body>
         <p><xref href="configuration.dita#configuration/keys">k</xref></p>
       </body></topic>`,
      "docs/a.dita",
      CORPUS,
    );
    expect(doc.links[0]).toMatchObject({ anchor: "keys" });
  });
});
