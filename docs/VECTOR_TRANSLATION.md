# Universal vector translation: keep knowledge portable

**Switch models. Keep the context. Build on what works.**

Embedding models represent information as vectors, and those vectors can differ in size and meaning. MemQ includes vector-translation interfaces for adapting supported source and target dimensions. The practical goal is a common memory workflow as your model stack evolves, with explicit compatibility checks rather than a separate integration assumption for every vector shape.

## What the user gets

- **More freedom to change tools.** Keep the underlying facts, decisions, checkpoints, and source references available to authorized agents even as model choices change.
- **A common integration contract.** Describe the source and target embedding profiles so compatible translation paths can be evaluated and reused.
- **A deliberate migration path.** Test translated retrieval against a baseline before deciding whether translation or re-embedding is appropriate for the new profile.
- **Continuity with provenance.** Know which source material and embedding profile produced a result, rather than treating every vector as interchangeable.

## What “universal” covers

Here, universal describes a provider-neutral interface for supported vector dimensions. It is not a promise that every embedding model shares the same semantic space, that every conversion is lossless, or that all deployments expose the same profiles.

Matching dimensions does not prove that two independently trained models represent meaning the same way. Numerical projection can change a vector's shape without aligning its semantic coordinates. Retrieval quality therefore needs profile-specific evaluation, even when the translation operation succeeds.

Keep three capabilities distinct:

| Capability | What it establishes |
|---|---|
| Source-backed memory | Facts and context remain available beyond a session or model choice |
| Vector dimension adaptation | A supported vector can be transformed to the required shape |
| Semantic retrieval compatibility | Relevant memories are actually retrieved with acceptable quality for the selected embedding profiles |

The first does not require claiming that every vector conversion has the third property. Preserve source material and allow re-embedding when a translation path does not meet the retrieval threshold.

## Deployment evidence

Discover the live API, permitted profiles, dimensional limits, and authenticated scope. Record the source model, target model, transformation method, and provenance. Evaluate representative queries, paraphrases, irrelevant queries, and wrong-scope attempts against an appropriate baseline. Measure retrieval quality and migration costs separately.

The MNX-AGI repository provides the harness and integration contracts. Vector translation belongs to the configured MemQ service; it is not implemented by the narrow experimental Codex plan gateway. This documentation does not establish live translation availability or cross-model retrieval performance for a particular deployment.

See [the pairing guide](MEMQ_PAIRING.md), [MemQ capability contract](MEMQ_CONTRACT.md), and [runtime verification](RUNTIME.md).
