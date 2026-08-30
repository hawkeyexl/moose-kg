import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Real-model tests need network and model weights, which this suite must
    // never do (ADR 01025). They have their own config and CI job.
    // Extend, not replace: a bare list drops vitest's defaults
    // (node_modules, dist, .git), so anything vendored under test/ would
    // start being collected.
    exclude: [...configDefaults.exclude, "test/real/**"],
    environment: "node",
    // Vitest's 5s default is sized for in-process unit tests. Half of this
    // suite is integration tests that spawn `dist/cli.js`, and process spawn on
    // Windows costs multiples of what it costs on Linux — two of them in one
    // test (a determinism gate builds twice, by definition) is enough to blow
    // 5s on a loaded runner. Found by adding Windows to the matrix, where two
    // embed tests timed out while all three platforms agreed on every byte.
    // 30s still surfaces a genuine hang promptly.
    testTimeout: 30_000,
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
