/**
 * `moose-kg/embed` — local, in-browser-capable embeddings (ADR 01020).
 *
 * A separate entry point from `moose-kg/runtime` on purpose: this module reaches
 * `@huggingface/transformers`, which hard-depends on both ONNX runtimes plus
 * native `sharp`. Keeping it here means the ~24 KB runtime never grows a model
 * stack, and a consumer who never imports `moose-kg/embed` never resolves the
 * optional peer at all.
 *
 * ```js
 * import { createLocalEmbedder } from "moose-kg/embed";
 * import { createVectorIndex, findEntry } from "moose-kg/runtime";
 *
 * const embedder = await createLocalEmbedder({ role: "query" });
 * const vectors = createVectorIndex(new Uint8Array(await (await fetch("/kg/vectors.bin")).arrayBuffer()));
 * const entry = await findEntry(question, {
 *   lexical, vectors, embedQuery: (q) => embedder.embed(q),
 * });
 * // entry.lexical / entry.vector / entry.candidates
 * ```
 */
export {
  createLocalEmbedder,
  EmbedderUnavailableError,
  type LocalEmbedderOptions,
} from "./local.js";
export { createMockEmbedder, type MockEmbedderOptions } from "./mock.js";
export {
  DEFAULT_MODEL,
  MODEL_PROFILES,
  profileFor,
  withPrefix,
  type EmbedRole,
  type Embedder,
  type ModelProfile,
} from "./types.js";
