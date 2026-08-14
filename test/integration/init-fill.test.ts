import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(root, "dist", "cli.js");

function run(args: string[], cwd: string): { stdout: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      cwd,
    });
    return { stdout, status: 0 };
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    return { stdout: err.stdout ?? "", status: err.status ?? -1 };
  }
}

describe("moose-kg init", () => {
  it("scaffolds a valid config and refuses to overwrite", () => {
    const dir = mkdtempSync(join(tmpdir(), "moose-kg-init-"));
    const first = run(["init"], dir);
    expect(first.status).toBe(0);
    expect(existsSync(join(dir, "moose.config.yaml"))).toBe(true);

    // scaffolded config parses: build against it (with a doc present)
    writeFileSync(join(dir, "docs.md"), "# Hi\n");
    const build = run(["build", "docs.md", "--out", join(dir, "g.ttl")], dir);
    expect(build.status).toBe(0);

    const second = run(["init"], dir);
    expect(second.status).toBe(2);
  });

  /**
   * moose.config.yaml belongs to the whole moose tool family, so "the file
   * exists" is not "moose-kg is configured". A repo running another moose tool
   * must be able to add a `kg:` section without losing its existing config.
   */
  it("extends a shared config that has no kg section, preserving siblings", () => {
    const dir = mkdtempSync(join(tmpdir(), "moose-kg-initshared-"));
    const path = join(dir, "moose.config.yaml");
    const sibling = "# owned by moose-lint\nlint:\n  rules: [no-passive]\n";
    writeFileSync(path, sibling);

    const { stdout, status } = run(["init"], dir);
    expect(status).toBe(0);
    expect(stdout).toContain("Added a `kg:` section");

    const after = readFileSync(path, "utf8");
    // The sibling section survives verbatim, comment included.
    expect(after.startsWith(sibling)).toBe(true);
    expect(after).toContain("\nkg:\n");

    // And the result is a config moose-kg can actually build against.
    writeFileSync(join(dir, "docs.md"), "# Hi\n");
    expect(
      run(["build", "docs.md", "--out", join(dir, "g.ttl")], dir).status,
    ).toBe(0);
  });

  it("refuses a config that already has a kg section", () => {
    const dir = mkdtempSync(join(tmpdir(), "moose-kg-initkg-"));
    writeFileSync(
      join(dir, "moose.config.yaml"),
      "kg:\n  version: 1\nlint:\n  rules: []\n",
    );
    expect(run(["init"], dir).status).toBe(2);
  });
});

describe("moose-kg fill --provider mock (CLI smoke)", () => {
  it("runs offline end-to-end without writing anything", () => {
    const dir = mkdtempSync(join(tmpdir(), "moose-kg-fillcli-"));
    writeFileSync(
      join(dir, "moose.config.yaml"),
      'kg:\n  version: 1\n  inputs: ["*.md"]\n',
    );
    const doc = "---\ntitle: T\n---\n\n# T\n";
    writeFileSync(join(dir, "a.md"), doc);
    const { stdout, status } = run(
      ["fill", "--dry-run", "--provider", "mock", "--no-cache"],
      dir,
    );
    expect(status).toBe(0);
    expect(stdout).toContain("LLM cost: $0.00");
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe(doc);
  });

  it("accepts --min-confidence and still exits 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "moose-kg-fillconf-"));
    writeFileSync(
      join(dir, "moose.config.yaml"),
      'kg:\n  version: 1\n  inputs: ["*.md"]\n',
    );
    writeFileSync(join(dir, "a.md"), "---\ntitle: T\n---\n\n# T\n");
    const { status } = run(
      [
        "fill",
        "--dry-run",
        "--provider",
        "mock",
        "--no-cache",
        "--min-confidence",
        "0.9",
      ],
      dir,
    );
    expect(status).toBe(0);
  });
});
