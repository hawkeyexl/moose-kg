/**
 * The input-format registry: file extension → body analyzer.
 *
 * Roadmap formats are registered as *stubs* rather than left out. That is the
 * point of the registry, not a placeholder: an unregistered extension and an
 * unimplemented format lead a reader to different next actions ("fix the
 * glob" vs "dockg cannot read this yet"), and before this existed both
 * produced the same thing — a build that exited 0 having derived nothing,
 * because `analyzeDoc` parsed every extension as Markdown. An HTML corpus
 * yielded a clean, green, empty graph. Silence is the failure mode dockg
 * exists to remove (ADR 01008).
 *
 * The shape is docmeta's `MetadataExtractor` registry, deliberately: docmeta
 * already resolves *metadata* per format, and two registries that disagree
 * about what a `.dita` file is would be worse than one that is merely
 * duplicated.
 */
import { DockgError } from "../../types.js";
import { byCodeUnit } from "../sort.js";
import { markdownAnalyzer, mdxAnalyzer } from "./markdown.js";
import type { DocAnalyzer } from "./types.js";

export type { AnalyzedBody, AnalyzeContext, DocAnalyzer } from "./types.js";

/**
 * A registered format whose body parsing is not implemented yet.
 *
 * `note` says what is missing, so the error tells the reader whether to wait
 * for dockg or to change their corpus.
 */
export function createStubAnalyzer(
  name: string,
  extensions: string[],
  note: string,
): DocAnalyzer {
  return {
    name,
    extensions,
    implemented: false,
    writable: false,
    analyze() {
      throw new DockgError(
        `The "${name}" input format is not yet implemented (${note}).`,
      );
    },
  };
}

export const ANALYZERS: DocAnalyzer[] = [
  markdownAnalyzer,
  mdxAnalyzer,
  createStubAnalyzer(
    "html",
    [".html", ".htm"],
    "headings, links, images and code blocks are not derived yet",
  ),
  createStubAnalyzer(
    "dita",
    [".dita"],
    "topic, section, xref and image derivation is not implemented yet",
  ),
  createStubAnalyzer(
    "ditamap",
    [".ditamap"],
    "topicref derivation is not implemented yet",
  ),
  createStubAnalyzer(
    "asciidoc",
    [".adoc", ".asciidoc"],
    "section, cross-reference and image derivation is not implemented yet",
  ),
  createStubAnalyzer(
    "rst",
    [".rst"],
    "docutils is a Python library with no JavaScript equivalent; a subset parser is planned",
  ),
  createStubAnalyzer(
    "xml",
    [".xml"],
    "generic XML declares no headings, links or images, so dockg has nothing to derive a body from — DITA is supported as its own format",
  ),
];

const byExtension = new Map<string, DocAnalyzer>();
for (const analyzer of ANALYZERS) {
  for (const ext of analyzer.extensions) {
    byExtension.set(ext.toLowerCase(), analyzer);
  }
}

/** The analyzer claiming an extension (incl. dot), implemented or not. */
export function analyzerForExtension(ext: string): DocAnalyzer | undefined {
  return byExtension.get(ext.toLowerCase());
}

/** Extensions dockg can actually derive a body from, sorted. */
export function implementedExtensions(): string[] {
  return ANALYZERS.filter((a) => a.implemented)
    .flatMap((a) => a.extensions)
    .sort(byCodeUnit);
}
