/**
 * Fill proposal cache. Storage is the inference library's `JsonCache`; what
 * stays here is what only moose-kg can decide — what invalidates an entry:
 * provider, model, prompt version, the requested fields, and the full file
 * content.
 */
import { JsonCache, buildCacheKey, sha256 } from "@hawkeyexl/inference";
import type { FillField } from "../core/config.js";
import { PROMPT_VERSION } from "./prompt.js";

export { sha256 };

export function cacheKey(
  provider: string,
  model: string,
  content: string,
  fields: FillField[],
): string {
  return buildCacheKey([
    provider,
    model,
    `v${PROMPT_VERSION}`,
    // Pre-hashed: documents are large and key parts should stay short.
    sha256(content),
    fields.join(","),
  ]);
}

/**
 * Proposals are plain JSON objects. Callers re-validate what comes back
 * against the proposal schema — a hand-edited or stale entry must not bypass
 * validation just because it parsed.
 */
export class FillCache extends JsonCache<Record<string, unknown>> {
  constructor(dir: string, enabled: boolean = true) {
    super(dir, enabled, "moose-kg");
  }
}
