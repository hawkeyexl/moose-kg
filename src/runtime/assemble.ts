/**
 * Context assembly (ADR 01018) — the runtime's terminal stage.
 *
 * Turns traversed nodes into the bundle an inference engine consumes:
 * `{ context, citations, trace, refusal? }`. **dockg stops here**: it never
 * calls a model. A different tool (an agent over MCP, a site backend) takes the
 * bundle onward, which keeps this runtime fully deterministic and keeps API
 * keys and inference cost outside dockg entirely.
 *
 * When nothing survives retrieval the result is a *structured refusal*, never
 * empty context — a caller must be able to tell "no route exists" apart from
 * "here is nothing, proceed anyway" (the disciplined-silence contract).
 *
 * Platform-neutral: no `node:` imports, no npm dependencies.
 */
import type { ContentResolver } from "./resolve.js";
import type { QueryTrace } from "./trace.js";
import { createTrace } from "./trace.js";
import type { TraversedNode } from "./traverse.js";

export interface ContextBlock {
  iri: string;
  title?: string;
  text: string;
  sourceUrl: string;
  /** Hops from the nearest seed — the relevance signal, carried through. */
  depth: number;
}

export interface Citation {
  iri: string;
  title?: string;
  sourceUrl: string;
}

export type RefusalReason = "no-route" | "no-content";

export interface Refusal {
  reason: RefusalReason;
  detail: string;
}

export interface RetrievalBundle {
  context: ContextBlock[];
  citations: Citation[];
  trace: QueryTrace;
  /** Present when retrieval found nothing usable. `context` is then empty. */
  refusal?: Refusal;
  /** True when the character budget dropped otherwise-eligible blocks. */
  truncated: boolean;
}

export interface AssembleOptions {
  /** Character budget across all blocks. Default: unbounded. */
  maxChars?: number;
  /** Append to an existing trace (normally the traversal's). */
  trace?: QueryTrace;
}

/**
 * Resolve traversed nodes to text and assemble the retrieval bundle. Nodes are
 * kept in traversal order (nearest-first), which is deterministic, and every
 * block carries the IRI it came from so citations are structural, not inferred.
 */
export async function assemble(
  resolver: ContentResolver,
  nodes: TraversedNode[],
  options: AssembleOptions = {},
): Promise<RetrievalBundle> {
  const trace = options.trace ?? createTrace();
  const budget = options.maxChars ?? Infinity;

  if (nodes.length === 0) {
    return {
      context: [],
      citations: [],
      trace,
      truncated: false,
      refusal: {
        reason: "no-route",
        detail:
          "No node in the graph was reachable for this query under the active scope filter.",
      },
    };
  }

  const context: ContextBlock[] = [];
  let used = 0;
  let truncated = false;
  let resolvedAny = false;

  for (const node of nodes) {
    const resolved = await resolver.resolve(node.iri);
    if (!resolved) continue;
    resolvedAny = true;
    if (used + resolved.text.length > budget) {
      truncated = true;
      continue;
    }
    used += resolved.text.length;
    context.push({
      iri: resolved.iri,
      title: resolved.title,
      text: resolved.text,
      sourceUrl: resolved.sourceUrl,
      depth: node.depth,
    });
  }

  if (context.length === 0) {
    return {
      context: [],
      citations: [],
      trace,
      truncated,
      refusal: {
        reason: "no-content",
        detail: resolvedAny
          ? "Every matching node's content exceeded the character budget."
          : "Matching nodes were found, but none of them resolved to readable content.",
      },
    };
  }

  return {
    context,
    citations: context.map((b) => ({
      iri: b.iri,
      title: b.title,
      sourceUrl: b.sourceUrl,
    })),
    trace,
    truncated,
  };
}
