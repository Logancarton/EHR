# Clinical Bond

An AI-infused EHR for psychiatric practice, owned and directed by Logan Carton, PMHNP-BC.

**A calm clinical workspace where you can get to the right information and action from wherever you are, without losing the patient or the work in progress.**

## The intended experience

Clinical Bond combines Chrome-style persistent workspaces with the light, readable visual language of Google Workspace and Facebook: white surfaces, restrained borders, clear labels, generous usable space, and detail on demand. These are design references, not a request to clone another product or add a UI framework.

A patient is a workspace. Keep several charts open, move between them, inspect related evidence beside an encounter, and return to the same draft, section, and scroll position. The main shell has two levels: a calm global bar and a labeled open-work tab strip. Home is the suite launcher; the tab strip's always-available `+` opens or focuses major workspaces such as Calendar, Patients, Intake, Documents, Billing, and Brand. Contextual tools live in the right companion/canvas system and can expand without losing the workspace beneath them. Staff/HR belongs in that companion layer rather than the major-app launcher. The retired left sidebar stays retired.

AI is a system capability across the omnibox, Home, and companion tools. Typed and spoken intent should share permission-aware patient resolution, evidence retrieval, navigation, and reviewed action proposals. Structured records remain authoritative. Asking a question or opening a record must not silently sign, prescribe, transmit, or change clinical state.

The default is minimal and readable. A clinician can reveal detail, add/rearrange windows, change density, or save a richer cockpit. Reduce repeated identity blocks, counts, warnings, and layout controls while preserving information, keyboard access, visible recovery, and clinical functionality. Owner defaults remain clinical; business tools are optional.

## Start here

| Document | Owns |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Agent workflow, constraints, validation, and handoff rules |
| [Product vision](docs/PRODUCT_VISION.md) | Canonical experience requirements and stable acceptance IDs |
| [Roadmap](docs/ROADMAP.md) | Current evidence, ordered execution slices, dependencies, and completion gates |
| [Architecture](docs/ARCHITECTURE.md) | Implemented boundaries and known structural gaps |
| [Decision index](docs/DECISIONS.md) | Governing decisions, amendments, and preserved rationale |
| [Documentation index](docs/INDEX.md) | Task-specific domain references and historical archives |

**Coding agents:** read the first three, inspect current `main`, and execute the next eligible roadmap slice unless Logan supplies a different scope. Reuse what already works. The roadmap is the only ordered work queue; this README is an orientation, not a competing plan.

## Current prototype and its limits

The repository contains persistent patient workspaces, Dashboard and Calendar over a shared appointment store, prospective-person Intake, longitudinal records, encounter persistence/signing, operational queues, internal billing charges, and authenticated organization/patient authority boundaries. Feature presence is not a claim that every workflow is certified complete.

The 2026-09-19 review found remaining gaps: the AI companion still has a separate answer path with hardcoded content; some communication/practice panels simulate external success; several screens repeat identity, counts, alerts, and controls. The roadmap records the inspected commit, CI evidence, and specific remediation gates. Do not describe all AI surfaces as unified or all visible integrations as working until those gates pass.

This is a **synthetic-data prototype**. Real PHI remains behind the production-readiness gate. DrFirst is the selected planned prescribing/EPCS vendor, but live access and enablement are deferred. Unsupported external services must say they are disconnected or be contained in an explicit preview. Missing data is not zero, normal, delivered, or complete.

## Run locally

Use the Node version in [.nvmrc](.nvmrc). From an existing checkout:

```bash
git pull origin main
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Dependency changes must commit `package.json` and `package-lock.json` together; CI uses `npm ci`.

On an existing Windows installation, the Clinical Bond desktop launcher builds on first run, starts the production server, and opens the app. Closing its server window stops it. The launcher stores the installation's session secret and database path outside the repository in `%LOCALAPPDATA%\ClinicalBond\config.json`. To rebuild after changes, run `scripts\Start-ClinicalBond.ps1 -Rebuild`.

## Verify work

```bash
npm run check        # lint, typecheck, and Node/integration tests
npm run build        # production build
npm run test:browser # Playwright; install Chromium if needed
```

`npm run check:full` runs the complete sequence including browser installation. Runtime changes require the repository gates plus focused workflow verification. Documentation-only changes require link/anchor checks, a complete diff review, `git diff --check`, and inspection of available CI; do not run expensive application tests solely for Markdown edits. A known failing baseline is a tracked defect, not permission to weaken tests or call the build green.

## Technical boundaries

Next.js 16, React 19, TypeScript, vanilla CSS with shared design tokens, and prototype SQLite persistence through `node:sqlite`. No Tailwind migration is part of the visual plan.

Clinical records, immutable signed encounters, audit/provenance, authorization, workspace preferences, AI proposals, and external transport evidence have distinct owners. UI cleanup must preserve them. Vendor adapters keep integrations replaceable. GitHub `main` is authoritative, and agent-assisted work goes directly to `main` unless Logan requests otherwise.
