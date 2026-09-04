# Contributing to dockg

## Setup

```bash
npm install
```

Requires Node.js 24+ and npm 11.6.3 or newer. Husky installs the git hooks on `npm install`.

`npm ci` works too, and CI uses it. The npm floor is the load-bearing half. Versions up to 11.6.2
write a lockfile that drops the top-level entries for optional platform packages. A strict install
then rejects it. Both floors are enforced rather than advisory. [package.json](package.json)
declares them under `engines`, and [.npmrc](.npmrc) sets `engine-strict=true`, so a violation
fails the install instead of surfacing later as a red build.

Do not read the npm floor as implied by the Node one. Node 24.11.0 satisfies `>=24` while bundling
npm 11.6.1, which sits below the floor. Run `npm -v` to check, and `npm install -g npm@^11.6.3` to
fix it.

## Quality gates

Checks are layered by cost. Fast ones run on commit, the full loop on push, and everything again
in CI, which is the authoritative gate.

| Script | What it checks |
|---|---|
| `npm run format:check` / `npm run format` | Prettier formatting |
| `npm run lint` / `npm run lint:fix` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | tsup bundle into `dist/` |
| `npm test` | vitest, unit + integration |

| Git hook | Runs |
|---|---|
| `pre-commit` | lint-staged (Prettier + ESLint on staged files), then `typecheck` |
| `pre-push` | `typecheck`, `build`, `test` |
| `commit-msg` | commitlint |

Prose has a gate of its own, and it is CI-only. [Vale](https://vale.sh) holds every Markdown and
text file to the [Moose house voice](https://github.com/hawkeyexl/moose-vale), which forbids em
dashes, sentences past 25 words, and the "Label: explanation" opener. It **fails the build**. It
also reads the whole corpus rather than only the lines a pull request adds, so moving a sentence
past the limit counts. `test/fixtures/` is exempt, because its bytes are the test.

Run it locally the way CI does:

```bash
vale sync && vale .
```

**Build before test.** The integration suite executes `dist/cli.js`, not `src/`.

Prettier deliberately ignores `test/fixtures/` and `schemas/`: the corpus and golden graph are
byte-exact regression baselines, and published frontmatter schemas are immutable once released.
It also ignores `*.md` and `*.mdx`: prose in this repo is hand-wrapped, and Prettier's reflow adds
churn without adding signal. `.gitattributes` pins LF line endings everywhere except those
byte-exact fixtures.

## Documentation

The published site lives in [`docs/`](docs) as its own npm project, so the released package never
carries a docs toolchain.

```bash
npm run docs:dev      # local preview
npm run docs:build    # production build into docs/dist
```

Before writing or changing a page, read
[`docs/content_strategy/README.md`](docs/content_strategy/README.md). The set is organized by
what a reader is trying to accomplish, not by document type. Every page is written against a
named persona and journey.

| Gate | Command | Enforces |
|---|---|---|
| Strategy invariants | `npm run docs:check-strategy` | Every `aud-`/`persona-`/`cuj-` reference resolves; personas and CUJs cover each other; the IA plans exactly the pages the journeys name |
| CLI drift | `npm run docs:check-cli` | `reference/cli.mdx` documents exactly the commands, arguments, and options commander knows about |
| Internal links | `npm run docs:check-links` | Every `/dockg/…` link resolves to a built page |

The docs workflow additionally builds a graph from the documentation site itself and holds it to
`dockg check` and `dockg stats --check`, the same gates the docs recommend to readers.

**When you change the CLI surface**, meaning you add, rename, or remove a command, argument,
flag, or default, update
[`docs/src/content/docs/reference/cli.mdx`](docs/src/content/docs/reference/cli.mdx) in the same
change. The drift check enforces it.

**Command output on a page is executed by CI.** Capture it by running the built binary against a
committed fixture under [`test/fixtures/`](test/fixtures), never from memory. Determinism means
what you capture is what every reader sees. Pages then assert that output through Doc
Detective, which reports how many:

```bash
npm link && npm link @hawkeyexl/dockg && npm run docs:test
```

Output is asserted with `stdio`, which matches stdout or stderr. `stdout` and `stderr` are **not**
schema properties, and a step using them is silently dropped rather than failed. So
`scripts/check-doc-tests.mjs` runs after the suite. It fails on both a step that never ran and a
step that ran but did not pass.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), enforced by the `commit-msg` hook
and re-checked across the whole PR range in CI. Hooks are bypassable, and semantic-release
derives every version bump from these messages. Subjects must be lower-case:
`feat: prov-o support`, not `feat: PROV-O support`.

| Type | Release |
|---|---|
| `fix:` | patch |
| `feat:` | minor |
| `feat!:` or a `BREAKING CHANGE:` footer | major |
| `chore:`, `docs:`, `ci:`, `style:`, `test:`, `refactor:`, `build:`, `perf:` | none |

Releases are fully automated by semantic-release. Don't hand-edit `version` in `package.json`,
create `v*` tags, or run `npm publish` locally.

## Architecture decisions

Every behavior change ships with an ADR in [`adrs/`](adrs), in
[MADR](https://adr.github.io/madr/) format, written before or alongside the code. Refactors,
dependency bumps, and doc fixes do not need one.

## Branches and pull requests

Changes land on `main` via a branch and a pull request, not direct pushes. Branch names follow
the release channels: `feat/**` gets its own npm dist-tag, and `fix/**`, `docs/**`, and the rest
do not publish. CI must be green before merge.
