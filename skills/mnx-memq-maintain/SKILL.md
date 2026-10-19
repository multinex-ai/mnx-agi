---
name: mnx-memq-maintain
description: Review stale or duplicated MemQ records and perform explicitly authorized corrections, retention changes, exports, or deletion with scope checks and verifiable receipts.
---

# Maintain memory safely

Use this workflow for correcting retained facts, resolving stale records, reviewing duplicates, or a specific retention/export/deletion request. Routine task completion does not authorize bulk cleanup. Follow [the MemQ contract](references/MEMQ_CONTRACT.md) and the active realm's policy.

Verify the current authenticated subject, namespace, intended data class, and operation scope. Discover the actual lifecycle tools and their semantics. Do not substitute reflection, consolidation, namespace switching, or a local file deletion for an unavailable provider deletion API.

Find the minimum set of affected record IDs using bounded exact or scoped retrieval. Separate independently corroborated duplicates from distinct events with similar wording. A newer record is not automatically more authoritative; compare evidence and source revisions. Prepare specific proposed corrections, supersession links, retention changes, or export projections with their consequences.

For corrections, preserve provenance and uncertainty. Do not reinforce a claim merely because it appears repeatedly. For destructive changes, meet the host's action-time approval requirements with exact scope before dispatch. Cross-realm export additionally uses the federation workflow; an ordinary maintenance request never grants cross-account disclosure.

Use supported conditional writes, operation identifiers, and receipts. Reconcile uncertain outcomes before retrying. Verify the intended records and, when supported, exclusion from retrieval, indexes, caches, derived memories, and learning jobs. Disclose copies or derived data the service cannot retract. Metadata saying “private,” “excluded,” or “deleted” is not proof of enforcement.

Keep the audit free of credentials and unnecessary source content. Report what changed, what was verified, and what remains outside the service's lifecycle guarantees. Use [runtime verification](references/RUNTIME.md) for deletion and learning-exclusion checks.

Use [the tool coverage map](references/MEMQ_TOOL_COVERAGE.md) to select among currently exposed capabilities. Installed skills do not grant access to tools withheld by the host.
