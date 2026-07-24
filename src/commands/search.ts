/**
 * `dockg search` — text query → ranked seed nodes (ADR 01019).
 *
 * A thin Node wrapper over the browser-native lexical entry stage: it loads the
 * `search.json` artifact and runs the same `findEntry` a browser would. This is
 * the stage before `traverse`; Phase 9's `retrieve` chains the two.
 *
 * The trace is always in the JSON output — retrieval provenance is part of the
 * contract, not an opt-in (ADR 01018).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadConfig } from "../core/config.js";
import { compactIri } from "../core/load.js";
import {
  SEARCH_INDEX_FILENAME,
  type SearchIndexDoc,
} from "../core/search-index.js";
import { DockgError } from "../types.js";
import { findEntry } from "../runtime/entry.js";
import { createLexicalIndex } from "../runtime/lexical.js";
import type { QueryTrace } from "../runtime/trace.js";

export interface SearchOptions {
  config?: string;
  /** Graph .ttl path (default: config `out`) — locates the sibling index. */
  graph?: string;
  /** Search index path (default: `search.json` beside the graph). */
  index?: string;
  query: string;
  limit?: number;
  cwd?: string;
}

export interface SearchReport {
  query: string;
  results: Array<{
    iri: string;
    score: number;
    via: string;
    type?: string;
    title?: string;
  }>;
  trace: QueryTrace;
}

/**
 * Read and shape-check the artifact. A truncated write, or `-i` pointed at the
 * wrong file, is an operational error (exit 2) like an unparseable graph — not
 * a raw stack trace, and not a confident "0 results".
 */
function loadSearchIndex(indexPath: string): SearchIndexDoc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(indexPath, "utf8"));
  } catch (e) {
    throw new DockgError(
      `Failed to parse ${indexPath}: ${e instanceof Error ? e.message : "parse error"} — re-run \`dockg export --format search\`.`,
    );
  }
  const entries = (parsed as SearchIndexDoc | null)?.entries;
  if (!Array.isArray(entries)) {
    throw new DockgError(
      `Not a dockg search index: ${indexPath} — expected an \`entries\` array; re-run \`dockg export --format search\`.`,
    );
  }
  return parsed as SearchIndexDoc;
}

export function runSearch(opts: SearchOptions): SearchReport {
  const cwd = opts.cwd ?? process.cwd();
  const config = loadConfig(opts.config, cwd);
  const graphPath = resolve(cwd, opts.graph ?? config.out);
  const indexPath = opts.index
    ? resolve(cwd, opts.index)
    : join(dirname(graphPath), SEARCH_INDEX_FILENAME);

  if (!existsSync(indexPath)) {
    throw new DockgError(
      `Search index not found: ${indexPath} — run \`dockg export --format search\` first.`,
    );
  }

  const lexical = createLexicalIndex(loadSearchIndex(indexPath));
  const { candidates, trace } = findEntry(opts.query, {
    lexical,
    limit: opts.limit,
  });

  return {
    query: opts.query,
    results: candidates.map((c) => {
      const entry = lexical.entry(c.iri);
      return {
        iri: c.iri,
        score: c.score,
        via: c.via,
        ...(entry?.type === undefined ? {} : { type: entry.type }),
        ...(entry?.title === undefined ? {} : { title: entry.title }),
      };
    }),
    trace,
  };
}

export function renderSearch(
  report: SearchReport,
  format: "pretty" | "json",
): string {
  if (format === "json") return JSON.stringify(report, null, 2);

  const lines: string[] = [];
  for (const r of report.results) {
    const label = r.title ? ` — ${r.title}` : "";
    const type = r.type ? ` [${r.type}]` : "";
    lines.push(`${r.score.toFixed(4)}  ${compactIri(r.iri)}${type}${label}`);
  }
  if (report.results.length === 0) {
    lines.push("(no matches)");
  }
  lines.push("");
  lines.push(
    `${report.results.length} result${report.results.length === 1 ? "" : "s"}`,
  );
  return lines.join("\n");
}
