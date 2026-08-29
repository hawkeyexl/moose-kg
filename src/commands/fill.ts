/**
 * `dockg fill` — propose SKOS frontmatter fields (`kg:` sub-key) with an LLM
 * and write them back. Single-shot structured output per doc, content-hash
 * cached, cost-budgeted. Human-set fields are never overwritten without
 * `--force`; `--dry-run` reports without writing. Any per-doc failure is
 * recorded as a result, never aborts the run.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { analyzeDoc } from "../core/analyze.js";
import { loadConfig, type FillField } from "../core/config.js";
import { discoverFiles } from "../core/discover.js";
import {
  applyKgFields,
  existingKgFields,
  existingProvenance,
  hasLegacyProvenance,
  frontmatterKind,
  type ProvenanceEntry,
} from "../core/frontmatter-edit.js";
import { FillGuard } from "../core/fill-guard.js";
import { bundledShapesPath } from "../core/pkg.js";
import { DockgError } from "../types.js";
import {
  completeValidatedJSON,
  costOfUsage,
  pricingFor,
  validatorFor,
  type InferenceProvider,
} from "@hawkeyexl/inference";
import { FillCache, cacheKey } from "../llm/cache.js";
import {
  SYSTEM_PROMPT,
  SECTION_FILL_FIELDS,
  buildUserPrompt,
  proposalSchema,
} from "../llm/prompt.js";
import { makeProvider, resolveProviderIdentity } from "../llm/provider.js";

export interface FillOptions {
  globs?: string[];
  config?: string;
  cwd?: string;
  dryRun?: boolean;
  force?: boolean;
  noCache?: boolean;
  maxCost?: number;
  /** Minimum model confidence to write a field (overrides fill.minConfidence). */
  minConfidence?: number;
  provider?: string;
  model?: string;
  /** Disable the graph guardrail (`--no-validate-graph`). */
  noValidateGraph?: boolean;
  /** Propose per-section metadata as well as document-level (ADR 01032). */
  sections?: boolean;
  /** Injection seam for tests: bypasses the provider factory. */
  providerInstance?: InferenceProvider;
}

export type FillStatus =
  | "filled"
  | "proposed" // dry run: would write
  | "complete" // nothing missing
  | "nothing-proposed"
  | "skipped-budget"
  | "error";

export interface FillDocResult {
  path: string;
  status: FillStatus;
  /** Fields written (or that would be written under --dry-run). */
  fields: string[];
  /** Human-set fields the proposal was not allowed to touch. */
  preserved: string[];
  /** Fields dropped by the graph guardrail (fill.validateGraph). */
  rejected?: string[];
  /**
   * Section slugs the model proposed that match no heading in the document.
   * Dropped rather than written: writing one would mint a
   * dockg:brokenSectionRef, a finding fill must report and never manufacture
   * (ADR 01032).
   */
  unknownSections?: string[];
  /** Fields the model proposed but scored below fill.minConfidence (ADR 01015). */
  lowConfidence?: Array<{
    field: string;
    confidence: number;
    reasoning?: string;
  }>;
  cached: boolean;
  error?: string;
}

/**
 * Whether the cost cap could actually be applied to this run.
 *
 * - `off` — no cap was set (`fill.maxCostUsd: null`).
 * - `enforced` — a cap was set and the model has a price, so `costUsd` is real
 *   and `skipped-budget` can fire.
 * - `unpriceable` — a cap was set and the model has no entry in the price
 *   table, so nothing can be totalled and the cap **cannot** be applied.
 *
 * The third case used to be indistinguishable from a run that cost nothing:
 * `pricingFor` returns undefined, `costOfUsage` then returns 0, and the gate
 * `costUsd >= maxCostUsd` never fires. Costing zero and being unpriceable are
 * not the same thing, and the default cap is 5 USD while the price table has
 * six models in it — so the silent case was the common one.
 */
export type BudgetState = "off" | "enforced" | "unpriceable";

export interface FillReport {
  results: FillDocResult[];
  costUsd: number;
  /** Whether `costUsd` means anything, and whether the cap could be applied. */
  budget: BudgetState;
  /** Non-fatal diagnostics. Never affects the exit code. */
  warnings: string[];
  exitCode: 0 | 1;
}

/** SKOS relation fields that require a `label` to attach to. */
const RELATION_FIELDS = [
  "alt-labels",
  "broader",
  "narrower",
  "related-concepts",
] as const;

