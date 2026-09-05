/**
 * HTML primitives shared by the analyzer and the text slicer.
 *
 * They must agree, not merely resemble each other. A section's `dcterms:title`
 * comes from `headingTextOf` here, and the lexical index looks its slice up
 * *by that title* — so if the two computed heading text differently, every
 * affected section would silently index no text at all. That is not
 * hypothetical: it is what happened when the slicer resolved a heading's
 * permalink target from the heading's own id while the analyzer inherited the
 * id from an enclosing `<section>`.
 */
import { defaultTreeAdapter } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";

export type Node = DefaultTreeAdapterMap["node"];
export type Element = DefaultTreeAdapterMap["element"];

export const HEADINGS = new Map([
  ["h1", 1],
  ["h2", 2],
  ["h3", 3],
  ["h4", 4],
  ["h5", 5],
  ["h6", 6],
]);

/** Sectioning content whose id a contained heading may inherit. */
export const SECTIONING_ELEMENTS = new Set(["section", "article"]);

/**
 * Elements whose text content is machinery, never prose. `template` holds
 * inert markup; the rest are code the browser runs or styling it applies.
 * `head` carries metadata, which docmeta's extractor reads separately.
 */
export const NON_PROSE = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "head",
]);

export function isElement(node: Node): node is Element {
  return defaultTreeAdapter.isElementNode(node);
}

export function attr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

export function childNodesOf(node: Node): Node[] {
  return (node as { childNodes?: Node[] }).childNodes ?? [];
}

/** Collapse every run of whitespace to one space, and trim. */
export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Resolve heading anchors for one document, in document order.
 *
 * The heading's own id wins — it is what a link elsewhere in the corpus
 * targets. Failing that, the nearest enclosing `<section>` or `<article>` id,
 * but only for the *first* heading inside it: a later sibling heading is not
 * that section's title and must not claim its anchor. Stateful, so one
 * instance must serve one document's whole walk.
 */
export class HeadingAnchors {
  private readonly claimed = new Set<Element>();

  idFor(heading: Element, ancestors: readonly Element[]): string | undefined {
    const own = attr(heading, "id");
    if (own !== undefined && own !== "") return own;
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const ancestor = ancestors[i]!;
      if (!SECTIONING_ELEMENTS.has(ancestor.tagName)) continue;
      const id = attr(ancestor, "id");
      if (id === undefined || id === "" || this.claimed.has(ancestor)) {
        return undefined;
      }
      this.claimed.add(ancestor);
      return id;
    }
    return undefined;
  }
}

/**
 * Whether a link points back at the heading it sits inside — the permalink
 * widget Sphinx, MkDocs and Docusaurus all append. It carries no information a
 * reader or a graph can use, so it is neither a link nor part of the heading's
 * text. `id` is the heading's *resolved* anchor, inherited id included.
 */
export function isSelfPermalink(
  el: Element,
  headingId: string | undefined,
): boolean {
  if (headingId === undefined || headingId === "") return false;
  return el.tagName === "a" && attr(el, "href") === `#${headingId}`;
}

/**
 * A heading's text: everything under it except non-prose subtrees and its own
 * permalink, whitespace collapsed.
 */
export function headingTextOf(
  heading: Element,
  headingId: string | undefined,
): string {
  let out = "";
  const visit = (node: Node): void => {
    for (const child of childNodesOf(node)) {
      if (defaultTreeAdapter.isTextNode(child)) {
        out += child.value;
        continue;
      }
      if (!isElement(child)) continue;
      if (NON_PROSE.has(child.tagName)) continue;
      if (isSelfPermalink(child, headingId)) continue;
      visit(child);
    }
  };
  visit(heading);
  return collapse(out);
}

/** Depth-first walk over elements in document order, with ancestor chains. */
export function walkElements(
  node: Node,
  visit: (el: Element, ancestors: readonly Element[]) => void,
  ancestors: Element[] = [],
): void {
  for (const child of childNodesOf(node)) {
    if (!isElement(child)) continue;
    visit(child, ancestors);
    ancestors.push(child);
    walkElements(child, visit, ancestors);
    ancestors.pop();
  }
}
