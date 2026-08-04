import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

/**
 * The nav is the information architecture, and the IA is CUJ-first: group
 * labels name what the reader is trying to do, not what kind of document they
 * are about to read. See docs/content_strategy/information_architecture/.
 *
 * Every group autogenerates from a directory, so there is no hand-maintained
 * page list here to drift. Labels are journey-voiced while directories stay
 * short and URL-friendly ("Govern it in CI" -> govern/), and each directory's
 * index.mdx doubles as the group's landing page and journey hub.
 */
export default defineConfig({
  site: "https://hawkeyexl.github.io",
  base: "/dockg",
  integrations: [
    starlight({
      title: "dockg",
      description:
        "Deterministic knowledge graphs derived from documentation frontmatter and formatting.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/hawkeyexl/dockg",
        },
      ],
      sidebar: [
        {
          label: "Get started",
          items: [{ autogenerate: { directory: "get-started" } }],
        },
        {
          label: "Understand the model",
          items: [{ autogenerate: { directory: "concepts" } }],
        },
        {
          label: "Build your graph",
          items: [{ autogenerate: { directory: "build" } }],
        },
        {
          label: "Model your metadata",
          items: [{ autogenerate: { directory: "model" } }],
        },
        {
          label: "Govern it in CI",
          items: [{ autogenerate: { directory: "govern" } }],
        },
        {
          label: "Retrieve & export",
          items: [{ autogenerate: { directory: "retrieve" } }],
        },
        {
          label: "Fix a failing check",
          items: [{ autogenerate: { directory: "fix" } }],
        },
        {
          label: "Reference",
          items: [{ autogenerate: { directory: "reference" } }],
        },
      ],
    }),
  ],
});
