/**
 * Entry-point finding (ADR 01019, extended by ADR 01020) — the stage that turns
 * a question into seed nodes for the walker.
 *
 * Two rankings now: lexical (BM25 over the search artifact) and, when the host
 * supplies an embedder, vector (cosine over the sidecar). `rrfMerge` fuses them.
 *
 * **Each leg is returned separately as well as fused.** A caller rendering a
 * search UI wants to show "text matches" and "semantic matches" as distinct
 * things, and either leg is usable on its own — `lexical.search` and
 * `vectors.search` are public and independent of this function.
 *
 * Every candidate is appended to the trace, so "why did retrieval start here?"
 * is answerable alongside "why did it walk there?" (ADR 01018 invariant 2).
 *
 * Platform-neutral: no `node:` imports.
 */
import { byCodeUnit } from "../core/sort.js";
import type { LexicalIndex } from "./lexical.js";
import type { VectorIndex } from "./vector.js";
import {
  createTrace,
  type EntryCandidate,
  type EntryVia,
  type QueryTrace,
} from "./trace.js";

export interface FindEntryOptions {
  /** The lexical index to query. */
  lexical: LexicalIndex;
  /** The vector index. Without it (or `embedQuery`), entry is lexical-only. */
  vectors?: VectorIndex;
  /**
   * Embed the query locally. Required for the vector leg; absent, entry
   * degrades to lexical rather than failing (ADR 01009).
   */
  embedQuery?: (query: string) => Promise<Float32Array> | Float32Array;
  /** Maximum seeds to return. Default 10. */
  limit?: number;
  /** Append candidates here instead of starting a new trace. */
  trace?: QueryTrace;
}

export interface EntryResult {
  /** The fused ranking — what seeds traversal. */
  candidates: EntryCandidate[];
  /** The lexical leg's own ranking. */
  lexical: EntryCandidate[];
  /** The vector leg's own ranking; empty when no embedder was supplied. */
  vector: EntryCandidate[];
  trace: QueryTrace;
}

/**
 * Reciprocal rank fusion over N ranked lists: score = Σ 1/(k + rank).
 *
 * Rank-based rather than score-based on purpose — lexical BM25 scores and
 * cosine similarities are not on a comparable scale, so fusing raw scores would
 * let whichever leg happens to produce bigger numbers dominate. `k = 60` is the
 * standard damping constant.
 *
 * Deterministic: input list order does not affect the result, and ties break by
 * IRI.
 */
export function rrfMerge(
  rankings: EntryCandidate[][],
  k = 60,
): EntryCandidate[] {
  const fused = new Map<string, { score: number; vias: Set<EntryVia> }>();
  for (const ranking of rankings) {
    ranking.forEach((candidate, i) => {
      const current = fused.get(candidate.iri) ?? {
        score: 0,
        vias: new Set<EntryVia>(),
      };
      current.score += 1 / (k + i + 1);
      current.vias.add(candidate.via);
      fused.set(candidate.iri, current);
    });
  }

  return [...fused.entries()]
    .map(([iri, { score, vias }]) => {
      // One leg keeps its own provenance; several means the seed was fused.
      // Destructuring rather than `[...vias][0]!` so the single-leg case needs
      // no non-null assertion — an empty set simply falls through to "hybrid",
      // which is unreachable anyway (a set only exists once a leg added to it).
      const [only] = vias;
      return {
        iri,
        score,
        via: vias.size === 1 && only !== undefined ? only : "hybrid",
      };
    })
    .sort((a, b) =>
      a.score === b.score ? byCodeUnit(a.iri, b.iri) : b.score - a.score,
    );
}

/**
 * Find seed nodes for a question, returning each ranking leg and their fusion.
 *
 * Async because embedding a query is: local models are a WASM forward pass.
 * Uniformly async rather than sync-when-lexical-only, so callers have one
 * contract to hold rather than a return type that changes with the options.
 *
 * The vector leg runs only when both a `vectors` index and an `embedQuery` are
 * supplied. Absent either, this is lexical entry exactly as Phase 8 shipped it —
 * additive, never a new failure mode (ADR 01009's degrade-don't-fail rule).
 */
export async function findEntry(
  query: string,
  options: FindEntryOptions,
): Promise<EntryResult> {
  const trace = options.trace ?? createTrace();
  // `--limit abc` parses to NaN, and `slice(0, NaN)` is empty — a typo'd flag
  // would report a confident "0 results" for a query that does match. Anything
  // that is not a non-negative integer falls back to the documented default.
  const limit =
    typeof options.limit === "number" &&
    Number.isInteger(options.limit) &&
    options.limit >= 0
      ? options.limit
      : 10;

  const lexical = options.lexical.search(query, { limit });

  let vector: EntryCandidate[] = [];
  if (options.vectors && options.embedQuery && query.trim() !== "") {
    const queryVector = await options.embedQuery(query);
    vector = options.vectors.search(queryVector, { limit });
  }

  const rankings = vector.length > 0 ? [lexical, vector] : [lexical];
  const candidates = rrfMerge(rankings).slice(0, limit);

  for (const candidate of candidates) trace.entry.push(candidate);
  return { candidates, lexical, vector, trace };
}
