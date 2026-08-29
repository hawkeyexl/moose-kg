/**
 * `dockg fill` proposing per-section metadata (ADR 01032).
 *
 * The interesting cases are the refusals. Section metadata is explicit-only
 * (ADR 01013), so writing a block against a heading that does not exist would
 * mint a `dockg:brokenSectionRef` — a finding `stats` reports and `fill` must
 * never manufacture.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderFill, runFill } from "../../src/commands/fill.js";
import { MockProvider } from "@hawkeyexl/inference";

const PAGE = [
  "---",
  "title: Widget SDK",
  "---",
  "",
  "# Widget SDK",
  "",
  "Intro prose.",
  "",
  "## Install the SDK",
  "",
  "Installation steps.",
  "",
  "## Troubleshoot a failed install",
  "",
  "What to do when it breaks.",
  "",
].join("\n");

function setup(config = ""): string {
  const dir = mkdtempSync(join(tmpdir(), "dockg-fillsec-"));
  writeFileSync(
    join(dir, "dockg.config.yaml"),
    `version: 1\ninputs: ["*.md"]\nfill:\n  fields: [type]\n${config}`,
  );
  writeFileSync(join(dir, "a.md"), PAGE);
  return dir;
}

/** A proposal with a document type and per-section types. */
function proposal(sections: Array<Record<string, unknown>>) {
  return {
    type: "reference",
    confidence: { type: 0.9 },
    sections,
  };
}

describe("fill --sections", () => {
  it("writes per-section metadata under the matching slug", async () => {
    const dir = setup();
    const provider = new MockProvider([
      {
        json: proposal([
          {
            slug: "install-the-sdk",
            type: "task",
            confidence: { type: 0.95 },
          },
          {
            slug: "troubleshoot-a-failed-install",
            type: "troubleshooting",
            confidence: { type: 0.9 },
          },
        ]),
      },
    ]);

    const report = await runFill({
      cwd: dir,
      providerInstance: provider,
      sections: true,
      noCache: true,
    });

    expect(report.exitCode).toBe(0);
    const written = readFileSync(join(dir, "a.md"), "utf8");
    expect(written).toContain("sections:");
    expect(written).toContain("install-the-sdk:");
    expect(written).toContain("troubleshoot-a-failed-install:");
    // The document keeps its own type; sections carry theirs.
    expect(written).toMatch(/type: reference/);
    expect(written).toMatch(/type: task/);
    expect(written).toMatch(/type: troubleshooting/);
  });

  it("drops a slug that matches no heading, and says so", async () => {
    const dir = setup();
    const provider = new MockProvider([
      {
        json: proposal([
          { slug: "install-the-sdk", type: "task", confidence: { type: 0.95 } },
          // A heading that does not exist. Writing this would create a
          // dockg:brokenSectionRef in the graph.
          { slug: "renamed-heading", type: "task", confidence: { type: 0.99 } },
        ]),
      },
    ]);

    const report = await runFill({
      cwd: dir,
      providerInstance: provider,
      sections: true,
      noCache: true,
    });

    const result = report.results[0]!;
    expect(result.unknownSections).toEqual(["renamed-heading"]);
    expect(renderFill(report, "pretty")).toContain(
      "no such section: renamed-heading",
    );

    const written = readFileSync(join(dir, "a.md"), "utf8");
    expect(written).toContain("install-the-sdk:");
    expect(written).not.toContain("renamed-heading");
  });

  it("gates section fields on confidence, like document fields", async () => {
    const dir = setup();
    const provider = new MockProvider([
      {
        json: proposal([
          { slug: "install-the-sdk", type: "task", confidence: { type: 0.2 } },
        ]),
      },
    ]);

    const report = await runFill({
      cwd: dir,
      providerInstance: provider,
      sections: true,
      noCache: true,
    });

    const result = report.results[0]!;
    expect(result.lowConfidence?.map((l) => l.field)).toContain(
      "sections.install-the-sdk.type",
    );
    expect(readFileSync(join(dir, "a.md"), "utf8")).not.toContain("sections:");
  });

  it("never overwrites a section field a human set", async () => {
    const dir = setup();
    writeFileSync(
      join(dir, "a.md"),
      PAGE.replace(
        "title: Widget SDK",
        "title: Widget SDK\nkg:\n  sections:\n    install-the-sdk:\n      type: concept",
      ),
    );
    const provider = new MockProvider([
      {
        json: proposal([
          { slug: "install-the-sdk", type: "task", confidence: { type: 0.95 } },
          {
            slug: "troubleshoot-a-failed-install",
            type: "troubleshooting",
            confidence: { type: 0.95 },
          },
        ]),
      },
    ]);

    const report = await runFill({
      cwd: dir,
      providerInstance: provider,
      sections: true,
      noCache: true,
    });

    const written = readFileSync(join(dir, "a.md"), "utf8");
    // Preservation is decided at the leaf, so the human's value survives while
    // the section beside it is still filled.
    expect(written).toContain("type: concept");
    expect(written).not.toContain("type: task");
    expect(written).toContain("troubleshoot-a-failed-install:");
    expect(report.results[0]!.preserved).toContain(
      "sections.install-the-sdk.type",
    );
  });

  it("proposes nothing for sections unless asked", async () => {
    const dir = setup();
    const provider = new MockProvider([
      {
        json: proposal([
          { slug: "install-the-sdk", type: "task", confidence: { type: 0.95 } },
        ]),
      },
    ]);

    // Sections are opt-in: the schema does not offer them, and a provider that
    // volunteers them anyway is narrowed away rather than written.
    const report = await runFill({
      cwd: dir,
      providerInstance: provider,
      noCache: true,
    });

    expect(readFileSync(join(dir, "a.md"), "utf8")).not.toContain("sections:");
    expect(report.results[0]!.unknownSections).toBeUndefined();
  });
});
