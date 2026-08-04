# Contributing to dockg

## Setup

```bash
npm install
```

Requires Node.js 24+. Husky installs the git hooks on `npm install`.

Use `npm install`, not `npm ci`: the committed lock is generated on Windows and omits the
Linux-side optional dependencies of rolldown's wasm binding, so a strict lock check cannot pass
on both platforms.

## Quality gates

Checks are layered by cost — fast ones on commit, the full loop on push, and everything again in
CI, which is the authoritative gate.

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

**Build before test** — the integration suite executes `dist/cli.js`, not `src/`.

Prettier deliberately ignores `test/fixtures/` and `schemas/`: the corpus and golden graph are
byte-exact regression baselines, and published frontmatter schemas are immutable once released.
It also ignores `*.mdx`, because the docs pages carry Doc Detective test blocks written as JSX
comments wrapping JSON, which its MDX formatter reflows into invalid JSON.
`.gitattributes` pins LF line endings everywhere except those byte-exact fixtures.

## Documentation

The published site lives in [`docs/`](docs) as its own npm project, so the released package never
carries a docs toolchain.

```bash
npm run docs:dev      # local preview
npm run docs:build    # production build into docs/dist
```

Before writing or changing a page, read
[`docs/content_strategy/README.md`](docs/content_strategy/README.md). The set is organized by
what a reader is trying to accomplish, not by document type, and pages are written against a
named persona and journey.

| Gate | Command | Enforces |
|---|---|---|
| Strategy invariants | `npm run docs:check-strategy` | Every `aud-`/`persona-`/`cuj-` reference resolves; personas and CUJs cover each other; the IA plans exactly the pages the journeys name |
| CLI drift | `npm run docs:check-cli` | `reference/cli.mdx` documents exactly the commands, arguments, and options commander knows about |
| Internal links | `npm run docs:check-links` | Every `/dockg/…` link resolves to a built page |
| Documented behavior | `npm test` | Every command shown on a page actually behaves as printed (`test/integration/docs-claims.test.ts`) |

**When you change the CLI surface** — add, rename, or remove a command, argument, flag, or
default — update [`docs/src/content/docs/reference/cli.mdx`](docs/src/content/docs/reference/cli.mdx)
in the same change. The drift check enforces it.

Command output shown on a page is captured by running the built binary against a committed
fixture in [`test/fixtures/dd/`](test/fixtures/dd), never written from memory. Determinism means
what you capture is what every reader sees.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), enforced by the `commit-msg` hook
and re-checked across the whole PR range in CI — hooks are bypassable, and semantic-release
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
