/**
 * DITA → indexable text, for the lexical search artifact (ADR 01019).
 *
 * Same granularity rule as everywhere else: a section owns its title down to
 * the next section of any depth, and the document owns the prose no section
 * covers. In DITA that prose is the `<shortdesc>` and any block content that
 * sits in a topic's body ahead of its first `<section>`.
 *
 * Titles come from the same `dita-dom` primitives the analyzer used to write
 * `dcterms:title`, because the index looks a section's slice up by that title.
 */
import {
  childNodes,
  classMatches,
  DITA_SECTION,
  DITA_TITLE,
  DITA_TOPIC,
  elementText,
  firstChildMatching,
  parseXml,
  type XmlElement,
} from "./dita-dom.js";
import type { DocumentText } from "./types.js";

type Block =
  | { kind: "heading"; title: string; level: number }
  | { kind: "text"; text: string };

/**
 * Elements whose text is machinery rather than prose: metadata the extractor
 * reads separately, generated link lists, index keys, and authoring comments.
 */
const NON_PROSE = new Set([
  "prolog",
  "related-links",
  "titlealts",
  "data",
  "indexterm",
  "draft-comment",
  "required-cleanup",
]);

/**
 * Inline elements — the ones that sit *within* a run of prose rather than
 * ending it.
 *
 * The set is inverted deliberately: DITA has hundreds of block elements and a
 * modest, stable set of inline ones, so listing the inline ones means an
 * unfamiliar element defaults to ending its line. That is the safe direction —
 * a spurious line break costs nothing in a lexical index, whereas a missing one
 * runs two sentences together into a phrase that matches neither.
 */
const INLINE = new Set([
  "apiname",
  "b",
  "cite",
  "cmdname",
  "codeph",
  "filepath",
  "i",
  "image",
  "keyword",
  "menucascade",
  "msgph",
  "option",
  "parmname",
  "ph",
  "q",
  "sub",
  "sup",
  "synph",
  "systemoutput",
  "term",
  "tm",
  "tt",
  "u",
  "uicontrol",
  "userinput",
  "varname",
  "wintitle",
  "xref",
]);

function blocksOf(content: string, path: string): Block[] {
  const blocks: Block[] = [];
  let buffer = "";

  const flush = (): void => {
    const text = buffer
      .split("\n")
      .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
      .filter((line) => line !== "")
      .join("\n")
      .trim();
    if (text !== "") blocks.push({ kind: "text", text });
    buffer = "";
  };

  const visit = (el: XmlElement, depth: number): void => {
    if (NON_PROSE.has(el.tagName)) return;

    let childDepth = depth;
    const isSection =
      classMatches(el, DITA_TOPIC) || classMatches(el, DITA_SECTION);

    if (isSection) {
      flush();
      const titleEl = firstChildMatching(el, DITA_TITLE);
      blocks.push({
        kind: "heading",
        title: titleEl ? elementText(titleEl) : "",
        level: depth + 1,
      });
      childDepth = depth + 1;
    }

    // Walk child *nodes*, not child elements: `<p>See <xref>the keys</xref>
    // first.</p>` keeps its prose in text nodes on either side of the xref, and
    // an element-only walk silently indexes the link text alone.
    for (const child of childNodes(el)) {
      if ("text" in child) {
        buffer += child.text;
        continue;
      }
      // A section's own title is its heading, not part of its body text.
      if (isSection && classMatches(child.element, DITA_TITLE)) continue;
      visit(child.element, childDepth);
    }

    if (!INLINE.has(el.tagName)) buffer += "\n";
  };

  visit(parseXml(content, path), 0);
  flush();
  return blocks;
}

function render(blocks: Block[]): string {
  return blocks
    .map((b) => (b.kind === "heading" ? b.title : b.text))
    .filter((s) => s !== "")
    .join("\n\n");
}

export function ditaTextOf(content: string): DocumentText {
  // The path is only used in the parse error, and a document that reached the
  // index already parsed once during analysis.
  const blocks = blocksOf(content, "<indexed document>");
  return {
    body: render(blocks),

    preamble(): string | undefined {
      const end = blocks.findIndex((b) => b.kind === "heading");
      const text = render(end < 0 ? blocks : blocks.slice(0, end));
      return text === "" ? undefined : text;
    },

    sectionOwnText(title, level, occurrence): string | undefined {
      const wanted = title.trim().toLowerCase();
      let remaining = occurrence;
      let start = -1;
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i]!;
        if (b.kind !== "heading") continue;
        if (b.title.trim().toLowerCase() !== wanted) continue;
        if (level !== undefined && b.level !== level) continue;
        if (remaining > 0) {
          remaining -= 1;
          continue;
        }
        start = i;
        break;
      }
      if (start < 0) return undefined;
      let end = blocks.length;
      for (let i = start + 1; i < blocks.length; i++) {
        if (blocks[i]!.kind === "heading") {
          end = i;
          break;
        }
      }
      const text = render(blocks.slice(start, end));
      return text === "" ? undefined : text;
    },
  };
}
