/**
 * The lexical search artifact (ADR 01019) — `kg/search.json`, a sibling of the
 * graph rather than prose inside it.
 *
 * The graph is an index, not a corpus (ADR 01008): sections carry only titles,
 * so a lexical index built from the graph alone cannot find anything a document
 * actually *says*. This module walks the built graph, reads each document's
 * markdown from disk (the same pattern the iiRDS projection uses for
 * renditions), and emits a deterministic JSON index the browser runtime loads in
 * one fetch.
 *
 * Granularity golden rule: a Section carries its own body slice; a Document
 * carries title + description, and body text *only* when it has no sections —
 * otherwise every document would shadow the sections inside it in the rankings.
 * Slicing reuses `sliceSection` from the runtime, so index-time and
 * retrieval-time slicing cannot drift.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compactIri } from "./load.js";
import { byCodeUnit } from "./sort.js";
import { NS } from "./vocab.js";
import type { GraphIndex } from "../runtime/graph.js";
import {
  documentPreamble,
  sectionOccurrences,
  sliceSection,
} from "../runtime/resolve.js";

const DOCKG_DOCUMENT = `${NS.dockg}Document`;
const DOCKG_SECTION = `${NS.dockg}Section`;
const SKOS_CONCEPT = `${NS.skos}Concept`;
const DOCKG_PATH = `${NS.dockg}path`;
const DOCKG_LEVEL = `${NS.dockg}level`;
const DCTERMS_TITLE = `${NS.dcterms}title`;
const DCTERMS_DESCRIPTION = `${NS.dcterms}description`;
const SKOS_PREF_LABEL = `${NS.skos}prefLabel`;
const SKOS_ALT_LABEL = `${NS.skos}altLabel`;

/** One indexable node. Empty fields are omitted so the artifact stays tight. */
export interface SearchEntry {
  /** Node IRI. */
  id: string;
  /** Compacted class IRI, e.g. `dockg:Section`. */
  type: string;
  title?: string;
  /** Space-joined alternative labels, deduped case-insensitively. */
  labels?: string;
  description?: string;
  /** Body text, per the granularity rule. */
  text?: string;
}

export interface SearchIndexDoc {
  version: 1;
  entries: SearchEntry[];
}

/** Conventional filename, written beside the graph. */
export const SEARCH_INDEX_FILENAME = "search.json";

export interface SearchIndexOptions {
  /** Read a document's source. Defaults to reading `cwd`-relative from disk. */
  readDoc?: (path: string) => string | undefined;
  /** Warnings channel (missing sources are non-fatal — the entry loses text). */
  warnings?: string[];
}

/** Space-join labels, dropping case-insensitive duplicates, sorted. */
function joinLabels(values: string[]): string | undefined {
  const seen = new Map<string, string>();
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, v.trim());
  }
  const out = [...seen.values()].sort(byCodeUnit);
  return out.length > 0 ? out.join(" ") : undefined;
}

/**
 * A leading YAML frontmatter block, and the blank lines after it.
 *
 * Only a document with *no* sections gets body text, and its body is the whole
 * file — frontmatter included, unless it is stripped here. That block is
 * machinery, not prose: left in, a query for `prefLabel` or `altLabels` matches
 * every sectionless document, and the artifact carries YAML nobody can read.
 * Section slices start at their heading, so they never see it.
 */
const FRONTMATTER =
  /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)(?:\r?\n)*/;

function stripFrontmatter(markdown: string): string {
  return markdown.replace(FRONTMATTER, "");
}

/** Drop undefined fields so entries serialize identically for equal inputs. */
function entry(
  id: string,
  type: string,
  fields: Omit<SearchEntry, "id" | "type">,
): SearchEntry {
  const out: SearchEntry = { id, type };
  if (fields.title !== undefined) out.title = fields.title;
  if (fields.labels !== undefined) out.labels = fields.labels;
  if (fields.description !== undefined) out.description = fields.description;
  if (fields.text !== undefined) out.text = fields.text;
  return out;
}

