import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Real-model tests need network and model weights, which this suite must
    // never do (ADR 01025). They have their own config and CI job.
    exclude: ["test/real/**"],
    environment: "node",
    env: {
      // The inference library installs node-llama-cpp on demand into
      // ~/.hawkeyexl-inference/runtime when a local provider is constructed
      // without it. Any non-empty value refuses that. Without this, a test that
      // reached the local provider by accident would download from the network
      // — the one thing the default suite must never do.
      INFERENCE_NO_AUTO_INSTALL: "1",
    },
  },
});
