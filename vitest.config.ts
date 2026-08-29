import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Real-model tests need network and model weights, which this suite must
    // never do (ADR 01025). They have their own config and CI job.
    exclude: ["test/real/**"],
    environment: "node",
  },
});
