#!/usr/bin/env node
// Verifies the invariants declared by docs/content_strategy/README.md.
//
// The strategy's value depends on two properties staying true as it is edited:
// every `aud-*`/`persona-*`/`cuj-*` reference resolves to a defined id, and
// personas and CUJs cover each other in both directions. Neither survives
// hand-maintenance across a growing set, so they are checked here instead.
//
// It also cross-checks the IA: every route a journey step names must be a page
// the content set plans, and every planned page must be reachable from some
// journey step — except the navigation-only pages listed in the gap analysis.
//
// Exit codes follow the repo contract: 0 clean, 1 findings, 2 operational.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse } from "yaml";

const STRATEGY_DIR = "docs/content_strategy";
const CONTENT_ROOT = "docs/src/content/docs";
const IA_FILE = `${STRATEGY_DIR}/information_architecture/proposed-ia.md`;

/** Pages that exist for navigation and are deliberately named by no journey.
 *  Kept in sync with the "Pages that map to no CUJ" table in the gap analysis. */
const NAVIGATION_ONLY = new Set([
  "/dockg/concepts/",
  "/dockg/reference/",
  "/dockg/reference/glossary/",
]);

/** Frontmatter fields whose values are ids and must therefore resolve. */
const ID_FIELDS = [
  "audience",
  "audiences",
  "personas",
  "journeys",
  "lenses",
  "overlaps",
  "anchors",
  "lens",
];

const findings = [];
const report = (file, message) =>
  findings.push(`${file.replace(/\\/g, "/")}: ${message}`);

function markdownFilesUnder(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return markdownFilesUnder(path);
    return path.endsWith(".md") ? [path] : [];
  });
}

function readDoc(file) {
  const raw = readFileSync(file, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    if (!file.endsWith("README.md")) report(file, "missing YAML frontmatter");
    return { file, raw, frontmatter: {} };
  }
  try {
    return { file, raw, frontmatter: parse(match[1]) ?? {} };
  } catch (error) {
    report(file, `unparseable frontmatter: ${error.message}`);
    return { file, raw, frontmatter: {} };
  }
}

