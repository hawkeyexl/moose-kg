/** dockg public API. */
export * from "./types.js";
export {
  loadConfig,
  parseConfig,
  type DockgConfig,
  type DeriveSource,
  type FillField,
  type GitMode,
  type Pricing,
} from "./core/config.js";
export {
  COVERAGE_FIELDS,
  COVERAGE_FIELD_NAMES,
  type CoverageField,
} from "./core/coverage.js";
export { discoverFiles } from "./core/discover.js";
export {
  DOCKG_NOT_APPLICABLE_TO_VARIANT,
  DOCKG_NOT_SOFTWARE_SUBJECT,
  SOFTWARE_LIFECYCLE_IRIS,
  SOFTWARE_SUBJECT_IRIS,
  TOPIC_TYPE_IRIS,
} from "./core/iirds.js";
export {
  conceptSlug,
  encodeSegment,
  mintAgentIri,
  type AgentKind,
  mintBuildActivityIri,
  mintConceptIri,
  mintDocIri,
  mintGraphIri,
  mintProductIri,
  mintSchemeIri,
  mintSectionIri,
  normalizeDocPath,
  resolveBaseIri,
} from "./core/iri.js";
export { analyzeDoc } from "./core/analyze.js";
export {
  deriveGraph,
  type DeriveOptions,
  type Quad,
  type Term,
} from "./core/derive.js";
export {
  collectGitHistory,
  type GitFileHistory,
  type GitHistory,
} from "./core/git.js";
export { emitTurtle } from "./core/emit.js";
export { emitJsonLd } from "./core/emit-jsonld.js";
export { emitRdfXml } from "./core/emit-rdfxml.js";
export { writeZip, type ZipEntry } from "./core/zip.js";
export {
  projectPackage,
  type IirdsPackageOptions,
  type PackageProjection,
  type ContentFile,
} from "./core/iirds-package.js";
export {
  loadGraph,
  expandTerm,
  compactIri,
  storeToQuads,
} from "./core/load.js";
/**
 * The browser-native GraphRAG runtime is also published as the `dockg/runtime`
 * subpath, which is the import to use in a browser: it has no `node:` imports
 * and no dependencies (ADR 01018).
 */
export * from "./runtime/index.js";
export {
  applyKgFields,
  existingKgFields,
  existingProvenance,
  frontmatterKind,
  type KgApplyResult,
  type ProvenanceEntry,
} from "./core/frontmatter-edit.js";
export { NS, PREFIXES } from "./core/vocab.js";
export {
  runBuild,
  type BuildOptions,
  type BuildResult,
} from "./commands/build.js";
export {
  runValidate,
  type ValidateOptions,
  type ValidateResult,
} from "./commands/validate.js";
export {
  runExport,
  type ExportOptions,
  type ExportResult,
  type ExportFormat,
} from "./commands/export.js";
export {
  runQuery,
  type QueryOptions,
  type QueryResult,
} from "./commands/query.js";
export {
  runStats,
  type CoverageRow,
  type StatsOptions,
  type StatsReport,
} from "./commands/stats.js";
export {
  runTraverse,
  renderTraverse,
  type TraverseOptions as TraverseCommandOptions,
  type TraverseReport,
} from "./commands/traverse.js";
export {
  runSearch,
  renderSearch,
  type SearchHit,
  type SearchOptions,
  type SearchReport,
} from "./commands/search.js";
export {
  runEmbed,
  renderEmbed,
  embedText,
  type EmbedOptions,
  type EmbedReport,
} from "./commands/embed.js";
export {
  createLocalEmbedder,
  createMockEmbedder,
  EmbedderUnavailableError,
  DEFAULT_MODEL,
  MODEL_PROFILES,
  profileFor,
  withPrefix,
  type EmbedRole,
  type Embedder,
  type LocalEmbedderOptions,
  type MockEmbedderOptions,
  type ModelProfile,
} from "./embed/index.js";
export {
  buildSearchIndex,
  emitSearchIndex,
  SEARCH_INDEX_FILENAME,
  type SearchEntry,
  type SearchIndexDoc,
  type SearchIndexOptions,
} from "./core/search-index.js";
export {
  runFill,
  type FillOptions,
  type FillReport,
  type FillDocResult,
} from "./commands/fill.js";
export type {
  LlmProvider,
  CompleteJSONRequest,
  CompleteJSONResponse,
} from "./llm/types.js";
export { MockProvider, type MockResponse } from "./llm/providers/mock.js";
