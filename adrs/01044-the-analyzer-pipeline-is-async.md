---
status: accepted
date: 2026-09-01
decision-makers: hawkeyexl
---

# The analyzer pipeline is async

## Context and Problem Statement

AsciiDoc is the last format in the [ADR 01041](01041-every-input-format-is-explicit.md) roadmap
with a real parser behind it. Asciidoctor.js is the only credible one — it is the reference
implementation compiled to JavaScript, so it agrees with `asciidoctor` the tool by construction
rather than by approximation.

Its current major, 4.x, **has no synchronous API**. `load()` returns a `Promise<Document>`, where
2.x and 3.x returned the document directly. Verified against 4.0.11 and 3.0.4 in this repo.

dockg's analyzer contract is synchronous, and the two functions at its edges —
`analyzeDoc` and `buildSearchIndex` — are **public library exports**, documented in
[library-api.mdx](../docs/src/content/docs/reference/library-api.mdx). So one format's parser
choice reaches all the way out to dockg's published API.

## Decision Drivers

- Asciidoctor.js is the only implementation that *is* AsciiDoc rather than a reimplementation of
  it. A subset parser for AsciiDoc would be a much larger and less trustworthy undertaking than
  the RST one already deferred.
- Determinism is the product contract, and concurrency is a determinism hazard. Anything async
  must be provably order-stable.
- The library API is published. Breaking it needs a reason and a major.
- A codebase that pins a dependency for API convenience accrues that debt permanently: the day
  it must move, the same conversion is due, plus whatever else changed in the interim.
- The failure mode of an async pipeline is a forgotten `await`, and the compiler does not catch
  the dangerous shape.

## Considered Options

1. **Pin `@asciidoctor/core` ^3.0.4**, keeping the pipeline synchronous.
2. **Make `analyze` and `textOf` async**, and with them `analyzeDoc` and `buildSearchIndex`.
3. **Leave AsciiDoc unimplemented**, and decide separately.
4. **Run Asciidoctor 4 synchronously via `deasync` or a worker + `Atomics.wait`.**

## Decision Outcome

Chosen: **option 2** — `DocAnalyzer.analyze` and `DocAnalyzer.textOf` return promises, and the
async-ness propagates out through `analyzeDoc`, `buildSearchIndex`, `FillGuard.create`,
`FillGuard.commit` and `runSearchIndex`.

Option 1 is the smaller diff today and the same diff later. Pinning one major behind buys time
and pays interest: 4.x is where upstream fixes land, and the eventual move to it forces exactly
this conversion anyway, on top of whatever else has accumulated. The deciding factor is that the
seam is now *general*: any future analyzer that needs to await — a parser that loads a grammar,
a format that resolves an include — fits without another API break.

Option 4 was rejected outright. `deasync` blocks the event loop through a native addon, which
reintroduces exactly the cross-platform binding risk
[ADR 01025](01025-embedder-cross-platform-reality.md) was written about; the worker variant adds
a thread and a serialization boundary to avoid a keyword.

**This is a breaking change to the library API**, so it ships as `feat!`. `analyzeDoc` and
`buildSearchIndex` now return promises. Nothing else about them changes — same arguments, same
shapes, same `DockgError` on an unreadable format.

**Determinism is preserved by construction, not by convention.** `build` analyzes with
`Promise.all` over the already-sorted discovery order, and `Promise.all` resolves in input order
regardless of completion order, so concurrency cannot reach the emitter. The double-build byte
comparison and the goldens across all three format corpora are what prove it, and they did not
move: 762 tests before the conversion, 762 after.

**Two type-aware ESLint rules are enabled with it.** This is part of the decision rather than an
aside. TypeScript catches most forgotten awaits — a `Promise<DocModel>` where a `DocModel` was
expected is a type error — but it says nothing about a bare statement call like
`guard.commit(path, content);`, which silently does its work after the caller has moved on. That
exact line existed during this conversion and was caught by hand, not by a tool.
`@typescript-eslint/no-floating-promises` and `no-misused-promises` are scoped to `src/` and
`test/` rather than switching the whole config to `recommendedTypeChecked`, because lint here
exists to catch what types, tests and the determinism gate miss — and this is precisely such a
class.

### Consequences

- Good: Asciidoctor 4 is usable, so AsciiDoc gets the reference implementation rather than an
  approximation of it.
- Good: the analyzer seam accommodates any future async parser with no further API change.
- Good: forgotten awaits are now a lint error across `src/` and `test/`, which is a guard the
  codebase did not have before and would have wanted regardless.
- Bad: a breaking change for library consumers. Two call sites, one `await` each.
- Bad: type-aware linting needs a TypeScript program, so `npm run lint` is slower.
- Neutral: no output changed. Same graph, same goldens, same triple counts.

### Confirmation

The whole suite is the confirmation, and the number is the point: **762 tests before, 762
after**, with the six corpus goldens, the mixed HTML/Markdown goldens and the DITA goldens all
byte-identical. A conversion that altered behavior would move at least one of them.

The determinism gates specifically cover the concurrency risk: `build` twice over unchanged
inputs is compared byte-for-byte on all three format corpora.

The lint rules were verified to actually fire rather than being silently inert — a floating
`analyzeDoc` call planted in `build.ts` produced
`error Promises must be awaited … @typescript-eslint/no-floating-promises`, and the file
lints clean once restored.

## Pros and Cons of the Options

### 1. Pin `@asciidoctor/core` ^3.0.4

- Good: smallest diff; no API break; no consumer migration.
- Good: 3.0.4 is a real, working release, and the AST it exposes is the same one 4.x exposes.
- Bad: the conversion is deferred, not avoided — moving to 4.x later costs this same change plus
  the interim drift.
- Bad: upstream fixes land on 4.x.
- Bad: leaves the seam unable to accommodate any other async parser.

### 2. Make the pipeline async (chosen)

- Good: current upstream; general seam; a lint guard the codebase wanted anyway.
- Bad: breaking library-API change, and a broad mechanical diff across the test suite.
- Bad: introduces a determinism hazard that has to be argued and gated rather than being absent
  by construction.

### 3. Leave AsciiDoc unimplemented

- Good: no change at all; the stub already reports itself honestly.
- Bad: AsciiDoc is a major documentation format, and "we could not await" is a poor reason to
  omit it.

### 4. Force synchrony (`deasync`, or a worker with `Atomics.wait`)

- Good: no API change.
- Bad: `deasync` is a native addon that blocks the event loop — the exact cross-platform binding
  risk ADR 01025 exists to warn about.
- Bad: the worker variant adds a thread and a serialization boundary to avoid a keyword.
