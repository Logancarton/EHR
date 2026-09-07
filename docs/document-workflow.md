# Document workflow

Patient documents are first-class chart records with an explicit forward-only workflow:

`received -> needs_review -> reviewed -> filed -> superseded`

## Safety and integrity

- Workflow mutations are patient-bound consequential actions and must pass through `ClinicalActionGateway` with the active chart patient context.
- Transitions cannot skip states or move backward.
- Superseding requires a replacement document for the same patient; a document cannot replace itself or use an already-superseded document as the active replacement.
- Every transition creates an immutable `document_workflow_events` record, a `record_versions` snapshot, a provenance event, and an audit log entry.
- Review and filing actor/timestamps are stored on the authoritative document row.

## User experience

- Every patient chart has a Documents section with a document list and exact selected-document detail pane.
- The detail pane shows source, versions, workflow history, reviewer/filer metadata, and only the next legally allowed workflow action.
- The global Documents queue shows received/needs-review/filed counts and routes directly to the exact patient document.
- Browser-style Back/Forward navigation preserves the selected document identity.
