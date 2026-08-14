/**
 * `moose-kg search` — text query → ranked seed nodes (ADR 01019).
 *
 * A thin Node wrapper over the browser-native lexical entry stage: it loads the
 * `search.json` artifact and runs the same `findEntry` a browser would. This is
 * the stage before `traverse`; Phase 9's `retrieve` chains the two.
 *
 * The trace is always in the JSON output — retrieval provenance is part of the
 * contract, not an opt-in (ADR 01018).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadConfig } from "../core/config.js";
import { compactIri } from "../core/load.js";
import {
  SEARCH_INDEX_FILENAME,
  type SearchIndexDoc,
} from "../core/search-index.js";
import { VectorIndexError } from "../core/vector-index.js";
import { MooseKgError } from "../types.js";
import { findEntry } from "../runtime/entry.js";
import { createLexicalIndex } from "../runtime/lexical.js";
import {
  createVectorIndex,
  VectorMismatchError,
  type VectorIndex,
} from "../runtime/vector.js";
import {
  createLocalEmbedder,
  EmbedderUnavailableError,
} from "../embed/local.js";
import { createMockEmbedder } from "../embed/mock.js";
import type { Embedder } from "../embed/types.js";
import type { QueryTrace } from "../runtime/trace.js";

export interface SearchOptions {
  config?: string;
  /** Graph .ttl path (default: config `out`) — locates the sibling index. */
  graph?: string;
  /** Search index path (default: `search.json` beside the graph). */
  index?: string;
  query: string;
  limit?: number;
  /** Vector sidecar path (default: config `embed.out` when it exists). */
  vectors?: string;
  /**
   * Which legs to run. "lexical" is always available; "vector"/"hybrid" need an
   * embedder and a sidecar. Default "hybrid" when both are present, else
   * "lexical" — additive, never a new failure mode.
   */
  mode?: "lexical" | "vector" | "hybrid";
  /** Injection seam for tests: bypasses the embedder factory. */
  embedder?: Embedder;
  cwd?: string;
}

export interface SearchHit {
  iri: string;
  score: number;
  via: string;
  type?: string;
  title?: string;
}

export interface SearchReport {
  query: string;
  /** Which legs actually ran. */
  mode: "lexical" | "vector" | "hybrid";
  /** The fused ranking (or the single leg's, when only one ran). */
  results: SearchHit[];
  /** The lexical leg's own ranking. */
  lexical: SearchHit[];
  /** The vector leg's own ranking; empty when it did not run. */
  vector: SearchHit[];
  trace: QueryTrace;
}

/**
 * Read and shape-check the artifact. A truncated write, or `-i` pointed at the
 * wrong file, is an operational error (exit 2) like an unparseable graph — not
 * a raw stack trace, and not a confident "0 results".
 *
 * The digest travels with the document: it is what the vector sidecar records
 * as its `source`, and comparing them is how a stale sidecar is refused rather
 * than ranked against (ADR 01020).
 */
function loadSearchIndex(indexPath: string): {
  doc: SearchIndexDoc;
  source: string;
} {
  const raw = readFileSync(indexPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new MooseKgError(
      `Failed to parse ${indexPath}: ${e instanceof Error ? e.message : "parse error"} — re-run \`moose-kg export --format search\`.`,
    );
  }
  const entries = (parsed as SearchIndexDoc | null)?.entries;
  if (!Array.isArray(entries)) {
    throw new MooseKgError(
      `Not a moose-kg search index: ${indexPath} — expected an \`entries\` array; re-run \`moose-kg export --format search\`.`,
    );
  }
  return {
    doc: parsed as SearchIndexDoc,
    // Same recipe `moose-kg embed` uses, so the two digests are comparable.
    source: `sha256:${createHash("sha256").update(raw, "utf8").digest("hex")}`,
  };
}

