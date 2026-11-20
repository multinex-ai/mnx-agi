# Accords Sovereign Interactive Report & Tracker Standard (v2.2)

Version 2.2.0-mnx1.4 (Updated November 12, 2026 — token structure aligned to a `defineTheme`-shaped accent/radius/motion pattern; brand/UI package choices themselves stay out of this public package per `profiles/multinex.md`). Applies unilaterally across Codex (`AGENTS.md`), Claude Code (`CLAUDE.md`), and Antigravity/Gemini (`GEMINI.md`).

When producing substantial explanations, architecture briefs, planning roadmaps, tracking files, qualification receipts, or status reports, deliver a self-contained interactive HTML report (`<!doctype html>`) governed by this standard. Keep brief conversational answers concise in chat and honor a different format whenever explicitly requested.

## 1. Explanation Depth & Tone (Unlabeled ELI16 Default)

- **Implicit ELI16 Clarity (`MUST`):** Write all explanations, summaries, and component descriptions at an intelligent, concrete **ELI16** level by default—clear enough for a sharp 16-year-old or cross-functional partner to grasp the real mechanics, trade-offs, and failure modes immediately, without juvenile analogies or unexplained jargon soup.
- **No Meta-Labels (`MUST NOT`):** Never print literal labels such as `"ELI16"`, `"ELI10"`, or `"Explain Like I'm..."` in headings, badges, callouts, or body prose. Let the clarity of the writing speak for itself.

## 2. Canonical Design Tokens, Dark/Light Mode & Surface Hierarchy (`MUST` Include in `<style>`)

Every HTML report and tracker MUST support seamless **Dark Mode and Light Mode** switching (`<meta name="color-scheme" content="light dark">` + interactive `Dark` / `Light` / `System` toggle in the HUD persisted to `localStorage`) and initialize its stylesheet with this canonical token block (selecting `--brand` via `data-brand="emerald|cyan|indigo|amber|crimson"` on `<html>`):

```css
:root {
  color-scheme: light dark;
  interpolate-size: allow-keywords;
  /* Sovereign Neutral Surface Hierarchy (Light Mode: Ivory Paper / Dark Mode: Astryx Obsidian) */
  --bg-canvas: light-dark(#F7F8FA, #05070B);
  --bg-elevated: light-dark(#FFFFFF, #090C11);
  --bg-card: light-dark(#FFFFFF, #0D1117);
  --bg-interactive: light-dark(#F1F5F9, #151C25);
  --bg-glass: light-dark(rgba(255, 255, 255, 0.88), rgba(13, 17, 23, 0.84));
  --text-1: light-dark(#0F172A, #E8EEF2);
  --text-2: light-dark(#475569, #9FB0BF);
  --text-3: light-dark(#64748B, #6E7F8E);
  --border-subtle: light-dark(rgba(15, 23, 42, 0.10), rgba(255, 255, 255, 0.09));
  --border-strong: light-dark(rgba(15, 23, 42, 0.20), rgba(255, 255, 255, 0.18));
  --shadow-card: light-dark(0 2px 10px rgba(15, 23, 42, 0.06), 0 14px 34px rgba(0, 0, 0, 0.48));
  --specular-top: inset 0 1px 0 light-dark(rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.07));
  /* Accords Two-Axis Semantic Accents & Strict 6%–14% Translucent Surface Fills */
  --status-confirmed: light-dark(#059669, #34D399);
  --status-confirmed-bg: light-dark(rgba(5, 150, 105, 0.10), rgba(52, 211, 153, 0.10));
  --status-confirmed-bd: light-dark(rgba(5, 150, 105, 0.28), rgba(52, 211, 153, 0.32));
  --status-proposed: light-dark(#0284C7, #3DF0FF);
  --status-proposed-bg: light-dark(rgba(2, 132, 199, 0.10), rgba(61, 240, 255, 0.10));
  --status-proposed-bd: light-dark(rgba(2, 132, 199, 0.28), rgba(61, 240, 255, 0.32));
  --status-open: light-dark(#B45309, #F59E0B);
  --status-open-bg: light-dark(rgba(217, 119, 6, 0.10), rgba(245, 158, 11, 0.10));
  --status-open-bd: light-dark(rgba(217, 119, 6, 0.28), rgba(245, 158, 11, 0.32));
  --status-conflicted: light-dark(#DC2626, #EF4444);
  --status-conflicted-bg: light-dark(rgba(220, 38, 38, 0.10), rgba(239, 68, 68, 0.10));
  --status-conflicted-bd: light-dark(rgba(220, 38, 38, 0.28), rgba(239, 68, 68, 0.32));
  --brand: var(--status-proposed);
  --brand-bg: var(--status-proposed-bg);
  --brand-bd: var(--status-proposed-bd);
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  /* defineTheme-shaped theming primitives (accent / radius+multiplier / motion fast+medium+ratio)
     so a hand-rolled offline report and a themed app share one design language. */
  --radius-base: 8px;
  --radius-multiplier: 1;
  --radius-sm: calc(var(--radius-base) * 0.5 * var(--radius-multiplier));
  --radius-md: calc(var(--radius-base) * var(--radius-multiplier));
  --radius-lg: calc(var(--radius-base) * 1.5 * var(--radius-multiplier));
  --motion-fast: 120ms;
  --motion-medium: 220ms;
  --motion-ratio: 1.8;
}
html[data-theme="dark"] { color-scheme: dark; }
html[data-theme="light"] { color-scheme: light; }
html[data-brand="emerald"] { --brand: var(--status-confirmed); --brand-bg: var(--status-confirmed-bg); --brand-bd: var(--status-confirmed-bd); }
html[data-brand="amber"]   { --brand: var(--status-open);      --brand-bg: var(--status-open-bg);      --brand-bd: var(--status-open-bd); }
html[data-brand="indigo"]  { --brand: light-dark(#4F46E5, #A78BFA); --brand-bg: light-dark(rgba(79,70,229,0.10), rgba(167,139,250,0.10)); --brand-bd: light-dark(rgba(79,70,229,0.28), rgba(167,139,250,0.32)); }
```

