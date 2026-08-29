/**
 * Real-model tests (ADR 01025) — kept out of `npm test` on purpose.
 *
 * These download model weights and need network, which the default suite must
 * never do. They run only in the `embed-real` CI job, which also installs the
 * optional `@huggingface/transformers` peer.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Named explicitly, not globbed. `test/real/**` swept in the fill test
    // too, whose beforeAll dials an OpenAI-compatible server — so the
    // embed-real job, which starts no such server, failed with ECONNREFUSED on
    // a file it was never meant to run. Each real-model job owns its own
    // config for the same reason it owns its own service dependencies.
    include: ["test/real/node-embedder.test.ts"],
    environment: "node",
    // A cold model download plus ONNX session init dwarfs vitest's default.
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