export async function runSearch(opts: SearchOptions): Promise<SearchReport> {
  const cwd = opts.cwd ?? process.cwd();
  const config = loadConfig(opts.config, cwd);
  const graphPath = resolve(cwd, opts.graph ?? config.out);
  const indexPath = opts.index
    ? resolve(cwd, opts.index)
    : join(dirname(graphPath), SEARCH_INDEX_FILENAME);

  if (!existsSync(indexPath)) {
    throw new MooseKgError(
      `Search index not found: ${indexPath} — run \`moose-kg export --format search\` first.`,
    );
  }

  const { doc, source } = loadSearchIndex(indexPath);
  const lexical = createLexicalIndex(doc);

  // The vector leg is opt-in by availability: a sidecar plus an embedder. Asked
  // for explicitly (`--mode vector|hybrid`) a missing piece is an error, since
  // silently answering lexically would look like the semantic leg ran.
  const wantsVector = opts.mode === "vector" || opts.mode === "hybrid";
  const vectorsPath = opts.vectors
    ? resolve(cwd, opts.vectors)
    : resolve(cwd, config.embed.out);
  let vectors: VectorIndex | undefined;
  if (opts.mode !== "lexical" && existsSync(vectorsPath)) {
    try {
      vectors = createVectorIndex(readFileSync(vectorsPath));
    } catch (e) {
      // A truncated write or `--vectors` pointed at the wrong file is an
      // operational error (exit 2), exactly as for the search index above —
      // not a raw VectorIndexError stack trace out of an async action.
      if (e instanceof VectorIndexError) {
        throw new MooseKgError(
          `${e.message} (${vectorsPath}) — re-run \`moose-kg embed\`, or use \`--mode lexical\`.`,
        );
      }
      throw e;
    }
    // Refuse rather than rank: vectors built from a different corpus point at
    // IRIs that may no longer exist and miss everything added since
    // (ADR 01020, "Mismatch is refused, not ranked").
    const stale = vectors.check({ source });
    if (stale) throw new MooseKgError(stale.detail);
  } else if (wantsVector) {
    throw new MooseKgError(
      `Vector index not found: ${vectorsPath} — run \`moose-kg embed\` first, or use \`--mode lexical\`.`,
    );
  }

  let embedder: Embedder | undefined;
  if (vectors) {
    embedder = await resolveEmbedder(opts, vectors, wantsVector);
  }

  const entry = await findEntry(opts.query, {
    lexical,
    // Pass the embedder, not a bare function: findEntry then verifies it
    // against the index itself rather than trusting the CLI to have done so.
    ...(embedder && vectors ? { vectors, embedder } : {}),
    limit: opts.limit,
  }).catch((e: unknown) => {
    // `resolveEmbedder` has already checked model and dtype, so reaching here
    // means a dimension disagreement the header did not predict — a real
    // operational error (exit 2), not a stack trace out of an async action.
    if (e instanceof VectorMismatchError) {
      throw new MooseKgError(`${e.message} Re-run \`moose-kg embed\`.`);
    }
    throw e;
  });

  const decorate = (c: {
    iri: string;
    score: number;
    via: string;
  }): SearchHit => {
    const found = lexical.entry(c.iri);
    return {
      iri: c.iri,
      score: c.score,
      via: c.via,
      ...(found?.type === undefined ? {} : { type: found.type }),
      ...(found?.title === undefined ? {} : { title: found.title }),
    };
  };

  // Which legs *ran*, not which produced hits: a vector leg that matched
  // nothing (blank query, everything below `minScore`) still ran, and reporting
  // "lexical" for an explicit `--mode vector` would deny it ever happened. An
  // explicit mode is authoritative — the guards above already errored if it
  // could not be honored.
  const mode = opts.mode ?? (embedder && vectors ? "hybrid" : "lexical");

  // `--mode vector` reports the vector leg alone rather than the fusion.
  const results = opts.mode === "vector" ? entry.vector : entry.candidates;
  if (opts.mode === "vector") {
    // The trace is the answer to "why did these come back" (ADR 01018), so it
    // must describe the ranking actually returned, not the fusion that seeded
    // nothing in this mode.
    entry.trace.entry.length = 0;
    entry.trace.entry.push(...entry.vector);
  }

  return {
    query: opts.query,
    mode,
    results: results.map(decorate),
    lexical: entry.lexical.map(decorate),
    vector: entry.vector.map(decorate),
    trace: entry.trace,
  };
}

/**
 * Build an embedder for the query side, matching the sidecar. A mismatch is
 * refused rather than ranked against: comparing vectors from two different
 * models compares outputs of two different functions (ADR 01020).
 *
 * Both the model *and* the dtype come from the sidecar header rather than from
 * config: `embed.*` is a build-time knob, and q8 weights are a different
 * function from fp32 ones, so following config here would silently compare
 * query vectors against corpus vectors produced by different weights.
 */
async function resolveEmbedder(
  opts: SearchOptions,
  vectors: VectorIndex,
  required: boolean,
): Promise<Embedder | undefined> {
  const { model, dtype } = vectors;
  try {
    const embedder =
      opts.embedder ??
      (model === "mock"
        ? createMockEmbedder({ dtype })
        : await createLocalEmbedder({ model, dtype, role: "query" }));
    const mismatch = vectors.check({
      model: embedder.model,
      dtype: embedder.dtype,
      // Defense in depth: a future model that changes output size without
      // changing its id would otherwise only surface deep inside search().
      ...(embedder.dims > 0 ? { dims: embedder.dims } : {}),
    });
    if (mismatch) throw new MooseKgError(mismatch.detail);
    return embedder;
  } catch (e) {
    if (e instanceof MooseKgError) throw e;
    if (e instanceof EmbedderUnavailableError) {
      // Only fatal when the vector leg was asked for; otherwise degrade to
      // lexical rather than failing a search that can still be answered.
      if (required) throw new MooseKgError(e.message);
      return undefined;
    }
    // A model that will not load (bad id, 404, corrupt weights) is fatal either
    // way — but as an operational error with a message, not a stack trace.
    throw new MooseKgError(
      `Failed to load embedding model ${model}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
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
    `${report.results.length} result${report.results.length === 1 ? "" : "s"} (${report.mode})`,
  );
  return lines.join("\n");
}
