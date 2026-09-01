/**
 * Markdown and MDX analysis: one source file → body structure. Frontmatter
 * data comes from docmeta's extractor (single source of truth with
 * `dockg validate`); headings, links, images and code fences come from a
 * remark/mdast walk with positions in document order.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdx from "remark-mdx";
import { toString as mdastToString } from "mdast-util-to-string";
import { extractFrontmatter } from "docmeta";
import type { Root, Content, Definition } from "mdast";
import { DockgError } from "../../types.js";
import type { DocImage, DocLink } from "../../types.js";
import { classifyImage, classifyLink } from "./links.js";
import { SectionBuilder } from "./sections.js";
import { documentPreamble, sectionOwnText } from "../../runtime/resolve.js";
import type {
  AnalyzedBody,
  AnalyzeContext,
  DocAnalyzer,
  DocumentText,
} from "./types.js";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml", "toml"]);

/**
 * MDX gets its own processor, selected by extension (ADR 01022). It cannot be
 * the default: MDX reads `{` as an expression delimiter, so ordinary Markdown
 * prose containing braces would become a syntax error.
 */
const mdxProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml", "toml"])
  .use(remarkMdx);

/** MDX JSX attribute, narrowed to the literal-string case we can act on. */
interface JsxAttribute {
  type: string;
  name?: string;
  value?: unknown;
}

/**
 * Elements whose `src` is an image.
 *
 * `href` is HTML's hyperlink attribute wherever it appears, so reading it from
 * any element only ever yields an extra edge. `src` is not analogous: it is the
 * generic external-resource attribute, shared by `iframe`, `video`, `script`,
 * `audio`, `source`, and `embed`. Emitting `schema:image` for a video embed or
 * an analytics script would be a wrong *type* assertion rather than a merely
 * extra one, so `src` is read only where it means an image (ADR 01022).
 */
const IMAGE_ELEMENTS = new Set(["img", "image"]);

/**
 * The value of a JSX attribute, when it is a plain string literal.
 *
 * An expression attribute (`href={route}`) yields undefined rather than a
 * guess: its value is not knowable without evaluating the module, and a wrong
 * edge asserted confidently is worse than an absent one.
 */
function jsxAttributeValue(
  node: unknown,
  attributeName: string,
): string | undefined {
  const attributes = (node as { attributes?: JsxAttribute[] }).attributes;
  if (!Array.isArray(attributes)) return undefined;
  for (const attribute of attributes) {
    if (attribute.type !== "mdxJsxAttribute") continue;
    if (attribute.name !== attributeName) continue;
    return typeof attribute.value === "string" ? attribute.value : undefined;
  }
  return undefined;
}

