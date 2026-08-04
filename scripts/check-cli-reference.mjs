#!/usr/bin/env node
// Asserts docs/src/content/docs/reference/cli.mdx documents exactly the command
// surface commander knows about.
//
// Descriptions stay hand-written — prose is not machine-checkable and should not
// be. What is checked is the part that silently rots: which commands exist, what
// arguments they take, and which options they accept. Adding a flag without
// documenting it fails here rather than in a user's terminal.
//
// Reads the built CLI, which is importable without executing because src/cli.ts
// guards `program.parse()` behind an entry-point check.
//
// Exit codes follow the repo contract: 0 in sync, 1 drift, 2 operational.

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const CLI = "dist/cli.js";
const PAGE = "docs/src/content/docs/reference/cli.mdx";

/** Options every command inherits and the page does not repeat per command. */
const IMPLICIT = new Set(["-h, --help"]);

if (!existsSync(CLI)) {
  console.error(`dockg: ${CLI} not found — run \`npm run build\` first`);
  process.exit(2);
}
if (!existsSync(PAGE)) {
  console.error(`dockg: ${PAGE} not found`);
  process.exit(2);
}

const { program } = await import(pathToFileURL(CLI).href);
if (!program) {
  console.error(`dockg: ${CLI} does not export \`program\``);
  process.exit(2);
}

/** What commander actually knows, keyed by command name. */
function actualSurface() {
  const surface = new Map();
  for (const cmd of program.commands) {
    if (cmd.name() === "help") continue;
    surface.set(cmd.name(), {
      args: cmd.registeredArguments.map((a) => a.name()),
      options: cmd.options
        .map((o) => o.flags)
        .filter((flags) => !IMPLICIT.has(flags)),
    });
  }
  return surface;
}

/**
 * What the page documents. Each command is a `## \`name\`` section; its tables
 * carry one backticked identifier in the first cell of each row.
 */
function documentedSurface() {
  const lines = readFileSync(PAGE, "utf8").split(/\r?\n/);
  const surface = new Map();
  let command = null;
  let table = null;

  for (const line of lines) {
    const heading = line.match(/^## `([a-z]+)`\s*$/);
    if (heading) {
      command = heading[1];
      table = null;
      surface.set(command, { args: [], options: [] });
      continue;
    }
    if (/^## /.test(line)) {
      command = null;
      table = null;
      continue;
    }
    if (!command) continue;

    if (/^### Arguments\s*$/.test(line)) table = "args";
    else if (/^### Options\s*$/.test(line)) table = "options";
    else if (/^### /.test(line)) table = null;
    if (!table) continue;

    // `| \`-c, --config <path>\` | description |` — take the first cell only.
    const row = line.match(/^\|\s*`([^`]+)`\s*\|/);
    if (row) surface.get(command)[table].push(row[1]);
  }
  return surface;
}

const actual = actualSurface();
const documented = documentedSurface();
const findings = [];

for (const name of actual.keys()) {
  if (!documented.has(name))
    findings.push(`command \`${name}\` is not documented`);
}
for (const name of documented.keys()) {
  if (!actual.has(name))
    findings.push(`documented command \`${name}\` does not exist`);
}

for (const [name, real] of actual) {
  const docs = documented.get(name);
  if (!docs) continue;
  for (const kind of ["args", "options"]) {
    const missing = real[kind].filter((x) => !docs[kind].includes(x));
    const extra = docs[kind].filter((x) => !real[kind].includes(x));
    for (const m of missing)
      findings.push(`${name}: ${kind.slice(0, -1)} \`${m}\` is not documented`);
    for (const e of extra)
      findings.push(
        `${name}: documented ${kind.slice(0, -1)} \`${e}\` does not exist`,
      );
  }
}

const optionCount = [...actual.values()].reduce(
  (n, c) => n + c.options.length,
  0,
);
console.log(
  `${actual.size} commands · ${optionCount} options checked against ${PAGE}`,
);

if (findings.length) {
  console.error(`\n${findings.length} drift finding(s):`);
  for (const f of findings) console.error(`  ${f}`);
  console.error(`\nUpdate ${PAGE} to match the CLI.`);
  process.exit(1);
}

console.log("CLI reference is in sync.");
