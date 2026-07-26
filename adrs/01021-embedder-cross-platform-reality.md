---
status: accepted
date: 2026-07-25
decision-makers: hawkeyexl
supersedes: 01020 (its "Node and the browser compute the same function" section only)
---

# Embedder cross-platform behavior, as measured

## Context and Problem Statement

[ADR 01020](01020-local-embeddings.md) asserts that dockg forces transformers.js onto
one implementation — `device: "wasm"` in both Node and the browser — so that build-time
corpus vectors and query-time browser vectors are outputs of the *same function*. It
presents four "disciplines" as pinned in code, and cites the WASM spec's
round-to-nearest-ties-to-even mandate as grounds for bit-identical floats across
platforms.

**None of that was ever executed.** `createLocalEmbedder` shipped with zero test
coverage: the only tests were of its *absence* (missing optional peer → exit 2) and
static assertions about `package.json`. The mock embedder covered the CLI plumbing and
nothing about the real library. The claims came from reading documentation and the WASM
specification.

Running it against `@huggingface/transformers@4.2.0` and
`onnx-community/granite-embedding-small-english-r2-ONNX` produced this:

| Claim in ADR 01020 | Measured |
|---|---|
| `device: "wasm"` on both sides | **Throws in Node.** `Unsupported device: "wasm". Should be one of: dml, webgpu, cpu.` The browser's list is `webgpu, wasm`. The vocabularies are **disjoint** — no value works on both. |
| `env.backends.onnx.wasm.numThreads = 1` pins threading | **No-op in Node.** That object has exactly one key, `proxy`; `onnx.versions` reports `{common, node}` — ORT-node, no web entry. Writes a property nothing reads. |
| Bit-identical floats across platforms | **False.** Node native vs browser WASM, same text, same model, same dtype: max component diff **2.247e-3**, RMS **6.700e-4**, cosine **0.999914**. |
| `dtype: "q8"` | Correct. |
| `{pooling: "mean", normalize: true}` honored | Correct — measured L2 norm 0.99999992. |
| `output.data` is a `dims`-length vector | Correct — 384, mean-pooled, not `tokens × dims`. |
| Granite's 8192-token context avoids truncation | Correct — two 900-word texts differing only in their tails embed to cosine 0.949, so the tail is genuinely read. |

The consequence of the first row is that `dockg embed` **never worked at all** with a real
model. It failed at pipeline construction, every time.

Forcing ORT-web in Node was also tried and does not work: importing
`dist/transformers.web.js` by file URL still resolves `onnxruntime-web` to its Node entry
and still rejects `wasm`, and that build's model fetching assumes browser URL resolution.

So the question is not "how do we pin one implementation" — that option does not exist
through the supported API — but **what guarantee can dockg actually offer, and how is it
verified?**

## Decision Drivers

- A shipped correctness claim that has never been executed is worse than no claim.
- What users depend on is not float equality, it is that **the corpus embedded in Node and
  a query embedded in the browser rank the same way**.
- The verification must run the real model, or it verifies nothing (this ADR exists
  because mocks certified a function that throws).
- CI must stay hermetic *by default*; the repo's "no network in tests" invariant is load
  bearing for every other suite.

## Considered Options

1. **Accept the split; gate on ranking agreement.**
2. **Embed the corpus in a headless browser** so both sides run ORT-web.
3. **Drop the cross-platform claim**; refuse a sidecar built on another platform.

## Decision Outcome

**Chosen: option 1 — accept the split, and gate on the property that actually matters.**

Concretely:

1. **`device` is no longer forced.** `createLocalEmbedder` omits it, so transformers.js
   picks its platform default: native CPU in Node, WASM in the browser. In Node this is
   *bit-identical* to an explicit `device: "cpu"` (measured, max diff 0.0). An explicit
   `device` option remains for a caller who wants `webgpu`.
2. **`numThreads = 1` is still set, but honestly scoped.** It binds on the WASM side,
   where thread count would otherwise follow `hardwareConcurrency`; on the Node side it is
   inert. The code says so instead of implying it pins both.