export function buildSearchIndex(
  graph: GraphIndex,
  cwd: string,
  options: SearchIndexOptions = {},
): SearchIndexDoc {
  const warnings = options.warnings ?? [];
  const readDoc =
    options.readDoc ??
    ((path: string): string | undefined => {
      const abs = resolve(cwd, path);
      return existsSync(abs) ? readFileSync(abs, "utf8") : undefined;
    });

  const entries: SearchEntry[] = [];
  const sourceOf = new Map<string, string | undefined>();

  // Group sections by their parent document once. Re-scanning every section per
  // document is quadratic across the corpus, and the section loop below needs
  // the same grouping anyway.
  const allSections = graph.instancesOf(DOCKG_SECTION);
  const sectionsOf = new Map<string, string[]>();
  for (const section of allSections) {
    const hash = section.indexOf("#");
    if (hash < 0) continue;
    const doc = section.slice(0, hash);
    const siblings = sectionsOf.get(doc);
    if (siblings) siblings.push(section);
    else sectionsOf.set(doc, [section]);
  }

  // Documents. Sections resolve their slice from the parent's source, so read
  // each document once and remember it.
  for (const doc of graph.instancesOf(DOCKG_DOCUMENT)) {
    const path = graph.literal(doc, DOCKG_PATH);
    const source = path === undefined ? undefined : readDoc(path);
    sourceOf.set(doc, source);
    if (path !== undefined && source === undefined) {
      warnings.push(
        `Source not found for ${path} — indexed without body text.`,
      );
    }

    // Granularity rule: a section owns its slice, so a document with sections
    // keeps only the prose that belongs to no section — the preamble before the
    // first heading. Without this, that text is indexed nowhere and is
    // unfindable. A document with no sections owns its whole body.
    const body = source === undefined ? undefined : stripFrontmatter(source);
    const text =
      body === undefined
        ? undefined
        : (sectionsOf.get(doc)?.length ?? 0) > 0
          ? documentPreamble(body)
          : body;

    entries.push(
      entry(doc, compactIri(DOCKG_DOCUMENT), {
        title: graph.literal(doc, DCTERMS_TITLE),
        description: graph.literal(doc, DCTERMS_DESCRIPTION),
        text,
      }),
    );
  }

  // Sections: title plus the slice of the parent document they own. Occurrences
  // are per-document, so compute each document's map once.
  const occurrencesOf = new Map<string, Map<string, number>>();
  for (const section of allSections) {
    const hash = section.indexOf("#");
    const doc = hash < 0 ? section : section.slice(0, hash);
    const title = graph.literal(section, DCTERMS_TITLE);
    const source = sourceOf.get(doc);
    const levelText = graph.literal(section, DOCKG_LEVEL);
    const parsed =
      levelText === undefined ? NaN : Number.parseInt(levelText, 10);
    const level = Number.isNaN(parsed) ? undefined : parsed;

    let occurrences = occurrencesOf.get(doc);
    if (!occurrences) {
      occurrences = sectionOccurrences(graph, doc);
      occurrencesOf.set(doc, occurrences);
    }

    // Heading text repeats (the corpus has two `## Install`), so the section's
    // occurrence disambiguates which slice is actually its own.
    const text =
      source !== undefined && title !== undefined
        ? sliceSection(source, title, level, occurrences.get(section) ?? 0)
        : undefined;

    entries.push(entry(section, compactIri(DOCKG_SECTION), { title, text }));
  }

  // Concepts: label surface only — they are index nodes with no body of their
  // own, but they are worth seeding from (concept → the documents about it).
  for (const concept of graph.instancesOf(SKOS_CONCEPT)) {
    const pref = graph.literals(concept, SKOS_PREF_LABEL);
    const alt = graph.literals(concept, SKOS_ALT_LABEL);
    entries.push(
      entry(concept, compactIri(SKOS_CONCEPT), {
        title: pref[0],
        labels: joinLabels([...pref, ...alt]),
      }),
    );
  }

  entries.sort((a, b) => byCodeUnit(a.id, b.id));
  return { version: 1, entries };
}

/** Serialize deterministically, with the trailing newline the other emitters use. */
export function emitSearchIndex(doc: SearchIndexDoc): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
