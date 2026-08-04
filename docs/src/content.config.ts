import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

/**
 * Deliberately unextended. Frontmatter completeness (`title` + `description` on
 * every page) is enforced *outside* the build, by running dockg's own validate
 * against docs/doc-frontmatter.schema.json in .github/workflows/docs.yml —
 * dogfooding the product on its own documentation. Encoding the same rule as a
 * Zod extension here would duplicate it in a place the tool cannot check.
 */
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
