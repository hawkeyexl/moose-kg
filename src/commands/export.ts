/**
 * `dockg export` — reserialize the built graph into a consumer format. Reads
 * the graph the same way `stats`/`check` do (loadGraph over the config `out`,
 * missing graph → exit 2) and writes a deterministic rendering. `jsonld` emits a
 * whole-graph JSON-LD file; `iirds` projects the graph into a conformant,
 * deterministic unrestricted iiRDS package (`.iirds` ZIP) — see ADR 01017.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DockgError } from "../types.js";
import { loadConfig } from "../core/config.js";
import { emitJsonLd } from "../core/emit-jsonld.js";
import { emitRdfXml } from "../core/emit-rdfxml.js";
import { projectPackage } from "../core/iirds-package.js";
import { loadGraph, storeToQuads } from "../core/load.js";
import {
  buildSearchIndex,
  emitSearchIndex,
  SEARCH_INDEX_FILENAME,
} from "../core/search-index.js";
import { byCodeUnit } from "../core/sort.js";
import { PREFIXES } from "../core/vocab.js";
import { GraphIndex } from "../runtime/graph.js";
import { writeZip, type ZipEntry } from "../core/zip.js";

export type ExportFormat = "jsonld" | "iirds" | "search";

export interface ExportOptions {
  config?: string;
  /** Graph .ttl path (default: config `out`). */
  graph?: string;
  format: ExportFormat;
  /** Output path (default: the graph path with the format's extension). */
  out?: string;
  cwd?: string;
}

export interface ExportResult {
  outPath: string;
  format: ExportFormat;
  /** Distinct subject nodes in the emitted (or projected) graph. */
  nodes: number;
  /** Non-fatal projection warnings (iiRDS only; empty otherwise). */
  warnings: string[];
}

/** File extension each single-file format writes to. */
const EXTENSION: Record<"jsonld" | "iirds", string> = {
  jsonld: ".jsonld",
  iirds: ".iirds",
};

/** Replace a path's extension (or append one) with `.jsonld`-style ext. */
function withExtension(path: string, ext: string): string {
  return path.replace(/\.[^./\\]*$/, "") + ext;
}

function runJsonLd(cwd: string, graphPath: string, out?: string): ExportResult {
  const store = loadGraph(graphPath);
  const quads = storeToQuads(store);
  const serialized = emitJsonLd(quads);
  const nodes = new Set(quads.map((q) => q.s)).size;
  const outPath = out
    ? resolve(cwd, out)
    : withExtension(graphPath, EXTENSION.jsonld);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, serialized, "utf8");
  return { outPath, format: "jsonld", nodes, warnings: [] };
}

function runIirds(
  cwd: string,
  graphPath: string,
  iirds: { title?: string; creator?: string; version: "1.2" | "1.3" },
  baseIri: string,
  out?: string,
): ExportResult {
  const store = loadGraph(graphPath);
  const projection = projectPackage(
    store,
    {
      baseIri,
      version: iirds.version,
      title: iirds.title,
      creator: iirds.creator,
    },
    cwd,
  );
  const metadata = emitRdfXml(projection.quads, projection.prefixes);

  // Deterministic entry order: mimetype (stored, first) → metadata → content
  // files sorted by their in-archive path.
  const content = [...projection.contentFiles]
    .sort((a, b) => byCodeUnit(a.zipPath, b.zipPath))
    .map((f): ZipEntry => ({ name: f.zipPath, data: readFileSync(f.absPath) }));
  const entries: ZipEntry[] = [
    {
      name: "mimetype",
      data: Buffer.from("application/iirds+zip"),
      store: true,
    },
    { name: "META-INF/metadata.rdf", data: Buffer.from(metadata, "utf8") },
    ...content,
  ];

  const outPath = out
    ? resolve(cwd, out)
    : withExtension(graphPath, EXTENSION.iirds);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, writeZip(entries));
  const nodes = new Set(projection.quads.map((q) => q.s)).size;
  return { outPath, format: "iirds", nodes, warnings: projection.warnings };
}

/**
 * The lexical search artifact. Reads each document's source from disk — the
 * same thing the iiRDS projection does for renditions — because the graph
 * deliberately carries no prose (ADR 01008/01019).
 */
function runSearchIndex(
  cwd: string,
  graphPath: string,
  out?: string,
): ExportResult {
  const store = loadGraph(graphPath);
  const graph = GraphIndex.fromQuads(
    storeToQuads(store),
    Object.fromEntries(PREFIXES),
  );
  const warnings: string[] = [];
  const index = buildSearchIndex(graph, cwd, { warnings });

  // Sibling of the graph, named for what it is: `graph.json` next to
  // `graph.jsonld` would be a trap.
  const outPath = out
    ? resolve(cwd, out)
    : join(dirname(graphPath), SEARCH_INDEX_FILENAME);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, emitSearchIndex(index), "utf8");
  return { outPath, format: "search", nodes: index.entries.length, warnings };
}

const FORMATS: ExportFormat[] = ["jsonld", "iirds", "search"];

export async function runExport(opts: ExportOptions): Promise<ExportResult> {
  const cwd = opts.cwd ?? process.cwd();
  if (!FORMATS.includes(opts.format)) {
    throw new DockgError(
      `Unknown export format: ${opts.format} (expected: ${FORMATS.join(" | ")}).`,
    );
  }

  const config = loadConfig(opts.config, cwd);
  const graphPath = resolve(cwd, opts.graph ?? config.out);

  if (opts.format === "jsonld") return runJsonLd(cwd, graphPath, opts.out);
  if (opts.format === "search") {
    return runSearchIndex(cwd, graphPath, opts.out);
  }
  return runIirds(
    cwd,
    graphPath,
    config.export.iirds,
    config.baseIri,
    opts.out,
  );
}
