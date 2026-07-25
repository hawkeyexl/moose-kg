/**
 * Vector search (ADR 01020) — semantic entry, and a standalone capability.
 *
 * `search()` is usable on its own: give it a query vector and it ranks nodes by
 * meaning, with no lexical index and no graph involved. `findEntry` composes it
 * with the lexical leg, but does not own it.
 *
 * Hand-written rather than taken from a library, on evidence: the dedicated
 * browser vector libraries are 3 years stale, no maintained micro-package does
 * cosine top-k over typed arrays (the popular one throws on `Float32Array`), and
 * the engines that do exist run this same brute-force loop internally. See ADR
 * 01020 for the full survey.
 *
 * Vectors are L2-normalized at build time, so cosine similarity **is** the dot
 * product — no norms, no division, at query time. The loop is indexed rather
 * than `.reduce()`, which measures ~13× slower on typed arrays.
 *
 * Platform-neutral: no `node:` imports, no dependencies.
 */
import { byCodeUnit } from "../core/sort.js";
import {
  decodeVectorIndex,
  normalize,
  type VectorIndexHeader,
} from "../core/vector-index.js";
import type { EntryCandidate } from "./trace.js";

export interface VectorSearchOptions {
  /** Maximum candidates to return. Default 10. */
  limit?: number;
  /**
   * Drop candidates scoring below this. Default 0 — every model has its own
   * useful range, so dockg does not impose a threshold the user did not choose.
   */
  minScore?: number;
}

/** Why a vector index cannot be used with the embedder or corpus at hand. */
export interface VectorMismatch {
  reason: "model" | "dims" | "stale-source";
  detail: string;
}

export interface VectorIndex {
  /**
   * Rank nodes against a query vector. The vector is normalized here, so
   * callers need not — an unnormalized query would otherwise scale every score.
   */
  search(query: Float32Array, options?: VectorSearchOptions): EntryCandidate[];
  /**
   * Check this index against the embedder and corpus in play. Returns the
   * mismatch, or undefined when they agree. Ranking against vectors from a
   * different model compares outputs of two different functions (ADR 01020), so
   * callers should refuse rather than proceed.
   */
  check(expected: {
    model?: string;
    dims?: number;
    source?: string;
  }): VectorMismatch | undefined;
  readonly model: string;
  readonly dims: number;
  readonly source: string;
  size(): number;
  /** The IRI at a payload row, for callers walking the index directly. */
  idAt(row: number): string | undefined;
}

/** Build a vector index from encoded sidecar bytes. */
export function createVectorIndex(bytes: Uint8Array): VectorIndex {
  const { header, vectors } = decodeVectorIndex(bytes);
  const { dims, ids } = header;

  return {
    model: header.model,
    dims,
    source: header.source,
    size: () => ids.length,
    idAt: (row) => ids[row],

    check(expected) {
      if (expected.model !== undefined && expected.model !== header.model) {
        return {
          reason: "model",
          detail: `Vector index was built with ${header.model}, but the embedder is ${expected.model}. Re-run \`dockg embed\`.`,
        };
      }
      if (expected.dims !== undefined && expected.dims !== dims) {
        return {
          reason: "dims",
          detail: `Vector index has ${dims} dimensions, but the embedder produces ${expected.dims}.`,
        };
      }
      if (expected.source !== undefined && expected.source !== header.source) {
        return {
          reason: "stale-source",
          detail:
            "Vector index was built from a different search index — the corpus changed. Re-run `dockg embed`.",
        };
      }
      return undefined;
    },

    search(query, options = {}) {
      if (dims === 0 || ids.length === 0) return [];
      if (query.length !== dims) {
        // A silent zero-fill or truncate here would return confident nonsense.
        throw new Error(
          `Query vector has ${query.length} dimensions, expected ${dims}.`,
        );
      }
      const limit = normalizeLimit(options.limit);
      if (limit === 0) return [];
      const minScore = options.minScore ?? 0;

      // Copy before normalizing: the caller's vector is not ours to mutate.
      const q = normalize(Float32Array.from(query));

      const scored: EntryCandidate[] = [];
      for (let row = 0; row < ids.length; row++) {
        const base = row * dims;
        let score = 0;
        for (let i = 0; i < dims; i++) score += q[i]! * vectors[base + i]!;
        if (score >= minScore) {
          scored.push({ iri: ids[row]!, score, via: "vector" });
        }
      }

      scored.sort((a, b) =>
        a.score === b.score ? byCodeUnit(a.iri, b.iri) : b.score - a.score,
      );
      return scored.slice(0, limit);
    },
  };
}

/**
 * A limit that is not a non-negative integer falls back to the documented
 * default — `slice(0, NaN)` is empty, which would report a confident "no
 * results" for a query that does match.
 */
function normalizeLimit(limit: number | undefined): number {
  return typeof limit === "number" && Number.isInteger(limit) && limit >= 0
    ? limit
    : 10;
}

export type { VectorIndexHeader };
