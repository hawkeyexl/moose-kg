/**
 * HTML → indexable text, for the lexical search artifact (ADR 01019).
 *
 * The granularity rule is the same one Markdown obeys: a section owns its
 * heading down to the next heading of **any** rank, and the document owns the
 * prose no section covers. What differs is that the text has to be recovered
 * from markup first — indexing raw HTML would put `<div class="md-content">`
 * in front of every reader's query.
 *
 * Sections are looked up by heading text, so heading text here comes from the
 * same `html-dom` primitives the analyzer used to write `dcterms:title`. When
 * those two disagreed, every section whose permalink id was inherited from an
 * enclosing `<section>` silently indexed nothing.
 *
 * The document is parsed once per file and sliced from the resulting block
 * list, because `buildSearchIndex` asks for the preamble once and then for
 * every section: re-parsing per question would be a parse per section.
 */
import { parse, defaultTreeAdapter } from "parse5";
import {
  childNodesOf,
  headingTextOf,
  HeadingAnchors,
  HEADINGS,
  isElement,
  NON_PROSE,
  type Element,
  type Node,
} from "./html-dom.js";
import type { DocumentText } from "./types.js";

/**
 * Elements that end a line of prose. Without them every paragraph, list item
 * and table cell in a page runs into the next as one sentence.
 */
const BLOCK = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

type Block =
  | { kind: "heading"; title: string; level: number }
  | { kind: "text"; text: string };

/** Split a document into headings and the prose between them, in order. */
function blocksOf(content: string): Block[] {
  const blocks: Block[] = [];
  const anchors = new HeadingAnchors();
  let buffer = "";

  const flush = (): void => {
    const text = tidy(buffer);
    if (text !== "") blocks.push({ kind: "text", text });
    buffer = "";
  };

  const visit = (node: Node, ancestors: Element[]): void => {
    for (const child of childNodesOf(node)) {
      if (defaultTreeAdapter.isTextNode(child)) {
        buffer += child.value;
        continue;
      }
      if (!isElement(child)) continue;
      if (NON_PROSE.has(child.tagName)) continue;

      const level = HEADINGS.get(child.tagName);
      if (level !== undefined) {
        flush();
        const id = anchors.idFor(child, ancestors);
        blocks.push({
          kind: "heading",
          title: headingTextOf(child, id),
          level,
        });
        continue;
      }

      ancestors.push(child);
      visit(child, ancestors);
      ancestors.pop();
      if (BLOCK.has(child.tagName)) buffer += "\n";
    }
  };

  visit(parse(content), []);
  flush();
  return blocks;
}

/** Collapse intra-line whitespace, drop blank lines, trim. */
function tidy(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n")
    .trim();
}

function render(blocks: Block[]): string {
  return blocks
    .map((b) => (b.kind === "heading" ? b.title : b.text))
    .filter((s) => s !== "")
    .join("\n\n");
}

export function htmlTextOf(content: string): DocumentText {
  const blocks = blocksOf(content);
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
      // Own text only: the next heading of ANY rank ends it, so a parent does
      // not shadow its children in the rankings.
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
