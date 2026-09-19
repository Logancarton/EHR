# Clinical Bond

An AI-native, workspace-first electronic health record for psychiatric practice, built from the ground up to eliminate clinician burnout.

## Running it

A desktop launcher is set up on Windows: double-click **Clinical Bond** on the desktop. It builds on first run, starts the production server, and opens the app. A minimized *Clinical Bond - Server* window stays open while it runs — close that window to stop it.

The launcher generates and stores this installation's session secret and database path in `%LOCALAPPDATA%\ClinicalBond\config.json`, deliberately outside the repository so neither is ever committed. To pick up code changes, run `scripts\Start-ClinicalBond.ps1 -Rebuild`.

The core product mission is simple: **a patient chart behaves like a persistent workspace instead of a sequence of disconnected pages.** Multiple patient charts can remain open simultaneously as reorderable tabs, AI is designed as a native system substrate throughout every clinical surface rather than a bolt-on chatbot, and the UI complexity elastically scales to match the exact needs of the clinician.

## Start here: product True North

Read [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md) for the canonical product direction, complete interaction requirements, and acceptance scenarios: **Chrome + Google Workspace + an AI operating environment**.

The central interaction is `search / command / link / context → object → related object → action`. Future agent work must read this specification alongside [`AGENTS.md`](AGENTS.md). Vision requirements describe the target; current code and validation establish implementation status.

---

## Core Product Pillars

1. **Persistent Multi-Patient Workspace**:
   - Google Chrome-style patient tabs preserve clinical context as you move through your day.
   - Jump between active charts, morning schedules, and medication reviews without losing note drafts or navigating maze-like submenus.

2. **Elastic Complexity (Zen to Cockpit)**:
   - Scales seamlessly from a distraction-free single-column **"Zen" writing pad** (ideal for psychotherapy or focused note-taking) to a high-density, multi-metric **"Cockpit"** (ideal for high-velocity psychopharmacology and med checks).
   - Direct on-screen manipulation: reorder (`▲`/`▼`), collapse, and hide configurable dashboard content while keeping restoration obvious; the retired left sidebar is no longer part of the active shell, and the contextual right companion rail remains optional.
   - Dismissal is never a one-way door: anything hidden stays one click from returning, and every layout choice persists for that clinician across reloads.
   - Built-in clinical presets (`Standard Balanced`, `Minimal / Zen Focus`, `Comprehensive Intake`, `Fast Med Check`) plus clinician-saved custom presets.

3. **Native Bidirectional AI Substrate**:
   - AI is an operator of the system, not just an assistant: clinicians can query cross-chart data (*"Find when Jordan's labs were last done"*), execute layout commands (*"Switch to minimal mode"*, *"Hide action queue"*), or synthesize morning schedules using natural language.
   - Proactive clinical protocol surveillance automatically flags overdue metabolic labs (e.g. Quetiapine, Lithium) and generates one-click draft orders.
   - Longitudinal past encounter search is embedded directly inside the note drafting experience.

---

## Current Working Capabilities

The active prototype includes:

- **Dashboard + Calendar**: Dashboard handles the day/practice command-center view; Calendar is a first-class persistent workspace over the authoritative appointment book with direct day/week/month scheduling workflows.
- **Dynamic Layout Customizer**: Drawer for tuning information density (`Comfortable`, `Compact`, `Minimal`), patient header style (`Full`, `Compact`, `Minimal`), and reordering modules on the fly.
- **Natural Language Preference & Command Bar**: Universal search parses natural language intents to reconfigure the UI, switch presets, and answer clinical questions across patients.
- **Clinical Surveillance Protocols**: Automatic interval calculation tracking overdue labs per medication guidelines.
- **Longitudinal Past Encounter Drawer**: Keyword-search previous visits, HPIs, and titrations while drafting new notes.
- **Google Companion Rail**: Collapsible 52px right rail for AI copilot, scratchpad notes, clinical tasks, and psychiatric screening calculators (PHQ-9, GAD-7).

---

## Running Locally

Use the Node version declared in `.nvmrc`. For a clean or freshly updated checkout, install exactly the committed dependency graph:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000` in your browser.

When intentionally adding, updating, or removing a dependency, use the appropriate npm command and commit `package.json` and `package-lock.json` together. CI also uses `npm ci`, so a stale or mismatched manifest/lockfile pair fails validation instead of being repaired after it reaches `main`.

To run verification checks:

```bash
npm run check       # lint + typecheck + Node/unit tests — the fast inner loop
npm run check:full   # check, plus a production build and the Playwright browser suite
```

`npm run lint` (ESLint, flat config in `eslint.config.mjs`) and `npm run typecheck` can
also be run individually. ESLint owns correctness/quality; formatting is not yet
enforced repo-wide (see `docs/DECISIONS.md`).

---

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI & Runtime**: React 19, TypeScript
- **Styling**: Vanilla CSS with Material 3 design tokens, responsive typography, and Google Workspace aesthetics
- **Persistence (Prototype)**: SQLite (`node:sqlite`) for clinical records, audit history, and per-clinician layout preferences and workspace restoration state, resolved from the authenticated session; `localStorage` (`ehr_provider_preferences_v1`) remains a client-side fallback

---

## Architectural & Clinical Safety Invariants

- **Source of Truth**: `main` on [https://github.com/Logancarton/EHR](https://github.com/Logancarton/EHR) is authoritative.
- **Safety Boundary**: Only fictional/synthetic patient data is permitted. Real PHI will not be introduced until production authentication, audit logging, encryption, and HIPAA-appropriate infrastructure are implemented.
- **AI Principle**: Structured clinical records are always authoritative; AI output is derived assistance requiring explicit clinician action before committing to the legal medical record.
- **Vendor Decoupling**: E-prescribing, EPCS, labs, clearinghouses, and billing vendors sit behind adapters and will never dictate the internal clinical domain model.

See [`AGENTS.md`](AGENTS.md) for the project constitution, [`docs/INDEX.md`](docs/INDEX.md) for the documentation map, [`docs/ROADMAP.md`](docs/ROADMAP.md) for current execution, and [`docs/DECISIONS.md`](docs/DECISIONS.md) for the governing decision index.
