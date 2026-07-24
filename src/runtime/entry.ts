/**
 * Entry-point finding (ADR 01019) — the stage that turns a question into seed
 * nodes for the walker.
 *
 * Today there is one ranking (lexical). `rrfMerge` ships anyway, tested: it
 * fixes the fusion contract *before* Phase 8b's vector leg arrives, so adding
 * embeddings cannot reshape this API. With a single ranking it is an identity
 * ranking, not dead code.
 *
 * Every candidate is appended to the trace, so "why did retrieval start here?"
 * is answerable alongside "why did it walk there?" (ADR 01018 invariant 2).
 *
 * Platform-neutral: no `node:` imports.
 */
import { byCodeUnit } from "../core/sort.js";
import type { LexicalIndex } from "./lexical.js";
import {
  createTrace,
  type EntryCandidate,
  type EntryVia,
  type QueryTrace,
} from "./trace.js";

export interface FindEntryOptions {
  /** The lexical index to query. */
  lexical: LexicalIndex;
  /** Maximum seeds to return. Default 10. */
  limit?: number;
  /** Append candidates here instead of starting a new trace. */
  trace?: QueryTrace;
}

export interface EntryResult {
  candidates: EntryCandidate[];
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
 * Find seed nodes for a question. Currently lexical-only; the vector leg joins
 * the same `rrfMerge` call in Phase 8b.
 */
export function findEntry(
  query: string,
  options: FindEntryOptions,
): EntryResult {
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
  const candidates = rrfMerge([lexical]).slice(0, limit);

  for (const candidate of candidates) trace.entry.push(candidate);
  return { candidates, trace };
}
