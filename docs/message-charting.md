# Message charting

Patient-facing messages can be promoted into the legal clinical chart as one of three immutable communication records:

- a single source message;
- a snapshot of the full authoritative conversation at the time it is charted;
- a clinician-approved clinical summary, optionally initialized from the AI triage draft.

Every charted communication is patient-bound before execution, retains the source thread/message identifiers and a SHA-256 content hash, creates record-version and provenance records, and is protected from UPDATE/DELETE by database triggers. AI clinical context can read charted communications separately from raw message threads so official chart documentation is distinguishable from conversational source material.
