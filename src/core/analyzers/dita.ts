/**
 * DITA topic and map analysis (ADR 01039).
 *
 * Two analyzers, one parser. A topic has prose and structure; a map has
 * neither — it is a navigation tree of references — so a map derives links and
 * no sections. Inventing sections for a map would assert prose that is not
 * there.
 *
 * Elements are matched by `@class`, not by tag name, because that is how DITA
 * itself identifies them: a specialization renames the element and keeps the
 * class ancestry (`class="- topic/section concept/section "`). Matching names
 * alone would work on textbook DITA and silently derive nothing from a real
 * specialized document set. Tag names remain the fallback for hand-written
 * DITA, which often omits `@class`.
 *
 * **Not resolved:** `@conref`, `@conkeyref` and `@keyref`. Each is an
 * indirection that only a map (or another topic) can resolve, and dockg reads
 * one file at a time. A keyref-only link therefore derives nothing — an
 * absence, which ADR 01022 established as the conservative direction, rather
 * than a guessed edge.
 */

import { extractorForExtension } from "docmeta";
import { DockgError } from "../../types.js";
import type { DocImage, DocLink } from "../../types.js";
import { ditaTextOf } from "./dita-text.js";
import {
  childElements,
  classMatches,
  DITA_IMAGE,
  DITA_LINK,
  DITA_SECTION,
  DITA_SHORTDESC,
  DITA_TITLE,
  DITA_TOPIC,
  DITA_TOPICREF,
  DITA_XREF,
  elementText,
  firstChildMatching,
  parseXml,
  type XmlElement,
} from "./dita-dom.js";
import { classifyImage, classifyLink } from "./links.js";
import { SectionBuilder } from "./sections.js";
import type { AnalyzedBody, AnalyzeContext, DocAnalyzer } from "./types.js";

/**
 * DITA addresses an element as `file.dita#topicid/elementid`. dockg's section
 * IRIs are `doc#slug` where the slug is that element's own id, so the last
 * fragment segment is the anchor — which is right for both forms: `#install`
 * addresses the root topic, `#install/prereq` addresses the section inside it.
 */
function normalizeDitaHref(href: string): string {
  const hash = href.indexOf("#");
  if (hash < 0) return href;
  const path = href.slice(0, hash);
  const fragment = href.slice(hash + 1);
  const slash = fragment.lastIndexOf("/");
  return `${path}#${slash < 0 ? fragment : fragment.slice(slash + 1)}`;
}

/** Metadata from docmeta, plus the title and shortdesc the derive layer needs. */
function metadataOf(
  content: string,
  path: string,
  root: XmlElement,
): { data: Record<string, unknown>; present: boolean } {
  const extractor = extractorForExtension(".dita");
  if (!extractor) {
    throw new DockgError(
      `docmeta has no XML metadata extractor — cannot analyze ${path}.`,
    );
  }
  const meta = extractor.extract(content, path);
  const data = { ...meta.data };

  // docmeta records these under element-path keys (`topic.title`), which vary
  // with the root element's name and so vary with specialization. The derive
  // layer reads `title` and `description`; supply those names from the DOM,
  // without overwriting anything an author set explicitly.
  const title = firstChildMatching(root, DITA_TITLE);
  if (title && data["title"] === undefined) {
    data["title"] = elementText(title);
  }
  const shortdesc = firstChildMatching(root, DITA_SHORTDESC);
  if (shortdesc && data["description"] === undefined) {
    data["description"] = elementText(shortdesc);
  }
  return { data, present: meta.present };
}

function analyzeTopic(content: string, ctx: AnalyzeContext): AnalyzedBody {
  const { path, allPaths, routes } = ctx;
  const root = parseXml(content, path);
  const meta = metadataOf(content, path, root);

  const builder = new SectionBuilder();
  const links: DocLink[] = [];
  const images: DocImage[] = [];
  const codeLanguages = new Set<string>();
  let firstH1: string | undefined;

  /**
   * Walk with an explicit section depth rather than raw tree depth: DITA nests
   * sections inside `<body>`, which is not itself a section, so tree depth
   * would make every level wrong by one and vary with the body wrapper.
   */
  const visit = (el: XmlElement, depth: number): void => {
    let childDepth = depth;

    if (classMatches(el, DITA_TOPIC) || classMatches(el, DITA_SECTION)) {
      const level = depth + 1;
      const titleEl = firstChildMatching(el, DITA_TITLE);
      const title = titleEl ? elementText(titleEl) : "";
      if (level === 1 && firstH1 === undefined) firstH1 = title;
      const id = el.getAttribute("id") ?? undefined;
      builder.push(title, level, id === "" ? undefined : id);
      childDepth = level;
    }

    if (classMatches(el, DITA_XREF) || classMatches(el, DITA_LINK)) {
      const href = el.getAttribute("href");
      if (href) {
        const link = classifyLink(
          path,
          normalizeDitaHref(href),
          allPaths,
          routes,
        );
        // The raw target reported to the reader is what they wrote, not what
        // dockg normalized it to — a broken-link report naming a target that
        // appears nowhere in the source is unactionable.
        if (link) links.push({ ...link, raw: href });
      }
    }

    if (classMatches(el, DITA_IMAGE)) {
      const href = el.getAttribute("href");
      if (href) images.push(classifyImage(path, href));
    }

    // `outputclass` is where a DITA toolchain conventionally carries the
    // highlighting language, in either bare or `language-x` form.
    if (el.tagName === "codeblock" || classMatches(el, "pr-d/codeblock")) {
      const outputclass = el.getAttribute("outputclass");
      if (outputclass) {
        for (const token of outputclass.split(/\s+/)) {
          if (token === "") continue;
          codeLanguages.add(token.replace(/^(?:language|lang)-/, ""));
        }
      }
    }

    for (const child of childElements(el)) visit(child, childDepth);
  };

  visit(root, 0);

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

function analyzeMap(content: string, ctx: AnalyzeContext): AnalyzedBody {
  const { path, allPaths, routes } = ctx;
  const root = parseXml(content, path);
  const meta = metadataOf(content, path, root);
  const links: DocLink[] = [];

  const visit = (el: XmlElement): void => {
    if (classMatches(el, DITA_TOPICREF)) {
      const href = el.getAttribute("href");
      if (href) {
        const link = classifyLink(
          path,
          normalizeDitaHref(href),
          allPaths,
          routes,
        );
        if (link) links.push({ ...link, raw: href });
      }
    }
    for (const child of childElements(el)) visit(child);
  };
  visit(root);

  return {
    frontmatter: meta.data,
    frontmatterPresent: meta.present,
    // A map has no prose, so no sections, no images and no code. Its whole
    // contribution to the graph is the reference edges of the navigation tree.
    sections: [],
    links,
    images: [],
    codeLanguages: [],
  };
}

export const ditaAnalyzer: DocAnalyzer = {
  name: "dita",
  extensions: [".dita"],
  mediaType: "application/dita+xml",
  implemented: true,
  // docmeta's XML extractor exposes `apply`, so writing metadata into a
  // <prolog> is reachable later; dockg's own writer only knows YAML fences.
  writable: false,
  analyze: analyzeTopic,
  textOf: ditaTextOf,
};

export const ditaMapAnalyzer: DocAnalyzer = {
  name: "ditamap",
  extensions: [".ditamap"],
  mediaType: "application/dita+xml",
  implemented: true,
  writable: false,
  analyze: analyzeMap,
  textOf: ditaTextOf,
};
