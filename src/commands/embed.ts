/**
 * `dockg embed` — compute vectors for the search index (ADR 01020).
 *
 * Embeds the text already in `kg/search.json` rather than re-reading markdown:
 * vectors then cover exactly what the lexical index covers, with the Phase 8
 * granularity rule already applied, so both ranking legs score the same units.
 *
 * This is the one dockg command that needs a model. It is local — no API, no
 * key, no spend — but the weights are a download, so unlike every other
 * artifact `kg/vectors.bin` cannot be regenerated in CI.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadConfig } from "../core/config.js";
import {
  SEARCH_INDEX_FILENAME,
  type SearchEntry,
  type SearchIndexDoc,
} from "../core/search-index.js";
import { encodeVectorIndex } from "../core/vector-index.js";
import { DockgError } from "../types.js";
import {
  createLocalEmbedder,
  EmbedderUnavailableError,
} from "../embed/local.js";
import { createMockEmbedder } from "../embed/mock.js";
import type { Embedder } from "../embed/types.js";

export interface EmbedOptions {
  config?: string;
  /** Graph .ttl path (default: config `out`) — locates the sibling index. */
  graph?: string;
  /** Search index path (default: `search.json` beside the graph). */
  index?: string;
  /** Vector sidecar output (default: config `embed.out`). */
  out?: string;
  model?: string;
  dtype?: string;
  /** Skip the vector cache. */
  noCache?: boolean;
  /** Injection seam for tests: bypasses the embedder factory. */
  embedder?: Embedder;
  cwd?: string;
}

export interface EmbedReport {
  outPath: string;
  model: string;
  dims: number;
  /** Entries embedded this run (cache misses). */
  embedded: number;
  /** Entries served from cache. */
  cached: number;
  total: number;
}

/** The text an entry contributes to its vector — same fields the lexical index scores. */
export function embedText(entry: SearchEntry): string {
  return [entry.title, entry.labels, entry.description, entry.text]
    .filter((part): part is string => part !== undefined && part !== "")
    .join("\n\n");
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Per-text vector cache. Embedding is slow by construction (single-threaded
 * WASM, one text per call), so editing one section must not re-embed the corpus.
 * Keyed on text + model + dtype, so changing any of them re-embeds rather than
 * serving vectors from a different function.
 */
class VectorCache {
  constructor(
    private readonly dir: string,
    private readonly enabled: boolean,
  ) {}

  private path(key: string): string {
    return join(this.dir, `${key}.json`);
  }

  get(key: string): Float32Array | undefined {
    if (!this.enabled) return undefined;
    const file = this.path(key);
    if (!existsSync(file)) return undefined;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as number[];
      return Array.isArray(parsed) ? Float32Array.from(parsed) : undefined;
    } catch {
      return undefined; // A corrupt entry is a miss, never a crash.
    }
  }

  set(key: string, vector: Float32Array): void {
    if (!this.enabled) return;
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.path(key), JSON.stringify([...vector]), "utf8");
  }
}

async function makeEmbedder(
  opts: EmbedOptions,
  model: string,
  dtype: string,
): Promise<Embedder> {
  if (opts.embedder) return opts.embedder;
  // `--model mock` keeps the CLI exercisable offline, mirroring `fill`'s mock
  // provider. It produces hash-derived vectors with no semantics.
  if (model === "mock") return createMockEmbedder({ dtype });
  try {
    return await createLocalEmbedder({ model, dtype, role: "passage" });
  } catch (e) {
    if (e instanceof EmbedderUnavailableError) {
      throw new DockgError(e.message);
    }
    // Everything else the model stack can fail on — an unknown id, a 404 on the
    // hub, corrupt weights — is operational (exit 2), not a raw stack trace.
    throw new DockgError(
      `Failed to load embedding model ${model}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export async function runEmbed(opts: EmbedOptions = {}): Promise<EmbedReport> {
  const cwd = opts.cwd ?? process.cwd();
  const config = loadConfig(opts.config, cwd);
  const graphPath = resolve(cwd, opts.graph ?? config.out);
  const indexPath = opts.index
    ? resolve(cwd, opts.index)
    : join(dirname(graphPath), SEARCH_INDEX_FILENAME);

  if (!existsSync(indexPath)) {
    throw new DockgError(
      `Search index not found: ${indexPath} — run \`dockg export --format search\` first.`,
    );
  }
  const raw = readFileSync(indexPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new DockgError(
      `Failed to parse ${indexPath}: ${e instanceof Error ? e.message : "parse error"} — re-run \`dockg export --format search\`.`,
    );
  }
  const entries = (parsed as SearchIndexDoc | null)?.entries;
  if (!Array.isArray(entries)) {
    throw new DockgError(
      `Not a dockg search index: ${indexPath} — expected an \`entries\` array.`,
    );
  }

  const model = opts.model ?? config.embed.model;
  const dtype = opts.dtype ?? config.embed.dtype;
  // Built on the first cache miss, not up front: `pipeline()` downloads and
  // initializes tens of megabytes of weights, and a run that is entirely cache
  // hits has no reason to pay for it. An injected embedder is already built.
  let embedder = opts.embedder;
  const getEmbedder = async (): Promise<Embedder> =>
    (embedder ??= await makeEmbedder(opts, model, dtype));
  // The identity that keys the cache and stamps the header. Known without
  // loading anything: `makeEmbedder` reports back exactly what it was asked for.
  const identity = embedder
    ? { model: embedder.model, dtype: embedder.dtype }
    : { model, dtype };
  const cache = new VectorCache(
    resolve(cwd, config.embed.cacheDir),
    !opts.noCache,
  );

  // Digest of the artifact these vectors describe: the runtime refuses to rank
  // against a sidecar built from a different corpus.
  const source = `sha256:${sha256(raw)}`;

  const vectors: Array<{ id: string; vector: Float32Array }> = [];
  let embedded = 0;
  let cached = 0;

  for (const entry of entries) {
    const text = embedText(entry);
    if (text === "") continue;
    // JSON rather than a joined string: no separator can collide with content,
    // and no NUL byte enters the source (a NUL makes git classify the file as
    // binary — the no-NUL-bytes invariant in CLAUDE.md).
    const key = sha256(JSON.stringify([identity.model, identity.dtype, text]));
    let vector = cache.get(key);
    if (vector) {
      cached += 1;
    } else {
      vector = await (await getEmbedder()).embed(text);
      cache.set(key, vector);
      embedded += 1;
    }
    vectors.push({ id: entry.id, vector });
  }

  const outPath = opts.out
    ? resolve(cwd, opts.out)
    : resolve(cwd, config.embed.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    encodeVectorIndex(vectors, {
      model: identity.model,
      dtype: identity.dtype,
      source,
    }),
  );

  return {
    outPath,
    model: identity.model,
    dims: vectors[0]?.vector.length ?? 0,
    embedded,
    cached,
    total: vectors.length,
  };
}

export function renderEmbed(
  report: EmbedReport,
  format: "pretty" | "json",
): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  return [
    `Wrote ${report.total} vector${report.total === 1 ? "" : "s"} (${report.dims}-d, ${report.model}) to ${report.outPath}`,
    `  ${report.embedded} embedded, ${report.cached} from cache`,
  ].join("\n");
}
