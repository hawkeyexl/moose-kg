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

describe("dockg init", () => {
  it("scaffolds a valid config and refuses to overwrite", () => {
    const dir = mkdtempSync(join(tmpdir(), "dockg-init-"));
    const first = run(["init"], dir);
    expect(first.status).toBe(0);
    expect(existsSync(join(dir, "dockg.config.yaml"))).toBe(true);

    // scaffolded config parses: build against it (with a doc present)
    writeFileSync(join(dir, "docs.md"), "# Hi\n");
    const build = run(["build", "docs.md", "--out", join(dir, "g.ttl")], dir);
    expect(build.status).toBe(0);

    const second = run(["init"], dir);
    expect(second.status).toBe(2);
  });
});

describe("dockg fill --provider mock (CLI smoke)", () => {
  it("runs offline end-to-end without writing anything", () => {
    const dir = mkdtempSync(join(tmpdir(), "dockg-fillcli-"));
    writeFileSync(
      join(dir, "dockg.config.yaml"),
      'version: 1\ninputs: ["*.md"]\n',
    );
    const doc = "---\ntitle: T\n---\n\n# T\n";
    writeFileSync(join(dir, "a.md"), doc);
    const { stdout, status } = run(
      ["fill", "--dry-run", "--provider", "mock", "--no-cache"],
      dir,
    );
    expect(status).toBe(0);
    // Not "$0.0000". The mock has no price-table entry, so the default 5 USD
    // cap cannot be applied and nothing can be totalled — which is a different
    // statement from "this run was free" (ADR 01027). This assertion used to
    // pin the misleading version.
    expect(stdout).toContain("LLM cost: unpriceable");
    expect(readFileSync(join(dir, "a.md"), "utf8")).toBe(doc);
  });

  it("accepts --min-confidence and still exits 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "dockg-fillconf-"));
    writeFileSync(
      join(dir, "dockg.config.yaml"),
      'version: 1\ninputs: ["*.md"]\n',
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
