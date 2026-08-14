/**
 * Provider construction for `moose-kg fill`: map the config's `fill` section onto
 * the shared inference library's `ProviderSpec`.
 *
 * The providers themselves, the response cache, the price table, and the
 * schema-validated retry all live in `@hawkeyexl/inference` (ADR 01021). What
 * stays here is the one thing only moose-kg can decide: which of its own config
 * keys mean what.
 */
import {
  makeProvider as makeInferenceProvider,
  resolveProviderIdentity as resolveIdentity,
  type InferenceProvider,
  type ProviderSpec,
} from "@hawkeyexl/inference";
import type { MooseKgConfig } from "../core/config.js";

export interface ProviderOptions {
  provider?: string;
  model?: string;
}

/** Translate `config.fill` (plus CLI overrides) into a library ProviderSpec. */
export function providerSpecFor(
  config: MooseKgConfig,
  options: ProviderOptions = {},
): ProviderSpec {
  const fill = config.fill;
  const spec: ProviderSpec = {
    provider: (options.provider ?? fill.provider) as ProviderSpec["provider"],
    baseUrl: fill.baseUrl,
    command: fill.command,
  };
  // `null` in config means "use the provider default", which is exactly what
  // omitting the key means to the library — so don't pass the nulls through.
  const model = options.model ?? fill.model;
  if (model !== null && model !== undefined) spec.model = model;
  if (fill.apiKeyEnv !== null) spec.apiKeyEnv = fill.apiKeyEnv;
  if (fill.pricing) spec.pricing = fill.pricing;
  return spec;
}

/**
 * Resolve the provider name and model WITHOUT constructing the provider — a
 * fully-cached or fully-complete run must not require an API key, but its
 * cache keys and pricing still need the identity.
 */
export function resolveProviderIdentity(
  config: MooseKgConfig,
  options: ProviderOptions = {},
): { provider: string; model: string } {
  return resolveIdentity(providerSpecFor(config, options));
}

export function makeProvider(
  config: MooseKgConfig,
  options: ProviderOptions = {},
): InferenceProvider {
  return makeInferenceProvider(providerSpecFor(config, options));
}
