# MNX-AGI skills

These eight skills are workflow definitions installed by the CLI. Each skill routes a specific kind of work and refers to the shared core and MemQ contract. The installer places self-contained copies in the selected hosts' skill directories.

| Skill | Trigger | Result |
|---|---|---|
| [realm-context](../skills/mnx-realm-context/SKILL.md) | Start or switch a realm-bound task | Effective scope and relevant context |
| [memq-recall](../skills/mnx-memq-recall/SKILL.md) | Prior knowledge can change a decision | Bounded, sourced context with uncertainty |
| [memq-checkpoint](../skills/mnx-memq-checkpoint/SKILL.md) | Long work, interruption, or meaningful phase boundary | Resumable done/next/blocked state |
| [memq-coordinate](../skills/mnx-memq-coordinate/SKILL.md) | Authorized agents share one task | Bounded ownership, revision and handoff evidence |
| [memq-learn](../skills/mnx-memq-learn/SKILL.md) | A verified outcome yields a reusable lesson | Evidence-linked candidate knowledge |
| [realm-federation](../skills/mnx-realm-federation/SKILL.md) | Explicit cross-realm query, export or handoff | Minimal permitted projection and receipt |
| [decision-routing](../skills/mnx-decision-routing/SKILL.md) | Route among a finite set of eligible choices | Typed choice or abstention, subject to actual permissions |
| [harness-evaluate](../skills/mnx-harness-evaluate/SKILL.md) | Compare or change harness behavior | Reproducible behavioral evaluation and adoption recommendation |

Skills do not automatically spawn agents, contact peers, install services, mutate global settings, promote memory, or grant permissions. Their availability should be advertised cheaply; load only the selected workflow and needed references.
