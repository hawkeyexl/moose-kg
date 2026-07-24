/**
 * `dockg export` — reserialize the built graph into a consumer format. Reads
 * the graph the same way `stats`/`check` do (loadGraph over the config `out`,
 * missing graph → exit 2) and writes a deterministic rendering. `jsonld` emits a
 * whole-graph JSON-LD file; `iirds` projects the graph into a conformant,
 * deterministic unrestricted iiRDS package (`.iirds` ZIP) — see ADR 01017.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Store } from "n3";
import { DockgError } from "../types.js";
import { loadConfig } from "../core/config.js";
import type { Quad, Term } from "../core/derive.js";
import { emitJsonLd } from "../core/emit-jsonld.js";
import { emitRdfXml } from "../core/emit-rdfxml.js";
import { projectPackage } from "../core/iirds-package.js";
import { loadGraph } from "../core/load.js";
import { byCodeUnit } from "../core/sort.js";
import { NS } from "../core/vocab.js";
import { writeZip, type ZipEntry } from "../core/zip.js";

const XSD_STRING = `${NS.xsd}string`;

export type ExportFormat = "jsonld" | "iirds";

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

/** File extension each format writes to. */
const EXTENSION: Record<ExportFormat, string> = {
  jsonld: ".jsonld",
  iirds: ".iirds",
};

/** Convert an in-memory N3 store back to dockg's internal quad shape. */
function storeToQuads(store: Store): Quad[] {
  return store.getQuads(null, null, null, null).map((q) => {
    const o = q.object;
    let term: Term;
    if (o.termType === "Literal") {
      const dt = o.datatype.value;
      term =
        dt && dt !== XSD_STRING
          ? { kind: "literal", value: o.value, datatype: dt }
          : { kind: "literal", value: o.value };
    } else {
      term = { kind: "iri", value: o.value };
    }
    return { s: q.subject.value, p: q.predicate.value, o: term };
  });
}

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

export async function runExport(opts: ExportOptions): Promise<ExportResult> {
  const cwd = opts.cwd ?? process.cwd();
  if (opts.format !== "jsonld" && opts.format !== "iirds") {
    throw new DockgError(
      `Unknown export format: ${opts.format} (expected: jsonld | iirds).`,
    );
  }

  const config = loadConfig(opts.config, cwd);
  const graphPath = resolve(cwd, opts.graph ?? config.out);

  return opts.format === "jsonld"
    ? runJsonLd(cwd, graphPath, opts.out)
    : runIirds(cwd, graphPath, config.export.iirds, config.baseIri, opts.out);
}