/** Routes the content-set tables in proposed-ia.md plan, e.g. `/dockg/build/routes/`. */
function plannedRoutes() {
  const planned = new Set();
  let directory = null;
  for (const line of readFileSync(IA_FILE, "utf8").split(/\r?\n/)) {
    if (/^### Landing\b/.test(line)) directory = "";
    const group = line.match(/^### .*\(`([a-z-]+)\/`\)/);
    if (group) directory = group[1];
    const page = line.match(/^\| `([a-z0-9-]+)\.mdx` \|/);
    if (!page || directory === null) continue;
    const base = directory ? `/dockg/${directory}/` : "/dockg/";
    planned.add(page[1] === "index" ? base : `${base}${page[1]}/`);
  }
  return planned;
}

/** A site route resolves to `<page>.mdx` or `<page>/index.mdx` under the content root. */
function routeResolves(route) {
  const stem = join(
    CONTENT_ROOT,
    route.replace(/^\/dockg\//, "").replace(/\/$/, ""),
  );
  return existsSync(`${stem}.mdx`) || existsSync(`${stem}/index.mdx`);
}

if (!existsSync(STRATEGY_DIR)) {
  console.error(`dockg: ${STRATEGY_DIR} not found`);
  process.exit(2);
}

const docs = markdownFilesUnder(STRATEGY_DIR).map(readDoc);

// --- Declared ids -----------------------------------------------------------
const declared = new Map();
for (const doc of docs) {
  const { id } = doc.frontmatter;
  if (!id) continue;
  if (declared.has(id)) report(doc.file, `duplicate id: ${id}`);
  declared.set(id, doc);
}

// --- Anchor integrity -------------------------------------------------------
for (const doc of docs) {
  for (const field of ID_FIELDS) {
    const value = doc.frontmatter[field];
    if (value == null) continue;
    for (const ref of Array.isArray(value) ? value : [value]) {
      if (!declared.has(ref))
        report(doc.file, `${field}: dangling id "${ref}"`);
    }
  }
  for (const [, ref] of doc.raw.matchAll(
    /`((?:aud|persona|cuj)-[a-z0-9-]+)`/g,
  )) {
    if (!declared.has(ref))
      report(doc.file, `prose reference to dangling id "${ref}"`);
  }
}

// --- Mutual persona <-> CUJ coverage ----------------------------------------
const byType = (type) =>
  [...declared.values()].filter((d) => d.frontmatter.type === type);
const personas = byType("persona");
const cujs = byType("cuj");
const personasNamedByCujs = new Set(
  cujs.flatMap((c) => c.frontmatter.personas ?? []),
);

for (const persona of personas) {
  const { id, journeys = [] } = persona.frontmatter;
  if (!journeys.length) report(persona.file, "persona has no journeys[]");
  if (!personasNamedByCujs.has(id)) report(persona.file, `no CUJ names ${id}`);
  for (const journey of journeys) {
    const cuj = declared.get(journey);
    if (cuj && !(cuj.frontmatter.personas ?? []).includes(id))
      report(
        persona.file,
        `claims ${journey}, but ${journey} does not name ${id}`,
      );
  }
}

for (const cuj of cujs) {
  const { id, personas: named = [] } = cuj.frontmatter;
  if (!named.length) report(cuj.file, "CUJ has no personas[]");
  for (const personaId of named) {
    const persona = declared.get(personaId);
    if (persona?.frontmatter.type !== "persona") continue;
    if (!(persona.frontmatter.journeys ?? []).includes(id))
      report(
        cuj.file,
        `names ${personaId}, but ${personaId} does not list ${id}`,
      );
  }
}

// --- CUJ steps --------------------------------------------------------------
const referencedRoutes = new Set();
for (const cuj of cujs) {
  const steps = cuj.frontmatter.steps ?? [];
  if (!steps.length) report(cuj.file, "CUJ has no steps[]");
  for (const [i, step] of steps.entries()) {
    if (!step.stage) report(cuj.file, `step ${i}: missing stage`);
    if (!step.doc) {
      report(cuj.file, `step ${i}: missing doc`);
      continue;
    }
    referencedRoutes.add(step.doc);
    if (typeof step.exists !== "boolean" && step.exists !== "partial")
      report(cuj.file, `step ${i}: exists must be true, false, or partial`);
    if (step.exists === false && !/\[GAP\]/.test(step.note ?? ""))
      report(cuj.file, `step ${i}: exists:false needs a [GAP] note`);
    if (step.exists === true && !routeResolves(step.doc))
      report(
        cuj.file,
        `step ${i}: exists:true but ${step.doc} resolves to no file`,
      );
  }
}

// --- Relative links ---------------------------------------------------------
for (const doc of docs) {
  for (const [, href] of doc.raw.matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
    if (/^https?:/.test(href)) continue;
    if (!existsSync(resolve(dirname(doc.file), href)))
      report(doc.file, `broken relative link: ${href}`);
  }
}

// --- IA cross-check ---------------------------------------------------------
const planned = plannedRoutes();
for (const route of referencedRoutes) {
  if (!planned.has(route))
    report(IA_FILE, `journey step names ${route}, which the IA does not plan`);
}
for (const route of planned) {
  if (!referencedRoutes.has(route) && !NAVIGATION_ONLY.has(route))
    report(IA_FILE, `plans ${route}, which no journey step reaches`);
}

// --- Report -----------------------------------------------------------------
console.log(
  `${docs.length} files · ${declared.size} ids · ${personas.length} personas · ` +
    `${cujs.length} CUJs · ${referencedRoutes.size}/${planned.size} planned routes reached`,
);
if (findings.length) {
  console.error(`\n${findings.length} finding(s):`);
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(
  "Content strategy OK: anchors resolve, coverage is mutual, IA agrees.",
);
