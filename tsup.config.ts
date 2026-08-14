import { defineConfig } from "tsup";

/**
 * Two builds with different platform contracts:
 *
 * - the Node side (CLI + library) targets node24 and carries the shebang;
 * - `moose-kg/runtime` is built `platform: "neutral"` with no banner, because it
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
      embed: "src/embed/index.ts",
    },
    format: ["esm"],
    target: "es2022",
    platform: "neutral",
    clean: false,
    dts: true,
    sourcemap: true,
    /**
     * tsup externalizes package.json `dependencies` by default, which would
     * leave a bare `import MiniSearch from "minisearch"` in the bundle — a
     * specifier no browser can resolve without an import map or a bundler,
     * breaking the single-file drop-in `dist/runtime.js` is meant to be
     * (ADR 01019). Inline it. The Node build leaves it external, so it is not
     * duplicated there.
     */
    noExternal: ["minisearch"],
    /**
     * The opposite of minisearch: @huggingface/transformers is an *optional
     * peer* and must stay a bare specifier, so a consumer who never imports
     * `moose-kg/embed` never resolves it and bundlers can leave it alone.
     */
    external: ["@huggingface/transformers"],
    /**
     * No shared chunks: `dist/runtime.js` must stay a single file you can drop
     * into a browser with a script tag. Splitting would emit a chunk it imports
     * by relative path, which works in a bundler and breaks everywhere else.
     */
    splitting: false,
  },
]);
