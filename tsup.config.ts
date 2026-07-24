import { defineConfig } from "tsup";

/**
 * Two builds with different platform contracts:
 *
 * - the Node side (CLI + library) targets node24 and carries the shebang;
 * - `dockg/runtime` is built `platform: "neutral"` with no banner, because it
 *   must run in a browser (ADR 01018). The bundle-purity test
 *   (test/integration/runtime-bundle.test.ts) enforces that contract — if a
 *   `node:` import ever reaches the runtime's module graph, that test fails.
 *
 * Neither config sets `clean`: tsup runs an array config **concurrently**, and
 * a config with `clean` deletes every `.d.ts` in the shared outDir when its
 * declaration rollup starts — which raced away the other config's declarations
 * (`dist/runtime.d.ts` never survived). `npm run build` cleans once up front via
 * scripts/clean-dist.mjs instead.
 */
export default defineConfig([
  {
    entry: {
      cli: "src/cli.ts",
      index: "src/index.ts",
    },
    format: ["esm"],
    target: "node24",
    platform: "node",
    clean: false,
    dts: true,
    sourcemap: true,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  {
    entry: {
      runtime: "src/runtime/index.ts",
    },
    format: ["esm"],
    target: "es2022",
    platform: "neutral",
    clean: false,
    dts: true,
    sourcemap: true,
  },
]);
