# Acceptance and integration boundaries

## Shipped baseline

The release must pass its Node test suite, manifest inventory check, self-contained skill/link checks, and a review of all public files. Installation must preserve unrelated host instructions, refuse managed drift and symlink destinations, produce a no-write dry run, be repeatable, and restore prior bytes through rollback. A configuration marked valid must still report `runtimeVerified: false`.

The realm contract is versioned independently as `mnx-agi/v0.1`. Package 1.0.0 stabilizes installation and the governance baseline; it does not promote that integration schema to a production network protocol. Changing the realm contract requires an explicit migration.

## Required before connecting protected memory

Use synthetic data first. Demonstrate correct-account success, missing identity refusal, wrong principal refusal, wrong namespace refusal, and no broader fallback. Verify actual tool schemas, authorization and receipts. Ambiguous writes require reconciliation before retry. Local progress may continue when it does not depend on blocked memory.

## Required before concurrent shared mutation

Demonstrate conditional ownership, lease expiry and fencing, stale-worker rejection, retry deduplication, interruption and resumption. If the service cannot provide these properties, use one writer or a verified external coordinator. A saved plan record alone is not a lock.

## Required before federation

Use two synthetic isolated realms. Test an explicit purpose-bound grant, an absent grant, the wrong destination, expiry, revocation, replay, data minimization, and receiving-side rejection of embedded instructions. Verify the receipt and limits of retraction. A configured peer does not enable export.

## Required before decision-model routing

Compare against deterministic routing and the existing agent on representative tasks. Include ambiguity, malformed output, timeouts, unavailable candidates, injection attempts and calibration drift. Require an abstention path and revalidate eligibility before execution. Classification cannot grant permission or prove completion.

## Evaluation records

Record the fixture, expected observable behavior, model/tool versions, configuration digest, actual result, evidence reference and unresolved limitations. Separate a static schema check, an automated unit test, a human workflow review and a live behavioral test. Do not promote an integration based on documentation or vendor benchmark claims alone.

External MemQ adapters, a federation gateway, a registry resolver and decision-model integrations are optional follow-on implementations with the gates above. They are not silently activated by installing this release.
