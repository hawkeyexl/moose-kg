/**
 * HTML body analysis (ADR 01038).
 *
 * parse5 gives a spec-conformant tree and recovers from malformed markup, so
 * analysis never throws on a real-world page — an important difference from
 * MDX, where a parse failure is the honest answer (ADR 01022).
 *
 * Three rules here are decisions rather than mechanics:
 *
 * - **An explicit id beats a slugged title.** Section IRIs are `doc#slug`, and
 *   a link elsewhere in the corpus writes `install.html#install-the-sdk`.
 *   Slugging the title would mint an IRI nothing points at.
 * - **A heading's own self-permalink is not part of its text.** Sphinx, MkDocs
 *   and Docusaurus all append an anchor back to the heading's own id, so
 *   `textContent` would read "Install the SDK¶". The rule is structural rather
 *   than tool-specific: a link from a heading to *itself* carries no
 *   information, whatever glyph it uses.
 * - **`href` is read from hyperlink elements only.** ADR 01022 reads `href`
 *   from any JSX element because a component's identity is unknowable. In HTML
 *   it is known, and `<link rel="stylesheet">` sits in the head of every page —
 *   reading it would add a systematic spurious edge to every document, which is
 *   a different thing from the occasional extra edge that ADR accepted.
 */
import { parse } from "parse5";
import { extractorForExtension } from "docmeta";
import { DockgError } from "../../types.js";
import type { DocImage, DocLink } from "../../types.js";
import {
  attr,
  headingTextOf,
  HeadingAnchors,
  HEADINGS,
  isSelfPermalink,
  walkElements,
  type Element,
} from "./html-dom.js";
import { htmlTextOf } from "./html-text.js";
import { classifyImage, classifyLink } from "./links.js";
import { SectionBuilder } from "./sections.js";
import type { AnalyzedBody, AnalyzeContext, DocAnalyzer } from "./types.js";

/** HTML's hyperlink elements — the ones whose `href` addresses a document. */
const HYPERLINK_ELEMENTS = new Set(["a", "area"]);

/** Languages named by a `language-x` / `lang-x` class on a `<code>` element. */
function codeLanguageOf(el: Element): string | undefined {
  if (el.tagName !== "code") return undefined;
  const classes = attr(el, "class");
  if (classes === undefined) return undefined;
  for (const token of classes.split(/\s+/)) {
    const match = /^(?:language|lang)-(.+)$/.exec(token);
    if (match) return match[1];
  }
  return undefined;
}

/** The innermost heading a node sits inside, if any. */
function enclosingHeading(ancestors: readonly Element[]): Element | undefined {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i]!;
    if (HEADINGS.has(ancestor.tagName)) return ancestor;
  }
  return undefined;
}

async function analyzeHtml(
  content: string,
  ctx: AnalyzeContext,
): Promise<AnalyzedBody> {
  const { path, allPaths, routes } = ctx;
  const extractor = extractorForExtension(".html");
  if (!extractor) {
    // Unreachable with any docmeta that ships an HTML extractor; converted
    // rather than left to throw a TypeError three frames later.
    throw new DockgError(
      `docmeta has no HTML metadata extractor — cannot analyze ${path}.`,
    );
  }
  const meta = extractor.extract(content, path);

  const anchors = new HeadingAnchors();
  const builder = new SectionBuilder();
  const links: DocLink[] = [];
  const images: DocImage[] = [];
  const codeLanguages = new Set<string>();
  /** Resolved anchor per heading element, for the permalink check below. */
  const anchorOf = new Map<Element, string | undefined>();
  let firstH1: string | undefined;

  walkElements(parse(content), (el, ancestors) => {
    const level = HEADINGS.get(el.tagName);
    if (level !== undefined) {
      const id = anchors.idFor(el, ancestors);
      anchorOf.set(el, id);
      const title = headingTextOf(el, id);
      if (level === 1 && firstH1 === undefined) firstH1 = title;
      builder.push(title, level, id);
      return;
    }

    // A link inside a heading is still a link; a *self-permalink* is not, and
    // dropping it here matches dropping it from the heading's text. The walk
    // is in document order, so the heading's anchor is already resolved.
    if (HYPERLINK_ELEMENTS.has(el.tagName)) {
      const href = attr(el, "href");
      const heading = enclosingHeading(ancestors);
      const permalink =
        heading !== undefined && isSelfPermalink(el, anchorOf.get(heading));
      if (href !== undefined && !permalink) {
        const link = classifyLink(path, href, allPaths, routes);
        if (link) links.push(link);
      }
    }

    if (el.tagName === "img") {
      const src = attr(el, "src");
      if (src !== undefined) images.push(classifyImage(path, src));
    }

    const lang = codeLanguageOf(el);
    if (lang !== undefined) codeLanguages.add(lang);
  });

  return {
    frontmatter: meta.data,
    frontmatterPresent: meta.present,
    firstH1,
    sections: builder.build(),
    links,
    images,
    codeLanguages: [...codeLanguages].sort(),
  };
}

export const htmlAnalyzer: DocAnalyzer = {
  name: "html",
  extensions: [".html", ".htm"],
  mediaType: "text/html",
  implemented: true,
  // dockg's writer only knows YAML frontmatter fences. docmeta can write
  // `<meta>` tags (its HTML extractor exposes `apply`), so this is a dockg
  // limitation with a clear path out, not a property of the format.
  writable: false,
  analyze: analyzeHtml,
  textOf: htmlTextOf,
};
