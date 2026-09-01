/**
 * The localization manifest (ADR 01038) — `kg/localizations.json`, the index of
 * indexes.
 *
 * Retrieval artifacts fan out per language: one `search.<lang>.json` and one
 * `vectors.<lang>.bin` each, because a single flat index over every locale
 * ranks across the boundary it exists to respect, and because one embedding
 * model cannot serve every language. The manifest is what makes that navigable
 * — a browser fetches this one small file, learns which localizations exist and
 * what each costs, and downloads only the pair it needs.
 *
 * Written by `dockg export --format search`; `dockg embed` fills in the
 * `vectors` block as it produces each sidecar, so a manifest entry without one
 * means exactly "this language has no vectors yet".
 *
 * No `node:` imports: the CLI writes it and the browser runtime reads it.
 */
import { byCodeUnit } from "./sort.js";

/** Conventional filename, written beside the graph. */
export const LOCALIZATIONS_FILENAME = "localizations.json";

/**
 * BCP-47's tag for undetermined, used as the bucket for documents that declare
 * no language. A real tag rather than a dockg invention, so a consumer that
 * knows BCP-47 already knows what it means — and so the bucket sorts, filters,
 * and names a file like any other language.
 */
export const UNDETERMINED = "und";

/** Where one language's lexical index lives, and what it holds. */
export interface SearchArtifact {
  /** Filename, relative to the manifest. */
  path: string;
  /** Indexed nodes. */
  entries: number;
  /** `sha256:…` of the file, so a consumer can detect a stale pair. */
  digest: string;
}

/** Where one language's vector sidecar lives, and what produced it. */
export interface VectorArtifact {
  path: string;
  /** The embedding model this language was embedded with. */
  model: string;
  dtype: string;
  dims: number;
  count: number;
}

export interface LocalizationEntry {
  /** BCP-47 tag, or `und` for the undeclared bucket. */
  language: string;
  /** Documents in this language (sections excluded). */
  documents: number;
  search: SearchArtifact;
  /** Absent until `dockg embed` has run for this language. */
  vectors?: VectorArtifact;
}

export interface LocalizationsDoc {
  version: 1;
  /** One entry per language present, sorted by tag. */
  languages: LocalizationEntry[];
}

/** `search.de.json` — the lexical index for one language. */
export function searchIndexFilename(language: string): string {
  return `search.${language}.json`;
}

/** `vectors.de.bin` — the vector sidecar for one language. */
export function vectorIndexFilename(language: string): string {
  return `vectors.${language}.bin`;
}

/**
 * Serialize the manifest: sorted by language, two-space indent, trailing
 * newline — byte-stable like every other dockg artifact.
 */
export function emitLocalizations(doc: LocalizationsDoc): string {
  const languages = [...doc.languages].sort((a, b) =>
    byCodeUnit(a.language, b.language),
  );
  return `${JSON.stringify({ version: doc.version, languages }, null, 2)}\n`;
}

/** Parse and shape-check a manifest. Returns undefined for anything else. */
export function parseLocalizations(text: string): LocalizationsDoc | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const doc = parsed as LocalizationsDoc | null;
  if (!doc || doc.version !== 1 || !Array.isArray(doc.languages)) {
    return undefined;
  }
  return doc;
}
