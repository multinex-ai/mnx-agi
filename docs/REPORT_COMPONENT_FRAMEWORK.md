# Accords Report Kit 1.0

**Vision:** recognize the same navigation and evidence structure across projects while each project keeps its identity.

**Status:** local candidate. FieldLedger is the reference adopter. Other applications and installed package releases are not migrated automatically.

**Abstract:** a small, versioned CSS component layer and machine-readable contract sit between the existing report shell and a project brand adapter. The report builder inlines them into the single maintained HTML. No CDN, new runtime, paid service or always-on container is required.

## Component ownership

Think of a building system: Accords supplies the dimensions and accessible fittings; a project supplies its materials and identity. The report is the assembled room, not another source of project facts.

| Layer | Owns | Source |
|---|---|---|
| Contract | section order, semantics, evidence, target sizes, acceptance | [contract.json](../report-kit/v1/contract.json) |
| Components | type scale, spacing, cards, forms, selected/disabled/focus states, tables, disclosures | [components.css](../report-kit/v1/components.css) |
| Project adapter | brand accent, neutral surfaces, display/body typography, assets | project-owned theme tokens |
| Content | Vision, Status, Abstract, decisions, board and evidence | project state and typed document graph |

The shared source includes compatibility selectors for the reference report and optional `rpt-card`, `rpt-specimens` and `rpt-caption` classes. Semantic native HTML remains the behavior contract. This is a presentation kit, not an independent graph engine, app UI library or replacement for a project's existing framework.

## Adopt in another project

1. Inspect its brand sources, existing builder, tracking reference and authoritative state. Preserve unrelated work.
2. From the MNX-AGI checkout, run `node tools/export-report-kit.mjs <new-staging-directory>`. The exporter rejects an existing destination and writes a SHA-256 provenance receipt. Review the staged files before integrating.
3. Supply every required theme token listed in the contract. Map project typography to `--font-sans` and optional `--font-display`; keep reading surfaces neutral and status meanings distinct from branding. Use installed system fonts or licensed embedded fonts, never an online font dependency in offline reports.
4. Inline project tokens, existing shell, shared components, then narrowly scoped project overrides. Keep local CSS upgrades versioned; never silently edit vendored kit files or bulk-overwrite other repositories.
5. Render component examples inside the existing Product & UX section, alongside actual screen evidence or labelled concepts. Do not create a second maintained showcase report. Source documents, preview assets and runtime data remain in their owning realm.
6. Check all 13 sections, offline execution, keyboard focus, 44px targets, search/filter/stepper behavior, light/dark/system persistence, reduced motion and print. Run axe and inspect screenshots at 360/768/1280/1920 in both themes. A copied kit is not a verified migration.
7. Record version, hashes, adoption scope and verification receipts in project state, realm.md and the maintained report. Update after meaningful progress. Sync only through the verified memory contract; preserve pending local state when unavailable.

## Upgrade and failure rules

Use semantic versions: patch for compatible fixes, minor for additive components, major for changed markup/token contracts. Stage each update in a new directory, compare provenance hashes, integrate and rerun acceptance before retiring the previous version. Keep a recoverable prior HTML snapshot. Missing theme tokens, unresolved links, inaccessible labels or stale evidence block acceptance. Never make up product completion, user metrics or provider availability to fill a component.

The standard is shared; rollout is per project. Global instructions guide future work but do not prove a runtime hook or deployment. The current stylesheet has no network or script dependencies. Existing report interactions may continue to use an established library such as Lit; do not add a framework merely to style controls.