3. **The guarantee is decisive ordering, not identical rankings.** dockg's real usage is
   corpus-vectors-built-in-Node, query-embedded-in-browser, so the gate ranks a real
   corpus against a Node-embedded query and the same browser-embedded query.

   Requiring *identical* top-k was the first attempt, and it **failed on its first real
   run** — reproducibly, to the digit. The measured structure explains why:

   | Query | max score difference | top-5 |
   |---|---|---|
   | how do I install this | 3.6e-8 | identical |
   | where do settings go | 3.6e-8 | identical |
   | is the output reproducible | 3.6e-8 | identical |
   | semantic search by meaning | 4.4e-3 | **rank 5 differs** |
   | convert the graph to JSON | 3.3e-3 | identical |

   Three queries agree to ~2⁻²⁴ — float32 epsilon, as close as the representation allows.
   The others diverge five orders of magnitude further. That bimodality is the signature
   of **int8 quantization boundaries**: most activations round identically on both
   backends, and occasionally one lands on a boundary and the two round opposite ways,
   producing a discrete jump. It is inherent to `q8`, not a defect to pin down. And the
   smallest adjacent-rank margin in this corpus (1.8e-3) is *below* the worst
   disagreement, so tail flips are arithmetically expected rather than exceptional.

   So the gate asserts what the arithmetic can actually support: **any pair of results
   Node separates by more than twice the observed score noise must keep its relative order
   in the browser.** Pairs closer than that are genuine near-ties, and are allowed to swap.
   On the current corpus that is 324 decisive pairs with 0 violations, the closest upheld
   gap being 2.3e-4.

   Because the threshold is calibrated from measured noise, the gate **also bounds that
   noise** (ceiling 2e-2, ~3× what was observed). Otherwise a library regression that
   doubled the disagreement would silently widen the tolerance and keep passing.
4. **A real-model CI job, separate from the default suite.** `npm test` stays hermetic and
   network-free. A distinct `embed-real` job installs the optional peer, downloads granite
   once (cached), and runs both the Node tests and the cross-platform gate. The invariant
   in CLAUDE.md is narrowed to "the default suite", not weakened.

### Consequences

- Good: the embedder is executed against the real library on every run of the gate, so a
  transformers.js release that changes the device vocabulary again fails loudly instead of
  silently shipping.
- Good: dockg's stated guarantee is now one it can demonstrate.
- Bad: near-ties genuinely do flip — one of five gate queries swaps its rank 5, every
  run. Consumers ranking on the tail of a result list must not treat its order as stable
  across platforms. The gate prints every swap it tolerates rather than hiding them.
- Bad: the real-model job needs network and ~53 MB of weights; it is slower than the rest
  of CI and can fail for reasons unrelated to the change under test.
- Neutral: `vectors.bin` remains platform-agnostic. Vectors built anywhere are usable
  anywhere, with the documented tolerance.

### Confirmation

- `test/real/node-embedder.test.ts` — real granite: dims, L2 normalization, mean pooling
  (not `tokens × dims`), intra-platform repeatability, and non-truncation of a
  900-word text.
- `test/real/cross-platform.mjs` — headless Chrome via Playwright; embeds the same queries
  both sides, asserts every decisively-ordered pair holds, bounds the noise floor, and
  prints the cosine, score noise, decisive-pair count, and each tolerated near-tie swap.
  It also reads `numThreads` back in the browser, since a property nobody reads is the
  exact failure this ADR documents on the Node side.
- Both run only in the `embed-real` CI job. Neither is in `npm test`.

## Pros and Cons of the Options

### 1. Accept the split, gate on ranking agreement

- Good: tests the property users have, not a proxy.
- Good: no new build-side dependency; `dockg embed` stays a plain Node command.
- Bad: cannot prove ranking stability for inputs outside the gate's corpus.

### 2. Embed the corpus in a headless browser

- Good: makes the two sides genuinely one implementation, so 01020's claim becomes true.
- Bad: Playwright becomes a build-side dependency of `dockg embed` itself — a browser
  download to build a documentation graph.
- Bad: much slower embedding, for a difference measured at cosine 0.999914.

### 3. Drop the cross-platform claim

- Good: unambiguous, and cheap to enforce with a platform field in the header.
- Bad: a Node-built `vectors.bin` could not be queried from a browser, which removes most
  of Phase 8b's purpose.
