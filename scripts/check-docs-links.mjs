#!/usr/bin/env node
// Verifies that every internal link in the docs site resolves to a built page.
//
// Starlight does not fail a build on a dead internal link, and the IA is
// deliberately cross-linked — guides point into reference, journeys hand off to
// each other — so a page that has not been written yet is the most likely way
// this set breaks. Run it against docs/dist after `npm run docs:build`.
//
// Exit codes follow the repo contract: 0 clean, 1 findings, 2 operational.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = "docs/src/content/docs";
const DIST = "docs/dist";
const BASE = "/moose-kg/";

function filesUnder(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/** A site route is built as `<route>/index.html`, with the root as `index.html`. */
function routeIsBuilt(href) {
  const rel = href.slice(BASE.length).replace(/\/$/, "");
  return existsSync(
    rel === "" ? join(DIST, "index.html") : join(DIST, rel, "index.html"),
  );
}

if (!existsSync(DIST)) {
  console.error(
    `moose-kg: ${DIST} not found — run \`npm run docs:build\` first`,
  );
  process.exit(2);
}

const unresolved = new Map();
const pages = filesUnder(SRC).filter((f) => /\.mdx?$/.test(f));
let checked = 0;

for (const file of pages) {
  const raw = readFileSync(file, "utf8");
  // Matches both Markdown `](/moose-kg/…)` and JSX `href="/moose-kg/…"`.
  for (const [, href] of raw.matchAll(/["(](\/moose-kg\/[^"()\s#]*)/g)) {
    checked += 1;
    if (routeIsBuilt(href)) continue;
    const source = relative(SRC, file).replace(/\\/g, "/");
    unresolved.set(href, [
      ...new Set([...(unresolved.get(href) ?? []), source]),
    ]);
  }
}

console.log(`${checked} internal links checked across ${pages.length} files`);

// A gate that checks nothing passes silently. The most likely cause is the site
// `base` changing in docs/astro.config.mjs without BASE here following it, which
// would make every link stop matching rather than start failing.
if (checked === 0) {
  console.error(
    `moose-kg: no links matching ${BASE} found — is the site base still "${BASE.replace(/\/$/, "")}"?`,
  );
  process.exit(2);
}

if (unresolved.size) {
  console.error(`\n${unresolved.size} unresolved target(s):`);
  for (const [href, sources] of [...unresolved].sort()) {
    console.error(`  ${href}`);
    console.error(`      linked from: ${sources.join(", ")}`);
  }
  process.exit(1);
}

console.log("All internal links resolve.");
