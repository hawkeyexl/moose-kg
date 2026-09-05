/**
 * AsciiDoc analysis (ADR 01045).
 *
 * Asciidoctor.js is used as an **AsciiDoc-to-HTML front end**, and the
 * resulting HTML goes through dockg's existing HTML extraction. That is not a
 * shortcut — it is the only way to read AsciiDoc's inline structure at all.
 * Asciidoctor's loaded AST contains blocks but not inline nodes: links live
 * inside paragraph text and are only realized during conversion, so
 * `findBy({context: 'inline_anchor'})` on a loaded document returns nothing.
 * Converting is what makes them exist, and Asciidoctor's own resolution of
 * where a link points beats any reimplementation of it.
 *
 * Sharing HTML's extraction also settles the agreement problem that bit both
 * earlier formats: a section's `dcterms:title` and the lexical index's lookup
 * key come from one function, so they cannot disagree.
 *
 * Two attributes are load-bearing:
 *
 * - **`relfilesuffix: ".adoc"`.** Asciidoctor rewrites a cross-file xref's
 *   `.adoc` to the *output* suffix, so `xref:configuration.adoc[]` converts to
 *   `href="configuration.html"`. dockg resolves links against source files, so
 *   unconfigured that would make every cross-file xref in every corpus a
 *   broken link.
 * - **`showtitle`.** Without it the document title is not rendered into
 *   embedded output at all, so `= Title` would produce no section while a
 *   Markdown `# Title` produces one.
 *
 * And one safe mode: **`secure`**, which leaves `include::` directives
 * unresolved. Resolving them would make the graph depend on files outside the
 * corpus — and on whether they happened to be readable — which is not a thing
 * a deterministic build can do. Asciidoctor renders an unresolved include as
 * `<a class="bare include">` pointing at the include path, so those anchors
 * are filtered out: the author wrote a directive, not a link, and reporting a
 * broken link they cannot fix is the unactionable finding ADR 01033 exists to
 * prevent.
 */
import { load } from "@asciidoctor/core";
import { extractorForExtension } from "docmeta";
import { DockgError } from "../../types.js";
import { attr, type Element } from "./html-dom.js";
import { analyzeHtmlBody } from "./html.js";
import { htmlTextOf } from "./html-text.js";
import type { AnalyzedBody, AnalyzeContext, DocAnalyzer } from "./types.js";

const ATTRIBUTES = {
  relfilesuffix: ".adoc",
  showtitle: "",
};

/**
 * Convert one document to HTML.
 *
 * Asciidoctor's *document attributes* are never read — `docdate`, `doctime`
 * and `localdate` are synthesized from the system clock, so a single
 * `getAttributes()` call would put the wall clock into the graph and break the
 * determinism contract. Page metadata comes from docmeta instead, which reads
 * the `:key:` entries out of the source text.
 */
async function toHtml(content: string, path: string): Promise<string> {
  try {
    const doc = await load(content, { safe: "secure", attributes: ATTRIBUTES });
    return await doc.convert();
  } catch (error) {
    // Converted, or the raw throw escapes `cli.ts`'s `fail()` — which only
    // converts DockgError — so the CLI dumps a stack trace, exits 1 (the code
    // the contract reserves for findings), and never names the file. Same
    // failure ADR 01022 closed for MDX.
    const reason = error instanceof Error ? error.message : String(error);
    throw new DockgError(`Could not parse AsciiDoc in ${path}: ${reason}`);
  }
}

/** Asciidoctor's marker for an `include::` it was not allowed to resolve. */
function isUnresolvedInclude(el: Element): boolean {
  const classes = attr(el, "class");
  return classes !== undefined && classes.split(/\s+/).includes("include");
}

async function analyzeAsciidoc(
  content: string,
  ctx: AnalyzeContext,
): Promise<AnalyzedBody> {
  const extractor = extractorForExtension(".adoc");
  if (!extractor) {
    throw new DockgError(
      `docmeta has no AsciiDoc metadata extractor — cannot analyze ${ctx.path}.`,
    );
  }
  const meta = extractor.extract(content, ctx.path);
  const html = await toHtml(content, ctx.path);
  return {
    frontmatter: meta.data,
    frontmatterPresent: meta.present,
    ...analyzeHtmlBody(html, ctx, { skipLink: isUnresolvedInclude }),
  };
}

export const asciidocAnalyzer: DocAnalyzer = {
  name: "asciidoc",
  extensions: [".adoc", ".asciidoc"],
  mediaType: "text/asciidoc",
  // docmeta's AsciiDoc extractor exposes `apply`, so writing `:key:` entries
  // back is reachable later; dockg's own writer only knows YAML fences.
  writable: false,
  implemented: true,
  analyze: analyzeAsciidoc,
  textOf: async (content, path) => htmlTextOf(await toHtml(content, path)),
};