## 3. Visual & Structural Rules (`MUST` / `MUST NOT`)

- **Theming-Pattern Alignment (`MUST`):** Token names, radius scale, and motion durations follow a `defineTheme`-shaped pattern -- a single accent derives `--brand`/`--status-*`, `radius.base`/`multiplier` drives `--radius-*`, `motion.fast`/`medium`/`ratio` drives `--motion-*` -- so a static report and a themed app share one design language and porting between them is mechanical, not a rewrite. Use `var(--motion-fast)`/`var(--motion-medium)` for hover/focus/transition durations instead of inventing ad-hoc values.
- **MUST Verify Contrast In Both Modes, After Theming, Not Before:** once an accent/theme is actually configured, re-check text-on-background contrast separately in light mode and in dark mode -- a palette that compiles via `light-dark()` is not guaranteed to be legible in both directions. Spot-check body text (`>= 4.5:1`), large text/headings (`>= 3:1`), and secondary text against the actual background tokens in both themes. Don't assume dark mode "just works" because light mode passed, or vice versa.
- **MUST NOT Tint Reading Surfaces:** Never flood `--bg-canvas` or `--bg-card` with dark green, navy, or saturated brand colors. All reading surfaces MUST remain neutral (`--bg-canvas`, `--bg-card`) so semantic status badges and SVG diagrams carry clear chromatic meaning in both Dark Mode and Light Mode.
- **MUST Enforce the 6%–14% Opacity Rule:** Callouts, warning banners, and status pills MUST use translucent surface fills (`6%` to `14%` alpha via `--status-*-bg`) with `1px solid var(--status-*-bd)` borders and high-contrast text (`>= 4.5:1`). Never place opaque pastel blocks (e.g., solid yellow `#f6e0ad`) on dark surfaces.
- **Fluid Typography & Tabular Numerals:** Use `clamp()` fluid sizing (`rem`-based, never `< 0.75rem`/`12px`), `text-wrap: balance` on headings, `text-wrap: pretty` on body prose (`max-width: 72ch`), and `font-variant-numeric: tabular-nums` on all KPIs, tables, counters, and timestamps.

## 4. High Visual & Diagram Density (`MUST` Include Multiple Rendered SVG Visuals)

