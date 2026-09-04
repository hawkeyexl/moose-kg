---
status: accepted
date: 2026-09-04
decision-makers: hawkeyexl
---

# The prose gate blocks, and the whole corpus is its baseline

## Context and Problem Statement

The Moose Vale package landed advisory. `.vale.ini` pulls the Voices core, the Direct voice and
the Moose house rules, and [vale.yml](../.github/workflows/vale.yml) ran them through reviewdog
with `filter_mode: added` and `fail_on_error: false`. Its own comment named the follow-up: *flip
`fail_on_error` once the existing corpus is worked down.*

Nothing had been worked down. A first measurement found **2,265 alerts across 118 files**. That
is 1,111 em dashes, 691 sentences past 25 words, 453 colon-reveal openers, and 10 banned or
inflated words. More than half of them sat in `adrs/`.

An advisory gate is not a small version of a blocking one. It reports and nothing happens, so the
count only ever grows. A reviewer learns to scroll past the annotations. Two ADRs have recorded
that failure already. [ADR 01029](01029-coverage-catches-up-with-the-vocabulary.md) recorded it
for a coverage row that sits at zero by construction.
[ADR 01033](01033-links-to-non-document-files.md) recorded it for a broken-link list carrying
findings nobody can act on.

Two things about the configuration were also wrong, and neither is editorial.

**The gate read `test/fixtures/`.** Those bytes are the test. `windows-notes.md` is CRLF on
purpose, `.prettierignore` already keeps Prettier out for the same reason, and rewording a fixture
invalidates every golden derived from it. Seven alerts there had no lawful fix, so a blocking gate
could never go green.

**The gate did not understand `.mdx`.** Vale parses `.md` natively and treats an unknown
extension as plain text. The docs site is `.mdx`, so it was linted as if none of its markup
existed. Fenced blocks holding captured command output came back as prose alerts. Headings merged
into the paragraph below them, and sentence boundaries were counted across block edges. The docs are
forbidden to hand-write command output ([ADR 01035](01035-executing-documented-command-output.md)),
so those alerts had no lawful fix either.

## Decision Drivers

- A gate that reports without failing teaches readers to ignore it. Either the rules bind or they
  are not rules.
- Every alert must have a lawful fix. An alert on a byte-exact fixture, or on output the docs are
  required to capture verbatim, is a finding nobody can act on.
- The rules ask for a rewrite, not a substitution. `Moose.EmDash` says so outright: *split or
  restructure the sentence rather than swapping punctuation.*
- Meaning is the thing to preserve. An ADR records a decision, a fixture feeds a golden, and a
  Doc Detective block asserts real CLI output. None of them may move.
- Pre-release, a repo-wide prose rewrite is cheap. It gets more expensive with every page.

## Considered Options

1. **Work the corpus to zero, then block on the whole of it.**
2. **Block on added lines only**, leaving the historical corpus as it stands.
3. **Stay advisory**, and rely on review to act on the annotations.
4. **Exempt the historical files** by path, and hold only new ones.

## Decision Outcome

**Option 1 was chosen.** All 2,265 alerts are fixed, and the gate now runs with
`fail_on_error: true` and `filter_mode: nofilter`.

### Why the whole corpus rather than the added lines

`filter_mode: added` is the right setting for a corpus nobody has worked down: it stops the count
growing without demanding a rewrite first. It is the wrong setting afterwards, for a reason worth
recording. A pull request can push an existing sentence past 25 words without touching its line,
by editing the sentence before it or rewrapping a paragraph. A diff-scoped filter reads that as
untouched. With the corpus at zero, holding all of it costs nothing and closes that gap.

Option 4 was rejected for the same reason it is usually reached for. A path exemption is a list
that only grows, and it puts the rule and the files it governs in different places.

### The two exemptions, and why only one is editorial

`test/fixtures/**` turns styles off in `.vale.ini`, with the reason in the file. This is not a
judgement about the prose there. Those bytes are inputs to the goldens, and the CRLF fixture is
pinned by `.gitattributes`.

MDX expression containers are skipped through a `BlockIgnores` over `{/* ... */}`. Those hold Doc
Detective's testIds, shell commands and `stdio` assertions, which must match the CLI byte for
byte. They render to nothing, so no reader loses anything. `[formats] mdx = md` gives Vale the
right parser for everything around them.

### The remediation itself

Two list shapes recurred often enough across the ADR set to rewrite mechanically. Both are
the sentence split the rules ask for, rather than a punctuation swap:

```text
- Good: deterministic ...      ->  - Good. Deterministic ...
- **Label** - description ...  ->  - **Label.** Description ...
```

That covered 351 labels, and the diff was read before it was committed. Everything else is hand
editing. One term changed rather than being reworded. `Voices.Banned` covers the noun the roadmap
used for its Phase 10 evaluation component, so that is now the "eval suite".

### Consequences

- Good. New prose is held to the house voice by something that fails. The corpus it is held
  against is a real baseline rather than a backlog.
- Good. Two classes of alert that had no lawful fix are gone, so nobody has to choose between the
  prose gate and a byte-exact contract.
- Good. The docs site is now parsed as Markdown, so the linter reads it the way a reader does.
- Bad. Prose in a pull request can fail CI for a sentence a reviewer would have accepted. That is
  the trade a house voice is, and the rules are the ones the package publishes rather than ones
  invented here.
- Bad. The rewrite touched 112 files at once, which inflates `git blame` for that commit across
  the documentation set. Pre-release, and the alternative is doing it later across more files.
- Neutral. No behavior changed. No command, flag, config key, exit code, output shape, schema,
  shapes file or emitted triple moves in this work.

### Confirmation

- `vale sync && vale .` reports **0 errors, 0 warnings and 0 suggestions in 163 files**, which is
  what the gate runs. That count is a clean checkout, matching CI. A working tree carrying scratch
  output under `.tmp/` reports more files, because Vale walks that directory and git does not.
- The three docs gates still pass. `docs:check-strategy` reports the same 31 files, 25 ids, 5
  personas, 14 CUJs and 35/38 planned routes. `docs:check-cli` and `docs:check-links` are
  unchanged, because no command surface and no `/dockg/…` target moved.
- Every Doc Detective block is byte-identical, so `docs:test` asserts the same output against the
  same fixtures.
- `test/fixtures/` is untouched, so the goldens, the determinism gates and `npm test` are
  unaffected.

## Pros and Cons of the Options

### 1. Work the corpus down, then block on all of it (chosen)

- Good. The rules bind, and the baseline is real.
- Good. A regression anywhere fails, including one produced by rewrapping.
- Bad. A large one-time rewrite, and a real cost to land it.

### 2. Block on added lines only

- Good. No corpus work, and new prose is still held.
- Bad. Leaves 2,265 alerts standing, which is a backlog nobody is scheduled to clear.
- Bad. Misses a sentence pushed past the limit by an edit on a neighbouring line.

### 3. Stay advisory

- Good. Zero cost, and zero risk of a red build over wording.
- Bad. This is the state that produced the problem. The count grows and the annotations get
  scrolled past.

### 4. Exempt the historical files by path

- Good. Blocks immediately, with no rewrite.
- Bad. An exemption list only grows, and it separates the rule from the files it governs.
- Bad. It makes the linter's report a statement about which files someone got around to, rather
  than about the corpus.
