#!/usr/bin/env node
// Guards the Doc Detective inline tests against silently doing nothing.
//
// Doc Detective drops a step that fails its `step_v3` schema: it logs a warning
// and carries on, so the run still reports success while testing far less than
// it appears to. That is not hypothetical — 22 of this repo's 33 steps were
// dropped that way, because `runShell` takes a single `stdio` field (matching
// stdout or stderr) and is `additionalProperties: false`, while the steps had
// been written with `stdout`/`stderr`. Every reported item passed and two thirds
// of the suite never ran.
//
// A green Doc Detective run is therefore not sufficient on its own. Run this
// straight after it: it compares the steps the pages declare against the steps
// the run actually executed, and fails when they disagree. That catches a
// silent skip whatever its cause, not only a schema-invalid step.
//
// Usage:  npx doc-detective --exit-on-fail && node scripts/check-doc-tests.mjs
//
// Exit codes follow the repo contract: 0 clean, 1 findings, 2 operational.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CONTENT_ROOT = "docs/src/content/docs";
const RESULTS_DIR = ".tmp/doc-detective/results";

function mdxFilesUnder(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return mdxFilesUnder(path);
    return path.endsWith(".mdx") ? [path] : [];
  });
}

/** What the pages declare: one entry per `{/* step … *\/}` block. */
function declaredSteps() {
  const declared = new Map();
  for (const file of mdxFilesUnder(CONTENT_ROOT)) {
    const raw = readFileSync(file, "utf8");
    const count = (raw.match(/\{\/\* step /g) ?? []).length;
    if (count) declared.set(file.replace(/\\/g, "/"), count);
  }
  return declared;
}

/** What the most recent run actually executed, keyed by source file. */
function executedSteps() {
  if (!existsSync(RESULTS_DIR)) {
    console.error(
      `dockg: ${RESULTS_DIR} not found — run \`npx doc-detective\` first`,
    );
    process.exit(2);
  }
  const latest = readdirSync(RESULTS_DIR)
    .filter((f) => f.startsWith("testResults") && f.endsWith(".json"))
    .sort()
    .pop();
  if (!latest) {
    console.error(`dockg: no testResults file in ${RESULTS_DIR}`);
    process.exit(2);
  }
  const results = JSON.parse(readFileSync(join(RESULTS_DIR, latest), "utf8"));
  const executed = new Map();
  const failed = [];
  for (const spec of results.specs ?? []) {
    const path = String(spec.specId ?? spec.contentPath ?? "").replace(
      /\\/g,
      "/",
    );
    let steps = 0;
    for (const test of spec.tests ?? []) {
      for (const ctx of test.contexts ?? []) {
        for (const step of ctx.steps ?? []) {
          steps += 1;
          // A non-PASS step is a documentation defect, but the CLI exits 0
          // unless --exit-on-fail is passed. Belt and braces: this script is
          // the one place that has to be right, so it checks results too.
          if (step.result !== "PASS") {
            failed.push(
              `${path}: ${step.result ?? "NO RESULT"} — ${step.description ?? step.stepId}` +
                (step.resultDescription
                  ? `\n      ${step.resultDescription}`
                  : ""),
            );
          }
        }
      }
    }
    executed.set(path, (executed.get(path) ?? 0) + steps);
  }
  return { executed, failed };
}

const declared = declaredSteps();
if (!declared.size) {
  console.error(`dockg: no inline steps found under ${CONTENT_ROOT}`);
  process.exit(2);
}

const { executed, failed } = executedSteps();
const findings = [...failed];

for (const [file, count] of declared) {
  // Results identify a spec by a path that may be absolute or repo-relative.
  const key = [...executed.keys()].find((k) => k.endsWith(file));
  const ran = key === undefined ? 0 : executed.get(key);
  if (ran === count) continue;
  findings.push(
    ran < count
      ? `${file}: declares ${count} step(s), ${ran} ran — ${count - ran} skipped without failing the run`
      : `${file}: declares ${count} step(s) but ${ran} ran`,
  );
}

const totalDeclared = [...declared.values()].reduce((a, b) => a + b, 0);
const totalExecuted = [...executed.values()].reduce((a, b) => a + b, 0);
console.log(
  `${declared.size} pages · ${totalDeclared} steps declared · ${totalExecuted} executed`,
);

if (findings.length) {
  console.error(`\n${findings.length} finding(s):`);
  for (const f of findings) console.error(`  ${f}`);
  console.error(
    "\nA failing step means a page documents output the CLI no longer produces —" +
      "\nre-capture it by running the built binary against the fixture." +
      "\n\nA *missing* step is different: Doc Detective skips a step it cannot parse," +
      "\nsilently. The usual cause is a property the runShell schema does not define" +
      "\n— output is asserted with `stdio` (matching stdout or stderr), never" +
      "\n`stdout`/`stderr`.",
  );
  process.exit(1);
}

console.log("Every declared step ran, and every one passed.");