Do NOT deliver text-heavy walls of cards or tables without visual diagrams. Every report MUST pair narrative and tables with rich, theme-aware inline SVG diagrams (`currentColor` / CSS variables so they adapt to Dark & Light Mode):

1. **Interactive SVG Architecture & Trust-Boundary Diagram:** Render an inline `<svg>` system topology showing trust-zone enclosures (e.g., Device Sandbox, Authenticated Edge, Private VPC, Redacted Public View), directional bezier/orthogonal connectors, animated data-flow paths, and clickable nodes wired to a live **Component Inspector Panel** (`aria-live="polite"`).
2. **Lifecycle Sequence Swimlane / Failure-Recovery State Diagram:** Render a visual sequence flow or state-transition diagram (with an interactive `Prev` / `Next` stage stepper) illustrating both the primary execution path and the failure/retry/rollback path.
3. **Visual Data Charts, Funnels & Telemetry Gauges:** Render visual SVG funnel bars, proportional progress meters, latency/reliability gauges, or cohort comparison charts alongside metric tables.
4. **Visual Milestone & Gate Dependency Pipeline:** Render a visual horizontal phase/gate timeline showing how each delivery phase unlocks the next verification gate.

## 5. Mandatory Layout, HUD Controls & Accords Two-Axis Telemetry

1. **Sticky Glassmorphic Command HUD (`< 10%` viewport height):**
   - Top scroll-progress bar (`animation-timeline: scroll()` with JS fallback, `aria-hidden="true"`).
   - Project/realm badge, live Scrollspy navigation pills (`scroll-target-group: auto` + `:is(:target-current, .target-current)` + `aria-current="location"`), live search input (`/` shortcut), density toggle (`Comfortable` / `Compact`), explicit **Dark / Light / System** theme switcher, and `Print / PDF` button.
2. **Above-the-Fold Hero Decision Bento Grid:**
   - **Primary Outcome Cell:** Title, clear unlabelled ELI16 lead summary (`2–4` sentences), and scope/snapshot metadata.
   - **Decision & Next Action Gate:** Explicit decision, single next action (Ouroboros narrowing), and named owner.
   - **Tabular KPI / Readiness Strip:** Concrete counters with explicit denominators and visual progress bars.
   - **Two-Axis Status Badges:** Pair Semantic Status (`CONFIRMED` · `PROPOSED` · `OPEN` · `CONFLICTED`) × Truth Label (`MEASURED` · `DIRECTIONAL` · `ILLUSTRATIVE` · `CONFIRM`) × Verification State (`IMPLEMENTED` · `LOCALLY VERIFIED` · `BUILD-READY` · `DEPLOYED` · `LIVE-VERIFIED` · `BLOCKED / UNVERIFIED`).
3. **Faceted Filtering, Searchable Disclosures & Print Parity:**
   - Interactive filter pills + live text search announcing visible counts via `role="status"`.
   - `<details>` disclosures with `interpolate-size: allow-keywords`, `@container (width < 640px)` responsive tables (`tabindex="0" role="region"`), `@media (prefers-reduced-motion: reduce)`, and `beforeprint` auto-expansion.

## 6. System-Level Scripting & Tooling Language Mandate

- **Rust (`Cargo.toml`) and Deno / Node TypeScript (`deno.json` / `package.json` + `.ts`)** are the mandatory system-level scripting and program languages by specification over Python.
- Do NOT write ad-hoc Python (`.py`) scripts for report generation, system automation, or governance tooling unless Python is already the established de facto language and style in the specific target project being worked on.

## Versioned component implementation — November 15, 2026

The neutral Accords Report Kit 1.0.0 implements reusable control, card, typography, spacing, disclosure and evidence styles. Follow the package adoption guide at `docs/REPORT_COMPONENT_FRAMEWORK.md`; export with `tools/export-report-kit.mjs` into a new staging directory and retain its provenance receipt. Each project maps its own brand tokens and retains one offline report. Existing runtime libraries remain project choices. Verify actual output in both themes at all required widths before claiming adoption. Purpose-selected visuals and concrete UI previews take precedence over decorative diagram quotas. Keep simple explanations concise; use helpful analogies without printing reading-level labels.
