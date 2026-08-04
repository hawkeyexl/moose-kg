import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(root, "dist", "cli.js");
const contentRoot = join(root, "docs", "src", "content", "docs");

interface Step {
  description: string;
  runShell: {
    command: string;
    exitCodes?: number[];
    stdout?: string;
    stderr?: string;
  };
}

interface InlineTest {
  page: string;
  testId: string;
  steps: Step[];
}

function mdxFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return mdxFilesUnder(path);
    return path.endsWith(".mdx") ? [path] : [];
  });
}

/**
 * Parse the trailing Doc Detective blocks out of every page.
 *
 * The blocks are the single source of truth for what the docs claim: Doc
 * Detective reads them in its own workflow, and this test reads the same bytes.
 * It exists because Doc Detective's inline runner silently executed only a
 * subset of the declared steps — a gate whose coverage cannot be accounted for
 * is not a gate. Here every declared step runs, and the count is asserted.
 */
function inlineTests(): InlineTest[] {
  const tests: InlineTest[] = [];
  for (const file of mdxFilesUnder(contentRoot)) {
    const raw = readFileSync(file, "utf8");
    const testMatch = raw.match(/\{\/\* test (\{.*?\}) \*\/\}/s);
    if (!testMatch) continue;
    const steps = [...raw.matchAll(/\{\/\* step (\{.*?\}) \*\/\}/g)].map(
      (m) => JSON.parse(m[1]!) as Step,
    );
    tests.push({
      page: file.slice(contentRoot.length + 1).replace(/\\/g, "/"),
      testId: (JSON.parse(testMatch[1]!) as { testId: string }).testId,
      steps,
    });
  }
  return tests.sort((a, b) => (a.page < b.page ? -1 : 1));
}

/**
 * Run a documented command against the built CLI.
 *
 * Pages show the published `dockg …` form; here it is rewritten to the local
 * build so the gate needs no `npm link`. Doc Detective's own run exercises the
 * published form via the link (.github/workflows/doc-detective.yml).
 */
function run(command: string) {
  const argv = command.trim().split(/\s+/);
  expect(argv[0]).toBe("dockg");
  try {
    const stdout = execFileSync(process.execPath, [cli, ...argv.slice(1)], {
      encoding: "utf8",
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return {
      code: err.status ?? 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
}

const tests = inlineTests();

describe("documented claims (Doc Detective inline blocks)", () => {
  mkdirSync(join(root, ".tmp", "dd"), { recursive: true });

  it("finds an inline test block on every page that carries one", () => {
    // Guards against a rename or a stray edit quietly emptying the gate.
    expect(tests.length).toBeGreaterThanOrEqual(7);
    expect(tests.flatMap((t) => t.steps).length).toBeGreaterThanOrEqual(33);
  });

  for (const t of tests) {
    describe(`${t.page} (${t.testId})`, () => {
      for (const [i, step] of t.steps.entries()) {
        it(`step ${i}: ${step.description}`, () => {
          const { command, exitCodes = [0], stdout, stderr } = step.runShell;
          const result = run(command);
          expect(
            exitCodes,
            `${command}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
          ).toContain(result.code);
          if (stdout) expect(result.stdout).toContain(stdout);
          if (stderr) expect(result.stderr).toContain(stderr);
        });
      }
    });
  }
});