/** A record's `{field → number}` sub-map, ignoring non-number entries. */
function numberMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "number") out[k] = val;
    }
  }
  return out;
}

/** A record's `{field → string}` sub-map, ignoring non-string entries. */
function stringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
    }
  }
  return out;
}

/** Confidence stored to 2 decimals so the graph decimal literal is stable. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Remove `fields` (and their confidence) from a provenance entry. */
function dropFieldsFromEntry(
  e: ProvenanceEntry,
  fields: string[],
): ProvenanceEntry {
  const drop = new Set(fields);
  const keptFields = e.fields.filter((f) => !drop.has(f));
  const confidence = e.confidence
    ? Object.fromEntries(
        Object.entries(e.confidence).filter(([f]) => !drop.has(f)),
      )
    : undefined;
  return {
    "generated-by": e["generated-by"],
    fields: keptFields,
    ...(confidence ? { confidence } : {}),
  };
}

export async function runFill(opts: FillOptions = {}): Promise<FillReport> {
  const cwd = opts.cwd ?? process.cwd();
  const config = loadConfig(opts.config, cwd);
  const inputs =
    opts.globs && opts.globs.length > 0 ? opts.globs : config.inputs;

  const files = discoverFiles(inputs, config.exclude, cwd);
  if (files.length === 0) {
    throw new DockgError(
      `No input files matched: ${inputs.join(", ")} (cwd: ${cwd})`,
    );
  }

  // Identity (for cache keys and pricing) is resolvable without constructing
  // the provider; construction — which may demand an API key — is deferred to
  // the first actual LLM call, so complete/cached runs need no credentials.
  const identity = opts.providerInstance
    ? {
        provider: opts.providerInstance.provider(),
        model: opts.providerInstance.modelName(),
      }
    : resolveProviderIdentity(config, {
        provider: opts.provider,
        model: opts.model,
      });
  let provider: InferenceProvider | undefined = opts.providerInstance;
  const getProvider = (): InferenceProvider =>
    (provider ??= makeProvider(config, {
      provider: opts.provider,
      model: opts.model,
    }));

  const fields = config.fill.fields;
  // Compiled against the full configured field set, not any one doc's missing
  // subset: proposals are validated leniently and narrowed afterwards, so a
  // provider that volunteers a field this doc didn't ask for is fine.
  const withSections = opts.sections ?? config.fill.sections;
  const validateProposal = validatorFor(
    proposalSchema(fields, { sections: withSections }),
  );
  const cache = new FillCache(
    resolve(cwd, config.fill.cacheDir),
    !opts.noCache,
  );
  const pricing = pricingFor(identity.model, config.fill.pricing);
  const maxCostUsd = opts.maxCost ?? config.fill.maxCostUsd;
  const minConfidence = opts.minConfidence ?? config.fill.minConfidence;

  // A cap dockg cannot apply must say so. Silently not enforcing a spend limit
  // the caller asked for is the one failure here that costs money.
  const budget: BudgetState =
    maxCostUsd === null
      ? "off"
      : pricing === undefined
        ? "unpriceable"
        : "enforced";
  const warnings: string[] =
    budget === "unpriceable"
      ? [
          `Cost cap of ${maxCostUsd} USD cannot be enforced: no price is known for model "${identity.model}", ` +
            `so spend cannot be totalled. Set fill.pricing to enforce it, or fill.maxCostUsd: null if you meant no cap.`,
        ]
      : [];
  // Null unless the cap is both set and applicable, so the gate below needs
  // no non-null assertion and cannot fire on an unpriceable run.
  const enforcedCap = budget === "enforced" ? maxCostUsd : null;

  const allPaths = new Set(files);
  const results: FillDocResult[] = [];
  let costUsd = 0;

  // Graph guardrail: simulate each proposal against the SHACL shapes before
  // writing it. Off via fill.validateGraph: false or --no-validate-graph.
  // The guard's base state is the FULL configured corpus, not the positional
  // glob subset — a proposal for one doc can cycle with hierarchy that lives
  // in a doc outside the subset being filled.
  const shapesPaths =
    config.check.shapes.length > 0
      ? config.check.shapes.map((p) => resolve(cwd, p))
      : [bundledShapesPath(import.meta.url)];
  const guardFiles = [
    ...new Set([
      ...discoverFiles(config.inputs, config.exclude, cwd),
      ...files,
    ]),
  ];
  const guard =
    !opts.noValidateGraph && config.fill.validateGraph
      ? FillGuard.create(
          guardFiles,
          cwd,
          config,
          shapesPaths,
          opts.force ?? false,
        )
      : undefined;

  for (const path of files) {
    // Read failures are operational (deleted file, permissions) — abort the
    // whole run with exit 2 rather than burning LLM budget on the rest.
    const absPath = resolve(cwd, path);
    let content: string;
    try {
      content = readFileSync(absPath, "utf8");
    } catch (e) {
      throw new DockgError(
        `cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    try {
      results.push(await fillOne(path, absPath, content));
    } catch (e) {
      results.push({
        path,
        status: "error",
        fields: [],
        preserved: [],
        cached: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const hasErrors = results.some((r) => r.status === "error");
  return { results, costUsd, budget, warnings, exitCode: hasErrors ? 1 : 0 };

  async function fillOne(
    path: string,
    absPath: string,
    content: string,
  ): Promise<FillDocResult> {
    if (frontmatterKind(content) === "unsupported") {
      throw new DockgError(
        "only YAML frontmatter can be edited (found a TOML/JSON fence) — exclude this file or convert its frontmatter",
      );
    }

    const present = new Set(existingKgFields(content));
    const missing = opts.force ? fields : fields.filter((f) => !present.has(f));
    if (missing.length === 0) {
      return {
        path,
        status: "complete",
        fields: [],
        preserved: [],
        cached: false,
      };
    }

    if (enforcedCap !== null && costUsd >= enforcedCap) {
      return {
        path,
        status: "skipped-budget",
        fields: [],
        preserved: [],
        cached: false,
      };
    }

    const key = cacheKey(
      identity.provider,
      identity.model,
      content,
      missing,
      withSections,
    );
    // Cached proposals are validated too: a stale or hand-edited cache entry
    // must not bypass the schema (treat invalid entries as a miss).
    let proposal = cache.get(key);
    if (proposal !== undefined && !validateProposal(proposal)) {
      proposal = undefined;
    }
    const cached = proposal !== undefined;

    // Outside the cache-miss branch: a *cached* proposal can carry sections
    // too, and its slugs still have to be checked against real headings.
    const doc = analyzeDoc(content, path, allPaths, {
      routes: config.routes,
    });

    if (proposal === undefined) {
      // completeValidatedJSON validates and retries once before giving up.
      // fill previously aborted the document on a single malformed response;
      // one bad completion is not worth losing the work over.
      //
      // The request schema is narrowed to this doc's missing fields, so the
      // provider cannot propose fields the run should not touch. Validation
      // deliberately uses the WIDER configured-field schema: a provider that
      // volunteers extra fields is tolerated and narrowed below, not failed.
      const run = await completeValidatedJSON<Record<string, unknown>>({
        provider: getProvider(),
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(doc, content, missing, {
          sections: withSections,
        }),
        schema: proposalSchema(missing, { sections: withSections }),
        validate: validateProposal,
        temperature: config.fill.temperature,
      });
      costUsd += costOfUsage(run.usage, pricing);
      if (run.result === undefined) {
        throw new Error(run.error ?? "provider returned no proposal");
      }
      proposal = run.result;
      cache.set(key, proposal);
    }

    // Per-field confidence + reasoning ride alongside the values (ADR 01015);
    // pull them out before narrowing filters to field keys.
    const confidence = numberMap(proposal["confidence"]);
    const reasoning = stringMap(proposal["reasoning"]);

    // Only requested fields survive, even if the cache or provider offered
    // more; string arrays are deduplicated (the 0.1 schema enforces
    // uniqueItems on what we write).
    const narrowed = Object.fromEntries(
      Object.entries(proposal)
        .filter(([k]) => missing.includes(k as FillField))
        .map(([k, v]) => [k, Array.isArray(v) ? [...new Set(v)] : v]),
    );

    // Section proposals arrive as a list of {slug, …} and become dotted field
    // names — `sections.<slug>.type` — so the writer, the confidence gate, the
    // graph guardrail and the provenance record all treat them as ordinary
    // fields (ADR 01032).
    const unknownSlugs: string[] = [];
    if (withSections) {
      const realSlugs = new Set(doc.sections.map((s) => s.slug));
      for (const entry of Array.isArray(proposal["sections"])
        ? (proposal["sections"] as Array<Record<string, unknown>>)
        : []) {
        const slug = typeof entry["slug"] === "string" ? entry["slug"] : "";
        // A slug matching no heading is dropped, never written. Writing it
        // would mint a dockg:brokenSectionRef — a finding fill must report
        // rather than manufacture.
        if (!realSlugs.has(slug)) {
          if (slug) unknownSlugs.push(slug);
          continue;
        }
        const entryConfidence = numberMap(entry["confidence"]);
        const entryReasoning = stringMap(entry["reasoning"]);
        for (const [field, value] of Object.entries(entry)) {
          if (!SECTION_FILL_FIELDS.includes(field as FillField)) continue;
          if (!fields.includes(field as FillField)) continue;
          const name = `sections.${slug}.${field}`;
          narrowed[name] = Array.isArray(value) ? [...new Set(value)] : value;
          // Fold the per-section scores into the flat maps the gate reads, so
          // one code path scores document and section fields alike.
          if (entryConfidence[field] !== undefined)
            confidence[name] = entryConfidence[field];
          if (entryReasoning[field] !== undefined)
            reasoning[name] = entryReasoning[field];
        }
      }
    }

    // docmeta:kg requires `label` alongside any alt-label/relation field
    // (dependentRequired) — never write output our own validate rejects.
    // Rechecked after the guardrail: rejecting `label` takes the relation
    // fields down with it.
    const gateLabel = (): void => {
      const hasLabel =
        present.has("label") ||
        (typeof narrowed["label"] === "string" && narrowed["label"].length > 0);
      if (!hasLabel) {
        for (const field of RELATION_FIELDS) delete narrowed[field];
      }
    };
    gateLabel();

    // Confidence gate (ADR 01015): drop any field the model scored below
    // minConfidence (or did not score at all — no score means no write). This
    // runs before the structural guardrail; the two are orthogonal, and the
    // confidence gate covers every field, not just the guarded subset. A drop
    // here is normal operation, reported but never an error (exit stays 0).
    const lowConfidence: FillDocResult["lowConfidence"] = [];
    for (const field of Object.keys(narrowed)) {
      const c = confidence[field] ?? 0;
      if (c < minConfidence) {
        lowConfidence.push({
          field,
          confidence: c,
          ...(reasoning[field] ? { reasoning: reasoning[field] } : {}),
        });
        delete narrowed[field];
      }
    }
    if (lowConfidence.length > 0) gateLabel();
    const lowConf = lowConfidence.length > 0 ? { lowConfidence } : {};

    // Graph guardrail: drop any field whose triples would violate the
    // shapes contract (cycles, related⨯broader conflicts, second spellings
    // of an existing concept). Cached proposals are vetted too — rejection
    // sits downstream of the cache, so a later corpus change can re-admit
    // a proposal without re-asking the LLM.
    let rejected: string[] | undefined;
    if (guard) {
      const vetted = await guard.vet(path, content, narrowed);
      if (vetted.rejected.length > 0) {
        rejected = vetted.rejected.map((r) => r.field);
        for (const field of rejected) delete narrowed[field];
        gateLabel();
      }
    }

    // Which fields will actually be written (mirrors applyKgFields' filter);
    // empty means nothing to do — and no provenance entry either.
    const realFields = Object.keys(narrowed).filter((k) => {
      const v = narrowed[k];
      return (
        v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)
      );
    });
    if (realFields.length === 0) {
      return {
        path,
        status: "nothing-proposed",
        fields: [],
        preserved: [],
        ...(rejected ? { rejected } : {}),
        ...(unknownSlugs.length > 0 ? { unknownSections: unknownSlugs } : {}),
        ...lowConf,
        cached,
      };
    }

    // Record machine attribution alongside the fields, in the SAME write.
    // One entry PER MODEL (schema 0.4): the current model's entry unions its
    // own fields across runs, other models' entries are preserved — minus any
    // field this run just overwrote (--force), so attribution never lies.
    const values: Record<string, unknown> = { ...narrowed };
    if (config.fill.writeProvenance) {
      // `provenance` is overwritten wholesale below, and the deprecated
      // single-object shape cannot be read back (ADR 01023) — so writing over
      // it would silently discard another model's outstanding review record.
      // Refuse the file and name the migration instead.
      if (hasLegacyProvenance(content)) {
        throw new DockgError(
          `${path}: kg.provenance is the deprecated single-object form, which docmeta:kg dropped. ` +
            `Filling would overwrite it and lose its attribution — convert it to a one-entry list ` +
            `(a leading "- ", and generatedBy renamed to generated-by) first.`,
        );
      }
      const prior = existingProvenance(content);
      const mine = prior.find((e) => e["generated-by"] === identity.model);
      const others = prior
        .filter((e) => e["generated-by"] !== identity.model)
        .map((e) => dropFieldsFromEntry(e, realFields))
        .filter((e) => e.fields.length > 0);
      // Confidence rides in the entry too (ADR 01015): this run's scores for the
      // fields it wrote, merged over the model's prior scores.
      const myConfidence: Record<string, number> = {
        ...(mine?.confidence ?? {}),
      };
      for (const f of realFields) myConfidence[f] = round2(confidence[f] ?? 0);
      const fieldSet = [
        ...new Set([...(mine?.fields ?? []), ...realFields]),
      ].sort();
      const entry = {
        "generated-by": identity.model,
        fields: fieldSet,
        confidence: Object.fromEntries(
          fieldSet
            .filter((f) => f in myConfidence)
            .map((f) => [f, myConfidence[f]]),
        ),
      };
      values["provenance"] = [...others, entry].sort((a, b) =>
        a["generated-by"] < b["generated-by"] ? -1 : 1,
      );
    }

    const applied = applyKgFields(content, path, values, {
      force: opts.force,
      alwaysOverwrite: ["provenance"],
    });
    const reportedFields = applied.applied.filter((f) => f !== "provenance");

    if (reportedFields.length === 0) {
      return {
        path,
        status: "nothing-proposed",
        fields: [],
        preserved: applied.skipped,
        ...(rejected ? { rejected } : {}),
        ...(unknownSlugs.length > 0 ? { unknownSections: unknownSlugs } : {}),
        ...lowConf,
        cached,
      };
    }

    if (!opts.dryRun) writeFileSync(absPath, applied.content, "utf8");
    // Fold the accepted result into the guard even on --dry-run, so the dry
    // run predicts exactly what a real run would accept and reject.
    guard?.commit(path, applied.content);
    return {
      path,
      status: opts.dryRun ? "proposed" : "filled",
      fields: reportedFields,
      preserved: applied.skipped,
      ...(rejected ? { rejected } : {}),
      ...(unknownSlugs.length > 0 ? { unknownSections: unknownSlugs } : {}),
      ...lowConf,
      cached,
    };
  }
}

export function renderFill(
  report: FillReport,
  format: "pretty" | "json",
): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  const lines: string[] = [];
  for (const r of report.results) {
    const dropped =
      r.rejected && r.rejected.length > 0
        ? ` [graph check rejected: ${r.rejected.join(", ")}]`
        : "";
    const lowConf =
      r.lowConfidence && r.lowConfidence.length > 0
        ? ` [low confidence, not written: ${r.lowConfidence
            .map((l) => `${l.field} ${l.confidence.toFixed(2)}`)
            .join(", ")}]`
        : "";
    // Visible rather than silent: the model addressed a heading that is not
    // there, which usually means the page was edited after it was described.
    const unknown =
      r.unknownSections && r.unknownSections.length > 0
        ? ` [no such section: ${r.unknownSections.join(", ")}]`
        : "";
    switch (r.status) {
      case "filled":
        lines.push(
          `filled    ${r.path} (${r.fields.join(", ")})${r.cached ? " [cached]" : ""}${dropped}${unknown}${lowConf}`,
        );
        break;
      case "proposed":
        lines.push(
          `proposed  ${r.path} (${r.fields.join(", ")})${r.cached ? " [cached]" : ""}${dropped}${unknown}${lowConf} — dry run, not written`,
        );
        break;
      case "complete":
        lines.push(`complete  ${r.path}`);
        break;
      case "nothing-proposed":
        lines.push(
          `no-op     ${r.path} (model proposed nothing new)${dropped}${unknown}${lowConf}`,
        );
        break;
      case "skipped-budget":
        lines.push(`skipped   ${r.path} (cost budget exhausted)`);
        break;
      case "error":
        lines.push(`error     ${r.path}: ${r.error}`);
        break;
    }
  }
  // "$0.0000" reads as "this run was free". Under an unpriceable model it means
  // "nothing could be totalled", which is a different thing, so say which.
  lines.push(
    "",
    report.budget === "unpriceable"
      ? "LLM cost: unpriceable — no price known for this model, so the cap was not applied"
      : `LLM cost: $${report.costUsd.toFixed(4)}`,
  );
  return lines.join("\n");
}
