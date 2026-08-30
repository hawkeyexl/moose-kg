/**
 * `dockg fill` against a real OpenAI-compatible server (ADR 01031) — kept out
 * of `npm test` and out of `test:real` alike.
 *
 * Its own config rather than a filter on vitest.real.config.ts: these tests
 * need a *different service* (an LLM server on OLLAMA_BASE_URL, not model
 * weights on disk), and they run in a different CI job. Globbing both suites
 * from one config is what put the fill test inside the embed-real job, where
 * it failed with ECONNREFUSED against a server that job never starts.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/real/fill-*.test.ts"],
    environment: "node",
    // A cold model load on the server side dwarfs vitest's default.
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
