/**
 * moose.config.yaml is shared across the moose tool family, so moose-kg's
 * settings live under a top-level `kg:` key. Tests that compose a config from a
 * caller-supplied fragment need that fragment indented into the section.
 *
 * Not collected as a suite: vitest's `include` is `test/**\/*.test.ts`.
 */

/** Indent a flat config fragment so it nests under `kg:`. Blank lines stay blank. */
export function underKg(fragment: string): string {
  return fragment.replace(/^(?!$)/gm, "  ");
}
