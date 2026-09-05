---
id: aud-doc-contributors
type: audience
segment: Individual doc contributors
maturity: irrelevant, because this reader's situation does not vary with organizational maturity
docs_owner: nobody; they own one page, not the infrastructure
status: secondary, highest-traffic
firmographics:
  - contributes documentation occasionally, often alongside a code change
  - did not choose dockg and may not know what it is
  - arrives via a failing CI check with a link in it
  - has no dockg config knowledge and no local dockg installation
  - wants to be unblocked, not educated
relationship_stages:
  - blocked: a check is red and the PR cannot merge
  - unblocked: the page passes and they leave
personas:
  - persona-doc-contributor
evidence_basis:
  - the exit-code contract in src/cli.ts, where exit 1 means findings, which is what turns a CI job red and sends this reader to the docs
  - the operational-error (exit 2) messages across src/commands/*.ts, which are well written in code but collected nowhere
  - dockg check's per-finding mapping back to the responsible doc file(s), which presumes a human will go fix that file
  - the frontmatter validation errors surfaced through docmeta, which name a field and a constraint but not a remedy
  - docmeta's Theo persona and its fix/ track, whose information-architecture.md records it as the highest-traffic destination in the set
---

Someone whose pull request just went red, who did not choose this tool and does not want to
learn it.

## What they own

One page. Possibly one line of one page. They may be a software engineer who touched a README
alongside a code change. They may be a support specialist correcting a procedure, or a writer who
does not work on the docs platform.

They bring Markdown authoring and knowledge of the content they wrote. They bring **no** config
knowledge, no graph model, and frequently no local dockg installation. The first time they
encounter dockg is the error message.

## What they want

To merge. That is the whole goal, and the docset should not pretend otherwise. This reader is
not evaluating dockg and is not going to read the concept pages. They will bounce off any page
that opens by explaining what a knowledge graph is.

What actually helps them is narrow:

- **Decode the error line.** Which part is the file, which is the field, which is the rule.
- **Find the failure in a catalog** and see the fix as a diff on frontmatter.
- **Reproduce it locally** without setting up a whole toolchain, or confirm they cannot and
  need to push a fix and re-run CI.
- **Understand whether the failure is theirs.** Exit 2 means the pipeline is broken, not their
  page, and telling them apart saves an escalation.

## Why a secondary audience gets a dedicated track

Because traffic does not follow importance. This is the lowest-investment audience and, by a
wide margin, the most frequent arrival. Every other audience produces contributors, and every
gate the other audiences install generates visits here. docmeta's own IA records the equivalent
page as the highest-traffic destination in its set.

The track exists to make this audience's visit short. Success is measured by them **leaving
quickly**, not by depth of engagement. Resist the temptation to cross-sell them into the concept
pages. A single link out, at the bottom, is enough.

## Where the docset serves them

The `fix/` track exclusively, which is also the primary destination of every error message
dockg emits. See [`persona-doc-contributor`](../personas/doc-contributor.md) and
[`cuj-fix-failing-check`](../journeys/fix-failing-check.md).