async function analyzeMarkdown(
  content: string,
  ctx: AnalyzeContext,
  isMdx: boolean,
): Promise<AnalyzedBody> {
  const { path, allPaths, routes } = ctx;
  const meta = extractFrontmatter(content, "markdown");
  let tree: Root;
  try {
    tree = (isMdx ? mdxProcessor : processor).parse(content) as Root;
  } catch (error) {
    // Parsing MDX makes parse *failures* possible where Markdown had none:
    // remark-parse accepts anything, the MDX extension does not. Left raw, the
    // micromark throw escapes cli.ts's `fail()` — which only converts
    // DockgError — so the CLI dumps a stack trace, exits 1 (the code the
    // contract reserves for findings), and never names the file. Convert it.
    if (!isMdx) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new DockgError(`Could not parse MDX in ${path}: ${reason}`);
  }

  const builder = new SectionBuilder();
  const links: DocLink[] = [];
  const images: DocImage[] = [];
  const codeLanguages = new Set<string>();
  const definitions = new Map<string, Definition>();
  let firstH1: string | undefined;

  // First pass: collect reference-link definitions.
  visit(tree, (node) => {
    if (node.type === "definition") {
      const def = node as Definition;
      definitions.set(def.identifier, def);
    }
  });

  visit(tree, (node) => {
    switch (node.type) {
      case "heading": {
        const level = (node as { depth: number }).depth;
        const title = mdastToString(node);
        if (level === 1 && firstH1 === undefined) firstH1 = title;
        builder.push(title, level);
        break;
      }
      case "link": {
        const link = classifyLink(
          path,
          (node as { url: string }).url,
          allPaths,
          routes,
        );
        if (link) links.push(link);
        break;
      }
      case "linkReference": {
        const def = definitions.get(
          (node as { identifier: string }).identifier,
        );
        if (def) {
          const link = classifyLink(path, def.url, allPaths, routes);
          if (link) links.push(link);
        }
        break;
      }
      case "image": {
        images.push(classifyImage(path, (node as { url: string }).url));
        break;
      }
      case "imageReference": {
        const def = definitions.get(
          (node as { identifier: string }).identifier,
        );
        if (def) images.push(classifyImage(path, def.url));
        break;
      }
      case "code": {
        const lang = (node as { lang?: string | null }).lang;
        if (lang) codeLanguages.add(lang);
        break;
      }
      // A JSX element's `href` is a link and its `src` is an image, on any
      // element (ADR 01022). Those are HTML's own names for the relationships,
      // so this stays structural — dockg never learns what `<LinkCard>` means.
      case "mdxJsxFlowElement":
      case "mdxJsxTextElement": {
        const href = jsxAttributeValue(node, "href");
        if (href !== undefined) {
          const link = classifyLink(path, href, allPaths, routes);
          if (link) links.push(link);
        }
        const name = (node as { name?: string | null }).name ?? "";
        if (IMAGE_ELEMENTS.has(name.toLowerCase())) {
          const src = jsxAttributeValue(node, "src");
          if (src !== undefined) images.push(classifyImage(path, src));
        }
        break;
      }
    }
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

/** Minimal depth-first mdast walk in document order. */
function visit(node: Root | Content, fn: (node: Content) => void): void {
  const children = (node as { children?: Content[] }).children;
  if (!children) return;
  for (const child of children) {
    fn(child);
    visit(child, fn);
  }
}

/**
 * A leading YAML frontmatter block, and the blank lines after it.
 *
 * Only a document with *no* sections gets whole-body text, and its body is the
 * whole file — frontmatter included, unless it is stripped. That block is
 * machinery, not prose: left in, a query for `label` or `alt-labels` matches
 * every sectionless document. Section slices start at their heading, so they
 * never see it.
 */
const FRONTMATTER =
  /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)(?:\r?\n)*/;

/**
 * Markdown is its own indexable text, so slicing reuses the *runtime's* line
 * scanners rather than the mdast tree — index-time and retrieval-time text
 * cannot drift when both call the same function.
 *
 * Sections slice the raw source, not the stripped body: they start at a
 * heading, so frontmatter is already behind them, and `slice` re-joins on
 * "\n" so CRLF normalizes there. Only the document-level body needs the
 * explicit strip and newline normalization.
 */
async function markdownTextOf(content: string): Promise<DocumentText> {
  const body = content.replace(FRONTMATTER, "").replace(/\r\n/g, "\n");
  return {
    body,
    preamble: () => documentPreamble(body),
    sectionOwnText: (title, level, occurrence) =>
      sectionOwnText(content, title, level, occurrence),
  };
}

export const markdownAnalyzer: DocAnalyzer = {
  name: "markdown",
  extensions: [".md", ".markdown"],
  mediaType: "text/markdown",
  implemented: true,
  writable: true,
  analyze: (content, ctx) => analyzeMarkdown(content, ctx, false),
  textOf: markdownTextOf,
};

export const mdxAnalyzer: DocAnalyzer = {
  name: "mdx",
  extensions: [".mdx"],
  mediaType: "text/markdown",
  implemented: true,
  writable: true,
  analyze: (content, ctx) => analyzeMarkdown(content, ctx, true),
  textOf: markdownTextOf,
};
