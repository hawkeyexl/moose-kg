// Flat config (ESLint 10). Deliberately close to typescript-eslint's
// `recommended` — this repo's quality bar is carried by types, tests, and the
// determinism gate, so lint exists to catch the classes of mistake those miss,
// not to relitigate style. Formatting is Prettier's job; eslint-config-prettier
// switches off every rule that would fight it.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // Generated, vendored, or byte-pinned. `test/fixtures` in particular holds
    // the corpus, the golden graph, and a deliberately-CRLF file — none of it
    // is source, and rewriting any of it would break the determinism gate.
    // `dist/**` and `node_modules/**` are anchored to this file's directory, so
    // the docs site's own copies need naming separately — along with `.astro/`,
    // Astro's generated type and build cache.
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      ".tmp/**",
      "test/fixtures/**",
      "docs/dist/**",
      "docs/node_modules/**",
      "docs/.astro/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain-JS files run on Node and need its globals declared. TypeScript
    // sources don't: typescript-eslint's eslint-recommended turns off no-undef
    // there, because the compiler already resolves those names.
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: { globals: globals.node },
  },
  {
    // commitlint.config.cjs is CommonJS by extension, outside the package's
    // "type": "module" default.
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
  },
  {
    // The real-model gate drives a browser: its `page.evaluate` callbacks are
    // serialized and run in the page, so they legitimately name `window` and
    // `document` from a file that is otherwise Node.
    files: ["test/real/**/*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["**/*.ts"],
    rules: {
      // Unused args are meaningful in this codebase's interface-conforming
      // callbacks (exec seams, visitor signatures); allow the `_` convention.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Two type-aware rules, enabled for one specific reason (ADR 01040): the
    // analyzer pipeline is async, and the failure mode of an async pipeline is
    // a forgotten `await`. TypeScript catches most of them — a `Promise` where
    // a `DocModel` was expected is a type error — but it says nothing about a
    // bare statement call like `guard.commit(path, content);`, which silently
    // does its work after the caller has moved on. That exact line was written
    // during the conversion and only caught by hand.
    //
    // Type-aware linting is slower and needs a program, so it is scoped to
    // these two rules rather than switching the whole config to
    // `recommendedTypeChecked` — the bar here is carried by types, tests and
    // the determinism gate, and lint exists to catch what those miss.
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  prettier,
);
