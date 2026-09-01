/**
 * Link and image resolution, shared by every input-format analyzer.
 *
 * This is deliberately format-agnostic and deliberately shared. A link's
 * meaning must not depend on the syntax that expressed it: a relative target,
 * a site-root route, an anchor, an asset extension and a broken path all
 * resolve the same way whether they arrived from a Markdown `[]()`, an MDX
 * `href`, an HTML `<a>`, a DITA `<xref>` or an AsciiDoc cross-reference.
 * Reimplementing any of this per format would make `dcterms:references`
 * format-dependent and silently break cross-format links.
 */
import type { DocImage, DocLink } from "../../types.js";
import {
  DEFAULT_INDEX_FILES,
  DEFAULT_LINK_EXTENSIONS,
  type RouteMapping,
} from "../config.js";
import { normalizeDocPath } from "../iri.js";

/** True when the target has a URI scheme (http:, https:, mailto:, ...). */
export function hasScheme(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target);
}

/**
 * Resolve a relative link target against the linking doc's directory using
 * pure string math (posix, OS-independent). Returns null when the target
 * escapes the corpus root.
 */
export function resolveRelative(
  docPath: string,
  target: string,
): string | null {
  const baseSegments = normalizeDocPath(docPath).split("/").slice(0, -1);
  const segments = [...baseSegments];
  for (const part of target.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  return segments.join("/");
}

const HAS_EXTENSION = /\.[a-z0-9]+$/i;

/**
 * Whether a link target addresses a *document* at all (ADR 01033).
 *
 * An extension list declares what documents look like in a corpus. A target
 * carrying some other explicit extension — `/dockg/ns.ttl`, `./dist.zip`, a
 * linked PDF — is a static asset the site serves, not a document dockg failed
 * to find, and reporting it as a broken link produces a finding the author
 * cannot act on: there is no `.md` they could add to fix it.
 *
 * Extensionless and directory targets stay in scope, so a genuine typo in a
 * pretty URL is still caught.
 */
function addressesDocument(target: string, extensions: string[]): boolean {
  if (target === "" || !HAS_EXTENSION.test(target)) return true;
  // No configured extensions means the mapping has declared nothing about what
  // its documents look like — so there is no list to judge the target against,
  // and the narrowing does not apply. Gating on an empty list would answer "no"
  // to every extension-bearing target and skip genuinely broken `.md` links,
  // turning a narrowing into a way to switch the check off. `extensions: []` is
  // schema-valid (no minItems), so this is reachable config, not a theoretical.
  if (extensions.length === 0) return true;
  const ext = target.slice(target.lastIndexOf(".")).toLowerCase();
  return extensions.some((e) => e.toLowerCase() === ext);
}

/** Slug normalization for route matching: lowercase, dashes/underscores stripped. */
function slugNorm(path: string): string {
  return path.toLowerCase().replace(/[-_]/g, "");
}

/**
 * Tiered lookup over the corpus: exact path, then case-insensitive, then
 * slug-normalized (published slugs are often kebab-cased versions of
 * camelCase filenames, e.g. Fern's /stop-record for stopRecord.mdx).
 * Ambiguous fallback matches (two files normalizing identically) stay
 * unresolved rather than guessing.
 */
class PathIndex {
  private readonly lower = new Map<string, string | null>();
  private readonly slugged = new Map<string, string | null>();

  constructor(private readonly exact: ReadonlySet<string>) {
    for (const path of exact) {
      const lower = path.toLowerCase();
      this.lower.set(lower, this.lower.has(lower) ? null : path);
      const slug = slugNorm(path);
      this.slugged.set(slug, this.slugged.has(slug) ? null : path);
    }
  }

  resolve(candidate: string): string | undefined {
    if (this.exact.has(candidate)) return candidate;
    return (
      this.lower.get(candidate.toLowerCase()) ??
      this.slugged.get(slugNorm(candidate)) ??
      undefined
    );
  }
}

/** decodeURIComponent that falls back to the raw string on malformed input. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Candidate repo paths for an extensionless (or extension-bearing) link
 * target. Shared by route and relative resolution so both link forms resolve
 * identically: an explicit extension is taken verbatim; a trailing slash
 * prefers the directory's index files but falls back to extension candidates
 * (pretty URLs — Hugo/Docusaurus serve foo.md at /foo/); otherwise extensions
 * are tried before index files.
 */
function targetCandidates(
  target: string,
  isDirectory: boolean,
  extensions: string[],
  indexFiles: string[],
): string[] {
  if (target !== "" && HAS_EXTENSION.test(target)) return [target];
  const extensionCandidates =
    target === "" ? [] : extensions.map((ext) => `${target}${ext}`);
  const dir = target === "" ? "" : `${target}/`;
  const indexCandidates: string[] = [];
  for (const indexFile of indexFiles) {
    for (const ext of extensions)
      indexCandidates.push(`${dir}${indexFile}${ext}`);
  }
  return isDirectory
    ? [...indexCandidates, ...extensionCandidates]
    : [...extensionCandidates, ...indexCandidates];
}

/**
 * Resolve a root-absolute route (`/docs/actions/find`) to a source file via
 * the configured mappings. Returns the repo path, "broken" when a mapping's
 * basePath matched but no candidate file exists, or null when no mapping
 * covers the route.
 */
function resolveRoute(
  pathPart: string,
  routes: RouteMapping[],
  index: PathIndex,
): string | "broken" | null {
  const isDirectory = /\/+$/.test(pathPart);
  const clean = safeDecode(pathPart).replace(/\/+$/, "");
  let anyMatched = false;
  for (const mapping of routes) {
    if (
      clean !== mapping.basePath &&
      !clean.startsWith(`${mapping.basePath}/`)
    ) {
      continue;
    }
    // Matched the basePath, but this mapping's documents do not carry that
    // extension — so the mapping says nothing about this target. Leave
    // `anyMatched` alone: another mapping may still claim it, and if none
    // does the caller skips the link rather than calling it broken.
    const rest = clean.slice(mapping.basePath.length).replace(/^\/+/, "");
    if (!addressesDocument(rest, mapping.extensions)) continue;
    anyMatched = true;
    const prefix = mapping.root ? `${mapping.root}/` : "";
    // Bare basePath targets the root directory itself (index files only).
    const stem = rest === "" ? mapping.root : `${prefix}${rest}`;
    const candidates = targetCandidates(
      stem,
      isDirectory || rest === "",
      mapping.extensions,
      mapping.indexFiles,
    );
    for (const candidate of candidates) {
      const resolved = index.resolve(candidate);
      if (resolved) return resolved;
    }
  }
  return anyMatched ? "broken" : null;
}

/** One PathIndex per corpus set — analyzeDoc is called once per doc over the same set. */
const indexCache = new WeakMap<ReadonlySet<string>, PathIndex>();

function pathIndexFor(allPaths: ReadonlySet<string>): PathIndex {
  let index = indexCache.get(allPaths);
  if (!index) {
    index = new PathIndex(allPaths);
    indexCache.set(allPaths, index);
  }
  return index;
}

export function classifyLink(
  docPath: string,
  rawTarget: string,
  allPaths: ReadonlySet<string>,
  routes: RouteMapping[],
): DocLink | null {
  const raw = rawTarget;
  if (hasScheme(raw)) {
    try {
      return { raw, kind: "external", url: new URL(raw).href };
    } catch {
      // Scheme-bearing but unparseable — example junk, not a link. Skip.
      return null;
    }
  }
  const hashAt = raw.indexOf("#");
  const pathPart = hashAt === -1 ? raw : raw.slice(0, hashAt);
  const anchor = hashAt === -1 ? undefined : raw.slice(hashAt + 1);
  if (pathPart === "") return null; // same-document anchor
  // Site-root-absolute URLs (/docs/x/) are published-site routes. With route
  // mappings configured they resolve to source files (or count as broken when
  // a mapped basePath has no matching file); unmapped routes are skipped.
  if (pathPart.startsWith("/")) {
    const resolved = resolveRoute(pathPart, routes, pathIndexFor(allPaths));
    if (resolved === null) return null;
    if (resolved === "broken") return { raw, kind: "broken" };
    const link: DocLink = { raw, kind: "internal", resolvedPath: resolved };
    if (anchor) link.anchor = anchor;
    return link;
  }
  const resolved = resolveRelative(docPath, safeDecode(pathPart));
  if (resolved !== null) {
    const index = pathIndexFor(allPaths);
    let candidates: string[];
    if (allPaths.has(resolved)) {
      candidates = [resolved];
    } else if (HAS_EXTENSION.test(resolved)) {
      // Exact-or-broken — unless the extension is not a document extension at
      // all, in which case it is an asset and no document was ever addressed
      // (ADR 01033). Checked after `allPaths`, so an asset that IS in the
      // corpus still links.
      if (!addressesDocument(resolved, DEFAULT_LINK_EXTENSIONS)) return null;
      candidates = [];
    } else {
      candidates = targetCandidates(
        resolved,
        pathPart.endsWith("/"),
        DEFAULT_LINK_EXTENSIONS,
        DEFAULT_INDEX_FILES,
      );
    }
    for (const candidate of candidates) {
      const hit = index.resolve(candidate);
      if (hit) {
        const link: DocLink = { raw, kind: "internal", resolvedPath: hit };
        if (anchor) link.anchor = anchor;
        return link;
      }
    }
  }
  return { raw, kind: "broken" };
}

export function classifyImage(docPath: string, rawTarget: string): DocImage {
  if (hasScheme(rawTarget)) {
    return { raw: rawTarget, target: rawTarget, external: true };
  }
  const resolved = resolveRelative(docPath, rawTarget);
  return { raw: rawTarget, target: resolved ?? rawTarget, external: false };
}
