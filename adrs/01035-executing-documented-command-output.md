---
status: accepted
date: 2026-08-29
decision-makers: hawkeyexl
---

# Documented command output is executed, not trusted

## Context and Problem Statement

dockg's docs quote command output constantly, because determinism makes that output a promise:
what the page shows is what every reader gets, byte for byte. That promise is only worth making
if something checks it. Nothing did, and eight documented numbers had drifted from what the CLI
produces — one of them (`retrieve/export.mdx`, "17 nodes to kg/graph.jsonld", actually 33) had
never matched any build of any corpus. It was the `search.json` count pasted into the JSON-LD
block, wrong the day it was written.

Doc Detective is the runner for this, and it has been attempted here before. It lived and died
inside PR #25's branch on 2026-08-03: added, corrected, reverted 53 minutes later. The revert
records no technical failure — it was a scope cut.

What makes this decision worth recording rather than filing as tooling is that **the obvious
setup is silently broken in two independent ways**, and both were reached the first time:

1. **The runner exits 0 on failing steps by default.** `exit_on_fail` defaults to `false` in the
   GitHub Action, so a red run reports green.
2. **A step with a schema error is skipped, at warn level, and the run still passes.** `runShell`
   asserts output through a single `stdio` field matching stdout *or* stderr, and the step object
   is `additionalProperties: false`. Steps written with `stdout`/`stderr` — which
   doc-detective's own bundled reference shows in a `runShell` example — fail validation, log
   `isn't a valid step. Skipping.`, and return. The first integration **silently dropped 22 of 33
   steps and was green**; the 11 survivors were exactly the ones with no output assertion.

A gate that reports green while running a third of its cases, or none of them, is worse than no
gate: it converts "unverified" into "verified" in every reader's mind, including the maintainer's.

## Decision Drivers

- **A gate that cannot fail is not a gate** — the same principle ADR 01026 applies to mocks and
  ADR 01007 applies to hooks-versus-CI.
- **Silent skips must be impossible to mistake for passes.** The failure mode here is not "a
  test failed", it is "a test did not run", which no assertion inside the test can detect.
- **CLAUDE.md already forbids hand-written command output.** That rule needs an enforcer, or it
  is a convention people follow until they are in a hurry.
- **Fork PRs execute shell from the pull request's own content.** Whatever this runs, it must not
  hand an untrusted contributor a shell on the repo's runner with the repo's secrets.

## Considered Options

1. **Run Doc Detective with `--exit-on-fail`, plus a second guard that diffs declared steps
   against executed steps.**
2. **Run Doc Detective with `--exit-on-fail` alone.**
3. **Assert command output from vitest instead**, dropping the runner.
4. **Keep the convention unenforced**, as it was before.

## Decision Outcome

Chosen: **option 1**, with three sub-decisions.

**`--exit-on-fail` is mandatory, and passed on the command line rather than left to config.** The
default is the wrong way round for a gate, and a default that must be overridden to be correct is
one edit from being wrong again.

**`scripts/check-doc-tests.mjs` ships beside the runner and is not optional.** It parses the
`{/* step … */}` blocks declared in the pages, reads the runner's results JSON, and fails on any
mismatch in either direction — a declared step that did not execute, or an executed step that did
not pass. This is the part that makes a silent skip visible: without it, a dropped step and a
passing step are the same observation. It is why the count in its output is stated as
`N declared · N executed` rather than a pass tally.

**Eight pages carry step blocks; the rest do not, deliberately.** The excluded ones fall into two
groups. Six pages (`model/*`, `reference/frontmatter.mdx`, `govern/provenance.mdx`) illustrate a
fictional corpus whose files exist nowhere, so there is nothing to run them against; giving them
a fixture would mean inventing a second corpus to serve prose. `retrieve/search.mdx`'s vector
transcript needs model weights, which the default gate must not download (ADR 01025). These are
recorded here rather than left as an absence, because an unexplained gap in a gate reads as an
oversight and invites someone to "fix" it by weakening the gate.

**Fixtures live in `test/fixtures/dd/`, never in `test/fixtures/corpus/`.** The corpus fixture
feeds six byte-exact goldens; a file added to it to serve a doc page would invalidate all six.
Each dd scenario gets its own config file so its settings cannot perturb the counts another
page's steps assert.

**The job runs in its own workflow, and is skipped on fork PRs.** Its steps execute shell from
the PR's own content, so it cannot be granted a fork's trust level. A skipped job does not block,
which means **fork contributions are unverified for command output** — stated plainly in
CLAUDE.md rather than left for someone to discover.

### Consequences

- Good: the eight drifted numbers were found and re-captured, and cannot drift again unnoticed.
- Good: `dockg`'s "what you read is what you get" claim is now checked by the same determinism
  that makes it true.
- Bad: a page cannot be doc-tested without a fixture, so adding one has a real cost. That cost is
  the point — it is what stops a transcribed approximation from being written in the first place.
- Bad: coverage is uneven, and the gate does not run on fork PRs. Both are documented rather than
  papered over.

### Confirmation

- The test of the test, run before this landed: mutate one documented number and confirm the job
  **fails**; then delete a declared step's execution and confirm `check-doc-tests.mjs` fails on
  the mismatch. The first integration was green while dropping two thirds of its steps, so a
  green run on its own proves nothing about this gate.
- `npm run docs:test` reports `8 pages · 38 steps declared · 38 executed`.

## Pros and Cons of the Options

### 1. `--exit-on-fail` plus a declared-vs-executed guard

- Good: the only option that detects a step that never ran, which is the failure that actually
  occurred here.
- Good: the runner and the guard read the same results file, so the two cannot disagree about
  what happened.
- Bad: a second script to maintain, and it must be kept in step with the block syntax.

### 2. `--exit-on-fail` alone

- Good: one moving part.
- Bad: does not detect a skipped step at all — the exact failure mode that made the previous
  integration green while it ran a third of its cases. This is option 1 minus the part that
  matters.

### 3. Assert command output from vitest

- Good: no new dependency; the suite already runs the built CLI against fixtures.
- Good: no fork-PR trust problem, since it runs in the normal suite.
- Bad: the assertions live away from the prose they describe, so a page edit and its test drift
  apart in the ordinary course of editing — which is the whole failure being fixed, relocated.
- Bad: nothing then ties a *documented* block to a *tested* command; a page could quote output no
  test covers and look identical to one that is covered.

### 4. Leave the convention unenforced

- Good: zero cost.
- Bad: measured false. Eight numbers had drifted, one had never been right, and the rule against
  hand-writing output was already in CLAUDE.md the whole time.
