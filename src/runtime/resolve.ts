/**
 * Content resolution (ADR 01018): graph node → the text it stands for.
 *
 * The graph is an index over documents ([ADR 01008](../../adrs/01008-graph-as-index-not-corpus.md)),
 * so retrieval must go back to the source to get text. The seam is a
 * `ContentResolver`; the shipped implementation uses `fetch`, which works
 * unchanged in browsers and in Node ≥18, and is injectable for tests.
 *
 * Section nodes (`doc.md#slug`) resolve by fetching the parent document and
 * slicing it at the heading whose text matches the section's `dcterms:title`
 * — so no line-span predicates need to be added to the graph.
 *
 * Platform-neutral: no `node:` imports, no npm dependencies.
 */
import { NS } from "../core/vocab.js";
import type { GraphIndex } from "./graph.js";
import type { QueryTrace } from "./trace.js";

const DOCKG_PATH = `${NS.dockg}path`;
const DCTERMS_TITLE = `${NS.dcterms}title`;
const DOCKG_LEVEL = `${NS.dockg}level`;

export interface ResolvedContent {
  iri: string;
  text: string;
  sourceUrl: string;
  title?: string;
}

export interface ContentResolver {
  /** Text for a node, or undefined when the node has no content. */
  resolve(iri: string): Promise<ResolvedContent | undefined>;
}

type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface FetchResolverOptions {
  /** Prefix joined to each `dockg:path`, e.g. "https://site/raw/". */
  baseUrl?: string;
  /** Full control over path → URL. Overrides `baseUrl`. */
  pathToUrl?: (path: string) => string;
  /** Injectable fetch (defaults to the global). */
  fetch?: FetchLike;
  /** Record resolutions here. */
  trace?: QueryTrace;
}

/** Split a section IRI into its document IRI and fragment. */
export function splitFragment(iri: string): { doc: string; fragment?: string } {
  const hash = iri.indexOf("#");
  return hash < 0
    ? { doc: iri }
    : { doc: iri.slice(0, hash), fragment: iri.slice(hash + 1) };
}

/**
 * Mark every line that sits inside a fenced code block (including the fence
 * delimiters themselves). Without this, a shell comment in a code sample —
 * `# Set the API key` — reads as an h1 and truncates the surrounding section,
 * which silently drops most of the retrieved content.
 *
 * CommonMark rules, minus the ones a heading scan cannot observe: a fence opens
 * on 3+ backticks or tildes indented at most 3 spaces, a backtick fence's info
 * string may not contain a backtick, and it closes on a delimiter of the same
 * character that is at least as long and carries no info string. An unclosed
 * fence runs to end of document.
 */
function fencedLines(lines: string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  let open: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[i]!);
    if (open === undefined) {
      if (m && !(m[1]!.startsWith("`") && m[2]!.includes("`"))) {
        open = m[1]!;
        mask[i] = true;
      }
      continue;
    }
    mask[i] = true;
    if (
      m &&
      m[1]![0] === open[0] &&
      m[1]!.length >= open.length &&
      m[2]!.trim() === ""
    ) {
      open = undefined;
    }
  }
  return mask;
}

/**
 * Slice a markdown document at the heading whose text matches `title`,
 * returning that heading through to the next heading of the same or higher
 * rank. Returns undefined when no such heading exists. Handles CRLF, and
 * ignores `#` lines inside fenced code blocks.
 */
export function sliceSection(
  markdown: string,
  title: string,
  level?: number,
): string | undefined {
  const lines = markdown.split(/\r?\n/);
  const fenced = fencedLines(lines);
  const wanted = title.trim().toLowerCase();
  let start = -1;
  let startLevel = level ?? 0;

  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]!);
    if (!m) continue;
    const hLevel = m[1]!.length;
    if (m[2]!.trim().toLowerCase() !== wanted) continue;
    if (level !== undefined && hLevel !== level) continue;
    start = i;
    startLevel = hLevel;
    break;
  }
  if (start < 0) return undefined;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (fenced[i]) continue;
    const m = /^(#{1,6})\s+/.exec(lines[i]!);
    if (m && m[1]!.length <= startLevel) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trimEnd();
}

/**
 * A resolver that fetches document sources over HTTP. Documents map through
 * `dockg:path`; sections slice their parent document by heading.
 */
export function createFetchResolver(
  graph: GraphIndex,
  options: FetchResolverOptions = {},
): ContentResolver {
  const doFetch: FetchLike =
    options.fetch ?? ((url: string) => globalThis.fetch(url));
  const toUrl =
    options.pathToUrl ?? ((path: string) => `${options.baseUrl ?? ""}${path}`);
  const cache = new Map<string, Promise<string | undefined>>();

  const fetchDoc = (url: string): Promise<string | undefined> => {
    let pending = cache.get(url);
    if (!pending) {
      pending = doFetch(url)
        .then((r) => (r.ok ? r.text() : undefined))
        .catch(() => undefined);
      cache.set(url, pending);
    }
    return pending;
  };

  return {
    async resolve(iri: string): Promise<ResolvedContent | undefined> {
      const { doc, fragment } = splitFragment(iri);
      const path = graph.literal(doc, DOCKG_PATH);
      if (!path) return undefined;

      const sourceUrl = toUrl(path);
      const body = await fetchDoc(sourceUrl);
      const title = graph.literal(iri, DCTERMS_TITLE);

      if (body === undefined) {
        options.trace?.resolutions.push({
          iri,
          sourceUrl,
          ok: false,
          error: "fetch failed",
        });
        return undefined;
      }

      let text = body;
      if (fragment) {
        const levelText = graph.literal(iri, DOCKG_LEVEL);
        const level = levelText ? Number.parseInt(levelText, 10) : undefined;
        const slice =
          title === undefined
            ? undefined
            : sliceSection(
                body,
                title,
                Number.isNaN(level) ? undefined : level,
              );
        if (slice === undefined) {
          options.trace?.resolutions.push({
            iri,
            sourceUrl,
            ok: false,
            error: "section heading not found",
          });
          return undefined;
        }
        text = slice;
      }

      options.trace?.resolutions.push({ iri, sourceUrl, ok: true });
      return { iri, text, sourceUrl, title };
    },
  };
}
