import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(root, "dist", "cli.js");

/**
 * Run the built CLI; returns { stdout, stderr, status }. Never throws on
 * nonzero exit. stderr is captured because dockg's error messages go there —
 * a test that can only see stdout can assert an exit code but not the reason.
 */
export function runCli(args: string[], opts: { cwd?: string } = {}) {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      cwd: opts.cwd ?? root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout, stderr: "", status: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      status: err.status ?? -1,
    };
  }
}

describe("dockg CLI", () => {
  it("--help exits 0 and names the tool", () => {
    const { stdout, status } = runCli(["--help"]);
    expect(status).toBe(0);
    expect(stdout).toContain("dockg");
  });

  it("--version exits 0", () => {
    const { status } = runCli(["--version"]);
    expect(status).toBe(0);
  });
});

describe("numeric options are range-checked", () => {
  // Every count-like flag, not just the ones a fill run happens to read. A raw
  // `Number.parseInt` accepts `abc` as NaN and `-1` as a negative count; both
  // then flow into a command core with no defence against either.
  //
  // Each case asserts the MESSAGE, not just exit 2. Run from the repo root
  // these commands exit 2 anyway — on a missing graph or search index — so a
  // status-only assertion would pass without the range check existing at all.
  const cases: Array<[string, string[], string]> = [
    ["a negative --top", ["stats", "--top", "-1"], "--top must be >= 1"],
    [
      "a non-numeric --top",
      ["stats", "--top", "abc"],
      "--top expects a number",
    ],
    [
      "a fractional --top",
      ["stats", "--top", "2.5"],
      "--top expects a whole number",
    ],
    ["a zero --limit", ["search", "q", "--limit", "0"], "--limit must be >= 1"],
    [
      "a negative --depth",
      ["traverse", "x", "--depth", "-2"],
      "--depth must be >= 0",
    ],
    [
      "a non-numeric traverse --limit",
      ["traverse", "x", "--limit", "abc"],
      "--limit expects a number",
    ],
    [
      "a --min-confidence above 1",
      ["fill", "--min-confidence", "5"],
      "--min-confidence must be 0..1",
    ],
    [
      "a negative --max-cost",
      ["fill", "--max-cost", "-1"],
      "--max-cost must be >= 0",
    ],
  ];
  for (const [name, args, message] of cases) {
    it(`refuses ${name}`, () => {
      const { status, stderr } = runCli(args);
      expect(stderr, `stderr was: ${stderr}`).toContain(message);
      // Operational error, not a finding.
      expect(status).toBe(2);
    });
  }

  it("allows --depth 0, which means the node itself", () => {
    // The guard must not turn a meaningful value into an error. This gets as
    // far as the graph lookup, which is proof the parser let it through.
    const { stderr } = runCli(["traverse", "x", "--depth", "0"]);
    expect(stderr).not.toContain("--depth");
  });
});
