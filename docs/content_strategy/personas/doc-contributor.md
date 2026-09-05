---
id: persona-doc-contributor
type: persona
name: Sam
audience: aud-doc-contributors
role: Occasional contributor whose pull request is blocked by a failing check
proficiency:
  - writes Markdown and edits frontmatter by copying the page next door
  - opens pull requests and reads CI output
  - knows the content they wrote, and nothing about the pipeline
prerequisites:
  - Markdown
  - a pull request that is currently red
  - the error message, which may be their entire context
  - no dockg installation and no config knowledge is assumed
goals:
  - merge
pains:
  - the error names a field and a rule but not a fix
  - unclear whether the failure is their page or the pipeline
  - no idea whether this is reproducible locally without a setup afternoon
  - every explanation offered so far started further back than they needed
content_types:
  - error-message anatomy, part by part
  - a catalog of common failures, each with the fix as a frontmatter diff
  - one exit-code table
  - one command to reproduce locally, or an honest statement that they cannot
journeys:
  - cuj-fix-failing-check
evidence_basis:
  - the exit-1 findings contract in src/cli.ts, which is what turns a CI job red and produces this visit
  - dockg check's mapping of every finding back to the responsible doc file, which presumes a human will go edit that file
  - the frontmatter validation errors surfaced through docmeta, which name a field and a constraint but never a remedy
  - the exit-2 operational-error messages across src/commands/*.ts, which this reader must be able to recognize as not-their-fault
  - docmeta's Theo persona and the highest-traffic status its IA records for the equivalent page
---

Someone whose pull request just went red, who did not choose this tool and does not want to
learn it.

## Who they are

Sam edited one page, possibly one line. They may be a software engineer who touched a README
alongside a code change. They may be a support specialist correcting a procedure, or a writer who
does not work on the docs platform. They pushed, CI failed, and there is a link in the output.

That link is their entire relationship with dockg. They have not read the landing page, do not
know what a knowledge graph is, and will not find out today.

## What they bring, and what they do not

**Bring:** Markdown, and knowledge of the content they wrote.

**Do not bring:** config knowledge, the graph model, a local dockg installation, or any context
from a previous page. The first time they encounter this tool is the error message.

## Their goal is one word

Merge.

The docset should not pretend otherwise, and should not try to convert this visit into
engagement. Success for this persona is measured by **how quickly they leave**. A single link
out at the bottom of the page is enough. A page that tries to interest them in the concept track
has misread the situation, and costs them time they did not want to spend.

## What actually helps

- **Decode the error line.** Which part is the file, which is the field, which is the rule that
  fired. A part-by-part table does more here than paragraphs.
- **A catalog of common failures**, each with the fix shown as a diff on frontmatter. They will
  scan for the shape that matches theirs and copy it.
- **Tell them whose fault it is.** Exit 1 means their page; exit 2 means the pipeline is broken
  and they should hand it back. Getting this wrong costs an escalation in both directions.
- **One reproduce-locally command**, or an honest statement that reproducing requires setup they
  do not have and pushing a fix is the faster path.

## Why this persona gets a dedicated track despite being secondary

Traffic does not follow investment. Every other persona produces contributors, and every gate
the other personas install generates visits here. This will be the most-read track in the set,
by people who care about it least.

The track must also work with **no preceding context**, because it is the landing page for a
link in machine output. No "as we saw above", no assumed installation, no assumed config.

## Their journey

[`cuj-fix-failing-check`](../journeys/fix-failing-check.md)
