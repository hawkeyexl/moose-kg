/**
 * `dockg/runtime` — the browser-native GraphRAG runtime (ADR 01018).
 *
 * Retrieval over a built dockg graph, with no Node APIs and no dependencies:
 * load `graph.jsonld`, walk it with scope rules honored, resolve node text, and
 * assemble the bundle an inference engine consumes. Every result carries the
 * trace that produced it.
 *
 * **The runtime never generates.** It returns `{ context, citations, trace,
 * refusal? }` and stops; wiring a model is the host's job.
 *
 * ```js
 * import { GraphIndex, traverse, createFetchResolver, assemble } from "dockg/runtime";
 *
 * const graph = GraphIndex.fromJsonLd(await (await fetch("/kg/graph.jsonld")).text());
 * const { nodes, trace } = traverse(graph, {
 *   seeds: ["https://example.com/kg/doc/docs/configuration.md"],
 *   depth: 2,
 *   variant: "SP-X100",
 * });
 * const resolver = createFetchResolver(graph, { baseUrl: "/raw/", trace });
 * const bundle = await assemble(resolver, nodes, { trace, maxChars: 12000 });
 * ```
 */
export { GraphIndex, type GraphNode, type Value } from "./graph.js";
export {
  createTrace,
  reachedNodes,
  type EntryCandidate,
  type EntryVia,
  type Hop,
  type QueryTrace,
  type Resolution,
  type ScopeExclusion,
} from "./trace.js";
export {
  impact,
  resolveSubject,
  resolveVariant,
  reverseReferences,
  scopeExclusion,
  traverse,
  type Direction,
  type ScopeFilter,
  type TraverseOptions,
  type TraverseResult,
  type TraversedNode,
} from "./traverse.js";
export {
  createFetchResolver,
  documentPreamble,
  sliceSection,
  splitFragment,
  type ContentResolver,
  type FetchResolverOptions,
  type ResolvedContent,
} from "./resolve.js";
export {
  assemble,
  type AssembleOptions,
  type Citation,
  type ContextBlock,
  type Refusal,
  type RefusalReason,
  type RetrievalBundle,
} from "./assemble.js";
export {
  defaultGraph,
  literal,
  matchQuads,
  namedNode,
  rdfjsQuads,
  type RdfQuad,
  type RdfTerm,
} from "./rdfjs.js";
export {
  createLexicalIndex,
  type LexicalIndex,
  type LexicalSearchOptions,
} from "./lexical.js";
export {
  findEntry,
  rrfMerge,
  type EntryResult,
  type FindEntryOptions,
} from "./entry.js";
export type { SearchEntry, SearchIndexDoc } from "../core/search-index.js";
