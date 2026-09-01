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

export class SectionBuilder {
  private readonly slugger = new GithubSlugger();
  private readonly sections: Section[] = [];
  /** Open ancestors, innermost last. */
  private readonly stack: Array<{ level: number; slug: string }> = [];
  /** Sibling counters keyed by parent slug ("" = the document itself). */
  private readonly childCount = new Map<string, number>();

  /**
   * Add one heading. `id` is the format's own anchor for it, when it has one.
   * Returns the section, whose `slug` is the disambiguated final value.
   */
  push(title: string, level: number, id?: string): Section {
    // `slug()` both normalizes and reserves, so an explicit id competes for
    // the same namespace as a generated one — a document with an explicit
    // `#install` and a later "Install" heading gets `install` and `install-1`,
    // never two nodes sharing an IRI.
    const slug = this.slugger.slug(id ?? title);
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
