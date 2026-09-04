# EHR

An AI-infused, workspace-first electronic health record being built from the ground up.

The core product idea is simple: a patient chart behaves like a persistent workspace instead of a sequence of disconnected pages. Multiple patient charts can remain open as reorderable tabs, and AI is designed as a contextual system layer throughout clinical and operational workflows rather than as a separate chatbot.

## Start here

For coding agents and future development sessions:

1. Read [`AGENTS.md`](AGENTS.md) first. It is the project constitution and highest-level development instruction.
2. Read [`docs/INDEX.md`](docs/INDEX.md) for the durable product, architecture, AI, roadmap, and decision documents.
3. For feature implementation, use [`.codex/skills/ehr-builder/SKILL.md`](.codex/skills/ehr-builder/SKILL.md).

GitHub `main` is the source of truth. Agent-assisted GitHub development is performed directly on `main` unless Logan explicitly requests a branch or pull request.

## Current prototype

The initial UI includes:

- browser-style patient tabs
- drag-to-reorder patient workspaces
- global patient search using fictional mock data
- patient header and clinical alerts
- Overview, Encounter, Medications, Labs, Messages, and History surfaces
- persistent context-aware Clinical AI side panel
- responsive desktop/mobile layout

This phase is intentionally frontend-only. It does not connect to real PHI, a production database, prescribing, billing, labs, or clinical decision support.

## Current build direction

The next goal is the single-clinician workflow nucleus:

- Today/schedule dashboard
- patient creation/search and domain model
- encounter lifecycle with autosaved drafts
- longitudinal patient timeline
- medication workspace
- tasks/inbox

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the ordered build sequence.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

Validate with:

```bash
npm run typecheck
npm run build
```

## Stack

- Next.js 16
- React 19
- TypeScript
- plain CSS for the first interaction prototype

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the current system boundaries and [`docs/AI_SYSTEM.md`](docs/AI_SYSTEM.md) for the AI architecture.

## Safety boundary

Only fictional patient data is included. Real patient information should not be introduced until authentication, authorization, audit logging, encryption, secrets management, retention, backup/recovery, and HIPAA-appropriate infrastructure are intentionally designed and implemented.
