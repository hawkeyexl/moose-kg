/**
 * `dockg build` refuses input formats it cannot analyze (ADR 01041).
 *
 * The regression under test is not a crash — it is a *success*. `analyzeDoc`
 * used to parse every extension as Markdown, so an HTML corpus built cleanly,
 * exited 0, and emitted a graph with no sections, no links and no images. The
 * numbers were not wrong about what dockg saw; they were wrong about the
 * corpus, and nothing in the output said so. Hence the assertion that matters
 * most here: **no graph file is written.**
 *
 * These fixtures also back the error transcripts quoted in
 * docs/src/content/docs/build/index.mdx, so the documented output is captured
 * rather than transcribed.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { hermeticEnv } from "../helpers/git-env.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(root, "dist", "cli.js");
const fixtures = join(root, "test", "fixtures", "formats");

/** Build one fixture corpus, writing the graph outside it. */
function build(fixture: string): {
  status: number | null;
  stderr: string;
  outPath: string;
} {
  const outPath = join(mkdtempSync(join(tmpdir(), "dockg-formats-")), "g.ttl");
  const run = spawnSync(process.execPath, [cli, "build", "--out", outPath], {
    encoding: "utf8",
    cwd: join(fixtures, fixture),
    env: hermeticEnv(),
  });
  return { status: run.status, stderr: run.stderr, outPath };
}

describe("dockg build over an unsupported input format", () => {
  it("exits 2 and names the format, instead of writing an empty graph", () => {
    const { status, stderr, outPath } = build("rst");
    // 2 is the operational-error code; 1 is reserved for findings.
    expect(status).toBe(2);
    expect(stderr).toContain(
      'The "rst" input format is not yet implemented (docutils is a Python library with no JavaScript equivalent; a subset parser is planned).',
    );
    expect(existsSync(outPath), "no graph should be written").toBe(false);
  });

  it("names the file when no analyzer claims the extension at all", () => {
    const { status, stderr, outPath } = build("unknown");
    expect(status).toBe(2);
    // The reader's next action is to fix the glob, so the message has to name
    // the file, its extension, and what the alternatives are.
    expect(stderr).toContain(
      'No input format is registered for docs/notes.txt (".txt") — narrow your inputs globs. Supported: .adoc, .asciidoc, .dita, .ditamap, .htm, .html, .markdown, .md, .mdx.',
    );
    expect(existsSync(outPath)).toBe(false);
  });

  it("still builds Markdown", () => {
    const { status, outPath } = build("markdown");
    expect(status).toBe(0);
    expect(existsSync(outPath)).toBe(true);
  });
});
