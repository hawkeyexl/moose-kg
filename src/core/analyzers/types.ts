/** The analyzer contract shared by every input format. */
import type { DocModel } from "../../types.js";
import type { RouteMapping } from "../config.js";

/** What an analyzer derives from one document's body. */
export type AnalyzedBody = Omit<DocModel, "path" | "contentHash">;

/** Everything an analyzer needs beyond the file's own bytes. */
export interface AnalyzeContext {
  /** Normalized repo-relative path of the document, forward slashes. */
  path: string;
  /** The discovered corpus, for resolving internal links. */
  allPaths: ReadonlySet<string>;
  /** Site-route mappings, for resolving root-absolute links. */
  routes: RouteMapping[];
}

/**
 * A document's indexable text, for the lexical search artifact (ADR 01019).
 *
 * Produced once per file and queried many times: `buildSearchIndex` asks for
 * the preamble once and then for every section, and a markup format that
 * re-parsed per question would pay a parse per section.
 */
export interface DocumentText {
  /**
   * The whole indexable body — machinery removed. What a document with no
   * sections owns, since there is no section to own it instead.
   */
  body: string;
  /** Prose before the first heading, or undefined when there is none. */
  preamble(): string | undefined;
  /**
   * The text a section owns: its heading down to the next heading of **any**
   * rank, so a parent does not shadow its subsections in the rankings.
   * `occurrence` disambiguates repeated heading text (0 = the first).
   */
  sectionOwnText(
    title: string,
    level: number | undefined,
    occurrence: number,
  ): string | undefined;
}

/**
 * A pluggable body analyzer for one document format.
 *
 * `path` and `contentHash` are deliberately *not* an analyzer's job: the
 * dispatcher supplies both, so the content digest is computed identically for
 * every format (ADR 01036) and cannot drift as formats are added.
 */
export interface DocAnalyzer {
  /** Stable format name, used in diagnostics (e.g. "markdown", "dita"). */
  name: string;
  /** Lowercase file extensions this analyzer claims, incl. the dot. */
  extensions: string[];
  /**
   * IANA media type of the source, for the iiRDS package projection's
   * `iirds:format` (ADR 01017). A rendition shipped as `text/markdown` when it
   * is HTML is a wrong claim about the bytes in the package, not a cosmetic
   * one — a consumer picks its renderer from this.
   */
  mediaType: string;
  /** Whether body analysis is wired up (false for roadmap stubs). */
  implemented: boolean;
  /**
   * Whether `dockg fill --apply` may write metadata back into this format.
   *
   * dockg's writer re-serializes a YAML frontmatter fence and carries the body
   * over byte-for-byte, and creates a fence when a file has none — which on a
   * format that has no frontmatter is not an edit but a corruption. False
   * means propose-only.
   */
  writable: boolean;
  analyze(content: string, ctx: AnalyzeContext): Promise<AnalyzedBody>;
  /**
   * Recover indexable prose from the source. Required of every implemented
   * analyzer: a format that can be built but not sliced would emit a lexical
   * index full of its own markup, which is worse than no index at all.
   *
   * `path` is the document's repo-relative path, carried purely so a parse
   * failure here names the file the way `analyze` does. Indexing runs as its
   * own command over a whole corpus, so an error naming no file leaves the
   * reader grepping a thousand documents for the one that broke.
   */
  textOf(content: string, path: string): Promise<DocumentText>;
}
