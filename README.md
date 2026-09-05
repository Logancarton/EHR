# EHR

An AI-native, workspace-first electronic health record built from the ground up to eliminate clinician burnout.

The core product mission is simple: **a patient chart behaves like a persistent workspace instead of a sequence of disconnected pages.** Multiple patient charts can remain open simultaneously as reorderable tabs, AI is designed as a native system substrate throughout every clinical surface rather than a bolt-on chatbot, and the UI complexity elastically scales to match the exact needs of the clinician.

---

## Core Product Pillars

1. **Persistent Multi-Patient Workspace**:
   - Google Chrome-style patient tabs preserve clinical context as you move through your day.
   - Jump between active charts, morning schedules, and medication reviews without losing note drafts or navigating maze-like submenus.

2. **Elastic Complexity (Zen to Cockpit)**:
   - Scales seamlessly from a distraction-free single-column **"Zen" writing pad** (ideal for psychotherapy or focused note-taking) to a high-density, multi-metric **"Cockpit"** (ideal for high-velocity psychopharmacology and med checks).
   - Direct on-screen manipulation: reorder (`▲`/`▼`), collapse, and hide any card or widget with one click.
   - Built-in clinical presets (`Standard Balanced`, `Minimal / Zen Focus`, `Comprehensive Intake`, `Fast Med Check`) plus clinician-saved custom presets.

3. **Native Bidirectional AI Substrate**:
   - AI is an operator of the system, not just an assistant: clinicians can query cross-chart data (*"Find when Jordan's labs were last done"*), execute layout commands (*"Switch to minimal mode"*, *"Hide action queue"*), or synthesize morning schedules using natural language.
   - Proactive clinical protocol surveillance automatically flags overdue metabolic labs (e.g. Quetiapine, Lithium) and generates one-click draft orders.
   - Longitudinal past encounter search is embedded directly inside the note drafting experience.

---

## Current Working Capabilities

The active prototype includes:

- **Today / Schedule Cockpit**: Live patient flow metrics (`Total Scheduled`, `Waiting in Lobby`, `In Visit`, `Upcoming`), one-click "Start Visit" transitions, walk-in scheduling modal, and dynamic AI Morning Briefing.
- **Dynamic Layout Customizer**: Drawer for tuning information density (`Comfortable`, `Compact`, `Minimal`), patient header style (`Full`, `Compact`, `Minimal`), and reordering modules on the fly.
- **Natural Language Preference & Command Bar**: Universal search parses natural language intents to reconfigure the UI, switch presets, and answer clinical questions across patients.
- **Clinical Surveillance Protocols**: Automatic interval calculation tracking overdue labs per medication guidelines.
- **Longitudinal Past Encounter Drawer**: Keyword-search previous visits, HPIs, and titrations while drafting new notes.
- **Google Companion Rail**: Collapsible 52px right rail for AI copilot, scratchpad notes, clinical tasks, and psychiatric screening calculators (PHQ-9, GAD-7).

---

## Running Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

To run verification checks:

```bash
npm run typecheck
npm run build
```

---

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **UI & Runtime**: React 19, TypeScript
- **Styling**: Vanilla CSS with Material 3 design tokens, responsive typography, and Google Workspace aesthetics
- **Persistence (Prototype)**: Reactive browser state with `localStorage` preference engine (`ehr_provider_preferences_v1`)

---

## Architectural & Clinical Safety Invariants

- **Source of Truth**: `main` on [https://github.com/Logancarton/EHR](https://github.com/Logancarton/EHR) is authoritative.
- **Safety Boundary**: Only fictional/synthetic patient data is permitted. Real PHI will not be introduced until production authentication, audit logging, encryption, and HIPAA-appropriate infrastructure are implemented.
- **AI Principle**: Structured clinical records are always authoritative; AI output is derived assistance requiring explicit clinician action before committing to the legal medical record.
- **Vendor Decoupling**: E-prescribing, EPCS, labs, clearinghouses, and billing vendors sit behind adapters and will never dictate the internal clinical domain model.

See [`AGENTS.md`](AGENTS.md) for the project constitution, [`docs/ROADMAP.md`](docs/ROADMAP.md) for the living build sequence, and [`docs/AI_SYSTEM.md`](docs/AI_SYSTEM.md) for AI architecture details.
