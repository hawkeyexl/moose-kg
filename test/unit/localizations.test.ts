/**
 * The localization manifest contract (ADR 01038).
 *
 * `parseLocalizations` is the boundary between a file anyone can edit and code
 * that reaches straight for `entry.search.path`, so the ladder is both halves:
 * what it accepts, and every shape it must refuse rather than hand on.
 */
import { describe, expect, it } from "vitest";
import {
  emitLocalizations,
  isLanguageTag,
  parseLocalizations,
  searchIndexFilename,
  vectorIndexFilename,
  type LocalizationsDoc,
} from "../../src/core/localizations.js";

const entry = (language: string) => ({
  language,
  documents: 1,
  search: { path: `search.${language}.json`, entries: 2, digest: "sha256:ab" },
});

describe("emitLocalizations", () => {
  it("sorts by language and ends with a newline", () => {
    const out = emitLocalizations({
      version: 1,
      languages: [entry("und"), entry("de"), entry("de-AT")],
    });
    const parsed = JSON.parse(out) as LocalizationsDoc;
    expect(parsed.languages.map((l) => l.language)).toEqual([
      "de",
      "de-AT",
      "und",
    ]);
    expect(out.endsWith("}\n")).toBe(true);
  });

  it("is byte-stable for the same input in a different order", () => {
    const a = emitLocalizations({
      version: 1,
      languages: [entry("de"), entry("fr")],
    });
    const b = emitLocalizations({
      version: 1,
      languages: [entry("fr"), entry("de")],
    });
    expect(a).toBe(b);
  });
});

describe("parseLocalizations", () => {
  it("round-trips what emitLocalizations wrote", () => {
    const doc: LocalizationsDoc = { version: 1, languages: [entry("de")] };
    expect(parseLocalizations(emitLocalizations(doc))).toEqual(doc);
  });

  const rejected: Array<[string, string]> = [
    ["not JSON at all", "{oops"],
    ["a JSON scalar", '"nope"'],
    ["null", "null"],
    ["a future version", '{"version":2,"languages":[]}'],
    ["a missing languages array", '{"version":1}'],
    ["languages as an object", '{"version":1,"languages":{}}'],
    // The shape that crashed the CLI before the review fix: the envelope is
    // fine, so callers dereferenced `entry.search.path` on undefined and got a
    // raw TypeError with exit 1 instead of an operational error with exit 2.
    [
      "an entry with no search block",
      '{"version":1,"languages":[{"language":"de","documents":1}]}',
    ],
    [
      "an entry whose search.path is not a string",
      '{"version":1,"languages":[{"language":"de","documents":1,"search":{"path":7,"entries":1,"digest":"x"}}]}',
    ],
    [
      "an entry with no language",
      '{"version":1,"languages":[{"documents":1,"search":{"path":"a","entries":1,"digest":"x"}}]}',
    ],
    [
      "a vectors block whose path is not a string",
      '{"version":1,"languages":[{"language":"de","documents":1,"search":{"path":"a","entries":1,"digest":"x"},"vectors":{"path":null}}]}',
    ],
    ["a null entry", '{"version":1,"languages":[null]}'],
  ];

  for (const [name, text] of rejected) {
    it(`refuses ${name}`, () => {
      expect(parseLocalizations(text)).toBeUndefined();
    });
  }

  it("accepts an entry with no vectors block, which just means unembedded", () => {
    const doc = parseLocalizations(
      emitLocalizations({ version: 1, languages: [entry("de")] }),
    );
    expect(doc?.languages[0]?.vectors).toBeUndefined();
  });
});

describe("isLanguageTag", () => {
  it.each(["de", "en", "de-DE", "pt-BR", "zh-Hans", "zh-Hans-CN", "und"])(
    "accepts %s",
    (tag) => expect(isLanguageTag(tag)).toBe(true),
  );

  // Each of these would otherwise become a filename segment.
  it.each(["English", "de_DE", "d", "de-", "../escaped", "a/b", ".", ""])(
    "rejects %s",
    (tag) => expect(isLanguageTag(tag)).toBe(false),
  );
});

describe("artifact filenames", () => {
  it("names one file per language, per kind", () => {
    expect(searchIndexFilename("de-AT")).toBe("search.de-AT.json");
    expect(vectorIndexFilename("und")).toBe("vectors.und.bin");
  });
});
