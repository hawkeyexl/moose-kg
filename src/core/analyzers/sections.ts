/**
 * Section bookkeeping, shared by every input-format analyzer.
 *
 * Sections are a tree flattened into a list, and three things about that
 * flattening are contract, not detail: `parentSlug` comes from a level stack,
 * `order` is 1-based among siblings *under the same parent*, and repeated
 * headings disambiguate to `install`, `install-1`, ... Every format has to
 * agree on all three, or a section IRI means something different depending on
 * the syntax that produced it.
 *
 * Formats differ only in where the slug comes from. Markdown has no anchor
 * syntax, so it slugs the title; HTML, DITA and AsciiDoc carry explicit ids,
 * which are what an anchor link in the same corpus actually targets — so
 * `push` takes an optional `id` and falls back to slugging when there is none.
 * Explicit ids still go through the disambiguator, because nothing guarantees
 * a source document's ids are unique.
 */
import GithubSlugger from "github-slugger";
import type { Section } from "../../types.js";

/**
 * Ids that go into a section IRI unchanged.
 *
 * `mintSectionIri` does not percent-encode — it has always relied on the slug
 * already being safe — so an id is only preserved verbatim when it is made of
 * characters an IRI fragment accepts as-is. That is exactly the XML NCName
 * charset plus `:`, which covers what HTML, DITA and AsciiDoc actually put in
 * an `id`: `GUID-A1B2-C3D4`, `Install.SDK`, `_verify`, `sect_1`. Anything
 * stranger (a space, a quote, non-ASCII) falls back to slugging, which is
 * lossy for matching but keeps the output parseable.
 */
const IRI_SAFE_ID = /^[A-Za-z0-9._:~-]+$/;

export class SectionBuilder {
  private readonly slugger = new GithubSlugger();
  private readonly sections: Section[] = [];
  /** Open ancestors, innermost last. */
  private readonly stack: Array<{ level: number; slug: string }> = [];
  /** Sibling counters keyed by parent slug ("" = the document itself). */
  private readonly childCount = new Map<string, number>();
  /**
   * Every slug already handed out, so an explicit id and a slugged title
   * compete for one namespace and can never collide into a shared IRI.
   */
  private readonly used = new Set<string>();

  /** Claim `candidate`, suffixing `-1`, `-2`, ... until it is free. */
  private reserve(candidate: string): string {
    let slug = candidate;
    for (let n = 1; this.used.has(slug); n++) slug = `${candidate}-${n}`;
    this.used.add(slug);
    return slug;
  }

  /**
   * Add one heading. `id` is the format's own anchor for it, when it has one.
   * Returns the section, whose `slug` is the disambiguated final value.
   */
  push(title: string, level: number, id?: string): Section {
    // An explicit id is preserved **verbatim**, case and dots included,
    // because `derive` matches a link's anchor against this slug with `===`.
    // Slugging it would lowercase `#GUID-A1B2-C3D4` — the standard DITA id
    // convention — into `guid-a1b2-c3d4`, so every xref to it would silently
    // degrade from a section edge to a document edge, with `stats` reporting
    // no broken link because nothing is broken, only imprecise. That is the
    // very failure preferring the id over the title was meant to avoid.
    const slug =
      id !== undefined && IRI_SAFE_ID.test(id)
        ? this.reserve(id)
        : this.reserve(this.slugger.slug(id ?? title));
    while (
      this.stack.length > 0 &&
      this.stack[this.stack.length - 1]!.level >= level
    ) {
      this.stack.pop();
    }
    const parentSlug =
      this.stack.length > 0 ? this.stack[this.stack.length - 1]!.slug : null;
    const parentKey = parentSlug ?? "";
    const order = (this.childCount.get(parentKey) ?? 0) + 1;
    this.childCount.set(parentKey, order);
    const section: Section = { slug, title, level, order, parentSlug };
    this.sections.push(section);
    this.stack.push({ level, slug });
    return section;
  }

  /** The sections, in document order. */
  build(): Section[] {
    return this.sections;
  }
}
