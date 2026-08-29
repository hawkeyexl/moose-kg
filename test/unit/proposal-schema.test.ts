/**
 * `proposalSchema` is memoized so the inference library's identity-keyed
 * validator cache hits instead of recompiling Ajv per document. Memoization
 * makes call order observable, which determinism does not allow.
 */
import { describe, expect, it } from "vitest";
import { proposalSchema } from "../../src/llm/prompt.js";
import type { FillField } from "../../src/core/config.js";

const A: FillField[] = ["label", "related-concepts", "concepts"];
const B: FillField[] = ["concepts", "label", "related-concepts"];

describe("proposalSchema", () => {
  it("returns the identical object for the same field set", () => {
    // Object identity is the point: the library memoizes its compiled
    // validator on it, so a fresh object per call recompiles Ajv per document.
    expect(proposalSchema(A)).toBe(proposalSchema(A));
  });

  it("is order-independent, including property order", () => {
    // The cache key is the sorted field set, so these two calls share an
    // entry. If the schema were built from the caller's order, whichever call
    // arrived first would fix the property order for both — and that order is
    // observable: the schema is JSON.stringify'd into the claude-cli and
    // json_object prompts, so identical inputs could yield different prompts
    // depending on call sequence.
    const first = proposalSchema(A);
    const second = proposalSchema(B);
    expect(second).toBe(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("orders properties deterministically regardless of which order arrives first", () => {
    const props = Object.keys(
      proposalSchema(B)["properties"] as Record<string, unknown>,
    );
    const valueFields = props.filter(
      (p) => p !== "confidence" && p !== "reasoning",
    );
    expect(valueFields).toEqual([...valueFields].sort());
  });

  it("still narrows to exactly the requested fields", () => {
    const props = proposalSchema(["label"])["properties"] as Record<
      string,
      unknown
    >;
    expect(Object.keys(props).sort()).toEqual([
      "confidence",
      "label",
      "reasoning",
    ]);
  });

  it("keeps distinct field sets distinct", () => {
    expect(proposalSchema(["label"])).not.toBe(
      proposalSchema(["label", "related-concepts"]),
    );
  });

  it("types the advisory scores in the request schema", () => {
    // The request schema is what a provider is asked to satisfy, and what a
    // grammar-capable one compiles. Confidence is a number there.
    const props = proposalSchema(["label"])["properties"] as Record<
      string,
      Record<string, unknown>
    >;
    const confidence = props["confidence"]!["properties"] as Record<
      string,
      unknown
    >;
    expect(confidence["label"]).toMatchObject({ type: "number" });
  });

  it("does not type them in the lenient validation schema", () => {
    // ADR 01034: a malformed self-reported score must not discard the values,
    // which are the actual contract. `numberMap` ignores a non-number score,
    // so the field simply goes unscored and the confidence gate decides.
    const props = proposalSchema(["label"], { lenient: true })[
      "properties"
    ] as Record<string, Record<string, unknown>>;
    const confidence = props["confidence"]!["properties"] as Record<
      string,
      unknown
    >;
    expect(confidence["label"]).toEqual({});
    // The VALUES stay strictly typed — leniency is only about the advisory
    // metadata riding alongside them.
    expect(props["label"]).toMatchObject({ type: "string" });
  });

  it("memoizes the lenient schema separately", () => {
    const lenient = proposalSchema(["label"], { lenient: true });
    expect(lenient).toBe(proposalSchema(["label"], { lenient: true }));
    expect(lenient).not.toBe(proposalSchema(["label"]));
  });
});
