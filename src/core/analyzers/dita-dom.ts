/**
 * DITA/XML primitives shared by the analyzer and the text slicer.
 *
 * They must agree for the same reason the HTML pair must (ADR 01042): the
 * analyzer writes a section's `dcterms:title`, and the lexical index looks its
 * slice up by that title.
 */
import { DOMParser } from "@xmldom/xmldom";
import type { Element as XmldomElement } from "@xmldom/xmldom";
import { DockgError } from "../../types.js";

export type XmlElement = XmldomElement;

/**
 * DITA class ancestry strings. A specialized element renames its tag but keeps
 * the ancestry — `class="- topic/section concept/section "` — which is exactly
 * how a DITA processor identifies it. Matching tag names alone works on
 * textbook DITA and derives nothing from a real specialized document set.
 */
export const DITA_TOPIC = "topic/topic";
export const DITA_SECTION = "topic/section";
export const DITA_TITLE = "topic/title";
export const DITA_SHORTDESC = "topic/shortdesc";
export const DITA_XREF = "topic/xref";
export const DITA_LINK = "topic/link";
export const DITA_IMAGE = "topic/image";
export const DITA_TOPICREF = "map/topicref";

/**
 * Tag names that stand in for a class when `@class` is absent, as it usually
 * is in hand-written DITA. `topic/topic` covers the structural specializations
 * every DITA document set uses; `map/topicref` covers the map ones.
 */
const TAG_FALLBACKS: Record<string, readonly string[]> = {
  [DITA_TOPIC]: [
    "topic",
    "concept",
    "task",
    "reference",
    "glossentry",
    "glossgroup",
    "troubleshooting",
  ],
  [DITA_SECTION]: ["section"],
  [DITA_TITLE]: ["title"],
  [DITA_SHORTDESC]: ["shortdesc"],
  [DITA_XREF]: ["xref"],
  [DITA_LINK]: ["link"],
  [DITA_IMAGE]: ["image"],
  [DITA_TOPICREF]: [
    "topicref",
    "mapref",
    "keydef",
    "chapter",
    "appendix",
    "part",
    "anchorref",
    "topicset",
    "topicsetref",
  ],
};

/**
 * Whether an element is (a specialization of) the named DITA base.
 *
 * `@class` wins wherever it is present, so a specialization is recognized and
 * an element that merely *shares a name* with a DITA base but declares a
 * different ancestry is not.
 */
export function classMatches(el: XmlElement, base: string): boolean {
  const cls = el.getAttribute("class");
  if (cls !== null && cls !== "") return ` ${cls} `.includes(` ${base} `);
  return (TAG_FALLBACKS[base] ?? []).includes(el.tagName);
}

/** Child nodes as `{text}` or `{element}`, in document order. */
export function childNodes(
  el: XmlElement,
): Array<{ text: string } | { element: XmlElement }> {
  const out: Array<{ text: string } | { element: XmlElement }> = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes.item(i);
    if (!node) continue;
    // 3 = text, 4 = CDATA. Both are prose an author wrote.
    if (node.nodeType === 3 || node.nodeType === 4) {
      out.push({ text: node.nodeValue ?? "" });
    } else if (node.nodeType === 1) {
      out.push({ element: node as XmlElement });
    }
  }
  return out;
}

export function childElements(el: XmlElement): XmlElement[] {
  const out: XmlElement[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes.item(i);
    if (node && node.nodeType === 1) out.push(node as XmlElement);
  }
  return out;
}

/** The first direct child matching a DITA base class, if any. */
export function firstChildMatching(
  el: XmlElement,
  base: string,
): XmlElement | undefined {
  for (const child of childElements(el)) {
    if (classMatches(child, base)) return child;
  }
  return undefined;
}

/** All text under an element, whitespace collapsed. */
export function elementText(el: XmlElement): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Parse one document, or fail with an operational error naming the file.
 *
 * Unlike HTML, XML has no recovery mode, and malformed input reaches us two
 * different ways: a *fatal* error throws a `ParseError`, while a merely
 * well-formedness-violating one is reported through `onError` and leaves a
 * partial tree behind. Both are handled, for two different reasons.
 *
 * The throw has to be converted or it escapes `cli.ts`'s `fail()` — which only
 * converts `DockgError` — so the CLI dumps a stack trace, exits 1 (the code the
 * contract reserves for findings), and never names the file. That is the same
 * failure ADR 01022 had to close for MDX.
 *
 * The non-throwing case matters more: left alone, dockg would derive a
 * plausible, complete-looking graph from a truncated file and say nothing.
 */
export function parseXml(content: string, path: string): XmlElement {
  const errors: string[] = [];
  const fail = (detail: string): never => {
    throw new DockgError(
      `Could not parse XML in ${path}: ${detail.split("\n")[0]}`,
    );
  };

  let doc;
  try {
    doc = new DOMParser({
      onError: (level, message) => {
        if (level === "error" || level === "fatalError") errors.push(message);
      },
    }).parseFromString(content, "text/xml");
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  if (errors.length > 0) return fail(errors[0]!);
  const root = doc.documentElement;
  if (!root) return fail("no root element.");
  return root;
}
