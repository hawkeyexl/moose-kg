/**
 * Document analysis: one source file → a `DocModel`.
 *
 * This file is the dispatcher. Per-format parsing lives in `analyzers/`, and
 * everything downstream — `deriveGraph`, `fill`, the coverage report — sees
 * only `DocModel`, so a new input format never touches derivation.
 *
 * Two things stay here rather than in any analyzer, because they must be
 * identical across formats: the repo-relative path normalization that section
 * and document IRIs are minted from, and the content digest (ADR 01036).
 */
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { DockgError } from "../types.js";
import type { DocModel } from "../types.js";
import {
  analyzerForExtension,
  implementedExtensions,
} from "./analyzers/index.js";
import type { RouteMapping } from "./config.js";
import { normalizeDocPath } from "./iri.js";

export interface AnalyzeOptions {
  /** Site-route mappings for resolving root-absolute links. */
  routes?: RouteMapping[];
}

/**
 * Analyze one source file. `allPaths` is the discovered corpus for link
 * resolution.
 *
 * Throws `DockgError` when no implemented analyzer claims the file's
 * extension. Refusing is the feature: parsing an unknown format as Markdown
 * succeeds at everything except finding anything, and a graph that is empty
 * for a parser reason is indistinguishable from a corpus that genuinely has
 * no structure.
 */
export async function analyzeDoc(
  content: string,
  relPath: string,
  allPaths: ReadonlySet<string>,
  options: AnalyzeOptions = {},
): Promise<DocModel> {
  const path = normalizeDocPath(relPath);
  const ext = extname(path).toLowerCase();
  const analyzer = analyzerForExtension(ext);
  if (!analyzer) {
    throw new DockgError(
      `No input format is registered for ${path}${
        ext === "" ? " (no file extension)" : ` ("${ext}")`
      } — narrow your inputs globs. Supported: ${implementedExtensions().join(", ")}.`,
    );
  }
  const body = await analyzer.analyze(content, {
    path,
    allPaths,
    routes: options.routes ?? [],
  });
  return {
    path,
    ...body,
    // Over the content as read — line endings included, so the digest is
    // byte-faithful and equals `sha256sum <file>` for any valid-UTF-8 file
    // (ADR 01036). The CRLF corpus fixture depends on this not normalizing.
    contentHash: createHash("sha256").update(content, "utf8").digest("hex"),
  };
}
