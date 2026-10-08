---
name: mnx-realm-context
description: Resolve the active realm, effective scope and relevant context when starting or switching a realm-bound task. Use before protected memory access or coordination, not for unrelated casual conversation.
---

# Realm context

This skill follows the active host instructions and authorized task.

Identify the working directory, explicit target projects, linked-worktree ownership, applicable host instructions and the authorized task. Project ownership takes precedence over the incidental working directory when selecting a private account. Read the nearest declared realm configuration; if there is none, treat work as local to the authorized workspace without inventing a remote namespace. Read [CORE](references/CORE.md) for the policy precedence and [architecture](references/ARCHITECTURE.md) for identity/discovery boundaries.

Distinguish mandatory constraints from ordinary defaults. The host hierarchy remains authoritative. Do not union sibling realms or infer access from a global registry. Record the rule source when a conflict affects the task.

If the task needs protected memory, discover the actual MemQ tools and follow [the scope contract](references/MEMQ_CONTRACT.md). Compare authenticated scope with the expected binding before reads or writes. A tag is not a namespace. A configured namespace string is not permission.

Load a concise objective and only relevant skill metadata/context. Avoid loading every policy document or every realm. If required identity is unavailable, pause protected access while continuing independent local work. Report a short scope summary only when it changes what the user needs to know; no compulsory persona ceremony.

Return the active realm, effective constraints/defaults, available required capabilities and unresolved dependencies. Do not claim a live connection from configuration alone.
