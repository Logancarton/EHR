# EHR

An AI-infused, workspace-first electronic health record prototype.

The core product idea is simple: a patient chart behaves like a persistent workspace instead of a sequence of disconnected pages. Multiple patient charts can remain open as reorderable tabs, and the AI layer follows the active patient and clinical surface.

## Current prototype

The initial UI includes:

- browser-style patient tabs
- drag-to-reorder patient workspaces
- global patient search using fictional mock data
- patient header and clinical alerts
- Overview, Encounter, Medications, Labs, Messages, and History surfaces
- persistent context-aware Clinical AI side panel
- responsive desktop/mobile layout

This phase is intentionally frontend-only. It does not connect to real PHI, a database, prescribing, billing, labs, or clinical decision support.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

Validate TypeScript with:

```bash
npm run typecheck
```

Create a production build with:

```bash
npm run build
```

## Stack

- Next.js 16
- React 19
- TypeScript
- plain CSS for the first interaction prototype

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the current product model, architectural boundaries, and next milestone.

## Safety boundary

Only fictional patient data is included. Real patient information should not be introduced until authentication, authorization, audit logging, encryption, retention, backup, and HIPAA-appropriate infrastructure are designed and implemented.
