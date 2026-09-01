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
  analyze(content: string, ctx: AnalyzeContext): AnalyzedBody;
}
