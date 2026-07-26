/**
 * Real-model tests (ADR 01021) — kept out of `npm test` on purpose.
 *
 * These download model weights and need network, which the default suite must
 * never do. They run only in the `embed-real` CI job, which also installs the
 * optional `@huggingface/transformers` peer.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/real/**/*.test.ts"],
    environment: "node",
    // A cold model download plus ONNX session init dwarfs vitest's default.
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
