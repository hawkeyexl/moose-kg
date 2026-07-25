/**
 * The local embedder (ADR 01020) — `@huggingface/transformers` configured so
 * Node and the browser compute the **same function**.
 *
 * This is the whole reason dockg ships an embedder rather than telling hosts to
 * call transformers.js themselves. Its docs are explicit that Node uses
 * `onnxruntime-node` (native, CPUID-dispatched) while the browser uses
 * `onnxruntime-web` (WASM), and the two measurably disagree
 * (transformers.js#1046). Build-side vectors are cosine-compared against
 * browser-side query vectors, so a split implementation compares the outputs of
 * two different functions — retrieval degrades and nothing errors.
 *
 * Four disciplines close that, and every one is pinned here rather than left to
 * the caller:
 *
 *   1. `device: "wasm"` on both sides — the only cross-platform-reproducible
 *      path (the WASM spec mandates round-to-nearest-ties-to-even and forbids
 *      fusing operations to elide intermediate rounding).
 *   2. `numThreads = 1` — the default derives from `hardwareConcurrency`, so
 *      reduction splits would vary per machine.
 *   3. `dtype: "q8"` — int8 GEMM accumulates in int32, and integer addition is
 *      associative.
 *   4. One text per call — a batched vector depends on what it was batched
 *      with, so adding a document would perturb its neighbours.
 *
 * `@huggingface/transformers` is an **optional peer dependency**, imported
 * dynamically: it hard-depends on both ONNX runtimes plus native `sharp`, and
 * most dockg users never enable embeddings. Behind this subpath, a consumer who
 * never imports `dockg/embed` never resolves it.
 */
import {
  profileFor,
  withPrefix,
  type EmbedRole,
  type Embedder,
  type ModelProfile,
} from "./types.js";
import { DEFAULT_MODEL } from "./types.js";

export interface LocalEmbedderOptions {
  /** Hugging Face model id. Any id is accepted; the tested set is documented. */
  model?: string;
  /** Weight quantization. Default `q8` — see discipline 3 above. */
  dtype?: string;
  /**
   * What these embeddings are for. Decides which prefix convention applies for
   * models that need one. Default "passage" (indexing); the query side passes
   * "query".
   */
  role?: EmbedRole;
  /**
   * Inject the transformers.js module (tests, or a host that already imported
   * it). Absent, it is imported dynamically.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformers?: any;
}

/** Thrown when the optional peer is not installed, with the fix in the message. */
export class EmbedderUnavailableError extends Error {
  constructor(detail: string) {
    super(
      `Local embeddings need @huggingface/transformers, which is an optional peer dependency.\n` +
        `  Install it:  npm install @huggingface/transformers\n` +
        `  (${detail})`,
    );
    this.name = "EmbedderUnavailableError";
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any
   -- transformers.js is an optional peer, so it is untyped at this boundary
      (importing its types would make it a hard dependency). The surface used
      here is small and pinned: `env`, `pipeline`, and the returned tensor. */

async function loadTransformers(injected?: any): Promise<any> {
  if (injected) return injected;
  try {
    // A literal specifier, so a consumer's bundler can resolve and chunk it
    // normally when they *have* opted in. It does not typecheck here because
    // the package is an optional peer and deliberately not installed in this
    // repo — the same position every consumer who skips it is in. Nothing is
    // lost: this boundary is untyped by design (see the eslint block above),
    // and the missing-package path is exactly what the catch handles.
    // @ts-expect-error optional peer dependency, may not be installed
    return await import("@huggingface/transformers");
  } catch (e) {
    throw new EmbedderUnavailableError(
      e instanceof Error ? e.message : "import failed",
    );
  }
}

/**
 * Create an embedder backed by a local model. Nothing is downloaded until the
 * first `embed()` call.
 */
export async function createLocalEmbedder(
  options: LocalEmbedderOptions = {},
): Promise<Embedder> {
  const model = options.model ?? DEFAULT_MODEL;
  const dtype = options.dtype ?? "q8";
  const role: EmbedRole = options.role ?? "passage";
  const profile: ModelProfile = profileFor(model);

  const transformers = await loadTransformers(options.transformers);

  // Disciplines 1 and 2, set before the pipeline is built.
  transformers.env.backends.onnx.wasm.numThreads = 1;

  const extractor = await transformers.pipeline("feature-extraction", model, {
    device: "wasm",
    dtype,
  });

  let dims = 0;

  return {
    model,
    dtype,
    get dims() {
      return dims;
    },
    async embed(text: string): Promise<Float32Array> {
      // Discipline 4: one text per call, never a batch.
      const output = await extractor(withPrefix(profile, role, text), {
        pooling: "mean",
        normalize: true,
      });
      const data = Float32Array.from(output.data as ArrayLike<number>);
      dims = data.length;
      return data;
    },
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
