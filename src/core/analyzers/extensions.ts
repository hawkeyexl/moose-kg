/**
 * What a *document* looks like, for link resolution.
 *
 * Two things read this list. `addressesDocument` uses it to tell a broken
 * document link from a link to a static asset (ADR 01033) — a `.zip` or a
 * `.ttl` is not a document dockg failed to find. `targetCandidates` uses it to
 * expand an extensionless pretty URL (`/docs/install/` → `install.md`).
 *
 * It is a leaf module on purpose: `links.ts` and `config.ts` both need it, and
 * both are imported by the analyzers, so deriving it from the registry would
 * close an import cycle. The order is deliberate rather than sorted — it is
 * candidate precedence, and Markdown has to stay ahead of HTML so a corpus
 * carrying both `install.md` and a built `install.html` resolves to the source.
 *
 * `analyzers.test.ts` asserts this agrees with the registry's implemented set,
 * which is what keeps the two from drifting as formats land.
 */
export const DOCUMENT_EXTENSIONS: readonly string[] = [
  ".md",
  ".markdown",
  ".mdx",
  ".html",
  ".htm",
  ".dita",
  ".ditamap",
];
