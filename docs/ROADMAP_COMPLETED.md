# Clinical Bond Roadmap — completed work

The log of finished work and its evidence. Unfinished work, the ordered queue and open defects live in [ROADMAP.md](ROADMAP.md).

**Adding to this file.** When a slice is verified complete, add its entry to the top of *Completion log* in the same commit that finishes it: slice ID, date, starting and resulting SHA, what changed, checks actually run and their results, and named gaps. Then remove it from ROADMAP.md and carry any named gaps into ROADMAP.md's *Open defects and follow-ups*. Keep entries factual; do not rewrite history to sound current.

**Reading older entries.** Everything below the completion log was moved verbatim from ROADMAP.md on 2026-09-26. Statuses and "next step" remarks inside those entries are as recorded at the time. Where one says "in progress", "validation pending" or names a next slice, ROADMAP.md is authoritative for what remains. Evidence before 2026-09-19 is in [the roadmap archive](archive/roadmap/ROADMAP-through-2026-09-19.md).

## Completion log

### CONV-1b — conversation memory and the named-patient check (owner direction 2026-10-09, D-132)

- **Starting SHA:** a67eb9e.
- **Change:** the Clinical AI panel sends up to six earlier questions (`priorQuestionsFor`): the clinician's words only, from turns answered about the thread's patient. The route validates them (array of at most 6 strings, each up to 4000 characters). `app/server/ai/conversation-follow-up.ts` reads two follow-ups: "what about <patient>?" repeats the last question for that patient, and "the one before that" steps back through the last lab question's results. The planner re-answers from records, reports `followUp`, and the plan card shows "Read as: …". With a chart active, a partial name that points to another patient asks for the full name, quoting the typed word and showing the match's DOB, and answers nothing. A matching DOB in either stored form identifies one patient. Candidates carry DOB. Requirements CONV-01, CONV-06.
- **Changed assertion:** `omnibox-planning-boundary` used "Order a lithium level for Jordan" from Maya's chart to show a visible, blocked switch. That sentence now asks for the full name (asserted), and the same switch-and-block assertions moved unchanged to "…for Jordan Reed". This was an intended D-132 behavior change, not a weakening.
- **Validation:** `npm run check` 685/685 (0 lint errors; new `tests/conversation-follow-up.test.ts` 5/5 covers the reader, lab step-back to exhaustion, another-patient follow-up, first-name refusal, surname ambiguity with DOBs, DOB identification in both forms, and a wrong DOB; `clinical-ai-thread` 11/11; `care-completion-voice-defer` adds DOB checks); `npm run build` passed. Browser: companion-ai 2/2 (asserts the request carries `priorQuestions` and the thread patient, the "What about David?" refusal with DOB, and the "What about David Kim?" recap with its "Read as" line), plus home-assistant 7/7, omnibox-ambient-preview 1/1, omnibox-workspace-object-navigation 1/1, review-2026-10-06 4/4, review-improvements 5/5, voice-menu 4/4 and workspace-ergonomics 5/5. The first browser run caught two defects, both fixed before this entry: synthetic DOBs stored as `MM/DD/YYYY` never matched, and the refusal quoted the full name instead of the typed word. Screenshot inspected at 1280×720 (`output/playwright/conv-1-thread.png`).
- **Named gaps:** step-back covers lab results only, within the bounded recent-lab context (10 per request). The follow-up reader recognizes fixed English phrasings, not paraphrases. The full-name rule also applies in the omnibox, where it was not separately browser-tested beyond the specs listed.

### CONV-1 — one conversation thread per patient in Clinical AI (owner direction 2026-10-09, D-132)

- **Starting SHA:** b3ad7d2.
- **Change:** the Clinical AI companion keeps each patient's questions and answers in order instead of replacing the last answer (`app/lib/clinical-ai-thread.ts`, `ClinicalAiPanel`). Earlier turns collapse to one line and reopen; the latest stays open; "Clear conversation" empties it. The thread's patient is the planner's active patient for every turn. An answer that resolved to another named patient is labelled and offers no Insert into Note. A late answer lands only in its own thread and cannot revive a cleared thread or dismissed turn; one question at a time per thread. Threads survive chart switches (panel parks), close/reopen and expand/redock, live only in the browser session, and are dropped at sign-out and account switch (`AuthSessionGate`). Requirements CONV-01, CONV-06 (thread part); RIGHT-04.
- **Validation:** `npm run check` 679/679 (0 lint errors; new `tests/clinical-ai-thread.test.ts` 10/10); `npm run build` passed; browser specs companion-ai 2/2 (new: two turns sent with `activePatientId` maya-chen, earlier turn collapses/reopens, a David Kim question is labelled and has no Insert into Note, thread survives parking and close/reopen, Clear empties it), workspace-ergonomics 5/5, review-improvements 5/5. Screenshot inspected at 1280×720 (`output/playwright/conv-1-thread.png`); an overflow of the notice and evidence chips past the panel edge was found and fixed before this entry.
- **Named gaps:** the planner does not read earlier turns (CONV-1b); the name/DOB check for a named patient is not in place (CONV-1b); not checked at 200% zoom or phone width.

### OVERVIEW-EXPAND-1 — sections can open all details by default (owner request 2026-10-08, D-131)

- **Starting SHA:** 8cd613e.
- **Change:** ⋮ menu of Medications, Measures, Labs, Visits and Background offers "Expand all details" / "Show highlights only"; saved per section as `overview.expandedCards`; off by default; individual lines still toggle by hand. Labs' "more results" also opens.
- **Validation:** `npm run check` 669/669 (0 lint errors); browser specs overview-grounding 9/9 (new: switch on opens every Medications line, other sections unaffected, persists through reload via the server preference, switch off closes them), overview-content 6/6, patient-overview 6/6. Exercised in the running app on synthetic David Kim's Background (4/4 lines open, then 0), and the setting was returned to off.

### RECORD-TOOLS-LIST-2 — remaining rough spots (owner request 2026-10-08, D-131)

- **Starting SHA:** f07c017.
- **Labs:** picker labeled "Patient" with Open chart on the same row; scope banner kept without repeating identifiers; header reads name · MRN · DOB like every other panel (the tab name it showed is already on the tabs).
- **History:** view switch uses the shared pressed-button row ("Timeline (n)", "Structured history", "Rating scales (n)", "Vitals (n)").
- **Communication:** the unconnected-delivery notice is one quiet line with the same wording, always shown.
- **Documents:** source/added/reviewed/filed are labeled lines with the date or reference under the value.
- **Dashboard:** window headers match the Overview's sections (plain 16px title, no icon, white header, 10px corners, no shadow).
- **Validation:** `npm run check` 669/669 (0 lint errors) after restoring DOB to the Labs header (the unit check "must display patient DOB" caught its removal); `npm run build` passed; browser specs communication-companion 5/5, history-fit 2/2, lab-result-entry 2/2, patient-record-companion 9/9, prototype-containment, tool-navigation 5/5, window-lifecycle 7/7, workspace-ergonomics 5/5, companion-overflow-fit Labs tabs 4/4. Inspected in the running app on synthetic David Kim at 1440×900.

### RECORD-TOOLS-LIST-1 — the record tools follow the Overview's layout (owner request 2026-10-08, D-131)

- **Starting SHA:** 2e45518.
- **Audit:** Overview, Encounter, Dashboard, Billing, Home and the right-strip tools were inspected in the running app on synthetic David Kim. Dashboard, Billing and Intake already share one card/list anatomy and were left unchanged; Encounter is a note document; Brand/HR are out of EHR-first scope.
- **Panels (Medications, Documents, History, Orders):** the header names the patient once (name · MRN · DOB), as Labs and Communication did; the binding is one line with a small pin/follow control (same wording).
- **Titles:** a side panel no longer repeats its tool name in the body (kept for assistive technology; shown in the chart pane). Small labels above titles removed from Documents, History, Labs, Messages, Patient information, Prescription work and the sign dialog. Section titles in a docked panel are 16px (were 24px).
- **Medications:** one divided list; each line shows name, dosing and monitoring (Draft lab stays visible); source and the five record actions open in place.
- **History and Documents:** Sort/Group/Dates/Status behind one "Sort & filter" line that states the current settings; History's interval-summary request moved into its header actions. The timeline now starts on the first screen of the docked panel.
- **Labs:** monitoring checks are one divided list, amber only on the heading, text at 12–14px (was 10.5–12px), outlined Order buttons.
- **Validation:** `npm run check` 669/669 (0 lint errors); `npm run build` passed; browser specs clinical-decomposition 27/27, history-fit 2/2, medication-hierarchy 6/6, medications-unified, patient-record-companion 9/9, prescription-safety, review-2026-10-06 4/4, review-improvements 5/5, shell-ownership 5/5, companion-header-fit 3/3, companion-open 3/3, companion-viewport 5/5, lab-result-entry 2/2, local-time-display 2/2, measurement-dialog-surface passed; companion-overflow-fit 16/18. The two failures (six patient tabs at 1024 and 720) also fail on 2e45518 without these changes and are recorded in ROADMAP open defects. Updated tests: identity is asserted in the panel header; History opens Sort & filter first; two stale assertions from earlier commits were corrected (Structured History heading renamed in 1e006c7; Compose shares its class with Request forms since D-129).
- **Limits:** the Labs toolbar still stacks picker, scope banner and tabs (the banner is the deliberate D-116 binding signal); phone-width panels not inspected.

### OVERVIEW-LIST-1 — the Overview reads as one list of highlights (owner request 2026-10-08, D-131)

- **Starting SHA:** c28e1f9 (Needs attention list committed as f7ed565 within this slice).
- **Needs attention:** one aligned list; urgency is the left stripe only; category is a labeled word (Safety, Meds, Labs, Vitals, Notes, Allergy); urgent first; count beside the heading; monitoring fine print behind "Policy details".
- **Page:** Needs attention → Now tiles (Medications, Measures, Labs, Visits) → Recent changes → Background. One header per section (title, one "X →" link, ⋮). Each fact is one line that expands in place to the full record; provenance sits behind an ⓘ. Unrecorded history collapses to one line; care team is one line. Diagnoses moved to the header Problems bar ("+N more" opens the full list; chips show codes on hover; the bar now refreshes on patient updates).
- **Layout controls:** pin, move earlier/later, collapse, hide and restore reuse the saved card preferences; the width toggle and drag handles are retired; the layout customizer lists the tiles and fixed sections under their new names.
- **Effect:** synthetic David Kim at 1440×900 with a companion docked went from about 3,200 px to about 1,600 px.
- **Validation:** `npm run check` 669/669 (0 lint errors); `npm run build` passed; browser specs `overview-content` 6/6, `overview-grounding` 8/8, `patient-overview` 6/6, `asrs-assessment`, `patient-chart-polish`, `workspace-context-alignment` 2/2, `encounter-clinical-context` 10/10, `tool-navigation`, `ui-system`, `window-lifecycle`, `omnibox-ambient-preview` passed. Tests that named old card titles were updated to assert the same facts. `encounter-clinical-context` now checks that a problem added elsewhere reaches the Problems bar without a reload. Exercised in the running app on synthetic David Kim at 1440 and 2200 px wide.
- **Limits:** no billing/balance line until P9 provides a balance source; phone-width layout covered by CSS container rules but not inspected, because the docked companion covers the chart at that width.

### CHART-ORG-1 — chart organization and missing chart content (owner request 2026-10-08, D-130)

- **Chart index** replaces "More chart tools": Clinical record and Profile groups, each entry naming where it opens; Worklist/Columns under Tools.
- **Patient information:** Profile (was Identity), Additional info (race/ethnicity, orientation, marital status, previous name, occupation, employer, education, religious affiliation, primary provider, referral source, referred by; migration `2026-10-08-001`), Appointments (upcoming/past from the appointment book), responsible party (guarantor) role.
- **History:** Structured History adds medical, surgical, family medical, SDOH and implanted-device categories; Overview card renamed "History & Treatment Trials"; Vitals tab with a readings table. Fixed substance-use descriptions not saving.
- **Problems:** ICD-10-CM search over CMS FY2026 valid codes (74,719; `/api/reference/icd10`).
- **Documents:** referral sent/received and patient-education types.
- **Validation:** `npm run check` 669/669, `npm run build` passed; new `tests/icd10-reference.test.ts`, demographics cleaning test; browser specs `history-fit`, `overview-content` updated for renamed labels but not run. Exercised in the running app on synthetic David Kim.
- **Limits:** account/payments (P9), Rx eligibility (vendor), SNOMED (licence), portal accounts (P7); "Past notes & visits" opens the History timeline rather than a dedicated notes list.

### PATIENT-FORMS-1 — patient forms requested from the chart (owner request 2026-10-07, D-129)

- **Request forms** (Messages, beside Compose; link in the compose dialog): PHQ-9, GAD-7, ASRS v1.1, chosen consents, a blank patient-filled safety plan, and structured releases of information, behind D-109's token and date-of-birth check. C-SSRS is refused as clinician-administered. The link is shown once to the requester and recorded in a thread that says it was not delivered by the system; the token is never stored.
- **Results:** scores to rating-scale history; signed consents and releases recorded; a positive PHQ-9 item 9 leads the patient's reply with SAFETY and makes the thread urgent, and the patient sees 988/911 on the question and the receipt.
- **Safety plan:** the patient's draft is filed in Documents ("patient draft, not yet reviewed") and attached to the reply. **Review & finalize** in Documents files a clinician-authored "reviewed with patient" plan and marks the draft reviewed, filed and superseded by it.
- **Releases of information:** direction, party, information categories, purpose and expiry; the authorization text (right to revoke, no conditioning, redisclosure, 42 CFR Part 2 notice when substance-use records are included) is fixed at request time. Signing is optional for the patient. Patient information → **Releases (ROI)** lists status (in force, awaiting signature, not signed, revoked, expired), shows the text, and records a written revocation with a note.
- **Tracking:** Request forms → **Sent** lists each request's state with its thread and **Revoke** for an open link. The patient page's title follows the link's purpose.
- **Validation:** `tests/patient-form-requests.test.ts` (3 tests), migration identity list updated (`2026-10-07-002`, `-003`); `npm run check` passes except the pre-existing `next-env.d.ts` hygiene check from the browser-suite server. Exercised end to end in the running app on synthetic David Kim (scales with item 9, consent, safety plan draft and finalize, release signed). `npm run build` and browser specs not run.
- **Limits:** no transport (D-107); authorization wording is a prototype default to be replaced by counsel-reviewed practice text before real PHI (P11); signed releases are not yet enforced when sharing records (attachments/fax drafts do not check them); a finalized safety plan is shared with the patient by attaching it to a message.

### REVIEW-LOOP-1 thirteenth pass — inbox order and time labels, idempotent composers, Outstanding Work refresh, Clinical AI parking spec

2026-10-07 · owner-directed continuing review · starting `main` SHA `31a1a9e`; resulting SHA: the commit containing this entry. Requirements MSG, VIS-05/07, D-128 idempotent creates, TOOL-01/03; EHR loop: medications/prescribing → communication → follow-up.

- **Inbox order:** the Communication companion and the module inbox sorted threads with `new Date(lastMessageAt)`, but `lastMessageAt` is display text ("01:30 PM"), so newest-first silently did nothing. Threads now order by the last message's recorded instant (`message-recency`), with dated legacy text as a fallback; a bare clock time is never given an invented day and sorts last. List labels read "1:30 PM" for today and "Oct 6" otherwise; the chart thread list uses the same label.
- **Idempotent composers (D-128 follow-up):** task (companion, practice queue, lab follow-up), scratch-note and team-message composers now keep one `Idempotency-Key` per draft until the server confirms it (`createDraftKeyRing`), so a retry after a lost answer replays the first result instead of creating a duplicate. A confirmed draft forgets its key.
- **Outstanding Work:** re-reads when a refill or prescription action succeeds in the patient prescribing work list or a visit handoff is accepted, declined or cancelled (new `ehr-practice-queues-changed` event), closing the limit recorded in the seventh pass.
- **Stale spec:** `companion-ai` expected Clinical AI to retarget silently to another chart; the host deliberately parks it bound to its chart. The spec now asserts the parked state, its bound target, and that no answer or composer from the first chart is visible over the second.
- **Validation:** new unit files `message-recency`, `draft-idempotency`. Browser (isolated, separate worktree server): `companion-ai` 1/1, `companion-draft-target` 10/10. `npm test` 663/663; `npm run check` lint 0 errors; `npm run build` passed.
- **Limits:** the practice-level Prescribing queue workspace does not yet publish the queue-changed event; message thread ordering inside the chart list is unchanged (oldest thread first).

### REVIEW-LOOP-1 twelfth pass — practice-clock "today" on server and client, message conversation order

2026-10-07 · owner-directed continuing review (roadmap item 3, clinical date audit) · starting `main` SHA `99701b1`; resulting SHA: the commit containing this entry. Requirements D-049 practice clock, MSG, CARE completion; EHR loop: labs/results → communication → follow-up.

- **Message order:** the chart's conversation query sorted by the stored clock text (`ORDER BY timestamp`), so "01:30 PM" sorted before "11:00 AM" and an afternoon reply appeared above the morning question. Both message queries now order undated legacy/seed rows first in insertion order, then dated rows by `created_at`. Messages carry `createdAt`, and the chart thread shows "Oct 7, 2026 · 1:30 PM" from it instead of a time-only, server-local clock string (older rows still show their stored text).
- **UTC "today" replaced by the practice day:** in a US evening the UTC day is already tomorrow. Fixed where it mattered: a hand-entered result dated tomorrow passed the "cannot be in the future" check; Care Completion "Defer → Tomorrow" added a local day then took the UTC day, deferring to the day after tomorrow; the visit-prep queue's default day; visit-readiness coverage checks; a staff termination date; the team invite default date; the audit export filename; a new encounter's default date and the "Sent …" label in Care Completion (both formatted in the server's own zone).
- **Validation:** new `message-order` unit test (fails on the old ordering) and a clock-pinned case in `observation-and-scratch-storage` (6 PM at the practice on Oct 7 = Oct 8 UTC; a result dated Oct 8 is refused). `npm run check` passed (660/660; lint 0 errors); `npm run build` passed.
- **Limits:** the date audit is not finished — client-side `toLocaleDateString` calls on parsed calendar dates were reviewed as safe in kind but not individually migrated; thread lists still show `lastMessageAt` clock text; organization-specific time zones remain unimplemented.

### REVIEW-LOOP-1 eleventh pass — prescription indications without duplicates, Calendar visit counts and clock format

2026-10-07 · owner-directed continuing review · starting `main` SHA `e1cb217`; resulting SHA: the commit containing this entry. Requirements MED/RX composer, VIS-05, SCHED calendar; EHR loop: schedule → medications/prescribing.

- **Prescription indication:** the composer listed the patient's problems, then a fixed coded list, so Maya Chen was offered "Generalized anxiety disorder" and "F41.1 - Generalized anxiety disorder" as two choices. The list now groups "This patient's problems" and "Other indications", leaving out a coded entry whose description is already one of the patient's problems (`otherPrescriptionIndications`). Nothing is preselected.
- **Calendar counts:** week headers and agenda headings counted cancelled visits and non-patient blocks as "visits" (Tue Oct 6 read "3 visits" for two visits and a cancelled block; the dashboard rail said 2). They now count patient visits only (`countPatientVisits`). The Day view said "N patient visits scheduled for today" for any day and "1 patient visits"; it now names today only when it is today, and handles one and none.
- **Calendar times:** stored times arrive as "09:30 AM", "7:00 AM" or "14:30" depending on what created them, and the calendar showed the mix side by side. Calendar event chips, month pills, agenda rows and their accessible names use one format (`formatVisitTime`), parsed strictly so unreadable text is shown as written rather than as the shared parser's 9:00 AM fallback. Stored values are unchanged; other surfaces still show the stored text.
- **Validation:** new unit files `prescription-indications` and `calendar-visit-display`. Isolated browser: `calendar-companion-panel` 1/1, `calendar-event-lifecycle` 1/1, `calendar-interval-jump` 2/2, `calendar-view-options` 2/2, `clinical-decomposition` 27/27, `medications-unified` 1/1, `prescription-safety` 1/1. Both fixes inspected in the running app on synthetic data. `npm run check` passed (658/658; lint 0 errors); `npm run build` passed.
- **Limits:** time text is normalised for display in Calendar only; the roster and Day at a Glance still show stored text. The common-indication list remains a four-entry prototype list.

### REVIEW-LOOP-1 tenth pass — sign-in session race, New Intake beside a docked companion, stale layering/preference specs

2026-10-07 · owner-directed continuing review · starting `main` SHA `14131d4`; resulting SHA: the commit containing this entry. Requirements TOOL-01/03, VIS-03, LAYOUT-05, auth/session recovery; EHR loop: intake → schedule.

- **Session expired right after signing in:** the window-focus re-check (`/api/auth/me`) fires as the clinician clicks Sign in; its "no session" answer for the old cookie could arrive after the sign-in and raise "Your session expired" over the fresh workspace (seen in the review session; reproduced by delaying the check). Session checks now carry a ticket from `createSessionCheckSequencer`; signing in, switching account and signing out invalidate tickets already issued, and a stale answer is discarded. A genuine server-side expiry still raises the challenge (verified in the browser).
- **New Intake vs a docked companion (the reported overlap, confirmed):** the drawer was fixed to the viewport, so it covered a docked companion and the rail, while the companion's resize border (z 60) stayed on top and grabbed clicks on the left strip of the Email/phone fields. The drawer now fills the Intake module shell, which already sits below the measured chrome and ends at the companion; companion and rail stay usable. At 1024px and narrower the companion remains its intentional full-pane sheet with Return to workspace.
- **Stale specs repaired (no assertion weakened):** `workspace-layering` entered Encounter through the retired section-tab row and used the `inbox` view, which now opens the Communication companion (D-117); it uses the header control and the Billing module. `preference-account-isolation` unpinned Calculators, which left the default rail; it uses Calendar, an optional default pin, with the same isolation checks. `css-architecture` now pins the shell's chrome inset and the drawer's containment instead of the old viewport-fixed rule.
- **Validation:** new browser case (drawer ends at the companion, every field hit-testable edge to edge, companion and rail on top) failed on the old CSS and passes. Isolated browser: `workspace-layering` 13/13, `preference-account-isolation` 1/1, `session-expiry` 5/5, `intake-workspace` 5/5, `intake-name-layout` 1/1, `intake-dates` 1/1, `companion-open` 3/3. New unit case for the sequencer. `npm run check` passed (654/654; lint 0 errors, warning count unchanged); `npm run build` passed.
- **Limits:** the sequencer orders the gate's own checks; a 401 from an unrelated request that raced the sign-in is still re-verified, which is the intended path. Full isolated acceptance, CI and P12 remain open.

### REVIEW-LOOP-1 ninth pass — encounter fits short and 200% viewports, stacked rail floor, next-clinic-day jump, stale encounter specs

2026-10-07 · owner-directed continuing review · starting `main` SHA `8c7abc0`; resulting SHA: the commit containing this entry. Requirements VIS-03, PAT-08/10, ENC-CTX-1, LAYOUT-05; EHR loop: schedule → encounter → note.

- **Encounter height:** the encounter area used `height: calc(100vh - 224px); min-height: 520px` inside a pane that clips and never scrolls. At 1280×720 the readiness bar and the end of the note sat below the screen with no way to reach them (bottom 758px in a 720px viewport); at 1440×900 the readiness bar was clipped by 28px; at 720×450 (1440×900 at 200%) the note got a 34px sliver. The area now fills whatever the pane leaves under the chart header. Below 640px of height the patient pane itself scrolls, so the header moves away and the encounter takes the full height under the tab strip; the status line (patient name, date, open-item count) and Review & Sign stay at the top of that view. Only panes showing an encounter change; Overview scrolling is untouched.
- **Stacked context rail:** at ≤900px container width the rail sits in an `auto` grid row; as a scroll container its minimum was zero, so the note's 240px floor squeezed it to 0–28px and its tools (Labs / Monitoring, Guide Clinical Bond) were unreachable. It keeps a 200px floor; the stacked layout already scrolls.
- **Dashboard:** "Jump to next clinic day" showed an ISO date and ignored the provider filter and cancelled visits, so it could land on another empty day. It now honours both and shows "Mar 26, 2037"-style dates.
- **Stale specs repaired (no assertion weakened):** `visit-readiness` used the retired section-tab row, assumed an expanded readiness bar, matched "Visit focus" as "Focus", and skipped the explicit open-items acknowledgement now required to sign; it uses the header Encounter control, expands readiness through its own toggle, matches Focus exactly and checks the acknowledgement. `window-lifecycle`'s late-response case looked for the retired "Active problems and allergies" label; it now guards the identity header container, which holds both problems and allergies.
- **Validation:** new `encounter-viewport-fit` (1440×900, 1280×720, 720×450 wheel-scroll) failed 2/3 on the old CSS and passes 3/3. Isolated browser: `encounter-clinical-context` 10/10, `encounter-live` 6/6, `visit-readiness` 3/3, `window-lifecycle` 7/7, `companion-viewport` 5/5, `encounter-hydration` 4/4, `encounter-recovery` 8/8, `patient-chart-polish` 1/1, `sign-readiness` 4/4, `workspace-ergonomics` 5/5. Regenerated 200% captures were inspected. `npm run check` passed (653/653; lint 0 errors); `npm run build` passed.
- **Limits:** in the 200% view, wheeling over the note's own scroll region scrolls the note first (ordinary nested scrolling); the header scrolls away from wheeling over it or once the note reaches its end. At ≤900px the rail still stacks above the note. Full isolated acceptance, CI and P12 remain open.

### REVIEW-LOOP-1 eighth pass — idempotent creates, calendar-date task due dates, dated save stamps, Documents list room

2026-10-07 · owner-directed continuing review · starting `main` SHA `ebce6cc`; resulting SHA: the commit containing this entry. Governing [D-128](decisions/D-128.md); requirements MSG, VIS-05/07, D-049 practice clock; EHR loop: communication → follow-up.

- **Duplicate creates (CB-6e follow-up):** the action gateway honours an `Idempotency-Key` on `create_message_thread`, `send_message`, `create_task`, `create_scratch_note` and `team_send_message`: reserve-before-run per (actor, key), replay the stored result for an identical repeat, refuse a key reused for a different request (422) or still running (409), release on failure. Access and patient binding are checked on every attempt. Patient-message reply and new-thread composers keep one key per draft until it is confirmed recorded.
- **Task due dates:** due values were stored as the words chosen ("Today"), so a task was due "Today" forever and never overdue. Choices now resolve once to a practice-calendar date (weekday names and "In N days/weeks" included; unrecognised text refused); legacy word rows are read against their creation day without being rewritten. Task lists show "Overdue · Oct 6" / "Due today" / "Due Oct 14" / "No due date", open work sorted soonest-due first; care-completion task detail uses the same wording.
- **Save stamps:** "Saved 7:27 PM" used the browser clock and dropped the date, so yesterday's save read like a recent one. Save labels use the practice clock and name the date when the save was not today.
- **Documents companion:** the stacked list could shrink to about one clipped row beside the detail (1024px, docked); it keeps room for its rows, and the status/sort/group/date filters lay out two per row instead of truncating ("Newest firs").
- **Validation:** `npm run check` passed (653/653 incl. new `idempotent-creates`, `task-due` and save-stamp cases; lint 0 errors); `npm run build` passed. Isolated browser: `review-2026-10-06` 4/4 (its Tasks case now requires the stored calendar date; a first run had an unrelated sign-in restore stall, recorded in ROADMAP), `communication-companion` 5/5, `communication-lifecycle` 5/5, `patient-record-companion` 9/9, `ui-system` 5/5, and earlier in the pass `care-completion` 4/4. In the running app on synthetic data: a task added "In 1 week" was stored as `2026-10-14` and shown "Due Oct 14"; earlier tasks read overdue; the save stamp and Documents list were inspected at 1440, 1024 and 720×450.
- **Limits:** task, scratch-note and team-message composers do not send keys yet; orders/documents/appointments are outside the idempotent set; stored keys never expire (P11 retention).

### REVIEW-LOOP-1 seventh pass — patient-view lab acknowledgement, live Outstanding Work, inbox stale state, retired-route specs

2026-10-07 · owner-directed continuing review ("find, fix and continue") · starting `main` SHA `86e17e2`; resulting SHA: the commit containing this entry. Requirements PAT-01, VIS-05/07, TOOL-01/03, D-117; EHR loop: labs/results → follow-up, communication.

- **Labs:** "Open result" on Outstanding Work landed on the patient's Labs, where the result could not be acknowledged — only the all-patients queue could. The patient Labs companion now marks each unreviewed result "Needs review" and offers Acknowledge (or "Acknowledge all N" for a result set) through the same audited `acknowledge_result` action and confirmation; it re-reads the record and republishes the rail count. The surveillance line "Done Jun 14, 2025" for an overdue check now reads "Last done".
- **Dashboard:** Outstanding Work was read once on mount, so a note signed or a result acknowledged elsewhere stayed listed. It now re-reads on a signature and when a published lab count differs from the sets it lists. Day at a Glance named only the first of several un-checked-in past visits; it now counts them.
- **Overview:** PatientOverview uses utility class names that `patient-overview.css` only partly shims; the undefined ones (badge size/case/padding, truncate, margins) rendered unstyled — e.g. the Recent Changes type badge appeared as lowercase body text. They are now defined, scoped to `.overview-container`, without overriding the Overview's sentence-case eyebrows.
- **Communication (D-117):** the companion's Practice inbox emptied its list before every read and had no refresh, so a failed refresh erased threads already on screen. It keeps last-known rows, announces a stale refresh as an alert with Retry, and has a Refresh control; only a failed first read blocks.
- **Browser gate:** the five recorded pre-existing failures (`ui-system` ×3, `workspace-ergonomics` ×2) plus `clinical-calculators`, `capture-ui-tour` and `workspace-context-alignment` addressed retired routes (section tabs, pinned-only Calculators, the global inbox list, pre-MON-1 Preferences copy). New shared fixture `openCompanionTool` opens a pinned or overflow tool the clinician's way. The inbox failure case now proves the same claims (announced failure, retained rows, recovery) on the companion inbox. `workspace-context-alignment` no longer requires the Communication header to drop the patient on a practice canvas: D-117 says a patient thread retains explicit patient identity, and the header was deliberately changed to name it; the canvas binding (`data-context-tab` → `module:intake`) is still asserted.
- **Validation:** `npm run check` passed (643/643; lint 0 errors); `npm run build` passed. Isolated browser runs: `ui-system` 5/5, `workspace-context-alignment` 2/2, `workspace-ergonomics` 5/5, `clinical-calculators` 1/1, `capture-ui-tour` 5/5 (its regenerated tour screenshots were inspected). Patient acknowledgement, the Dashboard refresh (Labs 12 → 11, item removed) and the Overview badge were exercised in the running app on synthetic data.
- **Limits:** the per-patient Labs "Results & Surveillance" tab badge still counts overdue surveillance, not unreviewed results. Outstanding Work does not yet refresh on refill or handoff changes made elsewhere. Full isolated acceptance remains open.

### REVIEW-LOOP-1 sixth pass — Tasks +, lab result sets, organized Documents/History, message attachments

2026-10-06 · owner review ("labs from one order in one tab", "documents and history organized different ways", "Tasks + does not work", "attachments in communication") · starting `main` SHA `bdc6164`; resulting SHA: the commit containing this entry. Governing [D-127](decisions/D-127.md); requirements VIS-05/07, PAT-01, MSG; EHR loop: labs/results → communication → follow-up.

- **Tasks:** the docked + no longer does nothing on an empty box — it focuses the box and says what it needs. The composer gains *For* (chart in front, practice, or any roster patient, kept per chart) and *Due* (Today … In 4 weeks, No due date). Docked rows now name their patient and list open work first. "No due date" in the full queue was silently saved as "Today"; it is now saved as chosen.
- **Labs:** results group into one *result set* by order, then source document, then a report reference shared by analytes typed from one report (`lab-result-groups`); unlinked results still stand alone. The Labs companion queue shows one card per set with "Acknowledge all N"; the companion flowsheet, chart Labs table and full Labs workspace show a set heading. The entry form takes several analytes from one report, can link the lab order it answers (server-checked), and reports partial-save failures without double-filing. Today's attention item wording no longer calls a single unlinked result an "order".
- **Documents and History:** a shared organizer (sort, group by month/year/type, date window, remembered per viewer) with collapsible counted groups and an "n outside this date range · Show all dates" line. Documents add a status filter (needs action/reviewed/filed/superseded); History adds a *Compact* one-line view that expands entries in place. The "beginning of the record" marker shows only where it is true.
- **Communication (D-127):** patient replies and new threads carry signed notes, rating scales, documents, lab results or an uploaded file (filed in Documents first). The server re-checks every attachment against the patient; an unsigned note is refused; nothing is written on refusal. Sent attachments open their record. Charting a conversation lists what each message carried. The thread now opens at the newest message.
- **Hardening found on the way:** `create_document` had no validation — a request could set its own provenance, storage key, any type and any size; it is now validated with a MIME allow-list and size cap. Documents show filed PDFs/images instead of base64 text, and Upload accepts a real file. Search: a bare patient name + Enter showed "Not supported yet" despite offering "Open <name>"; the planner now resolves a bare name/MRN against the clinician's own roster, Enter opens the chart directly, and a model-chosen section the query never named is ignored (a local model sent "Jordan" to Medications).
- **Validation:** `npm run check` passed (lint 0 errors, typecheck, 643/643 unit tests incl. new `message-attachments` and `review-2026-10-06-organization`); `npm run build` passed. New isolated browser spec `review-2026-10-06` 4/4. Affected existing specs (standard isolated runner): clinical-decomposition 27/27, communication-companion 5/5, communication-lifecycle 5/5, companion-draft-target 10/10, companion-leave-warning 3/3, dashboard-preview 8/8, escape-layering 5/5, history-fit 2/2, lab-result-entry 2/2, omnibox-ambient-preview 1/1, patient-record-companion 9/9, practice-decomposition 16/16. Three of those first failed because of this pass and were fixed: a send-failure toast kept its established wording (reason appended), and two locators that meant "the patient picker" now name it, since Documents/History gained Sort/Group/Dates selects. `ui-system` (3 of 5) and `workspace-ergonomics` (2 of 5) fail identically on an untouched checkout of `bdc6164`, so they predate this pass (logged in ROADMAP). Each change was also exercised in the running app at 1440×900 with synthetic data.
- **Limits:** files are stored as data URLs in document versions — a prototype choice that must move to production file storage before real PHI (P11). Team chat and outside email/fax drafts have no attachments. Attachment drafts survive tool switches only while the Messages panel stays mounted. Two docked Messages scroll regions (panel and feed) remain; a single-scroll layout is a follow-up.

### REVIEW-LOOP-1 fifth pass — Billing charge heading and practice-clock dates

2026-10-06 · owner-directed continuing review · starting `main` SHA `38f394a`; resulting SHA: the commit containing this entry. Requirements VIS-05/07, D-049 practice clock; signed note -> charge preparation.

- **Behavior:** "Signed encounters awaiting a charge" and its explanation now stack instead of running together (the item REVIEW-BROWSER-ISOLATION-1 logged). The Charges summary ("computed …"), signed dates and the charge detail's prepared/reviewed/voided times use the shared practice-clock formatters instead of browser `toLocaleString`. Earlier in this pass, `cd18f2d` stopped Outstanding Work filters and the calendar rail claiming "(0)"/"No visits" while their data were still loading. No billing facts, codes or transport behavior changed.
- **Validation:** typecheck passed; a temporary isolated browser case (`npm run test:browser`, fresh database and owned server) opened Billing → Charges at 1280×720, asserted the caption sits below the title and that no locale "M/D/YYYY, h:mm:ss" timestamp remains, and its screenshot was inspected; it passed 1/1 and was then removed. `queue-filter-counts` 4/5 for `cd18f2d` (the fifth expects the retired "inbox" module).

### REVIEW-BROWSER-ISOLATION-1 — Standard browser acceptance owns a fresh database per file

2026-10-06 · owner-directed reliability point · starting `main` SHA `f0acab08d9ec551e774eee69d4eb88c1d6f9042f`; resulting SHA: the commit containing this entry. Governing [D-126](decisions/D-126.md), amending D-091's browser persistence lifecycle; preserves clinical authority and NOTE-07/PAT-01 workflow evidence.

- **Implemented mechanism:** standard/headed browser commands use Playwright's own selected manifest and run files serially through a file-only test-list intersection. Each receives a fresh synthetic database, newly owned dev server, separate failure output and CI HTML report. The final status includes every file failure; interruption stops execution. CI uploads invocation summaries with failure artifacts, excluding clinical databases. Direct Playwright receives a fresh database per invocation; standard server reuse is refused. Earlier databases are retained. Assertions/timeouts/retries are unchanged; no clinical reset endpoint, fixture success response or new dependency is introduced.
- **Validation:** two grouping/evidence-key unit cases passed; `npm run check` passed (638 tests) and `npm run build` passed. All 13 affected cases across billing containment, live capture and synthetic visit passed in a single standard isolated command. Read-only SQLite inspection verified that the charge exists only in the billing database and the uploaded visit document only in the synthetic-visit database; live capture has neither. [Source check](../output/playwright/isolation-source-check.json). An owned synthetic HTTP server collision deliberately failed both selected invocations and returned overall exit 1, proving an existing server is refused and failures are retained. Local collection remains driven by Playwright rather than a manual file list.
- **Inspected evidence:** the fresh [completed visit](../output/playwright/isolation-visit-completed.png) no longer inherits accumulated prior-run visit rows; the [billing inspector](../output/playwright/isolation-billing.png) starts without prior-run fees/charges. Existing matrix captures produced by verification were restored to their earlier canonical snapshots after saving these isolation images.
- **Layer and limits:** validation runtime/persistence ownership, a rule-level correction; production clinical persistence, navigation, permissions, reasoning and transports are unchanged. Per-file server startup adds overhead and uses the existing isolated Next cache. Within-file cases and direct multi-file invocations still share their own state; advanced lifecycle/config/output flags require direct CLI and are explicitly refused by the wrapper. The original isolated visit run failed at signed confirmation; focused unchanged and full-group reruns passed, so its cause remains unproven in ROADMAP. Full isolated CI/P12 and remaining suite failures are not certified. A billing caption-spacing defect was recorded for the later usability point. Unrelated launcher work was preserved.

### REVIEW-BILL-VISIT-GATE-1 — Billing containment and synthetic visit follow current owners

2026-10-06 · owner-directed readiness review, reliability point · starting `main` SHA `262ce1d3e8bf102a9b415656f8581998beed0479`; resulting SHA: the commit containing this entry. Requirements PAT-01/04/10, NOTE-02/04, TRUST-02; preserved D-101 billing truth and existing signing/readiness authority.

- **Confirmed repairs:** baseline had three failures and four passes. Billing containment tried to read the fee rule on Workflow; it now visits Practice setup for that rule and Charges for amounts/inspection, preserving no-fabrication, refused submission, unchanged status/notice, role restriction, stale-selection and preview checks. The synthetic clinic visit now uses the patient-bound Documents companion, expand/redock and current Encounter controls instead of retired primary section tabs. It verifies legal attestation alone cannot sign with unresolved readiness, explicitly acknowledges those items and then signs. The options case opens the owning Visit readiness disclosure before inspecting coding, then collapses it again; wording, focus, suggestion retention and reachable signing checks remain.
- **Validation:** all seven cases passed together after repairs; the five billing cases passed again after improving the inspector screenshot scroll state. `npm run check` passed (636 tests); `npm run build` passed. The synthetic visit reads/uploads a versioned document with SHA-256, returns to the same patient's encounter, signs, appends an immutable-record correction and confirms its appointment becomes Completed. Runtime clinical, schedule, billing and navigation implementations are unchanged.
- **Inspected screenshots:** [document intake](../output/playwright/reliability-visit-documents.png), [explicit signing guard](../output/playwright/reliability-visit-sign-review.png), [completed schedule](../output/playwright/reliability-visit-completed.png), billing [owner inspector](../output/playwright/reliability-billing/billing-owner-provider.png), [manager](../output/playwright/reliability-billing/billing-manager.png), [access refusal](../output/playwright/reliability-billing/billing-no-financial-access.png), [stale withdrawn selection](../output/playwright/reliability-billing/financials-stale-restore.png), and [labelled preview](../output/playwright/reliability-billing/billing-preview.png). These are workflow/authority verification images, not a new layout certification.
- **Layer and remaining scope:** validation/navigation ownership, a bounded correction; no clinical reasoning/state or external transport improvement is claimed. The shared mutable database still contains older in-visit rows, visible beside the newly completed visit, so this is not clean-clinic-day/P12 certification. Full CI and remaining browser failures/data isolation stay open in ROADMAP. The owner's reliability → usability → clinical completeness → production → AI order is recorded there; no broader readiness point is marked complete. Unrelated launcher edits were preserved.

### REVIEW-LIVE-GATE-1 — Live-capture checks use current navigation and fresh visit state

2026-10-06 · owner-authorized review through validation failures · starting `main` SHA `e2feb8d2e396feba15c2a97e8221e162b15449a1`; resulting SHA: the commit containing this entry. Requirements NOTE-07, PAT-01, TAB-04; governing D-115. Workflow: scheduled visit → patient-bound LIVE capture → provider guidance → editable durable REVIEW draft.

- **Confirmed repairs:** retired primary section-tab selectors now use the shared visible Encounter control/hydration fixture. Capture cases book their own synthetic visits through the existing schedule fixture and start from the authoritative roster, avoiding prior transcript/guidance state left by earlier runs. The durable read verifies appointment binding; reload verification waits for server hydration before inspecting the review draft. The layout cases simulate 200% reflow at 720×450 and check both columns remain inside the encounter, stack without overlap at its existing 900px container boundary, and remain separated above that boundary. The original 1024px viewport assertion conflicted with this implemented container rule; the [initial screenshot](../output/playwright/enc-live-layout-initial-1024-1.png) showed readable side-by-side columns. No runtime layout rule or clinical assertion was relaxed.
- **Validation:** six browser cases passed, then all six passed again on the same accumulated database after fresh-visit setup. They verify read-only LIVE, disabled signing, corrections/observations, clinical thoughts excluded from note prose, safety coverage guards, durable guidance actors/transcript, post-stop editing/reload, all four viewport sizes, microphone failure and rejection of late speech. The intermediate runs exposed the obsolete 1024px geometry assertion and reused transcript precondition, both repaired. `npm run check` passed (636 tests); `npm run build` passed.
- **Inspected evidence:** [LIVE](../output/playwright/enc-live-1440.png), [loaded REVIEW](../output/playwright/enc-review-1440.png); note at [1440](../output/playwright/enc-live-layout-1440-1.png), [1280](../output/playwright/enc-live-layout-1280-1.png), [1024](../output/playwright/enc-live-layout-1024-1.png), [200% reflow](../output/playwright/enc-live-layout-1440-2.png); guidance at [1440](../output/playwright/enc-live-guidance-1440-1.png), [1280](../output/playwright/enc-live-guidance-1280-1.png), [1024](../output/playwright/enc-live-guidance-1024-1.png), [200% reflow](../output/playwright/enc-live-guidance-1440-2.png). Separate note/guidance screenshots show their reached scroll states.
- **Layer and limits:** validation layer, a bounded repair; clinical state, capture interpretation, permissions, signing and transport implementations are unchanged. D-115 remains a deterministic foundation, not semantic psychiatric scribing. At 200% reflow identity remains visible but the guidance editor has very little vertical space; the uncertain chrome/layout choice remains in ROADMAP. Full browser CI, broader test isolation and P12 are still uncertified. Unrelated launcher edits were preserved. Next eligible slice: remaining billing/queue/clinical-loop failures under the current navigation owners.

### REVIEW-REFILL-PRIVACY-1 — Redaction verification distinguishes credentials from identifiers

2026-10-06 · owner-authorized review through validation failures · starting `main` SHA `161918d50523d619bc88381eddf282ced93033ba`; resulting SHA: the commit containing this entry. Governing privacy boundary D-025; workflow: patient-bound refill request → sanitized durable request → explicit renewal; preserved PAT-01 identity and medication/intent separation.

- **Confirmed validation repair:** a legitimate `synthetic-pharmacy-message-4321` reference deterministically failed the old whole-request short-PIN assertion even though the note was redacted. The lifecycle test now requires the exact sanitized note in the returned request, persisted row and version snapshot, retains the legitimate reference, and rejects distinct password/token/long-OTP sentinels across those records. Duplicate replay, wrong-patient/AI rejection, immutable prior history and medication-truth assertions remain. This strengthens the privacy evidence rather than changing runtime sanitization or suppressing a failing scenario.
- **Validation:** the collision failed before the repair and the complete refill lifecycle case passed afterward. `npm run check` passed (636 tests); `npm run build` passed. The medication hierarchy browser case passed, exercising readable active records and explicit Add medication/New prescription entry with Maya's identity. Refreshed and inspected existing screenshots at [1440](../output/playwright/medication-hierarchy-1440-1x.png), [1280](../output/playwright/medication-hierarchy-1280-1x.png), [1024](../output/playwright/medication-hierarchy-1024-1x.png) and [CSS enlargement](../output/playwright/medication-hierarchy-1440-2x.png). That inherited CSS enlargement case does not certify browser 200% reflow; no visual runtime change was made.
- **Layer and limits:** validation layer, a bounded correction; no reasoning/state, clinical authority, schema, sanitizer or transport implementation changed. The original CI failure's matching field is unknown, so its cause is not claimed proven. Current main CI reached browser verification after passing the unit gate; full CI, old browser failures, isolation and P12 remain open in ROADMAP. Unrelated launcher edits were preserved. Next eligible review: remaining live-capture browser entry/reflow coverage and failures.

### REVIEW-INTAKE-NAME-1 — Readable Intake identity without overlap

2026-10-06 · owner-authorized usability review · starting `main` SHA `7467e91ab3384929eb933f4671fa25f729b6c226`; resulting SHA: the commit containing this entry. Requirements PAT-01, LAYOUT-05 and preserved Intake identity/readiness under narrow presentation.

- **Confirmed repair:** at 1024px with a selected detail pane, a long synthetic name extended outside its queue card and overlapped readiness progress. The existing shared name layout now wraps the badge, permits unbroken names to wrap, and bounds the name button to its container. The card reserves a readable identity basis and puts progress on a following line when both cannot fit. The full name, prospect status, count, next-step text and existing name/detail actions remain; no font reduction, truncation or navigation replacement was added.
- **Validation:** a new browser regression failed on the baseline geometry, then passed after the shared layout fix. It creates its own synthetic intake record, checks queue/detail containment and non-overlap, opens detail by keyboard, closes it, and confirms no chart was implicitly created. Both the name regression and existing Intake date case passed. `npm run check` (636 tests) and `npm run build` passed. Captured and visually inspected [before](../output/playwright/intake-name-before.png), loaded detail/queue at [1440](../output/playwright/intake-name-1440.png), [1280](../output/playwright/intake-name-1280.png), [1024](../output/playwright/intake-name-1024.png), and [720×450 reflow](../output/playwright/intake-name-720.png). Capture waits for the actual detail identity rather than a loading panel.
- **Layer and limits:** shared presentation/identity layout, a bounded rule correction; Intake records, readiness computation, promotion authority and transports are unchanged. No uncertain product choice arose. Companion overlap, live-capture coverage, broader browser isolation/P12 and current CI failures remain open. Latest CI on the previous head failed a refill privacy assertion before browser verification; recorded for diagnosis in ROADMAP. Unrelated launcher changes were preserved.

### REVIEW-CONTEXT-GATE-1 — Clinical-context verification follows current navigation

2026-10-06 · owner-authorized systematic review · starting `main` SHA `d44789855476720c32bb028bc15c3a2b7ea82653`; resulting SHA: the commit containing this entry. Requirements ENC-CTX-1, PAT-01/09, TAB-04 and clinical authority/patient binding.

- **Confirmed repair:** clinical-context cases still entered Encounter/Overview through the retired primary section-tab row. They now use the shared fixture that clicks the current header control, checks its pressed state and waits for note hydration. The enlargement case uses a 720×450 reflow viewport equivalent to 1440×900 at 200%, replacing CSS body zoom that does not model viewport reflow. Clinical and patient-isolation assertions remain intact; no product behavior or safety gate changed.
- **Validation:** all nine clinical-context browser cases passed: source-backed medications and related prescribing, clinical/note/scribe tool retention, signed-history navigation, failed/wrong-patient/empty reads with recovery, late-response rejection, source mutations reflected in Encounter and Overview, four viewport cases, crowded provenance disclosure without historical text insertion, and patient-bound monitoring ordering with return to the same encounter. `npm run check` (636 tests) and `npm run build` passed. Captured and inspected [default](../output/playwright/enc-ctx-default.png), [1440](../output/playwright/enc-ctx-1440-1x.png), [1280](../output/playwright/enc-ctx-1280-1x.png), [1024](../output/playwright/enc-ctx-1024-1x.png), [200% reflow](../output/playwright/enc-ctx-1440-2x.png) and [crowded changes](../output/playwright/enc-ctx-crowded.png).
- **Layer and limits:** validation ownership and viewport simulation, a bounded correction. Runtime clinical state, provenance, navigation and transport implementation are unchanged. At 200% reflow, persistent chrome leaves little reading height; the layout decision is retained in ROADMAP without removing identity or shrinking text. Live-capture tests, remaining CI failures, browser data isolation and full P12 certification remain open. Unrelated launcher edits were preserved.

### REVIEW-RECOVERY-GATE-1 — Recovery matrix uses current controls and signing authority

2026-10-06 · owner-authorized review through validation failures · starting `main` SHA `9eccaecbacab195cbd0b445153fee78087f7c08b`; resulting SHA: the commit containing this entry. Requirements CB-7 / SAVE-06, patient identity, durable draft recovery and explicit legal signing.

- **Confirmed failures:** CI on `3220831` timed out at retired primary `.section-tabs`. Recovery tests now share a fixture that clicks the visible primary Overview/Encounter header control, verifies its pressed state, and waits for saved-note hydration before editing. Detached navigation remains pane-owned. The signing test then reached an existing readiness guard it had not acknowledged; it now verifies legal attestation alone leaves Sign disabled, explicitly acknowledges open readiness items, and verifies Sign becomes enabled. No runtime guard was relaxed.
- **Validation:** all eight recovery browser cases passed, covering patient switch, detach/redock, refresh, close/reopen, failed save/retry, late acknowledgement, revision conflict, and signing with immutable history plus an append-only amendment. The first migration run passed seven and failed at the unchanged readiness guard; the final full eight-case run passed. `npm run check` (636 tests) and `npm run build` passed. Captured/inspected failed-save recovery at [1440](../output/playwright/recovery-retry-1440.png), [1280](../output/playwright/recovery-retry-1280.png), [1024](../output/playwright/recovery-retry-1024.png), [720×450 reflow](../output/playwright/recovery-retry-720.png), plus the [explicit signing guard](../output/playwright/recovery-sign-review.png). Identity and Retry remain visible.
- **Layer and remaining scope:** validation entry and precondition ownership, a bounded repair with stronger guard verification; clinical state, persistence, signing and navigation implementation are unchanged. Full CI still has unresolved failures (64 failed / 282 passed / six flaky in the earlier run); this focused repair does not certify that suite or P12. Clinical-context/live navigation migration, remaining browser failures and per-file data isolation remain in ROADMAP. Unrelated launcher work was preserved.

### REVIEW-INTAKE-DATE-1 — Intake displays follow the practice clock

2026-10-06 · owner-authorized systematic review · starting `main` SHA `3220831e6dc398f3e13b2cc2c094687d5892019f`; concurrent local dashboard commit `cd18f2d` retained before publication; resulting SHA: the commit containing this entry. Requirements D-049 practice-clock contract and Intake follow-up continuity (D-075 / D-112).

- **Confirmed and repaired:** in a Tokyo browser, `2026-10-07T01:30:00Z` appeared as October 7, 10:30 AM, while the practice clock names October 6, 6:30 PM. Intake follow-up and last-outreach queue displays and note/outreach metadata now use the existing clinical-date helpers. Date-only and floating values retain their established semantics. Source records, follow-up editing and transport are unchanged.
- **Validation:** the new browser regression failed on the baseline's shifted date, then passed after migration. It creates its own synthetic intake precondition and verifies the queue and detail note. `npm run check` (636 tests) and `npm run build` passed. Captured and inspected [before](../output/playwright/intake-dates-before.png), [queue after](../output/playwright/intake-dates-queue.png), and detail at [1440](../output/playwright/intake-dates-detail-1440.png), [1280](../output/playwright/intake-dates-detail-1280.png), [1024](../output/playwright/intake-dates-detail-1024.png), [720×450 reflow](../output/playwright/intake-dates-detail-720.png).
- **Layer and limits:** shared date presentation rule, a bounded correction rather than a new clock or clinical model. Organization-specific timezone configuration and other unmigrated display callers remain open. Screenshots also exposed crowded long-name/prospect labels in the selected queue at 1024px; retained for the next review in ROADMAP. The older detail/companion overlap item remains unverified by this date-only pass. Previous-head CI run 37515293293 failed (64 browser failures / 282 passes), recorded for diagnosis in ROADMAP. Unrelated launcher changes are preserved; broad CI/browser/P12 certification remains open.

### REVIEW-RECOVERY-1 — Revalidate cached note save claims

2026-10-06 · owner-authorized continuous review · starting `main` SHA `194ccfd8cfb48f42e5aee0d30de9ba27bf5d70e8`; resulting SHA: the commit containing this entry. Requirements CB-7 / SAVE-06, truthful persistence feedback and patient-context preservation. Workflow: reopen a recovered encounter after its server draft disappears or the read fails.

- **Verified behavior:** the toolbar shows “Checking saved note…” during hydration. When a previously acknowledged draft is absent, or its read fails, the shared save coordinator invalidates its saved claim and the toolbar explains that the local copy remains and offers reload guidance. Local text, patient/encounter identity and expected server revision remain intact. Retry is shown only for pending dirty work; clean cached content has no save to retry. Existing save conflict checks remain authoritative; this does not automatically recreate a missing record.
- **Validation:** `npm run check` passed (636 tests) and `npm run build` passed. All four encounter-hydration browser cases passed, including existing loading/signing and separate scheduled-visit identity coverage. The added unit case verifies that a later edit still sends the original revision token and remains failed on conflict. Browser tests verify missing/failed reads retain text and send no write. Captured and visually inspected [1440](../output/playwright/recovery-missing-1440.png), [1280](../output/playwright/recovery-missing-1280.png), [1024](../output/playwright/recovery-missing-1024.png) and [720×450 reflow](../output/playwright/recovery-missing-720.png); the warning wraps within the toolbar and identity remains visible.
- **Layer and limits:** shared persistence feedback and presentation, a bounded rule correction; no clinical schema, AI, transport or navigation changes. Recreating/rebasing a missing draft remains deferred in ROADMAP. Failed reads without a cached server revision and dirty recovery reconciliation are not certified by this pass. Unrelated launcher edits were preserved. Full review coverage and full CI/browser certification remain open.

### REVIEW-TOUCH-1 — Discoverable roster actions on devices without hover

2026-10-06 · continuing authorized usability review · starting `main` SHA `9a1a1b41b54ff266f652d503e87ada73139948d9`; resulting SHA: the commit containing this entry. Requirements DASH-05/06/10 and PAT-08; schedule row -> explicit Start, visit detail, medication or More action -> originating patient. The existing reserved action column and authorized handlers remain the owner; unrelated launcher work is preserved.

- **Confirmed fix:** a touch-enabled browser reports `(hover: none)` and scheduled-row actions remain at opacity zero until an undiscoverable focus/hover interaction. A shared media rule now keeps roster actions visible on devices without hover, covering all appointment states rather than one patient or route. Desktop hover/focus disclosure is retained. No clinical action executes automatically and no layout column was added.
- **Validation:** roster browser cases pass 4/4 (three desktop hover geometry cases with a docked companion and one touch case over the viewport matrix). The final touch case also passes 1/1 with actual menu open/close and Open chart navigation, verifying the originating patient's heading. `npm run check` passed (635/635 unit/service tests, lint with existing warnings, typecheck); `npm run build` passed.
- **Screenshots captured and inspected:** [before](../output/playwright/roster-touch-before.png), [1440](../output/playwright/roster-touch-1440.png), [1280](../output/playwright/roster-touch-1280.png), [1024](../output/playwright/roster-touch-1024.png), [720×450 reflow](../output/playwright/roster-touch-720.png). Start and secondary actions remain reachable without horizontal clipping; narrow rows retain the existing second action line.
- **Layer and remaining scope:** presentation accessibility through the existing input-capability rule; a bounded correction. Patient records, permission enforcement, scheduling conflicts and transports are unchanged. No new uncertain product choice arose. Hybrid devices whose primary pointer supports hover still use the existing hover/focus behavior. Browser isolation, complete CI/browser/P12 certification and the other ROADMAP uncertainties remain open.

### REVIEW-RELIABILITY-1 — Restore sections through their owner and repair repeat-run preconditions

2026-10-06 · continuing owner-authorized review · starting `main` SHA `9f6f82880ba47d81b30d77021bf604991fa4dd00`; resulting SHA: the commit containing this entry. Requirements TAB-03/04, WIN-08/09, PAT-01 and keyboard/accessibility parity. Clinical workflow: retain each patient's section through detach/dock/reload, and schedule a prospect without inheriting old test bookings. Unrelated launcher changes remain untouched.

- **Confirmed runtime repairs:** Overview/Encounter passed `aria-pressed` to a shared Button that owns that attribute through `pressed`; selection was visual but absent from accessibility state. Both controls now use its established contract. Workspace restoration still clicked the retired primary section-tab row, losing Encounter on reload. Primary sections now restore through the registered navigation controller; capture reads rendered section metadata, navigation location reads the existing tab section metadata, and DOM fallback supports header controls. Detached controls retain their existing path. No second navigation or patient store was added.
- **Validation repair:** the two-chart test now exercises current Overview/Encounter controls while retaining identity, independent sections, Back/Forward, move/resize/cancel, minimize/maximize, docking, reload and keyboard assertions. The intake scheduling test reused October 1, 2026 until accumulated appointments left no open slot. All prospect booking cases now choose an unused synthetic date from the authoritative schedule rather than assume a fixed date is empty. This does not change product conflicts or clinical authority. The D-076 date defect had already been partly addressed by `7176073`; this pass found and repaired the remaining fixed-date case.
- **Layer:** workspace continuity and validation integrity; a bounded governing-mechanism correction. Clinical records, coding, AI behavior, external delivery and database isolation are unchanged. Per-file browser isolation and complete browser/CI/P12 remain open; a free-date read does not reserve against parallel suites sharing a database.
- **Browser and visual evidence:** both affected specs passed 8/8 twice against the same accumulated database; the repeat adds in-viewport identity/Encounter assertions at 1440×900, 1280×800, 1024×800 and 720×450 (200% reflow on a 1440×900 display). Inspected [independent patient panes](../output/playwright/reliability-patient-panes-before.png), [restored chart](../output/playwright/reliability-restored-panes.png), and [1440](../output/playwright/reliability-chart-1440.png), [1280](../output/playwright/reliability-chart-1280.png), [1024](../output/playwright/reliability-chart-1024.png), [720](../output/playwright/reliability-chart-720.png). Identity and section controls remain reachable; the smaller Encounter uses vertical scrolling. No uncertain product-intent choice arose. The next eligible slice remains browser isolation and complete synthetic clinic-day validation.
- **Required checks:** `npm run check` passed (635/635 unit/service tests, lint with existing warnings, typecheck); `npm run build` passed. An intermediate concurrent check failed repository hygiene because the browser dev server rewrote `next-env.d.ts`; final checks run after browser teardown with the committed generated file restored. No clinical assertion was weakened.

### REVIEW-IMPROVE-1 — Fix the improvements found by the usability review

2026-10-06 · explicit owner override to fix the found improvements · starting `main` SHA `524b09cdf543f48c9ad6f8097c4174e03280c2f0`; resulting SHA: the commit containing this entry. Requirements TAB-05, PAT-08/10, TRUST-01/03, DASH-11; patient chart -> working orders -> encounter review, practice queue continuity and source-grounded assistance. Pre-existing launcher/tab/CSS work is preserved outside this commit. [D-125](decisions/D-125.md) records the authority contracts and bridge limits.

- **Workspace and source ownership:** Results Queue and Document Inbox use persistent closeable module tabs; eligible module tabs and the active workspace survive reload through the existing navigation controller and snapshot. The note reads the same patient working cart as prescribing/labs, labels it local drafts, and does not claim encounter attribution or transmission. Monitoring controls identify already-staged labs. Dashboard visit handoffs are distinguished from team tasks; briefing labels another patient's unfinished work explicitly.
- **Review and entry:** jumping between signing steps no longer marks skipped steps complete. Empty documentation shows no evidence-supported billing estimate or persisted default code. Incomplete assessments expose existing item-level flags immediately while remaining incomplete and unsaveable. Medication search filters the 11-entry prototype catalog without changing the selected prescription. Intake relative dates use the practice calendar and readable units.
- **Grounding:** chart recap projects recorded diagnoses, medications and allergies with evidence references. The model boundary rejects a lab proposal for a medication operation lacking laboratory language. Explicitly patient-named synthetic tasks carry links in new seeds; the synthetic sulfa allergy example uses hives. Fabricated legacy fax/inbox snippets are [archived](archive/review/retired-communication-fixtures-2026-10-06.md), and imported legacy components have empty clinical inbox fixtures.
- **Layers and limits:** shared workspace persistence, source projection, entry feedback and validation are improved through bounded rule repairs. Recap is a bridge to full synthesis; action-family guarding is lexical containment. Catalog breadth, encounter-linked authorized order history, semantic intent understanding, older database fixture values, production gates and browser isolation remain unimproved. Provenance/value ordering remains coupled to the context assembler.
- **Validation:** `npm run check` passed (635 unit/service tests, lint with existing warnings, typecheck); `npm run build` passed. Focused browser tests passed 11/11, with the medication search/reflow case also passing 1/1 on a separate rerun. Evidence covers queue reload/background close, medication selection/search/empty filtering, incomplete safety flags/reset, patient-bound local cart and recap, delayed hydration without blank writes, signing/readiness and failure recovery. The hydration setup was updated to the current Encounter control without weakening assertions. Full-suite certification is not claimed.
- **Visual evidence inspected:** [queue tabs](../output/playwright/review-improvements-queue-tabs.png), [medication composer at 1440](../output/playwright/review-improvements-rx-1440.png), [1280](../output/playwright/review-improvements-rx-1280.png), [1024](../output/playwright/review-improvements-rx-1024.png), [incomplete assessment alert](../output/playwright/review-improvements-incomplete-safety.png), [working cart](../output/playwright/review-improvements-working-cart.png), [bounded recap](../output/playwright/review-improvements-chart-recap.png). The composer uses scroll to reach lower fields while retaining patient identity. The [720×450 reflow check](../output/playwright/review-improvements-rx-200-percent.png) models 200% browser zoom on a 1440×900 display; identity and Close stay visible, controls scroll, and dialog bounds stay inside the viewport. Root CSS zoom was discarded as an invalid viewport-unit simulation.
- **Next eligible step:** repair the remaining stale/state-dependent browser preconditions and isolate browser data before the full synthetic clinic-day gate. The autonomous review heartbeat remains active.

### REVIEW-LOOP-1 fourth pass — Lab result entry integrity

2026-10-06 · owner-directed continuing review · starting `main` SHA `12a9b0d84c730c5e97d042de512b3dd717f67e5b`; resulting SHA: the commit containing this entry. Requirements PAT-08/10, TRUST-01/03; manual result entry -> patient laboratory observation -> acknowledgement queue. Pre-existing launcher changes preserved.

- **Verified fixes:** selecting CMP and then a combined lipid/HbA1c panel retained CMP's `24323-8` code. Test-name changes now replace the code with the current single-code catalog match or clear it for a combined/custom/empty test. Manual code entry remains available. Collected-date default and maximum now use `practiceToday`, so a travelling clinician's browser does not select tomorrow at the practice. Existing observations are not rewritten.
- **Layer:** data-entry identity and practice-date projection; a bounded governing-rule repair, not a new lab model. Persistence, permission checks, acknowledgement and disconnected transport are unchanged. The catalog remains a limited set of selectable test names; code validity still relies on clinician review and the existing server contract.
- **Validation:** `npm run check` passed (628 unit/service tests, lint with existing warnings, typecheck); `npm run build` passed. `lab-result-entry.spec.ts` passed 2/2, including authoritative save/flowsheet display, vital-sign redirect, single/combined/custom/empty test transitions, manual code retention while entering a result, and Tokyo browser/Phoenix day boundary. Full browser suite remains uncertified.
- **Visual evidence inspected:** [before: stale CMP code](../output/playwright/review-loop-2026-10-06/20-lab-entry-stale-code-before.png), [1440×900](../output/playwright/review-loop-2026-10-06/21-lab-entry-cleared-code-1440.png), [1280×800 controls](../output/playwright/review-loop-2026-10-06/25-lab-entry-controls-1280.png), [1024×800 controls](../output/playwright/review-loop-2026-10-06/25-lab-entry-controls-1024.png), [200% CSS zoom](../output/playwright/review-loop-2026-10-06/24-lab-entry-200-percent.png). Form controls are reached by scrolling; identity and recovery controls remain visible. No new uncertain product-intent items; the existing review questions remain in ROADMAP.
- **Continuation:** hourly chat heartbeat resumes bounded review without owner input. Next eligible repair is browser validation reliability, including stale chart-section expectations and repeat-run scheduling data. Uncertain/deferred behavior remains listed in ROADMAP.

### REVIEW-LOOP-1 — Autonomous find-and-fix review of the running EHR

2026-10-06 · owner override: systematically review the EHR for errors and shortcomings with screenshots and usability checks, fixing each in turn. Starting `main`: `cedc4f5`. Resulting source SHA: `9d1ee05`; evidence: the commit containing this entry. Synthetic data only; the pre-existing uncommitted Open-workspace launcher/tab-strip z-index work in the tree was left untouched and is not part of these commits. Requirements TAB-05, PAT-06/08/10, VIS-05/06/07, TOOL-03, RIGHT-04/05, TRUST-01/02, RX-03.

- **Workspace restore (`a12152f`):** a reload in the in-app browser came back with no patient tabs and then autosaved the empty workspace over the saved one. The restore typed each name into the omnibox and clicked the first result containing it (now the "Open <name>" AI row), and omnibox results only render while the window has focus. Restore and `ensurePatientOpen` (Billing, Prescribing, Labs "open chart") now use the registered navigation controller; the omnibox is an exact-name fallback. New single-reload spec. It also passes on the old code under headless Playwright, so it guards the outcome; the in-app reproduction was twice-observed, and the precise trigger (focus vs. AI row) is not proven.
- **Identity safety (`2661182`):** Intake duplicate detection and self-service portal DOB verification compared raw date text, so an ISO prospect DOB never matched a seeded "MM/DD/YYYY" chart and seeded patients could not verify at the portal. Shared `normalizeDateOfBirth`/`sameDateOfBirth`; unreadable values never match.
- **Fabricated identity evidence (`8abd0cf`, `0b43ffa`, `9d1ee05`):** Patient information showed "Real ID Verified" for every chart and fixture license D9482710/05-18-2028 when none was on file; the ID & photo dialog filled a missing card with a fixture license ("742 Evergreen Terr", Class C, "(Valid)") and its Save wrote that card into the record. Both now show only the recorded card or "None on file"/"Not yet reviewed", and Save no longer touches the ID card.
- **Grounded counts and values:** Home's glance said "15 appointments scheduled for today" by counting every loaded date; it now counts today's non-cancelled visits and reports loading/failure (`8e2f3c8`). The lab unit sentinel "multi" leaked in five views ("AST 21 multi"); one formatter owns it and two seeded panels no longer append a single unit to a multi-unit summary (`53db455`).
- **Shell (`9160a53`):** opening a module from a Home tile kept Home's Zen chrome, whose CSS hides the companion rail, so Meds/Labs/Comms/Tasks were unreachable. Zen chrome now applies only while Home is in front. Spec extended; it fails on the old code.
- **Prescribing:** an advisory now appears when the chosen drug is already on the active medication list (`19ee8d2`); the selected medication chip no longer loses its label while hovered (`f409852`).
- **Presentation consistency:** DOB shows MM/DD/YYYY at every identity surface; Review & Sign steps wrap so "Sign & Authorize" is visible (`6eb5905`); document types and record sources read as words, not identifiers (`a99682a`, `53db455`); Results Queue/Document Inbox/medication/Intake dates use the practice clock instead of `toLocaleString` with an invented "12:00:00 AM" (`c5805a7`, `f49fd1f`); the Calendar mini-month starts on Monday like the grid and its days are keyboard buttons (`ac54102`); the Tasks target line reads "New tasks link to …" and a seeded task no longer puts lithium on Jordan Reed (`fba73cd`); the schedule search has an accessible name (`67ab9ad`).
- **AI grounding, second pass (local Ollama `llama3.2:1b` was live on this machine):** a model-supplied patient reference is honored only when the clinician typed it — "What medications is the patient taking?" with no chart open had answered with Maya Chen's medications (`19c6d9d`); a synthesized answer whose numbers are absent from its cited sources is discarded — asked for a GAD-7 trajectory the record does not hold, the model cited a valid key and reported "14.0 to 4.0" (`4761815`); in-chart search leaves out the bound patient's name and filler words, so answers no longer "find" an encounter by the patient's name, and highlight markers no longer leak into plain-text answers (`f18cf5f`); an unrecognized request says "Not supported yet" instead of blaming record access (`fc5c29e`). Each has a unit test that fails on the old code.
- **Second-pass UI:** patient search matches a DOB as displayed (`7c22b9d`); the omnibox "Open Meds Tab" button is "Open medications" and its spec checks the Medications view rather than the retired tab (`5c7be25`); teammate presence comes from live heartbeats, not the seeded "online" column, and Communication draws online/away/offline distinctly with spoken chip names (`aadae7f`, `09f0bbf`).
- **Third pass — ordering and counts:** Past notes list newest visit first (signed dates are display strings and sorted alphabetically, "Jun" before "Aug") (`5c85300`); the calendar rail, arrivals window and Intake date sort compare 12-hour times as minutes instead of text ("01:30 PM" before "10:00 AM") (`e46df4b`); the dashboard calendar rail no longer counts cancelled visits ("3 visits" under a "2 visits" schedule header) (`ad34fa0`). 1280×800 and 1024×768 dashboard/chart/encounter were re-inspected at full resolution.
- **Validation:** `npm run check` passed (lint 0 errors, typecheck, 628 unit/service tests incl. new DOB-identity, lab-value, schedule-glance, same-drug, invented-patient and invented-number tests); `npm run build` passed. Second-pass browser runs: `home-assistant` 6/6 (its "asks which one instead of choosing" case had failed on the invented-patient bug), `omnibox-ambient-preview` 1/1, `patient-roster`, `patient-picker`, `voice-menu`, `calendar-event-lifecycle` all passed, Communication/shell-ownership/lifecycle 15/15. Browser runs against the review server (`PLAYWRIGHT_PORT=3210`, shared review DB): `companion-draft-target` + `companion-leave-warning` 13/13 after repairing their helper (4 Scratchpad cases had failed before any assertion because Scratchpad is no longer a default pin; they now open it from More, as a clinician does); `workspace-reliability` new reload case passed; `practice-decomposition` Home-tile case passed (and failed with the fix reverted); `companion-resize` 4/4 at 1440 and 1024; `intake-workspace` 4/5 — the remaining case books a fixed 2037-09-22 slot that an earlier run of the same file already occupied. Full browser suite and CI were not run.
- **Visual evidence:** [dashboard lab values](../output/playwright/review-loop-2026-10-06/01-dashboard-lab-values-1440.png), [charts after reload](../output/playwright/review-loop-2026-10-06/02-after-reload-charts-restored-1440.png), [Home glance](../output/playwright/review-loop-2026-10-06/03-home-schedule-glance-1440.png), [Billing from Home with rail](../output/playwright/review-loop-2026-10-06/04-billing-from-home-rail-visible-1440.png), [ID none on file](../output/playwright/review-loop-2026-10-06/05-patient-info-id-none-on-file-1440.png), [Review & Sign steps](../output/playwright/review-loop-2026-10-06/06-review-sign-all-steps-visible-1440.png). 1024px and 720×450 (≈200%) were checked by measurement: no page-level horizontal overflow; companion panels scroll their body between sticky header and footer.
- **Not changed (owner decisions, carried to ROADMAP):** see "Review-loop questions" in ROADMAP.

### RECOVERY-1 — Recover prescribing, signing, local dates and companion fit

2026-10-05 · owner override: resume Claude's unfinished functionality/visual review with secondary agents. Starting authoritative `main`: `a011a795c0ee9badbcded495ea936f1bbd12388b`. Resulting source/test SHA: `c846477`; final evidence commit: the commit containing this entry. Requirements RX-03/04/05, TRUST-01/02/03, PAT-06/08/10, VIS-05/06/07, TOOL-01/03, TAB-05/07, RIGHT-04/05. This verifies the recovered bounded workflows locally; it does **not** close SHELL-OWN-1, P12 or the full browser/CI gate.

- **RX-SAFETY-1:** new prescriptions open without a drug, indication or pharmacy selected; staging stays disabled with an explicit reason until required fields are chosen. Catalog defaults follow explicit drug selection. Legacy medication matching cannot override a separate structured identity, preserves concentration denominators and remains advisory. Duplicate/continuation review does not automatically merge medication truth. The order dialog explains that staging does not send an order. Its unselected pharmacy label describes selection state rather than claiming the patient has no saved pharmacy; this composer does not read patient pharmacy links.
- **SIGN-READY-1:** the draft status and sign dialog summarize the existing readiness projection. Open/loading/unavailable sources require acknowledgement; changed evidence or pending rereads invalidate it. Known items remain visible while refreshing. Patient name/DOB/MRN remain visible at every sign step. Bounded client review metadata is audited, not server-certified completeness. Signing and order authorization/transmission remain separate. A fresh synthetic patient with no encounters passed author → first autosave → authoritative reload → legal sign, without seeded encounter data. See [D-124](decisions/D-124.md).
- **LOCAL-TIME-1:** migrated Overview, History, Labs, clinical-brief and monitoring age calculations distinguish date-only records, floating wall clocks and instants; instants use the shared practice timezone. Invalid ISO calendar components are rejected rather than normalized, and epoch zero is valid. New encounter reference reads wait until the server owns the encounter ID. Empty BMI-category parentheses are omitted. The vitals/History browser case used Tokyo browser time to distinguish practice time from host/browser time.
- **COMPANION-FIT-2:** Calendar popovers use existing zoom-aware geometry; Communication controls, conversation and composer fit narrow/short panels and retain drafts through expand/redock; Labs tabs retain full labels and a pinned bound-patient header. Open workspace and patient overflow remain clickable with six tabs. A late empty reconciliation read preserves a clinician-opened editor; patient rebinding still resets disclosure and obsolete responses remain cancelled. No font reduction, router/store replacement or vendor activation. The redundant readiness-panel signing control is retained through the visible encounter toolbar; readiness facts and their review actions remain in the panel/dialog.
- **Validation:** `npm run check` passed: lint (0 errors, 1297 existing warnings), typecheck and all 616 unit/service tests. `npm run build` passed. Integrated Chromium run: 48/50 passed; Calendar 1280 setup hit a preferences PUT connection reset and expand/redock setup timed out navigating during workspace restoration, before their behavior assertions. Both exact cases then passed unchanged, together with all six repaired Overview-content cases (8/8). Thus 56 distinct affected browser cases passed across the integrated/follow-up runs, including actual 200% enlargement, 1440×900, 1280×800, 1024px and minimum dock. Initial concurrency-related failures and these two setup failures are retained as unresolved test-environment reliability evidence, not silently waived. The final pharmacy-label browser regression also passed (1/1). Full suite was not run locally. The starting SHA's published CI failed at Browser workspace verification; published recovery CI is a separate gate and remains pending at this recording.
- **Validation repairs:** nested `.claude` checkouts are excluded from main lint/typecheck. Cancellation PIN redaction is asserted in the free-text reason instead of mistaking random generated IDs for credentials; other secret markers remain forbidden throughout the event. Signing source checks retain persistence-before-sign and one-sign-call guarantees with the new audit argument. Browser fixtures/selectors now supply patient identity, use actual History navigation, uniquely target Edit, wait for authoritative preference persistence and verify Orders through its retained overflow path. No behavioral assertions were skipped or removed. A malformed generated Next browser cache was preserved outside the active checkout and regenerated; source validation was rerun.
- **Visual evidence:** [empty prescription](../output/playwright/rx-safety-empty-composer.png), [existing-medication review](../output/playwright/rx-safety-existing-medication-review.png), [sign identity at 1024](../output/playwright/sign-readiness-acknowledge-1024x800.png), [practice-time vitals](../output/playwright/local-time-vitals-dialog.png), [Labs](../output/playwright/companion-overflow-labs-1280.png), [Calendar at 200%](../output/playwright/companion-fit-1440-2x-calendar.png), [Communication at 200%](../output/playwright/companion-fit-1440-2x-communication.png) and [Overview at 200%](../output/playwright/overview-content-1440-2x.png). Screenshots are synthetic and were inspected; the browser connection for an additional interactive manual review failed to attach.
- **Layer/limits:** presentation/lifecycle, conservative domain comparison, time normalization and validation improved through shared rules. AI reasoning, live vendor connectivity and production readiness were not improved. Legacy matching remains a deterministic advisory bridge, not medication equivalence or pharmacologic reasoning. Readiness remains coupled to asynchronous chart/reference/care projections and client acknowledgement; companion fit relies on existing saved state, CSS selectors and shared geometry. Other direct locale/UTC date call sites and organization-specific timezone configuration remain open in ROADMAP. Next eligible bounded repair: isolate browser data and stabilize setup before full synthetic clinic-day certification.

### COMPANION-HEADER-FIT-1 — Companion headers never wrap letter by letter

2026-10-04 · owner-requested follow-up from the 2026-10-04 functionality review · starting SHA `c558ebc` (`main`) · resulting commit: the commit containing this entry. Requirements VIS-05/06/07, TOOL-03, RIGHT-04/05.

- **Cause:** every right-rail tool renders the shared `CompanionPanelHeader` through `CompanionPanelFrame`. Its identity block (title + bound context) had `min-width: 0` while the controls (`Return to workspace`, expand/redock, unpin, close) were `flex-shrink: 0` on a single non-wrapping row. In the single-surface layout at a ~343px pane the labeled Return control took the row, and Communication's context line used `overflow-wrap: anywhere`, which let the block shrink to one glyph, so "Maya Chen · P-10482 · DOB…" stacked one letter per line.
- **Behavior:** the shared header now wraps. The identity block keeps a `10rem` basis (`min-width: min(10rem, 100%)`); when it and the controls cannot share a row, the controls move to a right-aligned second row and the identity block takes the full width. Communication's context line uses `overflow-wrap: break-word`, so words break only when they cannot fit. All labeled controls stay visible and labeled; no font, icon-only replacement, JS measurement, dependency or framework change. Applies to every frame-based companion (Communication, Meds/Docs/History/Orders, Labs, Calendar, Tasks, Scratchpad, Prescribing, Calculator, Clinical AI, HR).
- **Validation:** `npm run check` passed (585 unit/service tests, lint/typecheck). `npm run build` not run by this agent. New `companion-header-fit.spec.ts` (3 cases) passes: Communication, History and Labs at 1024×800 and 395×800 (single layout with Return to workspace) and at the 260px minimum dock measure each header text's width against its longest word and its height against three line-heights, require every header control to be labeled and inside the pane, and keep a typed Team draft through expand/redock. Before the fix the 395 case failed (title block 54.8px vs 105.5px longest word). Regression run over 9 companion/communication/history specs (51 cases incl. the new 3): 44 passed, 7 failed. Re-running the four failing spec files on the starting CSS gave 10 failures out of 18, covering 6 of the 7 (`companion-ai` planner, `companion-draft-target` ×3 Scratchpad, `companion-leave-warning` Scratchpad, `companion-resize` expand/redock draft); the 7th (`companion-draft-target` "task pressed twice") passed on its own rerun with this change and is load-dependent. Full browser suite and CI not run.
- **Visual evidence:** inspected [Communication 395](../output/playwright/companion-header-communication-395.png), [History 395](../output/playwright/companion-header-history-395.png), [Communication 1024](../output/playwright/companion-header-communication-1024.png), [Communication minimum dock](../output/playwright/companion-header-communication-min-dock.png) and [Labs minimum dock](../output/playwright/companion-header-labs-min-dock.png). Not fixed here: at the minimum dock the Communication "Patient threads / Practice inbox" sub-tabs overlap and the thread meta row squeezes into narrow columns.

### MEAS-DLG-1 — Measurement dialogs paint an opaque, stable surface

2026-10-04 · owner-requested follow-up from the 2026-10-04 functionality review · starting SHA `da35929cb0fc18dead25c79cafd4a7cd864ab2ee` (clean fetched `main`) · resulting commit: the commit containing this entry. Requirements VIS-05/06/07, RIGHT-04/05; within [D-123](decisions/D-123.md).

- **Cause:** `.modal-card`, used by the Vitals, Rating Scales and Psychiatric History entry dialogs, had no CSS rule at all. Only the inner form card was opaque, so the header, history table and footer floated transparently over the chart. Opened from the History companion, the dialogs also stayed inside the companion's stacking layer, and the global top bar painted over their title.
- **Behavior:** one shared `.modal-card` surface (opaque, bordered, elevated). The card remains the scroll container. Its header, with title, patient identity and close, sticks to the top, and the Close footer sticks to the bottom. The three dialogs portal to `document.body`, matching the existing Communication dialogs. The Vitals history table scrolls horizontally instead of clipping. Identity, focus/Escape handling, the clinical read/write calls and the patient binding are unchanged. No new store, dependency or vendor.
- **Validation:** `npm run check` passed (585 unit/service tests, lint/typecheck); `npm run build` passed. New `measurement-dialog-surface.spec.ts` covers both dialogs at 1024×640 opened from History. It asserts an opaque card/header/footer, a scrolling body, a header pinned to the card top after scrolling, a title that is topmost at its own position, and visible identity and Close. Escape and Close both dismiss. It and both `history-fit` cases pass. Across eight dialog-adjacent specs (33 cases), 30 passed. The 3 failures reproduce identically on the unchanged starting SHA via `git stash` and are not caused by this slice: `asrs-assessment` (no "Review scales" button is found before any dialog opens) and `patient-overview` CB-4 ×2 (expects a `data-tool-id="orders"` rail button that is not rendered). `overview-grounding` "width, pin, hide…" failed once in the combined run, then passed 8/8 alone and in a combined rerun, so it is order-dependent rather than caused by this slice. Full browser suite and CI were not run.
- **Visual evidence:** [Vitals at 1024×640](../output/playwright/measurement-dialog-vitals-1024.png) and [Rating Scales at 1024×640](../output/playwright/measurement-dialog-scales-1024.png), both scrolled to the bottom with the header and footer pinned. Not inspected: 200% zoom or a narrow docked opener.

### TOOL-FIT-1 — History controls fit their clinical surface

2026-10-04 · owner override · starting SHA `e0fd3b1e4d67353a1ba358007026b32d1da78c48` (clean fetched `main`) · resulting commit: the commit containing this entry. Requirements TOOL-03, RIGHT-04/05, VIS-07; [D-123](decisions/D-123.md).

- **Behavior:** History title/search, Record Vitals/Administer Scale, three labeled views, stream filters, interval controls and event details use intrinsic sizing and wrapping. Search has an accessible name. No action/record is removed, no font is reduced, and expand/redock/fit retain the mounted search/filter/patient context. The action check exposed missing patient identity in the covering measurement dialogs; shared Vitals and Assessments now display name/DOB/MRN and derive their request ID from that same owning patient object. History, Overview and Labs supply their existing patient. No new clinical store, router, permission, model, dependency, vendor or paid service was added.
- **Layer and limits:** presentation, accessibility, patient identity visibility and validation improved. Clinical reasoning, persistence, snapshot/reconciliation truth, clinical confirmation and transport remain unchanged. Existing modal draft/async/dismissal semantics remain; this does not certify complete modal or detached-window behavior. Shared History CSS and dialog callers remain coupled. Scripted interval synthesis remains demonstration behavior. A separate modal styling/autofocus follow-up is recorded in ROADMAP rather than hidden by this layout completion.
- **Validation:** `npm run check` passed (585 unit/service tests, lint/typecheck); `npm run build` passed. Seven distinct affected Chromium cases passed across runs: new fit/action/search/empty-state scenario, new pinned-dialog identity/read-target scenario, existing History lifecycle, Labs result/vitals flow and three Overview source/empty/wrong-patient/result cases. The first two-case run passed the lifecycle case and exposed missing dialog identity; after adding it, the three-case rerun passed. The broader nine-case regression passed six and failed three Overview gate cases. An isolated unchanged starting-SHA application reproduced the invalid encounter fixture and retired History-tab failures; the compact-density ambiguous Edit selector also reproduced on the unchanged application after copying the same synthetic browser database. Its fresh baseline passed, showing a state-dependent selector defect. No existing clinical assertions or timeouts were weakened. Full browser/P12 and remote CI certification remain open. `git diff --check` and changed documentation links passed; synthetic data only, no credentials added.
- **Visual evidence:** inspected [1440×900](../output/playwright/history-fit-1440-1x.png), [1280×800](../output/playwright/history-fit-1280-1x.png), [1024×800](../output/playwright/history-fit-1024-1x.png), [200%](../output/playwright/history-fit-1440-2x.png), [260px minimum dock](../output/playwright/history-fit-260-dock.png) and the [pinned patient dialog](../output/playwright/history-fit-bound-dialog.png). Controls fit their pane; dialog identity/read requests remain Maya while Jordan is foreground. Remaining Overview gate and modal visual defects stay in ROADMAP; SHELL-OWN-1 acceptance is next.


### MED-HIER-1 — Medication records and frequent actions first

2026-10-04 · owner override · starting SHA `8260f3dddea8574c0aaaefb0e9b0101cdfdd950e` (clean fetched `main`) · resulting commit: the commit containing this entry. Requirements TOOL-03, RIGHT-04/05, VIS-07; [D-122](decisions/D-122.md).

- **Behavior:** Add medication and the patient-bound New prescription action precede active records; New prescription is moved from Prescription work without duplicating it. Active records retain their dosing, indication, provenance, monitoring and actions. Reconciliation moves below active records, with a labeled count/disclosure: loaded pending evidence opens automatically; empty review stays collapsed; opening/collapsing preserves its report/interpretation draft. Record-authority explanation is disclosed below active records. Historical records, dose history, resolved reconciliation and prescription lifecycle actions retain their existing access. Initial load/error states no longer claim zero medications or review items, and each failed initial read offers Retry. The medication form's wide field no longer creates an extra grid column in a narrow dock, keeping Cancel reachable.
- **Layer and limits:** presentation hierarchy, read-state honesty and validation improved. Clinical APIs, patient-keyed mounts, stale-read guards, prescribing composer, reconciliation decisions and confirmations retain ownership. No schema, permission, router, model, vendor, dependency or paid service changed. Clinical reasoning and external transport were not improved; local disclosure drafts gain no reload durability. Prescription-driven truth revisions retain their existing remount semantics. Other compact tool layouts and full clinic-day acceptance remain separate work.
- **Validation:** `npm run check` passed (585 unit/service tests, lint/typecheck); `npm run build` passed. Nineteen distinct affected Chromium cases passed across runs: five hierarchy/read/reconciliation scenarios, unified Medications, nine patient-record lifecycle/authority/recovery cases and four existing patient-prescribing cases, including staging for a pinned patient while another chart is foreground. The broad run passed 12/13 and exposed Cancel outside the narrow form; fixing the governing grid span made the three-case rerun pass. The nine-case hierarchy/prescribing run passed; the final five-case hierarchy rerun also passed after a test type correction and waiting for the delayed response before asserting stale-read rejection. Assertions and timeouts were preserved. `git diff --check` and changed documentation links passed. Only synthetic fixtures used; no credentials added. Full browser/P12 and remote CI certification are not claimed.
- **Visual evidence:** inspected [1440×900](../output/playwright/medication-hierarchy-1440-1x.png), [1280×800](../output/playwright/medication-hierarchy-1280-1x.png), [1024×800](../output/playwright/medication-hierarchy-1024-1x.png) and [200% enlargement](../output/playwright/medication-hierarchy-1440-2x.png). Top actions and the active record remain reachable with patient identity in the pane. TOOL-FIT-1 is the next owner slice; SHELL-OWN-1 acceptance remains open.


### COMPANION-OPEN-1 — Open current work independently of favorite pins

2026-10-04 · owner override · starting SHA `4355b3e501dbd10ecaead5d97bdc065b5e607401` (clean fetched `main`) · resulting commit: the commit containing this entry. Requirements TOOL-03, RIGHT-04/05, VIS-07; [D-121](decisions/D-121.md).

- **Behavior:** More offers separate Open and Pin controls. Opening an optional tool does not add a favorite; opening the same tool again keeps its mounted work. Pin/unpin changes shortcuts without closing the tool or losing patient-owned work. More visibly names the active unpinned tool. Existing preferences restore implemented unpinned companions; unknown, planned and full-only destinations fail closed. Header Unpin appears only for an actual optional favorite. Closing/Escape returns keyboard focus to its favorite or More. The menu uses measured layout dimensions so Open and Pin remain reachable at enlargement.
- **Layer and ownership:** bounded workspace selection, preference restoration and accessibility improved. Existing registry/controller, favorite endpoint, patient binding and draft owners remain authoritative. No new router, clinical store, permission grant, model, dependency, vendor or paid service was introduced. Clinical reasoning and transport were not improved. Preference hydration, compatibility events and rail visibility retain their existing controller coupling. Reload does not add patient-selection or unstaged-form durability.
- **Validation:** `npm run check` passed (585 unit/service tests, lint/typecheck); `npm run build` passed. Twenty-four distinct affected Chromium cases passed across runs covering Open/Pin, personalization, responsive fit, patient records and Communication lifecycle. The broad run passed 23/24 and exposed More menu clipping at 200%; after fixing measured geometry the six-case Open/personalization rerun passed. A final three-case Open rerun also passed after the transient label padding adjustment. No clinical assertions were weakened. `git diff --check` and changed documentation links passed. Synthetic fixtures only; no credentials added. Full browser/P12 and remote CI certification remain separate gates.
- **Visual evidence:** inspected [1440×900](../output/playwright/companion-open-1440-1x.png), [1280×800](../output/playwright/companion-open-1280-1x.png), [1024×800](../output/playwright/companion-open-1024-1x.png), and [200% enlargement](../output/playwright/companion-open-1440-2x.png), including the independently reachable Orders Open/Pin controls and retained patient identity. Medication hierarchy and compact tool layouts remain in ROADMAP; MED-HIER-1 is the next eligible owner slice. SHELL-OWN-1 acceptance remains open.


### COMPANION-FIT-1 — Responsive companion fit and reachable return path

2026-10-04 · owner-directed override · starting SHA `1f348868332948f439c6bb8157f9c33a1d4918ff` (clean fetched `main`) · resulting commit: the commit containing this entry. Requirements TOOL-03, RIGHT-05, VIS-07; decision [D-120](decisions/D-120.md).

- **Behavior:** companion width fits beside a readable primary canvas on wide/medium screens. Narrow and enlarged layouts use one surface below persistent tabs with labeled Return to workspace and launcher focus recovery. Covered primary controls are inert; practice modules are hidden without unmounting. Short-window toolbars scroll instead of consuming the working body. Resize/zoom retains the mounted tool, patient target, typed lab draft, saved width and explicit expand/redock intent. Automatic fit does not change preferences; explicit close retains existing tool semantics, including ending local unstaged lab forms.
- **Layer and authority:** shared presentation geometry, accessibility and validation improved through the existing controller/frame. Clinical records, patient binding, draft ownership, permissions, AI reasoning and external transport are unchanged. No second router/store, font reduction, dependency or paid service was introduced. Root geometry/CSS/chrome coupling remains; detached floating panes retain their separate existing ownership.
- **Validation:** final `npm run check` passed (583 unit/service tests, lint warnings only, typecheck); final `npm run build` passed. Eighteen distinct affected Chromium scenarios passed: a final 17-case run across companion resize, viewport and patient-record specs, plus practice-module return/recovery. Coverage includes all tools' containment and expand/redock, saved-width reload, patient pin/follow, draft ownership, retrieval failure/retry and wrong-patient rejection, and round-trip resizing/enlargement. First broad run passed 15/16 with a workspace-restore setup timeout; the unchanged case and final full affected run passed. An initial local Ollama timeout passed serially. Another full-check attempt falsely matched dummy PIN `4321` in a generated transaction UUID/event key; stored reason redaction was verified, no assertion changed, and the final full check passed. The test defect remains documented in ROADMAP. Diff whitespace and changed Markdown file links passed; no real PHI or credentials were added. Full browser/P12, cross-browser and remote CI certification are not claimed.
- **Visual evidence:** inspected [1440×900](../output/playwright/companion-fit-1440-1x.png), [1280×800](../output/playwright/companion-fit-1280-1x.png), [1024×800](../output/playwright/companion-fit-1024-1x.png), [200% enlargement](../output/playwright/companion-fit-1440-2x.png), and [Home](../output/playwright/companion-fit-home.png), using only the isolated synthetic browser database. The 200% check verifies at least 100 CSS pixels of scrolling work area. Toolbar controls remain reachable by scrolling in short views.
- **Next eligible slice:** COMPANION-OPEN-1 separates current tool opening from favorite pins in the existing lifecycle. Medication hierarchy and compact tool layouts remain unfinished in ROADMAP.

### COMPANION-BIND-1 — Explicit record pinning and companion containment repairs

2026-10-04 · owner-directed cleanup · starting SHA `4b683ee98310735564ee1e4435931fd04e054ca2` with existing local changes · resulting commit: the commit containing this entry. Requirements TOOL-03, RIGHT-04/05, TAB-07, TRUST-03; amends [D-116](decisions/D-116.md).

- **Behavior and layer:** record companions distinguish following, deliberate pinning, and retained last-chart context. Pins survive chart changes and expand/redock; Follow active chart releases them. Name, MRN and DOB remain visible in the companion toolbar. Patient-explicit action callbacks and patient-scoped draft stores retain authority; Labs keeps its shared follow policy. Presentation state improved, not clinical reasoning, persistence or transport. Existing Labs toolbar/scope containment and Calculator footer wrapping resolve the previously reported narrow-width overflow. Calendar and parked Clinical AI reuse the existing expand/redock lifecycle.
- **Validation:** `npm run check` passed: lint (warnings only), TypeScript and all 583 unit/integration tests. `npm run build` passed. Publication verification covered 54 distinct affected Chromium cases: the broader run passed 51/54; its three old prescribing selectors/identity locations were corrected, preserving MRN/DOB and wrong-patient action assertions, and the final D-093 rerun passed all four cases. Record binding, pinned-patient prescribing, picker keyboard/failure recovery, companion resizing, Communication lifecycle and module tabs passed. Earlier focused runs also verified Labs/Tasks/message draft ownership and patient-tab overflow. Pin/follow controls were checked at 1440px, 1280px, 1024px and 200% CSS enlargement. Stale default-Orders/old-warning assertions were updated while retaining patient-action ownership coverage; picker failure testing waits for restoration to finish before holding Retry. Documentation links and `git diff --check` passed. Synthetic data only; no credentials or paid services added.
- **Limits:** the complete browser gate and remote CI certification are not claimed. The latest published starting-SHA CI run failed its unit step; this change includes the corrected assertions. Shared browser database state remains a test-isolation risk. The separate visual usability findings remain in ROADMAP; SHELL-OWN-1 acceptance remains open. Existing repository screenshot evidence was refreshed without adding new artifact paths.

### MED-UNIFY-1 — One Medications companion for medication and prescribing work

2026-10-03 · owner override · starting SHA `be109e87ac991b977dd4e3377765ebbf3de2c305` with pre-existing local changes · resulting commit: the commit containing this entry. Requirements TOOL-01/03, PAT-02/04/08; [D-119](decisions/D-119.md).

- **Behavior:** Medications retains patient medication truth and prescription work, and adds a Prescribing queue view over the existing authoritative practice queue. Separate Prescribing rail/pin-menu access is retired; legacy saved pins and open panel IDs resolve to Medications. Queue badges follow Medications. Existing full prescribing workspace access remains. Patient-explicit prescribing and order-created refresh remain reachable; patient identity and mismatch warning stay visible.
- **Layer:** workspace presentation and preference compatibility improved; clinical ownership, permissions, prescription authority and external transport remain unchanged. Existing controller/companion lifecycle and clinical source components are reused. Legacy PrescribingPanel source remains retained, unmounted; no files were deleted. Vendor-dependent populated recovery actions and full browser/P12 certification remain unverified.
- **Evidence:** final serial `npm run check` passed (582 tests, lint/typecheck; existing lint warnings); `npm run build` passed. Twelve distinct affected Chromium scenarios passed across focused runs: retained patient-selection/lifecycle, six practice-queue cases, four patient-prescribing cases, unified panel. Earlier overlapped runs hit restoration/generated-file interference and two migrated header selectors; corrected selectors and serial reruns passed. The staging test now asserts an increase of exactly one prescription instead of assuming the mutable browser database begins empty. `git diff --check` passed. Synthetic data only; no credentials, vendor or paid service added.
- **Visual evidence:** reviewed [1440×900](../output/playwright/medications-unified-1440-1x.png), [1280×800](../output/playwright/medications-unified-1280-1x.png), [1024px](../output/playwright/medications-unified-1024-1x.png) and [200%](../output/playwright/medications-unified-1440-2x.png). Medications and both inner views remain reachable. Remote CI certification is pending; unrelated pre-existing changes were preserved. The next eligible queue remains SHELL-OWN-1 acceptance.

### PAT-PICK-2 — Start new intake from the patient picker

2026-10-03 · owner-directed extension · starting SHA `be109e87ac991b977dd4e3377765ebbf3de2c305` (clean fetched `main`) · resulting commit: the commit containing this entry. Requirements TAB-03/05, TRUST-01/03; amends [D-118](decisions/D-118.md).

- **Behavior:** the find/pick canvas offers New patient / Start intake. It opens Intake's existing creation form, from either Dashboard or already-mounted Intake. Opening/cancelling writes nothing. Explicit submission starts the existing prospective-person intake with an optional tentative visit; identity/promotion remains the chart-creation boundary. Successful creation selects the existing intake detail pane. Failure stays in the form; retry reuses the prospect already recorded. Existing patient tabs remain available. Search resets result scroll, and the new action remains reachable at 200% enlargement.
- **Layer and ownership:** bounded workspace navigation and accessibility improved. The existing navigation controller holds only a transient form-opening handoff; Intake acknowledges it on dismissal/completion/unmount. Existing prospective-person, intake, appointment and identity/promotion services retain authority. No second form, patient store, mutation route, model or paid vendor was introduced. The six existing contact/identity fields now have accessible names, resolving the MSG-INTAKE-1 field-label follow-up removed from ROADMAP in this commit. Clinical reasoning, production transport and full draft recovery were not improved; Intake's current form lifetime and multi-write boundary remain unchanged.
- **Evidence:** `npm run check` passed (581 unit/service tests, lint/typecheck); `npm run build` passed. Eighteen distinct affected Chromium scenarios passed across runs: five existing Intake scenarios, seven picker scenarios including failure/retry with exactly one prospect creation and no new clinical chart, and six launcher scenarios. The broader run passed 17/18; its final workspace-setup timeout coincided with an accidentally overlapped visual rerun. The overlap was stopped; the final serial rerun passed all five selected visual/setup scenarios without changing assertions or timeouts. Full browser/P12 and remote CI certification are not claimed. `git diff --check` and changed documentation file links passed; no real PHI or credentials were added.
- **Visual evidence:** reviewed the updated [1440×900](../output/playwright/patient-picker-1440.png), [1280×800](../output/playwright/patient-picker-1280.png), [1024×800](../output/playwright/patient-picker-1024.png) and [200%](../output/playwright/patient-picker-200-percent.png) picker. Close and New patient remain reachable while the roster scrolls. Remaining work stays in ROADMAP's SHELL-OWN-1 acceptance and financial truth/portability/clinic-day gates.

### PAT-PICK-1 — Patients launcher opens a find/pick canvas

2026-10-03 · owner-directed defect repair · starting SHA `6ed9db4310700490492689b6d0006e58dd62076d` (clean fetched `main`) · resulting commit: the commit containing this entry. Requirements: TAB-01/03/04/05, TRUST-01/03.

- **Behavior:** `+ -> Patients` now opens a searchable selection canvas instead of reopening the active chart or choosing the first roster patient. Search uses name, MRN or recorded DOB; each result includes name/DOB/MRN and an explicit Open chart action. Existing chart tabs, sections and mounted work remain intact while choosing. Close/Escape returns to the originating workspace and launcher focus; selecting an open chart reuses its tab. Loading, failed/retry, loaded-empty and unmatched search have distinct states. Search/Close remain visible while results scroll.
- **Layer and authority:** presentation/navigation and focused validation improved; the shared access-filtered patient roster, stale-response protection and chart-opening controller remain the owners. Selection rechecks roster readiness/membership. No new patient store, clinical mutation, AI reasoning, transport or paid service was added. This is a local navigation defect repair, not a cognitive architecture change. Existing event/controller coupling remains. Launcher geometry now normalizes screen/CSS coordinates for root enlargement and bounds its scrollable menu to available space.
- **Validation:** `npm run check` passed (581 unit/service tests, lint/typecheck); `npm run build` passed. Focused Chromium verification passed all 12 distinct scenarios: patient selection/cancellation/search/MRN/keyboard/tab reuse, roster failure/retry/loading/empty, four viewport checks, and six existing launcher scenarios. The final broad affected run passed 11/12 and exposed search-field Escape consuming the key; after repairing dismissal, the complete selection scenario passed in its focused rerun. No assertions were weakened. `git diff --check` passed. No real PHI or credentials were added. Full browser/P12 and remote CI certification are not claimed.
- **Visual evidence:** inspected [1440×900](../output/playwright/patient-picker-1440.png), [1280×800](../output/playwright/patient-picker-1280.png), [1024×800](../output/playwright/patient-picker-1024.png), and [200% enlargement](../output/playwright/patient-picker-200-percent.png), including scrolling to the final roster row with Close still reachable. The shared synthetic browser database supplied all patient rows.
- **Remaining scope:** a search/selection overlay, not a separate persistent Patients directory tab; no new patient-administration workflow. The existing SHELL-OWN-1 acceptance and financial truth/portability/clinic-day gates in ROADMAP remain the next eligible work.

### PAT-RAIL-1 — Persistent patient record companions

2026-10-03 · owner-directed override · starting SHA `c15aa3da29b5cc18fdf3702e1ab9fa506190cd8d` (fetched main) · resulting commit: the commit containing this entry. Requirements TOOL-03, PAT-10, TAB-01/02, LAYOUT-05; decision [D-116](decisions/D-116.md).

- **Implemented:** primary chart left navigation is replaced by always-available labeled right-strip Medications, Labs, Documents, Messages, History and Orders. Opening follows the foreground chart; switching charts follows the new patient; Dashboard/practice navigation retains the explicit target until close. Reopening without a chart asks for selection. Expand/redock retains target and mounted state. Overview, Encounter and Patient info remain visible in the header; Worklist/Columns retain labeled overflow access and keyboard dismissal/focus return. Existing saved sections and detached-pane navigation remain supported. Older custom pin layouts cannot omit core tools.
- **Ownership and layer:** presentation, tool-selection state, patient-bound action routing and validation improved. Existing clinical surfaces, navigation, permissions, per-patient/thread message stores, staged-order/composer owner and write gateways remain authoritative. Labs forms are patient-keyed; foreign or stale reads cannot replace the active results, and monitoring uses retrieved active medications with honest loading/failure. Intake-contact messaging remains available with its administrative permission boundary. History insertion opens the matching Encounter before requiring a second Insert. No new clinical store, AI reasoning, paid provider or vendor transport was introduced. Shared shell geometry normalizes root CSS enlargement instead of doubling tool offsets.
- **Required validation:** final sequential `npm run check` passed (577 tests, typecheck, zero lint errors; 1295 existing warnings). Final `npm run build` passed. `git diff --check` and changed documentation file links passed. A concurrent earlier check returned 576/577 because the browser server temporarily rewrote `next-env.d.ts` to its private build path; teardown restored it and the complete sequential rerun passed without altering the hygiene assertion. No PHI or credentials were added. Local checks do not certify remote CI.
- **Browser evidence:** final serial suite passed **11/11**: five record tools follow/retain/close/reopen/expand/redock; patient-owned lab draft restoration; 1440×900, 1280×800, 1024×800, 720×800 and 200% enlargement with tab/rail alignment and reachable tools; intake recipient preservation; document failure/recovery; foreign-patient Labs rejection; existing lab result-entry/vitals path. Earlier affected run passed 26/28; both navigation-selector failures were corrected and passed in the five-case rerun alongside three existing message-draft cases. Assertions/timeouts were preserved. Full repository browser suite was not run.
- **Visual evidence:** inspected [chart](../output/playwright/patient-record-chart-1440.png), [docked Medications](../output/playwright/patient-record-meds-1440.png), [Documents](../output/playwright/patient-record-docs-1440.png), [expanded narrow pane](../output/playwright/patient-record-expanded-720.png), [retained Dashboard](../output/playwright/patient-record-retained-dashboard.png) and [200% enlargement](../output/playwright/patient-record-chart-200-percent.png). Images show the actual synthetic shared test database.
- **Limits:** clinical AI and assessment insertion retain their prior foreground gates; local unstaged lab forms end on close. No overall clinical safety or external delivery claim follows from a monitoring panel or an open composer. Shared browser-database state and full browser/P12 certification remain in ROADMAP. The next eligible queue remains financial truth, portability and the synthetic clinic-day gate.

### ENC-LIVE-1 — Document-first capture/review and provider guidance foundation

2026-10-02 · owner-directed override · starting SHA `8cd4b2de12e4eb4c76d2cd73e423a0fbbb3b901d` (fetched `main`) · resulting commit: the commit containing this entry. Requirements: NOTE-01/02/03/05/06/07, PAT-06, TRUST-01/02/03; decision [D-115](decisions/D-115.md).

- **Implemented:** explicit LIVE / REVIEW / SIGNED presentation; read-only changing narrative/MSE during capture; editable frozen draft after stop/error/demo completion; persistent typed Correction / Observation / Clinical Thought guidance; lightweight MSE selections and custom observations; prior-wording retention and withhold-until-clarified; separate missing/partial/clarification/covered note-section coverage with exact-evidence attestations. Safety needs documented evidence and explicit SI/HI/self-harm assessment attestation. Thoughts stay separate from prose/diagnosis truth. Live capture preserves raw speech and rejects late callbacks; replay deduplicates rather than clears evidence. Optional synthesis preserves guided sections. A fresh encounter no longer starts with scripted candidate actions before evidence exists.
- **Authority and layer:** bounded encounter input/review state, provenance, output grounding and validation. Separate append-only guidance/coverage rows save atomically through the existing authenticated draft gateway and revision checks. Server actor owns authorship; history mutation, wrong-patient and signed writes are rejected. Signed snapshot shape/hash and signing policy remain unchanged. A **deterministic bridge step**, not production semantic psychiatric scribing or stronger autonomous reasoning. No paid provider, dependency, clinical store or action gateway was added.
- **UX / retained paths:** paper occupies the main column; Copilot and existing Clinical / Note Tools / Scribe share the right rail. Core coverage adds medication response/tolerability when the authorized snapshot has active medications. Existing Overview-compatible snapshot, prior-note inspection, lab monitoring, medication/order composers, chart measures/vitals and action proposals remain with their current owners. Completion/readiness moves below the document, retains disclosure/recheck/coding and source-backed counts, and adds a review/sign path. Capture stop remains available in the status line when the rail is scrolled or hidden.
- **Required validation:** final `npm run check` passed: 574 unit/integration tests, typecheck, zero lint errors (1292 staged warnings). Final `npm run build` passed. Final `git diff --check` and documentation relative-link scan passed. Validation ran in the shared working tree with existing unrelated chart/header/test changes preserved and excluded from this commit. No PHI, credentials or paid services were introduced.
- **Browser evidence:** initial focused LIVE test passed; broader affected run returned 15 passed / 5 failed (four sign-in/workspace-setup timeouts and one signing-modal wait). Final serial rerun passed **10/10**: all six new LIVE/layout/capture-error tests plus both failed context paths, tab reopen and signing. These runs give successful executions for 25 distinct affected tests across context, hydration, recovery and LIVE behavior. A subsequent layout rerun passed 9/10 and exposed a test-clock setup race (pausing at a timestamp already elapsed); the clock now pauses at a future instant before capture starts. Final new-suite rerun passed **6/6**, including the narrow-column stacking assertions; the four context/recovery/signing tests also passed in the final layout run. Assertions and timeouts remain intact. Full repository browser suite was not run. Inspected [LIVE](gemini-context/screenshots/encounter-live/enc-live-1440.png), [REVIEW](gemini-context/screenshots/encounter-live/enc-review-1440.png), [1440×900](gemini-context/screenshots/encounter-live/enc-live-layout-1440-1.png), [1280×800](gemini-context/screenshots/encounter-live/enc-live-layout-1280-1.png), [1024×800](gemini-context/screenshots/encounter-live/enc-live-layout-1024-1.png) and [200% CSS enlargement](gemini-context/screenshots/encounter-live/enc-live-layout-1440-2.png). The test database contains synthetic edits from earlier recovery scenarios; screenshots show that actual state, not fabricated note completeness.
- **Deferred:** live output currently quotes evidence rather than generating a polished psychiatric formulation. Corrections use an explicit section and clinician wording; semantic instruction interpretation, richer observation detail, diagnosis/visit/monitoring-adaptive domains, sensitive-interpretation suggestions and production ambient capture remain ENC-LIVE-2 in ROADMAP. Independent panes use existing revision conflicts rather than a capture lease. Monitoring/snapshot synchronization remains D-114's limit. Remote CI status is not inferred from local checks.

### ENC-CTX-1 — Encounter Clinical Cockpit foundation

2026-10-02 · owner-directed override · starting SHA `23d2ca369c46c02f38dd174bf20b3a56218c00d8` (fetched `main`) · resulting commit: the commit containing this entry. Requirements: NOTE-01/02/03/06; decision [D-114](decisions/D-114.md).

- **Implemented:** Overview and Encounter share the permission-aware snapshot read lifecycle with patient identity rejection, late-response cancellation, failure/retry and event/focus invalidation. Successful clinical-record mutations announce a patient update. Encounter's existing left rail starts in Clinical; Note Tools preserves Suggestions/Context and Scribe preserves recording. Seven compact disclosures provide changes, prior assessment/plan, active medications, measures, vitals, results/monitoring and active problems. The note's read-only lists, smart-chip context and copied medication/diagnosis sections also use the snapshot. Prior inspection opens existing signed history; prescribing and due lab monitoring open the existing patient-bound composers. Readiness remains a projection. No AI, new clinical persistence or dependency was added.
- **Layer:** clinical read-state integrity, deterministic longitudinal comparison and source-grounded presentation. Architecture-faithful foundation, not the completed cockpit or a new planning engine. Medication update rows state current status rather than inventing old doses. The active encounter is excluded from its own prior-visit baseline; same-day events are excluded because the summary provides a calendar cutoff.
- **Required gates:** final `npm run check` passed (568 unit tests, typecheck, zero lint errors; 1291 staged warnings remain). Final `npm run build` passed. Documentation file links and `git diff --check` passed. Only synthetic data was exercised. Existing unrelated working-tree UI/test/screenshot changes were preserved and excluded from this slice's commit; validation ran in that shared working tree.
- **Browser evidence:** 35 distinct affected tests had successful executions across the context, hydration, recovery, readiness, Overview grounding, voice and note-tools flows. Final context run: 9/9 passed; signing, voice and existing note-tools interaction passed in the focused rerun. Earlier failures included new test selectors/dismissal, an incomplete crowded assessment fixture, hydration fixture/timing assumptions, and page/transport timeouts. Test fixtures/waits were corrected without weakening assertions; timed-out paths were rerun successfully. The full repository browser suite was not run. Inspected [default Clinical](gemini-context/screenshots/encounter-context/enc-ctx-default.png), [1440×900](gemini-context/screenshots/encounter-context/enc-ctx-1440-1x.png), [1280×800](gemini-context/screenshots/encounter-context/enc-ctx-1280-1x.png), [1024×800](gemini-context/screenshots/encounter-context/enc-ctx-1024-1x.png), [200% CSS enlargement](gemini-context/screenshots/encounter-context/enc-ctx-1440-2x.png) and [crowded disclosure](gemini-context/screenshots/encounter-context/enc-ctx-crowded.png). Empty, denied and foreign-patient states are covered by behavior tests. Enlarged layout uses the existing responsive stacking.
- **Limits:** exact medication version changes, same-day encounter-time comparison, controlled prior-plan insertion and direct vitals/measure/result-review actions remain in ROADMAP. Snapshot and monitoring are separate authorized reads; cross-browser changes need focus/manual refresh. Composer opening is not an order or delivery claim. Remote CI is not certified by local gates; the available commit-status reader returned no statuses for the baseline.

### PAT-OV-6 — Fit more Overview content with readable density

2026-10-02 · owner-directed presentation slice · starting SHA `80fa1db` (fetched remote `main`: `e3849f0`) · resulting commit: the local commit containing this entry. Requirements: VIS-04/05/06, PAT-09, LAYOUT-01/05. Decision refinement: [D-113](decisions/D-113.md).

- **Implemented:** default card padding reduced from 18×20px to 14×16px; heading size from 18px to 17px; tighter header, card, row and history/result spacing. Existing saved Compact setting uses 10×14px padding, 16px headings and 8px gaps. Clinical/body text, identity, content, card order/visibility, source details and action paths are preserved. Card headers wrap on narrow panes. No new preference, router, store or framework.
- **Verified:** `npm run check` passed (559 unit tests, lint/typecheck; zero lint errors, 1292 existing warnings); `npm run build` passed; `git diff --check` passed. Focused browser gate: 12/12 in `overview-content.spec.ts` and `patient-overview.spec.ts`. Density check verifies smaller medication-card height with identical content and medication text size, persistence after reload and return to Comfortable. Existing checks cover card recovery, content ordering and source error/empty/wrong-patient behavior. Inspected 1440×900, 1280×800, 1024×800 and 200% CSS enlargement. [Default](gemini-context/screenshots/overview-density/overview-density-comfortable.png), [Compact](gemini-context/screenshots/overview-density/overview-density-compact.png), [1280px](gemini-context/screenshots/overview-density/overview-content-1280-1x.png), [1024px](gemini-context/screenshots/overview-density/overview-content-1024-1x.png), [200% enlargement](gemini-context/screenshots/overview-density/overview-content-1440-2x.png).
- **Layer/limits:** presentation density and validation improved; no clinical reasoning, risk authority or backend behavior changed. CSS utility/header markup and shell density remain coupling points. Validation includes the preserved pending owner header/sidebar edits, which are excluded from this commit. Full browser suite and P12 clinic-day certification were not run. Existing risk/safety-plan and panel-fulfillment source gaps remain in ROADMAP; its next eligible slice is unchanged.

### PAT-OV-5 — Correct Overview content and clinical ordering

2026-10-01 · owner-directed slice · starting SHA `28eb8c6` (fetched remote `main`: `e3849f0`) · resulting commit: the local commit containing this entry. Requirements: VIS-02/05/06, PAT-05/06/08/09, LAYOUT-02/05. Decision: [D-113](decisions/D-113.md).

- **Implemented:** current diagnoses and medications precede visit continuity. Next appointment moved beside the last signed plan. Measurements, results/orders, and structured psychiatric history have separate cards before recent activity; care coordination stays last. The legacy default sequence upgrades, while custom/pinned relative ordering remains intact. New cards reuse ordering, pin, width, collapse, hide, recovery and Preferences controls; Minimal hides them with recovery and Standard restores them.
- **Grounding:** psychiatric history/trials retain outcome, reason stopped, status, event/record dates and provenance; entered-in-error history is excluded. Dated C-SSRS results are distinguished from unavailable safety-plan/current-risk contracts. Observations retain recorded result/review metadata. Patient-scoped orders load independently with error/retry; mismatched history/measurement/order identity is rejected, and cancelled reads cannot replace a different patient's content. Orders without linked final observations do not establish panel completion or delivery.
- **Attention:** compact clinical issues and unsigned-note tasks are separate and remain visible independently of cards. Critical details stay expanded. Recorded abnormal/critical latest results without recorded review join the same source-backed attention projection. Latest-result grouping prefers codes and bridges missing codes only when exact name/units identify one coded test; conflicting/ambiguous codes are retained.
- **Validation:** `npm run check` passed (559 unit tests, lint/typecheck; 0 lint errors, existing warnings remain), `npm run build` passed, and `git diff --check` passed. Final focused browser gate: 20/20, after preserving the prior synthetic browser database and running against a fresh one. Includes ordering, source-empty/error/retry/wrong-patient cases, dated outcomes, result review/critical attention, saved card recovery, timeline grounding, and existing chart controls. Inspected 1440×900, 1280×800, 1024×800, CSS 200% enlargement, history and results views; [Overview](gemini-context/screenshots/overview-content/overview-content-1440-1x.png), [history](gemini-context/screenshots/overview-content/overview-content-history.png), [results](gemini-context/screenshots/overview-content/overview-content-results.png).
- **Validation findings:** intermediate runs exposed a reset helper that checked Today without checking requested patient tabs, a draft assumption dependent on previous test data, and an in-flight mock `route.fetch` disposed during navigation. The helper now checks its promised tabs; the content test explicitly supplies its synthetic unsigned-draft precondition; mock snapshots are prepared before interception. Assertions remain. A separate workspace-restoration timeout occurred before a test installed its target mock on the accumulated database; the final fresh-database gate passed. This does not claim to repair all shared-suite/startup intermittency. The full repository browser suite was not run.
- **Layer/limits:** source-grounded presentation and validation improved; no new clinical record schema, AI reasoning or clinician risk formulation was implemented. Snapshot/order API contracts, optional preference flags and current header markup remain coupling points. Existing uncommitted header/sidebar edits are preserved; validation includes that working tree. Safety-plan/current-risk authority and lab-panel fulfillment remain in ROADMAP. Next default eligible slice remains the roadmap's financial/portability/production work; the next Overview source gap is a reviewed safety-plan/current-risk contract.

### PAT-OV-4 — Calm patient identity and main chart typography

2026-10-01 · owner-directed presentation slice · starting SHA `0d32247` · resulting commit: the local commit containing this entry. Requirements: VIS-01/05/06, LAYOUT-01/05.

- **Behavior:** readable patient-name and demographic hierarchy, unboxed allergy text with its explicit label and red safety cue retained, complete wrapping problem names, plain-text Overview annotations and diagnosis rows, softer card borders without shadows, and consistent scales/flowsheet link controls with visible keyboard focus. Left section navigation and clinical source/action ownership are unchanged. Each patient pane retains its own identity.
- **Layer:** presentation only; implements existing vision. No clinical-state, AI, continuity or confidence mechanism changed. Scoped CSS depends on the current header/facts-bar markup and shared typography tokens; existing uncommitted shell/header work remains separate from this commit.
- **Browser evidence:** 15/15 focused grounding, patient-overview and chart-polish tests passed. Added a complete-name clipping check at 1440×900, 1280×800, 1024×800 and CSS 200% enlargement, plus scales-dialog access. Inspected all four screenshots in [chart-polish](gemini-context/screenshots/chart-polish/chart-polish-1440-1x.png). An initial run passed 13/14: the saved-layout test interacted with a menu before asynchronous workspace restoration finished after reload. It now waits on the existing authenticated/restored-shell helper; assertions are retained. The subsequent run passed all 15.
- **Validation:** `npm run check` passed (556 unit tests, lint and typecheck; existing lint warnings remain). `npm run build` and `git diff --check` passed. Synthetic fixtures only; no clinical data/schema changes.
- **Limits:** this is visual cleanup, not a production-readiness or clinical-authority claim. The unavailable safety-plan source contract remains in ROADMAP. Next eligible work follows the existing roadmap; no new product expansion is introduced.

### PAT-OV-3 — Remove duplicate timeline projections

2026-10-01 · owner follow-up · starting SHA `1036668` · resulting commit: the local commit containing this entry. Requirements: VIS-06, TRUST-01/03.

- **Defect and correction:** Overview rendered the latest source records and then appended a continuity-brief rendering of those same records. String equality failed to recognize different descriptions of one event, and lexical category guessing could misclassify it. Removed the second projection; the timeline retains its typed source-record categories. Kept weight in the retained vital row so removing the duplicate loses no unique measurement. Empty visit descriptions now say “No visit summary recorded”; latest symptom scores expose their measurement date directly.
- **Verification:** eight `overview-grounding.spec.ts` browser tests passed; the final timeline/evidence rerun passed. It verifies one vital row and one medication row under their filters and together under All, preserved weight, and the visit filter. The actual already-open development app showed David Kim's timeline changing from seven to five rows with the repeated vital and medication summaries removed. [Visual evidence](gemini-context/screenshots/overview-review/overview-timeline-deduplicated.png). `npm run check` passed (556 tests, no lint errors); production build passed; `git diff --check` passed.
- **Limits:** this fixes output grounding/presentation and validation, not clinical reasoning or a complete longitudinal timeline. Overview remains a bounded latest-event summary, with History owning broader chronology. Safety-plan status remains the separately recorded follow-up in ROADMAP. Pre-existing owner chart/header changes were preserved and excluded from this commit; validation used the shared working tree. No remote publication is claimed.

### PAT-OV-2 — Review and repair the existing Overview

2026-10-01 · owner-directed slice · starting SHA `e3849f0` · resulting commit: the local commit containing this entry. Requirements: VIS-06, LAYOUT-02/05, TRUST-01/02/03.

- **Verified behavior:** clinical lists no longer fall back to patient-summary diagnoses/medications after a loaded-empty read. Care team, preferred pharmacy and emergency contacts come from the permission-aware administrative record, with separate loading/error/retry behavior and rejection of mismatched patient identity. Removed literal pharmacy, invented provider, e-prescribing readiness, safety-plan and low-risk claims. Empty attention results describe the loaded evidence rather than asserting overall safety. Medication monitoring selects the most urgent applicable requirement; unavailable policies and unmatched rules never become green current badges.
- **Presentation and controls:** saved card order, pinning and width now govern the rendered grid. Hiding/collapsing the visit summary preserves a visible attention/recovery path. Wide summaries place signed continuity beside measures; narrow panes stack. Flattened nested sections, preserved dated score history, corrected score comparisons and visit-date labels, exposed a signed-history review path, and kept vitals visible without assessment trajectories. Existing domain actions and patient-information/document/schedule return paths remain reachable.
- **Validation:** `npm run check` passed (556 tests, zero lint errors; existing warnings remain); `npm run build` passed. `overview-grounding.spec.ts` plus `patient-overview.spec.ts`: 13 passed; final viewport-only rerun: 1 passed. `git diff --check` passed. Browser checks cover empty clinical lists, administrative failure/retry, wrong-patient response rejection, unavailable monitoring policy, competing monitoring requirements, snapshot access failure/retry, preference persistence and hidden-summary recovery. The initial check failed because the isolated dev server rewrote `next-env.d.ts`; restored the ordinary generated reference and reran successfully.
- **Visual evidence:** [1440×900](gemini-context/screenshots/overview-review/overview-review-1440.png), [1280×800](gemini-context/screenshots/overview-review/overview-review-1280.png), [1024px](gemini-context/screenshots/overview-review/overview-review-1024.png), [200% CSS enlargement](gemini-context/screenshots/overview-review/overview-review-200-percent.png). Enlarged-scale review uses the existing collapsible chart navigation to recover canvas space.
- **Scope and limits:** improves presentation/output grounding and the validation layer, using existing authoritative owners; this is a bounded correction, not a clinical reasoning or monitoring-engine rewrite. Safety-plan status has no dedicated Overview read contract and remains explicitly unavailable with a document-review path. Live prescribing/transport remains outside this slice. Validation used the shared working tree, including pre-existing owner chart/header changes; those changes were preserved and are excluded from this commit. No remote publication or full clinic-day certification is claimed.


*(New entries go here, newest first.)*

### TEAM-SCOPE-1 — Keep team collaboration inside the practice; role-correct message reads

2026-09-29 · baseline `5185fba` · commit `f910751` · owner request · security follow-up from MSG-SCOPE-1; requirements D-033 (patient access is organization membership), D-051 (role-scoped boundaries), D-112 (intake contact messaging).

- **Defects & Security Risks:**
  - `GET /api/team`, `POST /api/team/messages`, `POST /api/team/agreements`, and `GET /api/team/presence` leaked cross-practice: staff members could view, message, and assign handoffs to staff in unrelated practices.
  - Linking a patient to a team message or task only checked individual assignment table rows rather than the full patient-access policy, and dropped the chart binding on the POST route so linking always failed validation.
  - Front desk staff (`send_message` capability without `read_clinical`) could initiate messages to intake contacts but were denied reading replies.
  - UI allowed clinical assistants to click compose/send buttons that subsequently failed on the server.
- **Fixes:**
  - **Practice isolation:** Team directory, direct messages, task agreements, handoffs, and presence are scoped strictly to `actor.organization_id`. Any colleague from another practice returns 404 (reads as not found, preventing cross-practice user enumeration).
  - **Patient access checking:** Patient-linked team messages and tasks verify `accessiblePatientIds(actor)` for both participants and forward the patient binding (`x-ehr-patient-id`).
  - **Role-correct message reads:** Front desk (`staff`) may read intake-contact conversations without requiring clinical chart read permissions (D-112). Chart-bound conversations remain strictly restricted to clinical credentials (`read_clinical`) per D-051.
  - **Role-tailored UI controls:** Front desk users on off-chart workspaces (e.g. Intake) see only intake contacts in the recipient picker with an explanatory disclaimer. Clinical assistants see Compose and Send controls disabled with clear assistive tooltips explaining the clinical scope restriction.
- **Checks run:**
  - `tests/team-and-staff-messaging-scope.test.ts` (145 lines) verifies: cross-practice member refusal (404), colleague directory isolation, patient link validation for both colleagues, outsider link refusal (403), presence filtering, front-desk intake contact read authorization (200), and chart read refusal (403). Fails on previous code.
  - `npm run check`: 545/545 unit tests passed, 0 lint errors.
  - `npm run build`: Production build completed successfully in 3.3s (62/62 static and dynamic routes compiled).
  - Browser tests: 15 Playwright specs passed across `communication-companion.spec.ts`, `communication-lifecycle.spec.ts`, and `team-retirement.spec.ts`.
  - Browser visual verification: Confirmed Casey's disabled Compose/Send buttons ([v16_clinical_assistant_messages_disabled.png](gemini-context/screenshots/deep-review/verification/v16_clinical_assistant_messages_disabled.png)) and Morgan's intake-only recipient picker with explanatory note ([v17_front_desk_messages_intake_only.png](gemini-context/screenshots/deep-review/verification/v17_front_desk_messages_intake_only.png)).
- **Named follow-ups & policy questions carried to ROADMAP:**
  - Front desk reading patient-chart conversations: today front desk may initiate but cannot read replies; decision pending on whether to permit non-clinical thread reads or route replies to an administrative queue.
  - Clinical assistant patient messaging: today clinical assistants may read but cannot compose or send patient messages; decision pending on whether clinical assistants should be granted delegated messaging authority.

### MSG-SCOPE-1 — Scope the practice-wide message list to the caller's patients

2026-09-29 · baseline `9f17a7d` · owner request · security follow-up from MSG-INTAKE-1; D-033 (patient access is organization membership), D-051.

- **Defect:** `GET /api/messages` with no `patientId` returned every thread in the database to any signed-in user, across practices. The repository also treated an empty id list as "no filter", so a user with no access at all would have received everything.
- **Fix:**
  - The route passes `accessiblePatientIds(actor)`, the same scope the roster and practice queues use (organization membership, plus assignments for assigned-scope members).
  - `MessageRepository.getAllThreads` now requires the ids and returns nothing for an empty list.
  - Per-patient reads (`?patientId=`) and `PATCH` were already access-checked and are unchanged.
- **Checks run:**
  - New `tests/messages-list-scope.test.ts` goes through the real session and route with three callers: a demo-practice clinician, a second-practice clinician, and a signed-in user with no membership. It fails on the previous code ("another practice's thread never appears") and passes with the fix.
  - `tests/operational-queues-resolution.test.ts` now passes an explicit scope and asserts that an empty scope returns nothing.
  - `npm run check`: 544/544, 0 lint errors.
  - `npm run build`: passed.
  - Browser: 42 tests across 6 inbox and communication specs; 41 passed. `workspace-layering` "responsive layout at 1024px" timed out on a tab click under suite load, then passed 3/3 on rerun (known shared-database flakiness).
- **Named gaps:** none new. The global inbox still omits intake-contact threads (D-112, open follow-up).

### MSG-INTAKE-1 — Message an intake contact from the Intake canvas

2026-09-29 · baseline `6306d4b` · owner request ("I should be able to send messages here as well", on the Intake canvas) · D-112, D-077, D-076, D-096, D-107.

- **Server:**
  - Message rows may belong to an intake contact. Migration `2026-09-29-001` makes `patient_id` optional, adds `prospective_person_id`, and requires at least one.
  - `create_message_thread` and `send_message` accept a prospect id under the gateway's existing prospect access.
  - A reply must name its thread's own owner; previously a reply could be filed under another patient's thread.
  - Promotion re-points the prospect's rows to the chart, on the same rows.
  - A promoted or archived prospect cannot be messaged.
  - Practice-written messages are stored as `queued`, not `delivered`, because no transport exists.
- **Companion:**
  - Off a chart, Messages asks for an explicit recipient (intake contacts, then patients) and remembers it per canvas. A chart behind the canvas is never assumed.
  - For an intake contact, chart-only actions are hidden.
  - Delivery reads "Not connected — recorded in this thread only", and each message reads "Recorded · not delivered".
  - The compose and summary dialogs render at the document root; inside the companion they were hidden under the Intake canvas.
  - The compose form got its padded body, the "＋ + Compose" label is fixed, and avatar initials come from the sender, not a fixed "LC".
- **Checks run:**
  - `npm run check`: 543/543 unit tests, 0 lint errors. This includes the new `tests/intake-contact-messaging.test.ts`, covering access, cross-thread refusal, promotion carry-over, refusal after promotion and the migration on an old table. `tests/migrations.test.ts` was updated with the new ledger id.
  - `npm run build`: passed.
  - Browser: 70 tests across 12 specs (communication, companion, intake, layering, dismissal). 68 passed. The 2 failures are `companion-resize` Labs and Calculator overflow at narrowest width, which fail identically on the untouched baseline.
  - Manually verified in the running app at 1440×900. Steps: created an intake contact with New Intake; on the Intake canvas, opened Messages, chose the contact, composed and replied (stored under the prospect as `queued`); promoted the contact; the same thread then appeared under the new chart with chart actions, and the picker moved the person to Patients.
- **Named gaps / follow-ups carried to ROADMAP:** `GET /api/messages` without a patient is unscoped; the global inbox omits intake threads; the Intake detail pane covers the companion rail; a prospect's name click creates a chart without confirmation; New Intake fields lack accessible names; the Labs and Calculator companions overflow at narrowest width.

### REVIEW-FIX-1 — Honest closing flow, keyboard-reachable workspace, grounded omnibox shortcuts

2026-09-29 · baseline `1744a9b` · owner instruction ("fix all" after a screen-by-screen review) · requirements D-111, D-104, D-017, D-107; AGENTS drift rules on grounding and labels.

- **Closing flow (D-111):**
  - A note needs an assessment or a plan to be signed. This is enforced in `ClinicalService.signEncounter`, and the dialog explains it and disables Sign.
  - The sign preview, the copy/export text and the rule-based scribe fallback no longer invent content ("Plan as documented.", "Denies adverse effects."). An empty section reads "Not documented".
  - Follow-up interval dates were "NaN-NaN-NaN". They are now computed from the note's calendar date (practice-zone today as fallback, never UTC), and "Next booked visit" comes from the schedule store instead of a stale fixture date.
  - A booked visit's type chooses the opening note (an intake opens the intake note). The Calendar now records the visit link, and a follow-up to an intake books as a 30-min med check.
- **Accessibility:**
  - Workspace tabs have a real, keyboard-focusable label button with `aria-current`. Pointer events pass through to the draggable tab, so drag-to-split still works.
  - The Sign, Order Cart and Audit modals are now `role="dialog"` with `aria-modal`, a label, focus-in, a Tab trap and focus return (`app/lib/use-modal-dialog.ts`). Sign and Audit close on Escape. The cart does not, because it may hold a half-written prescription.
  - The tab alert is a labelled badge, not a coloured dot.
- **Schedule and chart:**
  - An in-visit row says Resume, and a visit open well past its booked length shows RUNNING LONG.
  - An untouched note says "No changes yet", not "Unsaved changes".
  - Fixture-only monitoring alerts are hidden everywhere through `displayablePatientAlert`: tab strip, chart, detached pane and AI context.
  - Medication monitoring status reads the patient's record, not fixture labs.
- **Omnibox:**
  - The browser-side lab and note cards are navigation shortcuts badged "Shortcut", not "Protocol Verified". They state no fixture lab or note facts.
  - The rule planner treats "show Jordan's lithium level" as a question. It now resolves Jordan and answers from the record.
  - The suggestion list steps aside when the plan card opens.
  - Planner model, intent and confidence are collapsed under "Planning details", and confidence is omitted when clarification is needed. The safety statements stay visible.
- **Demo data and polish:**
  - Sofia (established) is seeded as a 45-min Therapy + Meds follow-up, not an intake.
  - The handoff due date is formatted and flagged when overdue; due dates were previously red regardless.
  - Billing rows 90+ days after service prompt "check payer filing limit".
  - The duplicated inline late-badge styles moved to CSS tokens.
- **Checks run:**
  - `npm run check`: 541/541 unit tests, 0 lint errors, 0 type errors. This includes the new `tests/honest-closing-flow.test.ts` (8 tests), which covers the server refusing an empty sign.
  - `npm run build`: passed.
  - Browser: 76 tests across 25 specs were run in three batches. Every failure was either fixed or reproduced identically on the untouched baseline via `git stash`. Fixed: detach/drag (3, caused by the new tab button, now resolved), a home-assistant safety line (kept visible), and `synthetic-visit` (now documents a plan before signing and passes end to end). Failing identically on the baseline: `companion-ai` target label; `home-assistant` "naming no patient" (active patient carried in shared DB state); `workspace-open-launcher` launcher row click; `patient-overview` CB-4 launcher row click; `clinical-decomposition` D-093 (leftover prescription in the shared DB); `care-completion` ×3; `tool-navigation` CB-3.
  - Manually verified in the running app at 1440×900 with a freshly seeded DB: the full sign flow (dialog semantics, Tab trap, Escape, blocker, real dates, next visit), keyboard tab switching, Resume/RUNNING LONG, intake note type, the omnibox possessive question, the billing prompt and the handoff date.
- **Named gaps / follow-ups carried to ROADMAP:** AGENTS.md HR drift rule; sign-in persona labels; hover-only roster actions on touch; stale local encounter recovery after a DB reset.

### P7-F — Tokenized Prospective Patient Self-Service Onboarding Portal

2026-09-29 · baseline `248e18f` · requirements INTAKE-01…08, MEAS-01…06, D-075, D-076, D-077, D-107, D-109, D-110.

- **Objective:** Deliver an external, tokenized self-service intake onboarding portal allowing prospective patients to securely confirm demographic facts, provide emergency contacts, execute verifiable digital consent signatures, and self-administer psychiatric rating scales (PHQ-9 and GAD-7) with immediate crisis alerts prior to their initial consultation, completely isolated from internal EHR chrome and clinician session auth.
- **Implemented Changes:**
  1. *Public Tokenized Route & Shell Isolation:* Established `/intake/self-service?token=<raw_token>`. Updated `AppChrome` to render `null` on self-service routes, completely suppressing internal top navigation, patient tabs, omnibox, and companion drawers. Updated `AuthSessionGate` to bypass staff session challenges, preventing redirect to provider login. Created mobile-first, distraction-free stylesheet `app/intake-self-service.css`.
  2. *Cryptographic Token Hashing & Expiration Lifecycle:* Generated tokens using Node `crypto.randomBytes(32)` (256-bit entropy). Stored only `SHA-256` token hashes in `intake_portal_invitations`. Supported configurable expiration lifetimes (default 7 days) and instant revocation. Enforced structured error rejection on expired, revoked, or non-existent tokens.
  3. *Date-of-Birth (DOB) Identity Gating:* Integrated an optional DOB challenge (`requires_dob_gate = 1`) on public invitations. Token metadata returns zero PHI until the recipient correctly matches the prospective person's date of birth. Enforced brute-force protection (5 failed attempts locks invitation).
  4. *Patient Onboarding Wizard:* Built 5-step self-service wizard (`IntakeSelfServicePortal.tsx`):
     - Step 1: DOB challenge (when required).
     - Step 2: Contact verification & emergency contact capture (name, relationship, phone).
     - Step 3: Verifiable digital consent signing (General Consent for Treatment and Practice Policies) supporting smooth HTML5 vector canvas drawing and typed legal attestation.
     - Step 4: Standardized psychiatric screening for PHQ-9 (depression) and GAD-7 (anxiety). Endorsement of suicidal ideation/self-harm (PHQ-9 Item 9 > 0) or elevated distress triggers a prominent 988 Suicide & Crisis Lifeline resource banner.
     - Step 5: Submission receipt displaying unique confirmation code (e.g. `CB-IN-XXXXXX`), timestamp, and next steps.
  5. *Intake Queue Integration & Pre-Chart Continuity:* Submissions atomically update prospective person contact records, persist digital consent signatures with verification receipts, record standardized rating scale assessments, and transition invitation status to `"completed"`. The intake queue checklist immediately reflects progress across `contact`, `consents`, and `assessments`. On subsequent promotion (`ProspectivePersonService.promote`), all records atomically carry forward into the active patient chart.
  6. *Staff Invitation Management in Intake Workspace:* Added portal invitation card to the `account` step in `IntakeDetailPanel.tsx` enabling staff to generate invitation links, configure DOB gating, preview onboarding, monitor status, and revoke links.
  7. *D-107 Zero-Cost Boundary:* All cryptographic token generation, hashing, canvas signing, and screening score evaluation run in native HTML5/Canvas and local SQLite persistence with zero paid vendor or SaaS dependencies.
- **Checks run:**
  - `tests/intake-self-service.test.ts` (2 / 2 passed): pure checklist projection across invitation lifecycle and end-to-end integration covering token generation, hashing, DOB gating, contact submission, consent signing, rating scale persistence, and error handling.
  - `tests/browser/intake-workspace.spec.ts` (5 / 5 passed in 21.0s): verified intake queue booking, dialog interaction, real queue rendering, prospective record creation, and pre-chart document/card continuity through promotion.
  - `npm run check`: 533 / 533 unit/integration tests passed, 0 lint errors, 0 type errors.
  - `npm run build`: 62 / 62 pages compiled/prerendered successfully without errors.
- **Named gaps / follow-ups carried to ROADMAP:**
  - None for P7-F. Core prospective intake loop and self-service onboarding are complete.


### P7 — Forms, consents, assessments, and patient-facing intake toward the D-107 funding prototype

2026-09-27 · baseline `a7af28b` · completed `cb242e6` · requirements INTAKE-01…08, MEAS-01…06, D-075, D-076, D-077, D-107, D-109.

- **Objective:** Deliver interactive rating scales, verifiable digital consent signatures, custom form template lifecycles, and structured response inspection with clinician review to complete the Intake loop for the D-107 synthetic funding prototype.
- **Implemented Changes:**
  1. *Psychiatric Rating Scale Runner & Safety Alerts:* Added interactive questionnaire runner in Intake for standardized instruments (PHQ-9, GAD-7, ASRS-v1.1, C-SSRS) with live score calculation, clinical severity evaluation, and immediate safety alert banners upon endorsement of suicide or self-harm (e.g. PHQ-9 Item 9 positive, C-SSRS suicidal ideation).
  2. *Pre-Chart Assessment Continuity:* Extended `AssessmentRecord` and `clinical_assessments` persistence to support both `patientId` and pre-chart `prospectivePersonId`. Pre-chart assessment stamps safely pass `patientId || null` for version/provenance events. In `ProspectivePersonService.promote`, added `ClinicalRecordRepository.linkAssessmentsToPatient` to atomically re-key pre-chart assessments to the new patient chart upon promotion.
  3. *Verifiable Digital Consent Signatures:* Added agreement terms disclosure (`bodyText`) to consent templates. Implemented three verified signature capture methods: `drawn_canvas` (HTML5 vector pointer drawing pad capturing smooth pen/touch signatures as base64 data URLs), `typed_attestation` (legal name typing with affirmative attestation), and `staff_attested`. Recorded signatures render verified digital signature receipts with timestamp, signer identity, IP/user-agent, and visual signature proof.
  4. *Structured Form Inspection & Clinician Sign-Off:* Added structured response inspector for submitted intake questionnaires across personal, medical, and psychiatric sections. Clinicians can record clinical review sign-off notes (`reviewNotes`), transition submissions to `"reviewed"`, and emit audited events (`intake_form_submission_reviewed`).
  5. *Form Template Management API:* Implemented `/api/intake/form-templates` endpoint supporting creation, versioning, and listing of editable practice form templates.
  6. *Readiness Integration:* Updated `computeIntakeChecklist` to include `"assessments"` step (evaluating to `"needed"` when unrecorded, `"recorded"` when completed without critical findings, and `"review"` when safety flags require clinical assessment).
  7. *D-107 Zero-Cost Boundary:* All signature pads, questionnaire scoring, and review workflows use native HTML5 canvas and SQLite storage with zero paid vendor or SaaS dependencies.
- **Checks run:**
  - `tests/intake-forms-consents-assessments.test.ts` (3 / 3 passed): pure rating scale scoring and safety flag detection, readiness checklist state transitions, and end-to-end service integration covering pre-chart prospective assessment promotion, drawn & typed signatures, form template versioning, and clinician sign-off notes.
  - `npm run check`: 513 / 513 unit/integration tests passed, 0 lint errors, 0 type errors.
  - `npm run build`: 58 / 58 pages compiled/prerendered successfully without errors.
- **Named gaps / follow-ups carried to ROADMAP:**
  - Patient self-service portal (P7-F) remains deferred until independent patient authentication and access model is designed (separate from staff sessions).
  - External OCR/document extraction remains deferred until vendor selection per D-107.

### P6 — Operational queue resolution and message triage honesty

2026-09-27 · baseline `6601de3` · completed `c408f60` · requirements RIGHT-04, MSG-01…05, DASH-11…13, D-107.

- **Objective:** Audit and resolve operational queues (Inbox/Messages, Tasks, Results) against the canonical resolution loop (`queue item -> source object -> patient context -> related evidence -> authorized action -> authoritative resolution -> return path`), replacing dead-ends with real gateway actions and eliminating deceptive AI representations.
- **Implemented Changes:**
  1. *Authoritative Message Thread Creation:* Replaced the dead-end toast "＋ Compose" button on `PatientMessages.tsx` with an accessible, modal-backed thread composer. Wired to new gateway action `create_message_thread`, enforcing provider permissions (`send_message`), patient-binding integrity, and emitting audit log event `message_thread_created`.
  2. *Thread Selection & Focused Navigation:* Added `WORKSPACE_SELECT_MESSAGE_THREAD_EVENT` (`ehr-select-message-thread`) with runtime payload guards. Extended `WorkspaceNavigationController.openPatient` and `navigateToPatientLocation` to accept `threadId`. Clicking a thread row in `CommunicationCompanionPanel` or `GlobalWorkspaceShell` now deep-links directly into the patient chart's Messages section and selects the target thread even if threads are still loading in flight.
  3. *Practice-wide Inbox Loading:* Replaced client-side per-patient sequential fetching (`roster.map(p => api.messages.list(p.id))`) with atomic `MessageRepository.getAllThreads()` and `api.messages.listAll()`, returning unified threads joined with patient name and MRN with fallback.
  4. *Truthful Ambient AI Triage Disclosure:* Labelled the Ambient AI Clinical Triage card on `PatientMessages.tsx` honestly as "Sample Scenario (D-107 Prototype)" with disclaimer stating the triage and suggested replies reflect pre-configured sample clinical data rather than active model inference.
  5. *Lab Result Follow-up Action:* Added a `+ Task` action button to each result row in `GlobalLabsWorkspace.tsx` alongside `Acknowledge`. Clinicians can instantly create follow-up clinical tasks (prefilling test name and value/interpretation) with configurable due dates ("Today", "Tomorrow", "In 1 week", "In 2 weeks", "In 1 month") via `api.tasks.create`, dispatching `ehr-tasks-updated` across all queues.
  6. *Quick Due-Date Assignment in Task Queue:* Added quick due-date pills ("Today", "Tomorrow", "1 week", "No due date") to `PracticeTaskQueue.tsx`'s compose row, passing due dates to `onAddTask` and `useCompanionWorkingData.handleAddTask`.
- **Checks run:**
  - `tests/operational-queues-resolution.test.ts` (2 / 2 passed) verifying thread creation, gateway authority, audit logging, practice-wide retrieval, HTTP endpoints, and navigation event guards.
  - `npm run check`: 510 / 510 unit/integration tests passed, 0 lint errors, 0 type errors.
  - `npm run build`: 58 / 58 pages compiled/prerendered successfully without errors.
- **Named gaps / follow-ups carried to ROADMAP:**
  - Prescribing operations integration enablement surface remains pending future authorized slice.
  - P7 remains next on the roadmap for forms, consents, assessments, and patient-facing intake.

### CB-7 — certify the complete manual encounter loop (P5)

2026-09-27 · baseline `aea633b` · requirements TAB-03, WIN-09, PAT-01, PAT-06, RIGHT-04, SAVE-01…08; P5-B, P5-C, P5-D.

- **Objective:** Certify the end-to-end psychiatric encounter documentation and signing loop without AI, and prove the complete browser recovery matrix.
- **Verification of Recovery Matrix:** Built comprehensive browser test suite in `tests/browser/encounter-recovery.spec.ts` (8 / 8 passed) covering all 8 specified recovery conditions:
  1. *Patient switch:* Typing in encounter draft preserves drafts per-patient without cross-patient contamination or wrong-patient writes.
  2. *Detach/redock:* Active encounter draft survives window detachment to floating state, permits editing while detached, and docks back with continuous autosave.
  3. *Refresh:* Browser reload restores the saved encounter draft from persistence without data loss.
  4. *Close/reopen:* Closing a patient tab and reopening via search restores the draft completely.
  5. *Failed save/retry:* Simulated server failure transitions visible state to `failed` (`[data-save-status="failed"]`) showing "Save failed" and the "Retry" button (never reporting unconfirmed saves as durable); clicking Retry flushes draft and transitions to `saved`.
  6. *Late response:* An older in-flight response does not mark a newer dirty revision as saved; the subsequent revision flushes and certifies `saved` accurately.
  7. *Revision conflict (409):* Server-side conflict response marks status `failed` without discarding the clinician's locally written draft.
  8. *Signing while save is pending:* Clicking Review & Sign immediately flushes unpersisted drafts to the server, signs the legal record, transitions toolbar to signed state, and removes the save indicator.
- **Verification of End-to-End Visit Lifecycle:** `tests/browser/synthetic-visit.spec.ts` (2 / 2 passed) and `tests/browser/encounter-hydration.spec.ts` (2 / 2 passed) verify:
  - Appointment booking on practice today $\rightarrow$ start visit $\rightarrow$ document narrative $\rightarrow$ autosave $\rightarrow$ documents reader & intake $\rightarrow$ review & sign closing ceremony $\rightarrow$ legal attestation $\rightarrow$ immutable signed record $\rightarrow$ reopen past notes $\rightarrow$ append amendment.
  - Appointment and patient identity maintained throughout; signed encounter snapshot remains immutable with trigger-protected integrity.
- **Checks run:**
  - `npm run check`: 508 / 508 passed, 0 lint errors, 0 type errors.
  - `npm run build`: 58 / 58 pages compiled/prerendered successfully.
  - Playwright browser suites: `tests/browser/encounter-recovery.spec.ts` (8 / 8 passed, 38.1s); `tests/browser/synthetic-visit.spec.ts` (2 / 2 passed, 14.2s); `tests/browser/encounter-hydration.spec.ts` (2 / 2 passed, 10.5s); combined run 12 / 12 passed (54.3s).
- **Named gaps / follow-ups carried to ROADMAP:**
  - Shared mutable test database causes known standing test isolation issues (noted in open defects).


### ROSTER-1 — dashboard roster status options stay on screen (owner-directed)

2026-09-27 · baseline `867293f` · requirements VIS-07, RIGHT-05 (companion docked without obscuring work).

- **Owner report:** hovering a patient on the dashboard roster pushed the status options (Tentative / Scheduled / Confirmed / In Office) and the Start button off the screen.
- **Cause:** hover revealed all four labels in the row's auto-width status column, widening it. The name column cannot shrink below 240px, so the row overran its card. At 1280px with a companion docked, the schedule card is about 530px wide, too narrow for the one-line row even without hover.
- **Change:** an invisible at-rest copy (`.roster-frontdesk-sizer`) holds the status column's width. The live options sit over it, anchored right, so hovering opens them leftward over the reason text without reflowing the row. A container query on `.schedule-main-card` switches to two lines below 800px: the name stays on the first line, and status and actions share a fixed second line. In the two-line layout the status stays compact (the current state's word plus glyphs, each button keeping its title), because four labels do not fit beside Start. The roster list is `display: contents`, so the query is on the card, whose `minmax(0, 1fr)` track cannot collapse under containment.
- **Checks:** new `tests/browser/roster-row-hover.spec.ts` hovers up to six rows at 1280, 1440 and 1600px with a companion docked. It checks that status options and actions stay inside the row, the row stays inside its card, and hover does not change row height. It failed at all three widths on `867293f` (options 214px and Start 360px past the row at 1280px) and passes 3/3 now. Screenshots at 1280 (docked, two-line) and 1600 (one line, labels revealed) were inspected. `session-expiry` (which clicks these buttons) passes 5/5. `npm run check` passes (501/501; lint 0 errors). `npm run build` passes. Failing identically on `867293f`: `synthetic-visit`, `capture-ui-tour`, `workspace-layering` "note region" and `workspace-module-tabs` ×2. Running `capture-ui-tour` rewrites the committed Gemini screenshots, which were restored rather than committed.

### INFO-1 — "Patient info" opens on the patient's details (owner-directed)

2026-09-27 · baseline `e401f18` · requirements PAT-01, progressive disclosure (PRODUCT_VISION).

- **Owner report:** "Patient info" on Jordan Reed's chart opened the first-call intake checklist, not the patient's information.
- **Change:** `PatientInformationDrawer` takes an `initialSection`, which defaults to Identity. Identity is now first in the tab row and Intake last. The intake screens still open on the checklist: Calendar's intake action and the Intake workspace's admin drawer pass `initialSection="intake"`.
- **Checks:** `npm run check` passes (501/501; lint 0 errors). `npm run build` passes. `patient-administration.spec.ts` now asserts the chart opens on Identity with no intake heading, and that the Intake tab still routes to Contact. `patient-administration`, `intake-workspace` and `patient-overview` pass, 20/20. A screenshot of Jordan Reed's chart → Patient info shows the Identity section.

### CB-6 — companion lifecycle gate: closed (includes CB-6h)

2026-09-27 · baseline `74a6273` · requirements RIGHT-01…05, PAT-04, SAVE-06, WIN-09, TRUST-02.

**CB-6h — refresh warning and expand parity (this commit).**

- **Owner decision (2026-09-27):** companion drafts are not written to browser storage. A refresh or close with an unsent draft raises the browser's "Leave site?" prompt instead. Recorded in [D-108](decisions/D-108.md).
- **Change:** new `app/lib/use-warn-before-leaving.ts`. `useCompanionWorkingData` warns while any patient's Tasks, Scratchpad or Messages draft is unsent. A draft leaves its store only on a successful save, so this covers saves in flight. The chart's own Messages section warns for its drafts too. Clinical AI and Messages gained the shared expand/redock control; they were the only non-Calendar tools without it.
- **Checks:** new `tests/browser/companion-leave-warning.spec.ts` (3): an unsent task on another patient's chart makes the browser ask, and staying keeps it; an unsent Scratchpad note makes it ask; an emptied composer or a saved task does not. The first two fail on `74a6273`. New case in `companion-resize.spec.ts` expands and redocks all nine expandable tools (AI, Calculators, Communication, HR, Labs, Messages, Prescribing, Scratchpad, Tasks). For each it checks that the rail stays reachable, the composer draft survives, and the chart in front is unchanged. `npm run check` passes (501/501; lint 0 errors). `npm run build` passes. Thirteen companion/layering browser specs: 65 passed. The two failures, `companion-ai` (retarget vs D-098) and `workspace-layering` "note region" (Review & Sign opens no modal in the shared DB), fail identically on `74a6273`.

**CB-6 gate, as verified across CB-6a…h.** Open/close, tool switch (CB-6d), expand/redock (CB-6h, and Communication in UI-4), patient change (CB-6c), Escape/focus return (CB-6f), resize (CB-6g), refresh (CB-6h, by warning) and failed persistence (CB-6e). Covered tools: schedule/calendar, AI, Scratchpad, Tasks, Calculators (assessments), Communication, Messages, Labs, Prescribing and HR. **Named gaps carried to ROADMAP:** no pop-out (detach is expand/redock only); Escape listeners outside the layer stack; server-side idempotency for companion creates; the Messages "Ambient AI" triage card.

The CB-6 section as it stood in ROADMAP when closed:

### CB-6 — Normalize companion presentation and lifecycle

Status: **In progress — AI viewport repair, CB-6c draft targeting, CB-6d Messages tool-switch continuity and CB-6e save failure/double-submit and CB-6f Escape layering and CB-6g resize verified; broader lifecycle gate pending**

**2026-09-26 CB-6c — companion drafts stay with their patient ([D-108](decisions/D-108.md)): verified complete.** Evidence is in [ROADMAP_COMPLETED](ROADMAP_COMPLETED.md). Tasks, Scratchpad and Messages drafts are now held per patient, so a chart switch can no longer save one patient's draft against another. **What CB-6 still needs**, checked in the code on 2026-09-26: companions have expand/redock but no pop-out, so "supported detach" is currently expand/redock only. The Messages reply draft and open thread now survive a tool switch (CB-6d, 2026-09-26). Failed and double-pressed saves are proven for Tasks, Scratchpad and Messages (CB-6e, 2026-09-26): one request per draft while it is in flight, a busy control, and the draft kept on failure. Escape answers one layer at a time and returns focus to the rail button for every companion tool (CB-6f, 2026-09-26). Every panel tool holds together at the narrowest and widest docked width, and the width carries across tools and a reload (CB-6g, 2026-09-27). The open item is draft continuity across a page refresh for Tasks, Scratchpad and Messages (drafts are in memory), which waits on an owner decision about keeping draft clinical text in the browser.

**2026-09-20 owner-requested screen-fit repair (baseline `dcee02d`):** The AI panel used an unstyled container class and relative 100%-height positioning, consuming a full-width workspace row. Restored the existing `.companion-panel` geometry and measured chrome offset, with a scrollable body and anchored context header/composer. Calendar retains its full height and independent time-grid scrolling; the rail, Close control and input remain reachable. This advances NAV-01/NAV-02, VIS-07 and RIGHT-05 without changing clinical state or the companion controller.

- **Browser evidence:** four viewport cases (1440×900, 1280×800, 1024×768, and 720×450 as the 200%-zoom equivalent) plus the existing AI planner/context-isolation test passed, **5/5**. Tests exercise actual wheel scrolling, unchanged calendar height, complete input/Close visibility, draft retention during scrolling, and closing the overlay. Reinstating the old component made the new 1440×900 regression fail: opening AI consumed 490.89px of calendar height. Screenshots were visually inspected under `test-results/screen-fit-evidence/` (ignored artifacts).
- **Validation:** production build, typecheck and lint passed (existing lint warnings remain); final Node suite **394/394**. This runtime blocked the `tsx` CLI's IPC socket, so the same suite ran with `node --import tsx --test tests/*.test.ts`. The browser CDN was unavailable; local verification used Chromium 153 and a locally supplied Material Symbols font through a temporary test harness, with no runtime dependencies or harness committed. CI retains the repository's normal browser configuration.
- **Observed baseline risks:** an initial unit run intermittently failed the existing weight-change assertion (vitals group by timestamp); its focused recheck and final full suite passed. A run overlapping browser verification also hit the generated `next-env.d.ts` hygiene check; restoring that generated file and running sequentially passed. Neither clinical logic nor assertions were changed for this presentation repair.
- **Still pending:** complete CB-6 lifecycle certification across other tools, expand/pop-out/redock, persistence failures and draft/context continuity. This repair does not certify all of CB-6.

**2026-09-25 CB-6b owner-directed companion review ([D-102](decisions/D-102.md), baseline `b6a3733`):** fixes the owner's review items 1, 2, 4, 5 and 6, plus item 3's hover-only labels (the owner declined persistent labels, grouping, and the Customize-rail menu).

- **Safety:** the PHQ-9 opened with nine hard-coded answers keyed 0–8 against questions 1–9, so it rendered as a complete 10/27 score for every patient and Save to Chart would record it. Scales now start blank, are keyed per patient and instrument, and show "N of M answered" with Insert and Save disabled until complete.
- **Layout:** above 1080px the chart shrinks to make room for the panel; at 1080px and below it floats. Checked at 1366×800 with Calculators open: Review & Sign, Visit readiness, and Orders / More / Open encounter all stay visible. Checked at 1000×760: the panel is an overlay.
- **Frame:** every companion surface (AI, parked AI, Scratchpad, Tasks, Calculators, Prescribing, Labs, HR, Calendar, Messages, Communication) render through `CompanionPanelFrame`. Communication's six channels and staff chips wrap instead of scrolling behind visible scrollbars. Labs shows the patient in one identity line (plus the picker) instead of four places. Prescribing's Refresh and empty-state text now use the shared styles. Calculators and Scratchpad can expand.
- **Scratchpad:** notes show their patient or "Practice note — no patient" and are filtered to the open chart.
- **Dashboard:** Outstanding Work is a compact one-row-per-item list with the action at the right. Side-by-side half-width windows end on the same line. Vital-sign readings in the lab queue read "Vital-sign reading to acknowledge".
- **Validation:** typecheck and lint pass (existing warnings remain). Production build passes. Node suite passes except `repository-hygiene`'s `next-env.d.ts` check, which fails only because a concurrently running browser-suite server had already rewritten that file in the working tree. Twenty affected browser spec files (111 tests) were run; after one fix (the scale switcher's `role="tab"` hid it from `getByRole("button")`), everything passes except the following. `companion-ai` (expects the AI panel to retarget on a tab switch, which contradicts D-098 parking) and `ui-system` "layout controls inside Preferences" (expects old copy) fail identically on untouched `b6a3733`. `visit-readiness` failed once inside a long run and passed alone on a fresh database, so it is order-dependent state, not this change.
- **Remaining gaps:** the lab queue still counts vital-sign readings in the Labs badge and filter, because the seed stores them as laboratory observations; the correct fix is to seed them as `vital-signs`. Existing dev databases keep untagged seed notes. CB-6 lifecycle certification (pop-out, persistence failure, refresh continuity) is still pending.

**2026-09-25 STORE-1 owner-directed storage hardening ([D-103](decisions/D-103.md), baseline `ac630d2`):** closes the gaps CB-6b left open.

- **Vitals vs labs:** the three seeded office blood pressures are vitals now (new seed plus migration `2026-09-25-001`, converted in place with provenance). `add_observation` refuses vital signs and unknown categories, and the API validates its payload strictly. The Labs section has *Record result* and *Record vitals*, and a vital sign typed into the lab form is redirected to the vitals form. The vitals form now closes on Escape and returns focus to whatever opened it.
- **Found and fixed:** the chart snapshot's 100-row cap shared rows with vitals (up to seven rows per entry), so Maya Chen's Labs section showed "No prior lab results" on the dev database. Snapshot `observations` now exclude vitals. Care-completion's result-review rule compared against `"lab"` while storage writes `"laboratory"`, so it never fired for real results.
- **Scratch notes:** moved from `tasks` to `scratch_notes` (migration `2026-09-25-002`) with an author and a practice. They were previously served to every user of every practice. Authors are taken from audit events, and the seed memos are tagged to Maya Chen. Notes show a real timestamp.
- **Validation:** typecheck and lint pass (existing warnings only). Production build passes. Node suite 477 of 478; the one failure is `repository-hygiene`'s `next-env.d.ts` check, caused by another session's browser-suite server rewriting that file. New `tests/observation-and-scratch-storage.test.ts` (6 tests) covers the category rules, the legacy upgrade of both migrations, fresh seeding, author privacy, snapshot separation under 20 vitals, and the care-completion spelling. Browser: 79 of 79 across ten affected specs, plus the new `lab-result-entry.spec.ts`. Checked in the running app: the dev database migrated on reload, Maya's BMP and TSH are back in Labs, the Labs badge went from 14 to 11, and the scratch memos show Maya Chen.
- **Remaining gaps:** the omnibox's local answers and the medication truth panel still read fixtures (now `fixtureMonitoringEvidence`). There is no edit or entered-in-error path for a hand-entered result yet.

**2026-09-25 NOTE-SAFE-1 owner-directed review fixes ([D-104](decisions/D-104.md), baseline `fdabb4f`):** fixes what a review of the Gemini dossier screenshots found in the running app.

- **Safety (verified in the running app):** every new note opened with a normal MSE that said "no … suicidal ideation" and quoted the patient. It was autosaved and marked *Safety & Suicidality Assessed — done* on an empty Risk Assessment. New notes now start blank, and **Insert normal exam** fills blank rows only when clicked. Safety closes only when the Risk Assessment is written. Unsigned drafts lose the old default on load, and migration `2026-09-25-003` clears it at the source with provenance; signed notes are untouched. The chief complaint starts blank.
- **Safety flags:** the Overview and the note share `currentSafetyFlags` (latest administration per instrument). Maya's superseded March item-9 flag no longer shows as unresolved. A current flag is the note's first item and "Next gap" until the Risk Assessment is written. If safety history cannot be read, the panel says so.
- **Timing:** the first reference read for a not-yet-saved draft returned 404 and showed "Linked records could not be refreshed". A 404 is now "not yet applicable", and the read re-runs on the first acknowledged save. Seen in the running app: 404 → 200 with no warning.
- **Dates:** added `toCalendarDate`, `formatCalendarDate` and `formatDateWithAge`. Overview cards show date and age ("Aug 12, 2026 · 6 wk ago"). The timeline sorts on calendar dates; it used to string-sort "Sep 24, 2026" against "2026-09-25". Care-completion and monitoring details no longer print raw ISO timestamps. *Next visit* ignores past-dated bookings; it had shown a Sep 22 visit on Sep 25.
- **Counts:** dashboard queue chips counted only the 8-item priority sample ("Labs (5)" beside a rail badge of 11). The chips now count the whole queue, a category chip lists all of its items, and the priority view says "8 of N shown". The dashboard and the rail badge share `groupUnacknowledgedLabsByOrder`, and the badge reads "lab orders to review".
- **Schedule:** a booked visit more than 10 minutes past its start with no check-in counts as **Late**, not Upcoming. There is a Late chip, and the briefing says who is late.
- **Billing:** drafts no longer default to CPT 99214 / "Moderate Complexity". Template badges read "Usually 99214 · MDM decides". The readiness item no longer promises a code.
- **Labs companion:** no test or indication is preselected. Staging needs both, and the catalog no longer says the metabolic panel is "required annually" for every patient.
- **Found during verification:** `EncounterRepository.getByPatient` ran `ORDER BY date` on display dates ("Sep 25, 2026"), which sorts alphabetically, so Maya's *Last visit* read May 19 instead of Aug 12. It now sorts by calendar date. The billing metric note was clipped mid-word by the global single-line `.metric-sub`. The capture script took 05 and 05b from the same view and left a stale query in the omnibox for every screenshot.
- **Validation:** `npm run check` passes (488/488; lint has no errors, and the touched files have the same warning counts as `fdabb4f`). `npm run build` passes. New `tests/note-safety-defaults.test.ts` (10 tests) covers the blank note, the keyword-proof safety goal, the legacy scrub, the normal-exam insert, current flags, flag-first readiness, unreadable safety history, date formatting, the migration and encounter ordering. The full browser suite ran 201 passed and 6 failed. The same 6 fail on untouched `fdabb4f`: `care-completion` ×3 (fixture appointment POST rejected), `companion-ai` and `ui-system` (already recorded under CB-6b), and `workspace-module-tabs` ×2. On a fresh `test-results/browser-ehr.db`, `care-completion`, `synthetic-visit`, `asrs-assessment` and `tool-navigation` pass alone, so part of the suite depends on accumulated state; CI has failed on every recent push to `main`. Dossier screenshots were recaptured on a fresh database and each caption re-checked against its image. Checked in the running app on the review database: the Maya note (including the migration clearing a legacy draft), Overview, dashboard and Labs companion.
- **Remaining gaps:** clearing browser storage starts a second same-day draft instead of resuming the server draft; this is existing behavior, seen during verification. Safety has no structured risk record yet. A scenario-sourced chief complaint on an existing draft is kept.

**Requirements:** RIGHT-01 through RIGHT-05, PAT-04, SAVE-06, WIN-09, TRUST-02.

**Inspect:** `app/components/DynamicSidebar.tsx`, `app/lib/use-companion-rail-controller.ts`, `app/lib/use-companion-working-data.ts`, `app/components/team/TeamCollaborationDock.tsx`, companion panels, existing floating-window/navigation controllers, and semantic stacking tokens.

- Reuse the existing companion controller and container to provide consistent header, title/context, close, expand and supported pop-out/redock behavior. Keep full workspaces for larger jobs; unify presentation without merging unrelated domain state.
- Keep the right icon rail and underlying primary controls reachable. Implement responsive width/overflow using existing geometry ownership rather than ad hoc z-index increases.
- Preserve draft text, explicit patient/recipient target, scroll, selected tool and return path through container changes. State belongs to existing feature lifecycles, not a duplicate wrapper store.
- Apply CB-2 readiness and preview containment identically in docked and full views. Merely changing active patient must not retarget a pending message/order/proposal.

**Verify:** schedule, AI, scratchpad, tasks, assessments and communication tools; open/close, tool switch, expand, supported detach/redock, Escape/focus return, patient change, resize, refresh and failed persistence. Reuse `calendar-companion-panel`, `rail-personalization`, `workspace-layering`, and window-lifecycle browser coverage.

**Accept:** consistent presentation and state continuity with no obscured rail, wrong-target action, lost draft, or new navigation owner. **Exclude:** generic window-manager rewrite or imposing one mandatory layout on every user.

### CB-6g — every companion tool survives resizing

2026-09-27 · baseline `6cc5f10` · part of CB-6, which stays open in ROADMAP · requirements RIGHT-02, RIGHT-05, VIS-07.

- **Defect (found by the new survey on `6cc5f10`):** the Labs panel had its own `min-width: min(100%, 360px)` in `app/labs-companion.css`. When the shared companion width was set to 260px, Labs stayed 360px and overran the space the chart had given it. The other tools followed the shared width.
- **Change:** that rule is removed, so Labs uses the shared width like every other tool. Its fields already shrink (`min-width: 0`).
- **Checks:** new `tests/browser/companion-resize.spec.ts` (3). It pins all ten panel tools (Labs, Prescribing, HR, Calendar, Tasks, Messages, Clinical AI, Communication, Scratchpad, Calculators) and opens Maya Chen's chart so patient tools show their forms. At 1440×900 and 1024×768 it sizes each tool with the keyboard to the narrowest (≥260px) and widest width. It checks that the panel matches the separator's value, stays on screen, keeps its close button fully visible, and has no content past its edge. A third case checks that a chosen width carries to another tool and survives a reload. Labs failed on `6cc5f10` (360px vs 264px) and passes now. The overflow detector was checked by temporarily forcing a Labs field to 600px, which it reported. `npm run check` passes (500/500; lint 0 errors). `npm run build` passes. `companion-viewport`, `calendar-companion-panel`, `rail-personalization` and `escape-layering` pass, 13/13. Labs at 260px on 1024×768 was also inspected in a screenshot.
- **Not covered:** the expanded canvas has no resize handle, by design. Viewport resizes while a panel is open are covered only by `companion-viewport`'s four fixed sizes.

### CB-6f — one Escape, one layer; focus returns to the rail

2026-09-26 · baseline `2efd53c` · part of CB-6, which stays open in ROADMAP · closes the "Escape arbitration" open defect deferred from UI-7b · requirements RIGHT-01…05, NAV-01, keyboard/focus rules in AGENTS.md.

- **Defect (reproduced in the browser on `2efd53c`):** every layer added its own Escape listener. With an expanded companion over a module, one press both redocked the companion and closed the module. The companion rail controller and the Communication panel each answered, so Communication acted twice. Escape inside a companion text field closed the panel. Closing a companion dropped focus on `<body>`. With the Open-workspace launcher over a companion, the press closed the companion as well as the launcher.
- **Change:** `useDismissible` is now one ordered stack. Layers join when they open (or when their `layerKey` changes, so an expanded companion counts as newest), and only the topmost is asked. A text field or `role="dialog"` still keeps its keystroke, and nothing lower answers it instead. A handler outside the stack calls `markEscapeHandled` to say it used the press (the patient "More" menu does). `preventDefault` deliberately does not count, so the omnibox clearing itself does not stop the AI card above it from closing. The companion controller's raw listener, the add-tool menu and the launcher's Escape now use the stack. Communication's duplicate listener is removed. Closing a companion by Escape returns focus to its rail button.
- **Checks:** `npm run check` passes (unit 500/500, one new `topmostLayer` test; lint 0 errors). `npm run build` passes. New `tests/browser/escape-layering.spec.ts` (5): the expanded companion over a module takes three presses (redock, then close, then the module); every docked tool on the rail closes and returns focus to its button; a Tasks field keeps Escape and its text; the launcher closes alone and focuses `+`; expanding a companion opened before the module puts it on top. The first four fail on `2efd53c`. Also passing: `dismissal`, `communication-lifecycle`, `communication-companion`, `workspace-open-launcher`, `workspace-layering`, `calendar-companion-panel`, `companion-draft-target`, `calendar-view-options`, `calendar-interval-jump`, `companion-viewport`. `rail-personalization` failed once in the combined run and passed alone. That is the shared-database order dependence already in ROADMAP. Failing identically on `2efd53c`, and already listed as standing failures: `companion-ai` (retarget vs D-098 parking), `workspace-module-tabs` ×2, `ui-system` "layout controls", and `tool-navigation` CB-3 calendar (two Jordan Reed rows from shared test data).
- **Behavior change to note:** Escape typed inside a companion text field no longer closes the panel. This follows the existing rule that a field keeps Escape for itself (as in a module composer). Tab out of the field, or use ×.
- **Named gaps (carried to ROADMAP):** about thirty components still use their own Escape listeners outside the stack; companion resize is still unverified across tools.

### MSG-SAFE-1 — Messages "AI Draft Reply" no longer invents what happened

2026-09-26 · baseline `52c26a2` · open defect found in CB-6c · requirements TRUST-02, AI principles (never invent clinical events).

- **Defect:** on a refill thread the button filled the reply with a claim that a 30-day refill was authorized and "electronically submitted via Surescripts" to a named pharmacy. Nothing was authorized or sent (prescribing is disconnected under D-107), and one Send put that claim in front of the patient. The other canned replies asserted clinical judgements.
- **Change:** the canned replies are removed. The button stays visible as an unavailable seam with its reason ("AI drafting is not connected yet. Write the reply yourself."), ready for the AI work D-107 schedules before the pitch.
- **Checks:** `npm run check` passes (unit 499/499; lint 0 errors). `npm run build` passes. New browser case in `companion-draft-target.spec.ts` goes through every Maya Chen thread: the button is aria-disabled with its reason, and clicking it leaves the reply empty. It fails on `52c26a2` and passes now.
- **Named gap (carried to ROADMAP):** the "Ambient AI Clinical Triage" card still shows seeded text as AI output.

### CB-6e — a companion save runs once, and a failure keeps the draft

2026-09-26 · baseline `53dbc1c` · part of CB-6, which stays open in ROADMAP · requirements RIGHT-01…05, SAVE-06, TRUST-02.

- **Defect (reproduced in the browser on `53dbc1c`):** Tasks, Scratchpad and Messages had no in-flight guard. With the save held open, three presses (button, keyboard shortcut, button) sent three POSTs from each tool, so a double-press could file a task or note twice or deliver the same message to a patient twice. The failure path already kept the draft, but it was only tested for Tasks.
- **Change:** new `app/lib/use-in-flight.ts` claims one key per draft (its scope plus trimmed text) until the server answers. A different draft is not held up: another patient's, or a task added from a message. `useCompanionWorkingData` guards Add task and Add note and exposes `taskSaving`/`noteSaving`. `PatientMessages` guards Send in both the companion and the chart section. Add task and Add note report `aria-busy` ("Saving…" on Add note). Send uses the shared Button's loading state ("Sending…").
- **Checks:** `npm run check` passes (unit 499/499, one new key test; lint 0 errors). `npm run build` passes. Three new cases in `tests/browser/companion-draft-target.spec.ts` hold the POST open, press three times, then fail it: one request, busy while held, the error shown, the draft kept (Scratchpad also keeps its patient), and nothing stored on the server. On `53dbc1c` all three receive 3 requests instead of 1. With the busy checks included they fail earlier, at the busy assertion. The spec passes 9/9. `communication-companion`, `companion-viewport`, `calendar-companion-panel` and `rail-personalization` pass, 13/13.
- **Named gaps (still in ROADMAP):** drafts do not survive a page refresh; Escape/focus return and resize across tools. The guard is client-side: two browser tabs or a retried network request can still create duplicates, so server idempotency keys are not part of this slice.

### CB-6d — a Messages reply survives a companion tool switch

2026-09-26 · baseline `970419e` · part of CB-6, which stays open in ROADMAP · requirements RIGHT-01…05, SAVE-06.

- **Defect (reproduced in the browser on `970419e`):** choosing another companion tool unmounts the Messages panel, which held its reply drafts and open thread in its own state. Opening Tasks and returning to Messages lost the half-written reply and reopened the first thread instead of the one the clinician had open.
- **Change:** `useCompanionWorkingData`, which outlives the panel, now holds the Messages reply drafts (per patient and thread) and open thread (per patient). `PatientMessages` takes them as optional `ScopedDraftStore`s; the chart's Messages section passes none and keeps its own, as before. D-108's per-patient scoping is unchanged.
- **Checks:** `npm run check` passes (unit 498/498; lint 0 errors). `npm run build` passes. New browser case in `tests/browser/companion-draft-target.spec.ts` (open a non-default thread, type, switch to Tasks, return: same thread, same text, and still absent on Jordan Reed's chart). It fails on `970419e` at the open-thread assertion and passes with the change; the spec is 6/6. `communication-companion`, `companion-viewport` and `calendar-companion-panel` pass, 10/10.
- **Named gaps (still in ROADMAP):** drafts do not survive a page refresh; failed-save behavior is proven only for Tasks; Escape/focus return and resize across tools. The Messages category filter still resets on a tool switch.

### CB-6c — companion drafts stay with their patient ([D-108](decisions/D-108.md))

2026-09-26 · baseline `bc31d56` · part of CB-6, which stays open in ROADMAP · requirements RIGHT-01…05, PAT-04, SAVE-06, TRUST-02.

- **Defect (reproduced in the browser on `bc31d56`):** "Recheck Maya's lithium level", typed into the Tasks companion on Maya Chen's chart, was filed against Jordan Reed after switching to his chart and pressing Add. The Messages reply composer kept Maya's text under a placeholder that already read "Reply to Jordan Reed…", so Send would post it in his thread. Scratchpad kept the text while its "For" picker followed the new chart.
- **Change:** `app/lib/use-scoped-drafts.ts` holds one draft per patient, or per practice when no chart is in front. `useCompanionWorkingData` (Tasks, Scratchpad text and target) and `PatientMessages` (reply per patient and thread, open thread per patient, dictation into the draft it started in) use it. A save reads its scope when it starts and clears only the draft it submitted. The docked Tasks composer states "Links to <patient>" or "Practice task — no patient". Communication and Labs already bind an explicit target, and AI and rating scales park (D-098), so they are unchanged.
- **Checks:** `npm run check` passes (498/498; lint has no errors, and the touched files have 12 warnings against 13 before). `npm run build` passes. New `tests/scoped-drafts.test.ts` (4 tests). New `tests/browser/companion-draft-target.spec.ts` (5 tests: Tasks, Scratchpad and Messages across a chart switch, a practice note staying a practice note, and a failed task save keeping its draft and patient). Its three core cases fail on `bc31d56` and pass with the change. Full browser suite on a fresh database, in the cloud workspace: 191 passed / 23 failed with the change, against 185 passed / 24 failed on `bc31d56` (209 tests before, 214 after). 22 failures are common to both (listed under *Open defects*). The one failure only with the change, `team-retirement` "all six retired communication capabilities", was a connection reset during its preference reset; that spec, `companion-ai` and `hr-workspace` then passed 16/16 together on a fresh database. Visually checked at 1440×900 and 1024×768: the "Links to" line reads clearly, and the panel is opaque once its entrance animation settles.
- **Named gaps (carried to ROADMAP):** the Messages draft does not survive a tool switch; drafts do not survive a refresh; failed-save behavior is proven only for Tasks. Also found and not fixed: Messages "AI Draft Reply" canned text claims a refill was sent via Surescripts.

## Completed-phase summary


Detailed delivery evidence remains available in the [historical roadmap snapshot](archive/roadmap/ROADMAP-through-2026-09-19.md). Important completed checkpoints include:

- P3 longitudinal clinical chart gate;
- P4 scheduling/front-office gate;
- RL-A/RL-B sign-time reference freeze and coded diagnosis foundation;
- Dashboard DB-0 through DB-10;
- P9-0 containment and durable internal charge foundation;
- AI-0 grounded answer path;
- signed-history authority correction (D-071);
- Calendar first-class workspace (D-072);
- Intake truth-alignment through D-078;
- code-quality/application-shell/CSS architecture cleanup D-079 through D-082.

Completed does not mean production-ready, vendor-connected, HIPAA-certified, or P12 accepted.

## Verified product state at the 2026-09-26 split


The project is architecturally ahead of its remaining product-completeness gaps.

Implemented foundations include:

- persistent multi-patient workspaces, detachable patient panes, restoration, clinician preferences, and browser-style patient tabs;
- server-derived user/session authority, organization membership, patient-access isolation, patient-bound consequential actions, audit/provenance, and immutable signed encounter snapshots;
- authoritative patient roster, administrative record, longitudinal chart foundations, medication truth/reconciliation/prescription-intent separation, prescription transaction/recovery workflows, and clinical reference freezing;
- complete Phase P3 longitudinal clinical-chart gate and Phase P4 scheduling/front-office gate;
- Dashboard DB-0 through DB-10, including configurable modules, shared live scheduling, care-completion projection, and persona/capability boundaries;
- Calendar as a first-class persistent workspace using the same authoritative appointment store as Dashboard/roster surfaces;
- signed encounter history and append-only addendum/amendment workflow;
- prospective-person Intake, standalone intake episodes, promotion/linking, evidence continuity, readiness projection, and staff workflow through D-078;
- durable internal billing charges derived from signed encounters without invented fee amounts; simulated billing success is isolated from normal workflows;
- one grounded planner path shared by the omnibox, Home, and Clinical AI companion, with permission-aware context, stale-response protection, explicit unsupported/unknown behavior, and human-confirmed consequential actions;
- staged static-quality tooling, PatientWorkspace decomposition, typed application navigation/coordination, and CSS ownership/stacking boundaries (D-079 through D-082).

Real PHI remains prohibited until the production-readiness gate is intentionally satisfied.

## Shell migration and owner-directed slices


Direction confirmed 2026-09-20. This is the current shell/UI migration order and takes priority over the older top-navigation presentation while preserving its working routes until replacements are proven.

`Home / + launcher -> persistent workspace tabs -> active canvas -> contextual right companion canvas`

**Migration invariant:** never remove a working top-bar destination merely because its replacement has been designed. Add the replacement, prove parity and state preservation, then remove only that one old entry.

### Ordered shell migration

| UI slice | Change | Exit gate before the next slice |
| --- | --- | --- |
| **UI-1** | Upgrade the tab-strip `+` from **Open a patient chart** to **Open workspace**. Offer Home, Calendar, Patients, Intake, Documents, Billing, Brand, and appropriate recent work. If already open, focus the existing tab instead of duplicating it. | **Verified complete.** Popover opens/toggles, instant filter matches keywords/patients, singleton workspaces and docked/undocked charts focus existing tabs without duplication, full keyboard/escape dismissal, Level 1 top-navigation preserved. Unit tests (4/4) and browser tests (5/5) pass. |
| **UI-2** | Make Home and `+` consume one shared workspace catalog rather than separate hard-coded destination lists. Home presents Clinical / Billing / Brand; Staff/HR is excluded from major-app launchers. | **Verified complete.** Single shared catalog (`app/lib/workspace-catalog.ts`); Home presents Clinical / Billing / Brand in centered Google Workspace aesthetics; `+` presents Home, Calendar, Patients, Intake, Documents, Billing, Brand; Staff/HR and withdrawn/planned tools (`financial_integration`, `reports`) excluded from both; destination identity and availability aligned. Unit tests (6/6) and browser tests (5/5) pass. |
| **UI-3** | Add **Communication** to the right companion/canvas rail while keeping the existing **Team** top-bar menu intact. Reuse real Inbox/team/patient communication/email/fax/community capabilities only where currently implemented. | **Verified complete.** Pinned `communication` tool in right companion rail by default; `CommunicationCompanionPanel` supports Team, Inbox, Patient SMS, Email, Fax, and Community; honest unconfigured notices for external gateways; Level 1 Team menu fully intact; unit tests (5/5), browser tests (5/5), and full inner loop pass. |
| **UI-4** | Give Communication the canonical companion lifecycle: docked, resizable, expanded main-canvas presentation, redock, minimize/close. | **Verified complete.** Canonical lifecycle implemented (docked, resizable, expanded main-canvas presentation, redock, minimize/close); right companion rail (52px) remains accessible during canvas expansion (RIGHT-05); draft persistence (chat, SMS, email, fax, tasks) and channel/partner selection survive expand, redock, tool-switching, close/reopen, and page reload; Escape gracefully redocks before dismissing; Level 1 Team menu preserved intact; unit tests (4/4), browser tests (5/5), and full inner loop (416/416) pass. |
| **UI-5** | Remove **Team** from the top bar only after UI-3/UI-4 parity is proven. | **Verified complete.** Team retired from `ToolNavigation` with its channel-dispatch plumbing; all six capabilities and their full-workspace escalations reachable from the right companion rail; a one-time `appliedRailBackfills` migration reaches layouts saved before the tool existed; the legacy collaboration dock still opens alone from its own control. |
| **UI-6** | Decompose **Practice** one child at a time: Billing -> major workspace; Website + Social Media -> Brand; Staff/HR -> companion canvas with expand; Settings -> profile/preferences; Reports -> assigned to its owning workspace when real. | **Verified complete.** Billing (UI-6a), Website + Social media (UI-6b/UI-6c), Staff/HR (UI-6d, with assignment in UI-6e) and Practice settings (UI-6f) each reached a verified owner before losing their entry; Reports was already filtered out as `planned` and left with the group. Practice was removed last (UI-6g). "Settings -> profile/preferences" is amended by [D-087](decisions/D-087.md): the child was organization administration, the practice's default layouts were already under preferences, and administration went to the account menu. |
| **UI-7** | Decompose **Clinical** one child at a time. Keep Calendar first-class; Patients/Documents open through `+`; move contextual tools such as Tasks to companions where appropriate; decide Labs/Prescribing placement from workflow ownership before removing their old route. | **Verified complete.** All five children reached an owner before losing their entry: Patients and Documents to the `+` launcher (UI-7a, which repaired the Documents route first), Tasks to the right companion whose expanded canvas renders the practice queue itself (UI-7b, D-089), Labs to the `+` launcher beside Documents (UI-7c, D-090), and Prescribing to the right companion (UI-7d, D-090 as amended by D-092). Clinical was removed last, after its last child. Prescribing's detail pane, patient-context gate, retry and evidence forms remain unexercisable without an enabled prescribing integration, which D-092 records rather than implies. |
| **UI-8** | Final chrome cleanup: Level 1 becomes brand/Home + omnibox + account/preferences; Level 2 remains persistent labeled workspace tabs + `+`; right side remains contextual companions. | **Complete.** Of the row's three remaining destinations, Calendar and Intake already had `+` launcher entries and **Dashboard did not** — so it got one first and the row was removed after, which is the rule every earlier slice followed one destination at a time ([D-094](decisions/D-094.md)). `ToolNavigation` is deleted along with the popover machinery UI-7d left for this slice, the stacking token, the grid column at every breakpoint and the dead `navigationTrigger` variant. No left app rail and no replacement navigation row. Verified per spec, not by a full-suite run. |

**The owner-directed shell migration is complete: UI-1 through UI-8 are done.** UI-7 took all five of Clinical's children and then the group: Patients, Documents and Labs to the `+` launcher (UI-7a, UI-7c), Tasks and Prescribing to the right companion (UI-7b [D-089](decisions/D-089.md), UI-7d [D-090](decisions/D-090.md) as amended by [D-092](decisions/D-092.md)). UI-8 then removed the row itself ([D-094](decisions/D-094.md)) — after giving Dashboard the launcher entry it was missing, which was the only part of that row that was not already rehomed. Level 1 is now brand/Home, the omnibox and account/preferences; Level 2 is the persistent labeled tabs and `+`; the right side is contextual companions. There is no left rail and no replacement navigation row.

**UI-8b then closed the last part of the owner's first bottleneck.** UI-8 deferred the right icon rail's overlap with the `+` launcher on the grounds that rail tools are companions rather than workspace destinations. Driving the surface showed one real instance behind the complaint: Calendar was both, and the rail's own "Unpin from Companion Rail" was reverted on the next load by two separate mechanisms ([D-095](decisions/D-095.md)). Tasks, Communication and the gear were checked and are not duplicates.

**Owner-directed AMB-1 — ambient omnibox answers (2026-09-22): implemented.** The owner reprioritized the screenshot-11 defect before CB-7: an informational question such as “What medications is Maya Chen taking?” now uses the existing authenticated planner while the omnibox remains open, renders the grounded answer/provenance inline, and makes chart navigation or prescribing/monitoring review secondary explicit actions. It adds no medication truth, no second router, and no separate clinical answer ladder. Focused server and browser regressions are included in the implementation commit; the push CI workflow remains the validation authority for the direct-main change.

**Owner-directed ERG-1 — patient-tool scope + browser ergonomics (2026-09-22): implemented.** The owner reprioritized the remaining screenshot ergonomics before CB-7. Patient-bound companions now expose a shared toolScope and park under an explicit **Inactive Chart Pinned** banner when their bound chart is not foreground; rating-scale insertion opens Encounter before any write; patient tabs collapse into a labeled overflow after the readable shelf fills; Ctrl/Cmd+K, Alt+W, and Ctrl+1–9 follow the in-app browser model; and the Omnibox **Stage Refill…** route is explicitly locked to the existing staged Orders Cart/composer rather than a vendor transport. Focused unit/browser regressions are included; push CI remains the validation authority for the direct-main change. See [D-098](decisions/D-098.md).

**Owner-directed PAT-OV-1 — patient Overview visit-readiness redesign (2026-09-23): implemented, validation pending.** The owner rejected the oversized first-viewport snapshot because clinically useful treatment state was pushed below the fold. The existing four-card ownership model remains intact, but Snapshot is now a compact visit-readiness surface: unresolved attention items plus six grounded signals (last visit, next visit, active medications, vitals, rating scale, latest lab). Active medications and diagnoses remain configurable detail cards beneath it, and Recent Clinical Changes now also projects medication and document changes. The hard-coded PHQ-9 fallback was removed with the old Snapshot implementation so a missing assessment can no longer look like patient truth. This advances PAT-05/PAT-06/PAT-08 and VIS-02/VIS-06 without creating a second clinical store or alert owner; push CI is the validation authority.

**Owner-directed MON-1 — layered clinical monitoring policy (2026-09-23): implemented, validation pending.** Medication-surveillance attention now resolves through system starter → practice default → provider override → documented patient exception. Owners/managers can edit practice defaults; providers can edit their own timing and an active patient's exception. Interval, due-soon window, overdue grace, enabled state, policy source and patient reason are persisted/audited. Lab and vital rules consume authoritative evidence of their own kind. The legacy synthetic monitoring strings in `patient.alert` are suppressed by exact fixture value so one policy engine owns due/overdue state; unrelated/manual alerts remain visible. See [D-099](decisions/D-099.md). Push CI is the validation authority.

**Owner-directed NOTE-READY-1 and BILL-1 — visit readiness in the note, and the practice billing template (2026-09-24): implemented; evidence below.** The owner named the note and billing as the next focus: the note "is not Google/Facebook-like yet", AI will eventually draft most of it, and the clinician wants prompts built in for missing information, billing and insurance needs, labs and medications. Recorded as [D-100](decisions/D-100.md) and [D-101](decisions/D-101.md); requirements NOTE-01…05 and BILL-01…04 in PRODUCT_VISION.

- **Visit readiness (NOTE-02/03/04).** A panel in the note's right margin, grouped Note · Billing & insurance · Labs & monitoring · Medications · Follow-up, derived on every render from sources that already own each fact — coding goals, care-completion rules for one patient, D-099 monitoring (same policy and evidence mapping as the Overview, now shared), recorded coverage, coded diagnosis links, practice billing setup. Items act (focus the section, therapy time, chart tab, schedule, Billing, patient information) and close when the source changes; each server part fails visibly on its own. Signed notes report their gaps as history. The documentation-and-coding footer moved into the Billing group; the unstyled evidence-refresh line became an item with Retry.
- **Note flow (NOTE-01).** Suggestions follow the cursor (all phrase categories stay mounted, so unfinished wording survives); Focus leaves only the page with the open count; narrow panes show readiness as a one-line bar; the Review & Sign step bar and summary were restyled (the letterhead grid had been overlapping text there); the note's outer containers can no longer be scrolled by focus, which had slid the toolbar out of view; Copy note used a hard-coded date of service and now uses the draft's.
- **Defects found and fixed while verifying.** A brand-new note never re-ran reference extraction after its first save, and signing within the 1.5 s extraction pause reached the Diagnoses step with nothing proposed — both left a signed note without a coded diagnosis and its charge unreviewable. Extraction now re-runs on first save and runs before Review & Sign opens. Coverage edits in the administrative drawer now announce a patient update.
- **Billing template (BILL-01/02/04).** Charge templates per note template (code, add-on policy, POS in person/telehealth, telehealth modifier), offered as one-click starters and never seeded; a practice fee schedule in integer cents, frozen per line at preparation (`null`, never $0.00, when unpriced); attested add-on codes persisted and sealed into the signed snapshot; recorded practice and rendering-provider identity with NPI check-digit and EIN format checks. Owners/managers edit; `view_financial` reads. All changes audited.
- **Superbill (BILL-03).** A reviewed charge renders as a printable superbill with gaps printed as "Not recorded" and listed; unreviewed or void charges are refused with no audit; production is audited. Print shows the superbill alone; the browser's Save as PDF is the export.
- **Evidence.** Starting SHA `a2da86d`. `npm run check`: lint 0 errors, typecheck clean, unit tests pass (new `tests/visit-readiness.test.ts`, `tests/billing-setup-and-superbill.test.ts`; `tests/migrations.test.ts` ledger extended). `npm run build` passes. `tests/browser/visit-readiness.spec.ts` (3 tests) passes twice in a row against the persisted suite database, including print-media emulation. Full browser suite: 198 passed, 8 failed on the persisted suite database. Rerun on a fresh suite database: `asrs-assessment` (repaired — its "Scales →" control was removed by PAT-OV-1 and replaced by "Review scales"), both `care-completion` failures (caused by a Maya Chen draft this slice's own spec left behind; the spec now edits and signs Sofia Martinez so it leaves no draft) and `synthetic-visit` pass. Four fail identically at the starting SHA in a clean worktree and are not caused by this slice: `workspace-module-tabs` ×2 (click the top-bar "Intake" removed by UI-8), `ui-system` "Workspace layout" (Preferences copy changed by MON-1) and `companion-ai` patient-switch target label. Manual verification in the running app at 1440×900, 980×800 and 390×844 with synthetic data.
- **Not done / named gaps.** Claim transmission, eligibility and remittance remain refused (no paid vendors). The ambient scribe is still two scripted demonstration scenarios and the reference matcher is deterministic although its proposals are labelled "AI extracted" — neither is a model, and neither was changed here. The administrative drawer cannot edit a coverage member ID in place (terminate and re-add). Charges prepared before this slice keep their frozen lines without fees or modifiers. Place of service needs an appointment-linked encounter; drafts opened outside the schedule get none, by design.

**Owner-directed BILL-WF-1 — Billing workflow queue (2026-09-25): implemented; evidence below.** The owner asked for a billing workflow tab like Intake's. Recorded as [D-105](decisions/D-105.md); requirement BILL-05 in PRODUCT_VISION.

- **What changed.** Billing has a **Workflow** view beside Charges and Practice setup. Charges remains the default. It is an Intake-shaped queue: stage tabs with counts (Needs charge · Coding incomplete · Ready for review · Reviewed; Voided in the overflow), sort (practice priority, oldest service date, patient), and search by name or MRN. Each card shows "N of M complete" and "Next: step (owner)". A detail panel shows the step timeline, where each step's fix lives (Prepare charge, Open chart, Open practice setup, Mark reviewed), Superbill, Show in Charges and Void. Submit claim is refused and shows its reason.
- **Ownership.** `app/domain/billing-workflow.ts` is a pure projection over the existing `/api/billing` load. There is no new table, endpoint or store. Prepare, review and void are single handlers in `BillingWorkspace`, used by both views. The stage equals the server's `billingChargeIsReviewable`. Facts not yet read from the signed record are `pending`, not missing. Submission is never counted toward progress. The queue reuses Intake's classes.
- **Evidence.** Starting SHA `91cdf86`. `npm run check`: lint 0 errors, typecheck clean, 494/494 unit tests (new `tests/billing-workflow.test.ts`). `npm run build` passes. The new `tests/browser/billing-workflow.spec.ts` passes twice in a row on the persisted suite database and again on a fresh one. `billing-containment` and `visit-readiness` pass. Full browser suite: 200 passed, 8 failed.
  - Four of the failures are the standing ones recorded above (`workspace-module-tabs` ×2, `ui-system` "Workspace layout", `companion-ai`).
  - `ui-system` "Communication companion" passed on rerun.
  - `care-completion` ×2 pass on a fresh suite database; the failure was state accumulated in the persisted database.
  - `tool-navigation` CB-3 (duplicate "Jordan Reed" week-view rows) fails identically at `91cdf86` and is not caused by this slice.
  - Manual check in the running app through the `+` launcher at 1440×900, 800×600 and 375×812: a charge was prepared from the queue, the row kept its selection, and the server agreed.
- **Follow-up (2026-09-25).** The shared "… recorded." confirmation is now a one-line, dismissible status instead of an empty-state block, so short viewports keep the queue in view; `billing-containment`'s refused-submission check was pointed at the new element so it still watches the real notice. The chosen stage and sort persist per viewer in browser storage (`ehr.billing.workflow.queue`, validated on read, restored after mount; queue rows never come from storage). New browser case: choose a stage and sort, reload, both restored and every card is in that stage; a tampered value falls back to the defaults. It caught and fixed a restore/save race that overwrote the saved choice on mount. `npm run check` 494/494, `npm run build` passes, `billing-workflow` + `billing-containment` 7/7. Owner-reported (2026-09-26): in the Workflow layout the Charges / Workflow / Practice setup switch collapsed to an unreadable sliver (a sideways-scrolling flex item shrinking in the column); fixed in `177a087` so only the queue gives up height, with a spec assertion at 1440×900 and 800×600 that fails without the fix. Checked in the running app at 800×600.
- **Completion & Diagnosis Gap Resolution (2026-09-29).**
  - **Workflow view promoted to default:** `BillingWorkspace` now defaults to the Workflow view (`billingView = "workflow"`); the view switch tab order is Workflow, Charges, Practice setup. Charges and Practice setup remain fully accessible.
  - **Inline billing diagnosis assignment:** Resolves the open defect where a signed encounter lacking a diagnosis blocked charge review with no remedy except voiding. Added `attach_billing_diagnosis` action on `ClinicalActionGateway`, implemented in `BillingService.attachDiagnosis` and `BillingRepository.attachDiagnosis` with optimistic concurrency checking (`expectedVersion`), patient access verification, and audit logging (`billing_charge_diagnosis_attached`). The charge row's `diagnosis_codes_json` is updated directly.
  - **Preserves clinical immutability:** The signed encounter snapshot in `signed_encounter_snapshots` is never modified; its `content_sha256` and raw clinical content remain strictly immutable.
  - **Workflow detail UI:** Added inline diagnosis picker in `BillingWorkflowQueue` step timeline for unreviewed charges with a diagnosis blocker. Clinicians/billers can select standard psychiatric ICD-10 diagnoses (F32.9 MDD, F41.1 GAD, F90.2 ADHD, F43.10 PTSD, F31.9 Bipolar, F10.20 Alcohol use) or input a custom code and description. Attaching immediately updates charge state, clears the `no-coded-diagnosis` blocker, advances progress, and moves the card to `ready_for_review`.
  - **Superbill & self-pay continuity:** Once a charge is reviewed, the step action provides a direct "Generate Superbill" shortcut for immediate review/print.
  - **Evidence:** `npm run check` (531 unit tests pass, 0 lint/typecheck errors); `npm run build` passes; Playwright browser tests pass (`tests/browser/billing-workflow.spec.ts` 2/2, `tests/browser/visit-readiness.spec.ts` 3/3); live browser subagent verified on running dev server (attaching F32.9 to uncoded charge for David Kim advanced progress from 2/7 to 4/7 and moved charge to `ready_for_review`).

**The next eligible slice returns to CB-7**, the clinical certification gate, unless the owner reprioritises again. UI-9 closes implicit foreground-context ownership, AMB-1 closes router-first informational questions, and ERG-1 closes the remaining context/overflow/focus edge cases without creating a second router, patient store, order path, or note buffer.

**Owner-directed PAT-HDR-1 — patient header action-overlap repair (2026-09-23): implemented, validation pending.** At ordinary desktop widths, seven full-size chart actions could consume more horizontal space than the patient identity block, allowing DOB/pronouns/MRN to be visually covered. Orders, Patient info, Message, and Open encounter remain directly visible; Worklist, Schedule, and Layout move to a keyboard-accessible **More** menu, with Patient info/Message also promoted into that menu at narrower widths. The header now reserves space for identity and wraps safely before collision. No capability was removed. The same commit restores the explicit authoritative-empty vitals wording required by the clinical snapshot truth gate.

**Owner-directed PAT-HDR-2 — responsive overflow/layer repair (2026-09-23): implemented, validation pending.** Follow-up screenshots showed the new More menu being painted underneath later chart chrome and the legacy <=680px breakpoint still deleting the whole action row. The patient pane now owns an inline-size container; the action row progressively condenses based on actual pane width, remains present at narrow widths, and the More menu is explicitly elevated above facts/alerts/section tabs with compact menu-row styling. No action is removed. Browser coverage includes a 680px narrow case plus an occlusion check using the topmost painted element.



**UI-7d moved on the owner's decision, and part of it is unproven by design.** The owner's instruction on 2026-09-21 was *"We don't need to buy DrFirst to get moved what is there. Please move it and then delete it from its current position."* [D-092](decisions/D-092.md) records the move and, more importantly, records what it does and does not establish. In short: the Clinical menu reached the same structurally empty queue, so nothing that worked before stopped working, and the parity bar is the route being removed rather than the capability working end to end. The detail pane, the patient-context gate's own controls, retry and the three evidence forms are **unexercised and unexercisable here**, and nobody should read UI-7d as evidence that prescribing recovery works. What *was* proven in a browser is the container and the structural precondition the module could never meet: the queue stays on screen while a patient chart is the active tab, and the shell resolves that tab to the patient.

**Owner instruction, 2026-09-21: no money is being committed to paid integrations or to a paid model for the internal EHR AI.** Work around the gap rather than buying past it, and never simulate the part that is missing. `PrescriptionOperationsWorkspace`'s queue stays empty in every checkout because a transmission is refused before a `prescription_transactions` row is written when no adapter is enabled.

**There is an honest way to make that queue non-empty with no vendor, and it is not taken yet.** Verified by driving the real transmit path: with an enabled configuration for the development placeholder adapter, `orderTransmissionService.transmit` prepares a transaction, the placeholder honestly refuses (`DrFirst network transmission is not implemented`), the failure is recorded, and the queue returns **one real `transmission_failed` item with retry allowed**. Nothing is simulated — the refusal is genuine and no success is claimed. Two things must come first, and each is its own slice:

1. **Nothing in the product can enable an integration.** `IntegrationConfigurationService` has `manage_integrations`, audit logging and secret references, and **no API route and no UI**. Organization administration already has a home in the account menu ([D-087](decisions/D-087.md)).
2. **"Integration ready" would then be a lie on the surface least able to afford one.** With the placeholder enabled, `integrationHealthService` reports `ready` and the operations queue renders *"Integration ready — the configured prescribing integration is enabled and its required secret material is available"* for an adapter that cannot transmit anything, ever. That is configuration readiness wearing transport readiness' clothes. The adapter needs to declare that it cannot transmit and the health projection needs to surface it. **This one is not optional**: shipping it to unblock a UI proof would trade a presentation gap for the fabricated-readiness failure AGENTS.md forbids.

Neither is authorised here. Both are recorded so a later slice starts from them rather than from the wall, and so that the unexercised surfaces above get exercised when it does.

Prove the replacement before removing anything. UI-7a is the reason to insist on that: Documents looked like a parity proof with nothing to build, and the launcher's Documents turned out to open nothing at all. Nothing about the `+` launcher already listing a destination means the destination works. UI-7b is the second reason: the Tasks companion existed, was pinned by default, and was still not a replacement — it could not filter, could not remove, could not reach a linked chart, and had no expanded presentation at all. UI-7c is the third: the replacement for Prescribing could have been built and demonstrated on an empty queue without ever touching the half that matters — and UI-7d is the fourth, where the owner decided the move was worth making anyway and the honest thing left to do was name the half that stayed untouched rather than let a passing suite imply otherwise.

One part of the defect CB-0a was drawn from is still open, and it is not UI-7's: the browser suite's fixture week still moves under specs that name a weekday or expect one visit where the shift has delivered two. It is recorded below with a fresh diagnosis and it does not touch UI-7's surfaces. Do not let it absorb a failure of your own.

CB-6's companion-container requirements remain binding and are consumed directly by UI-3/UI-4/UI-5. CB-7 and later clinical certification work remain in the roadmap; this owner-directed shell migration is the immediate presentation priority.

**Deferred from UI-7b with reason:** Escape is answered by every layered surface that is listening, with no arbitration about which is topmost. With a module workspace open underneath, one Escape press both redocks an expanded companion and closes the module — the module's tab survives and is one click away, so nothing is lost, but two surfaces answer one keystroke. `app/lib/use-dismissible.ts` already states the intended rule ("The topmost layer answers first") and implements it only for `[role='dialog']` through `event.target`, which does not fire when Escape is pressed with nothing focused. The obvious local fix — a capture-phase `window` listener in the companion controller, as `ToolNavigation` uses — was rejected rather than merely skipped: a companion panel can be open underneath a modal, and a capture-phase swallow would steal Escape from the modal above it. This needs one small shared layer rule, owned where the rule is already written down, which is more than a presentation slice should decide on its own.

**Deferred from UI-5 with reason:** `TeamCollaborationDock` is a separate surface, not a top-bar entry, so retiring it is not part of this slice. It keeps ownership of the `ehr-open-communications` intent and its remaining entry point (the dashboard Team window). Consolidating the dock into the Communication companion is a bounded follow-up that belongs with the dashboard/Team decomposition work, not with the menu deletion.

### UI-1 — Upgrade tab-strip `+` to universal "Open workspace" launcher

Status: **Verified complete**
- **Implementation:** Created `OpenWorkspaceLauncher.tsx` and `open-workspace-launcher.css` implementing the universal "Open workspace" popover. Integrated into `WorkspaceTabStrip.tsx` with updated `aria-label="Open workspace"`, `aria-haspopup="dialog"`, and `data-workspace-control="open-workspace-launcher"`.
- **Destinations & Catalog:** Offers Home, Calendar, Patients, Intake, Documents, Billing, Brand, and Recent Patients with live instant search filtering and Google Workspace/Facebook aesthetic icon badges.
- **Focus-Existing Singleton Invariant:** Selecting an already-open workspace or docked patient focuses that existing tab without duplicating it; un-docked patients activate and append cleanly.
- **Keyboard & Dismissal:** Supports Arrow Up/Down navigation, Enter selection, Escape dismissal with focus return to `+` button, and outside-click dismissal.
- **Top Bar Preservation:** Preserved `ToolNavigation` completely intact (Clinical, Calendar, Intake, Team, Practice, Dashboard) without premature removal.
- **Evidence:**
  - Unit tests: `tests/workspace-open-launcher.test.ts` (4 passed)
  - Browser tests: `tests/browser/workspace-open-launcher.spec.ts` (5 passed)
  - Regression validation: `npm run check` (401/401 unit tests passed, 0 lint/typecheck errors) and `npm run build` passed.

### UI-2 — Shared Home / '+' workspace catalog

Status: **Verified complete**
- **Implementation:** Created canonical `app/lib/workspace-catalog.ts` defining major suite entities (`Clinical`, `Billing`, `Brand`) and major workspaces (`Home`, `Calendar`, `Patients`, `Intake`, `Documents`, `Billing`, `Brand`). Refactored `ZenHomeWindow.tsx` and `OpenWorkspaceLauncher.tsx` to consume the single shared catalog rather than hard-coded destination lists.
- **Home Suite Presentation:** Home presents the 3 major entities (`Clinical`, `Billing`, `Brand`) in a centered, balanced layout beneath the omnibar and chips with rich circular icon badges. The Clinical tile carries `[data-workspace-view="today"]` for 1-click restore to Today.
- **Staff/HR & Withdrawn Tool Exclusion:** Staff/People/HR is excluded from both Home and `+` major-app launchers (retained for contextual companion/canvas per D-085/LEFT-02). Withdrawn prototypes (`financial_integration`) and planned tools (`reports`) cannot leak into either surface.
- **Destination Parity:** Billing and Brand agree on identical identity, label, icon, tone, and global module target between Home and `+`.
- **Evidence:**
  - Unit tests: `tests/workspace-catalog.test.ts` (6 passed)
  - Browser tests: `tests/browser/workspace-catalog.spec.ts` (5 passed)
  - Regression validation: `tests/browser/workspace-open-launcher.spec.ts` (5 passed), `npm run check` (407/407 unit tests passed, 0 lint/typecheck errors) and `npm run build` passed.

### UI-3 — Add Communication to the right companion rail

Status: **Verified complete**
- **Implementation:** Registered `communication` in `app/lib/workspace-tools.ts` and `app/lib/preference-engine.ts` with default right-rail pinning. Built `CommunicationCompanionPanel.tsx` hosted inside `CompanionPanelHost.tsx` with dedicated styling in `app/communication-companion.css`.
- **Six Communication Channels:**
  1. *Team:* Integrated internal team chat, presence strip, patient context linking, and full tasks launcher using authoritative `teamApi`.
  2. *Inbox:* Integrated patient message roster across all clinical patients with filter chips (`all`, `unread`, `priority`, `refills`) and full inbox workspace launcher.
  3. *Patient SMS:* Patient-bound SMS threads with honest unconfigured telephony gateway notice (`data-sms-transport="unconfigured"`) and draft response composer.
  4. *Email:* Clinical email/referral threads with honest unconfigured SMTP/IMAP gateway notice (`data-email-transport="unconfigured"`).
  5. *Fax:* Digital fax log and composer with honest unconfigured digital fax gateway notice (`data-fax-transport="unconfigured"`).
  6. *Community:* Psychiatric consultation network with honest unconfigured network notice (`data-community-network="unconfigured"`).
- **Navigation Preservation:** Existing Level 1 `Team` top-bar menu (`ToolNavigation.tsx`) and `TeamCollaborationDock.tsx` remain 100% untouched and functional.
- **Evidence:**
  - Unit tests: `tests/communication-companion.test.ts` (5 passed)
  - Browser tests: `tests/browser/communication-companion.spec.ts` (5 passed)
  - Regression validation: `npm run check` (412/412 unit tests passed, 0 lint/typecheck errors).

### UI-4 — Expand/redock Communication canvas with state preservation

Status: **Verified complete**
- **Canonical Companion Lifecycle:**
  1. *Docked right panel:* Opens cleanly in `.companion-panel` at preferred/default width with standard chrome headers, tab selector, and resize boundary.
  2. *Expanded main canvas:* `<CompanionPanelHeader>` provides an accessible `Expand to workspace canvas` (`open_in_full`) button. When toggled, the panel applies `.companion-expanded-canvas` spanning the main workspace canvas (`position: fixed; inset: 0 52px 0 0; z-index: var(--z-modal, 1000)`).
  3. *Unobscured right companion rail (RIGHT-05):* The right companion rail remains visible, stationary, and fully interactable at `right: 0; width: 52px`, allowing one-click companion switching or toggling directly from the rail while expanded.
  4. *Redock & minimize:* Clinicians can redock back to the side panel via the header's `Redock to side panel` (`close_fullscreen`) button, redock via `Escape` key, or close entirely via the header close (`close`) button or rail toggle.
- **State & Draft Preservation across Container Changes:**
  - Implemented `app/lib/use-communication-drafts.ts` syncing active channel, selected partner/thread, team chat composer text, shared task delegate and title drafts, and patient-bound SMS drafts with `sessionStorage` (`ehr-communication-drafts-v1`).
  - Drafts survive container expand, redock, tool switching (e.g. switching between communication and calendar or scratchpad), companion close/reopen, and browser reload without data loss.
  - SMS drafts adhere strictly to active patient context (`drafts.patientSms[patientId]`) with zero silent cross-patient leaking (`RIGHT-04`, `RIGHT-05`).
- **Responsive Workspace Grid in Expanded View:**
  - In expanded view (`data-companion-presentation="expanded"`), the Team channel renders in a rich 2-column workspace (`.comm-team-workspace-wrap`) with chat on the left and shared tasks on the right.
  - Channels with unconfigured gateways (SMS, Email, Fax, Community) present structured multi-column views with persistent honest gateway notices and uninhibited drafting capability.
- **Escape Key Contract:**
  - When expanded, the initial `Escape` keypress safely transitions presentation back to `"docked"` without closing the panel or losing draft text. A subsequent `Escape` keypress dismisses the docked panel back to the rail with focus retained.
- **Evidence:**
  - Unit tests: `tests/communication-companion-lifecycle.test.ts` (4 passed) covering docked/expanded attributes, expand/redock button accessibility, draft persistence roundtrips, and patient-bound SMS draft isolation.
  - Browser Playwright tests: `tests/browser/communication-lifecycle.spec.ts` (5 passed) verifying docked opening at preferred width, expand filling workspace while rail remains clickable, team chat and partner surviving expand/redock, patient SMS draft surviving channel switching and redock, and two-stage Escape key dismissal.
  - Inner loop & build: `npm run check` (416/416 tests passed, 0 lint errors, 0 typecheck errors) and `npm run build` (Turbopack production build succeeded cleanly).
  - Combined UI-1..4 regression: All 20 browser tests across `workspace-open-launcher.spec.ts`, `workspace-catalog.spec.ts`, `communication-companion.spec.ts`, and `communication-lifecycle.spec.ts` passed cleanly in 1.2m.

### UI-5 — Retire Team top-bar entry with full companion parity

Status: **Verified complete**
- **Retirement of the Level 1 Team group:**
  - `Team` is gone from `.tool-navigation` in `app/components/ToolNavigation.tsx`, leaving `Clinical`, `Calendar`, `Intake`, `Practice`, and `Dashboard`.
  - Its six channel destinations were the only ones that carried a `channel`, so the `WORKSPACE_OPEN_COMMUNICATIONS_EVENT` dispatch and the `Destination.channel` field went with them rather than staying behind as an unreachable second route.
- **Full capability parity through the companion rail:**
  - All six retired capabilities (Team collaboration, Inbox, Patient SMS, Email, Fax, Community) open from the pinned right-rail Communication companion, which is keyboard reachable as well as clickable.
  - Every channel keeps the escalation to its full workspace (`.comm-launch-workspace-btn`) that the old dock's fullscreen control provided.
- **Repaired the escalation path the parity test exposed:**
  - `.communication-companion-panel` set `height: 100%`. On the fixed-positioned `.companion-panel`, a percentage height resolves against the viewport instead of the element's own `top`/`bottom` pair, so the panel ran one workspace-chrome height (108px) past the bottom of the screen and carried every channel's "Open Full … Workspace" button off-screen with it — docked *and* expanded. Removing the declaration lets `top`/`bottom` size the panel; all six escalation buttons now sit inside the viewport (measured at 1024x768: panel 108→768, buttons ending at 756).
  - This was live before UI-5 and only mattered once the companion became the sole route, which is why the slice fixes it rather than deferring it.
- **Legacy layouts are not stranded:**
  - `app/lib/preference-engine.ts` records `appliedRailBackfills` and backfills the `communication` pin once into stored rails written before the tool existed, placing it beside the other assistive companions rather than at the end of the rail.
  - Recording the backfill means it runs exactly once, so a clinician who then unpins the tool keeps that choice instead of having it restored on every load.
- **Surface separation:**
  - `TeamCollaborationDock` is not retired by this slice. It keeps the `ehr-open-communications` intent and its own remaining entry point, and opening it does not also summon the companion — one request must not produce two competing communication surfaces.
- **Evidence:**
  - Unit tests: `tests/communication-companion.test.ts` (Team group and its channel dispatch retired; remaining groups retained) and `tests/workspace-personalization.test.ts` (a pre-UI-3 rail receives `communication` once and in position; an explicit unpin survives a later load).
  - Browser tests: `tests/browser/team-retirement.spec.ts` (5/5) — Team gone while other destinations work, all six channels plus their escalations reachable from the rail, Inbox opens the full inbox workspace, a pre-UI-3 stored layout still gets the rail entry, and the legacy dock opens alone. Run together with `communication-companion.spec.ts` and `communication-lifecycle.spec.ts`: 15/15.
  - Inner loop & build: `npm run check` (418/418 unit tests, 0 lint errors, 0 type errors) and `npm run build` (Turbopack production build succeeded).
  - Full browser suite on a fresh test database: **129 passed, 6 failed**. All six failures reproduce unchanged at `143e323` without this slice's changes, verified in a clean worktree, and share one date-dependent cause: the run date (2026-09-20) is a Sunday, so the shifted seed fixtures leave the clinic day empty and roster rows, calendar event rows, and appointment seeding have nothing to assert against. They are `calendar-interval-jump`, `care-completion` (follow-up loop), `dismissal`, `home-assistant`, `intake-workspace` (D-077), and `tool-navigation` (CB-3 calendar status cues). They are recorded here as an open pre-existing defect, not as a UI-5 result and not as a waiver.

### UI-6 — Decompose Practice one child at a time

Status: **Verified complete** at working tree on 2026-09-21, from `86c4c02`. Every child
reached a verified owner before losing its entry, and the group was removed last.

| Practice child | New owner | State |
| --- | --- | --- |
| Billing | Home suite tile and the `+` launcher | **UI-6a done** — menu entry removed |
| Staff directory (`hr`) | HR: a `+` launcher workspace and a rail companion (D-086) | **UI-6d/UI-6e done** — menu entry removed; records are assignable from the interface |
| Website | Brand workspace, Website section | **UI-6c done** — menu entry removed |
| Social media | Brand workspace, Social media section | **UI-6c done** — menu entry removed |
| Practice settings (`settings`) | Organization administration, in the account menu, gated on `manage_organization` (D-087) | **UI-6f/UI-6g done** — replacement proven, then the entry and the group removed |
| Reports | Its owning workspace when real | Never rendered: the tool registry calls it `planned` and the menu filtered on that, so it left with the group rather than needing a home |

- **UI-6a — Billing.** `Practice -> Billing` called `nav.openGlobalModule("billing")`; the Home tile and the `+` launcher issue the same command, so the replacement is the identical controller path rather than a lookalike, focus-existing singleton rule included. The layering spec's "leave a module, return Home" case reached its module through `Practice -> Billing` and now uses Staff directory.
- **UI-6b — Brand as a real workspace.** Brand was a Home tile and launcher entry that quietly opened the `website` module, with `openGlobalModule("website")` hard-coded in two places beside the catalog's own `targetModule`. It is now a registered module of its own rendering `BrandWorkspace`, and both hard-coded routes are gone, so the catalog is the single answer to where Brand goes. `BrandWorkspace` is a container, not a rewrite: each section renders the same component the `website` and `social_media` modules render, so content, drafts and honest unconfigured-gateway notices are the originals rather than a second copy free to drift. Visited sections stay mounted, so an edited practice headline or an unsent post draft survives switching sections.
- **UI-6c — Website and Social media leave the menu.** Removed only after UI-6b proved Brand reaches both surfaces, per the additive-first rule. The `website` and `social_media` modules stay registered: they are the renderers Brand composes, and persisted workspace state may still name them.
- **Evidence:**
  - Browser tests: `tests/browser/practice-decomposition.spec.ts` (10/10) — launcher and Home reach Billing, Billing focuses its existing tab, Brand opens as its own workspace with both sections, work in progress survives section switches in both directions, Brand focuses its existing tab, and Practice was left holding exactly Staff directory and Practice settings — the state at that commit, before UI-6d and UI-6f rehomed both.
  - `tests/browser/workspace-catalog.spec.ts` (5/5) with its Brand case updated to the new destination; `workspace-layering`, `workspace-open-launcher`, `workspace-module-tabs`, `prototype-containment` and `billing-containment` green.
  - Inner loop: `npm run check` (418/418 unit tests, 0 lint errors, 0 type errors).
  - Verified in the running app at 1024x768: Brand opens from `+` and Home with labeled `Website` / `Social media` section tabs, the website CMS notice intact, and an edited headline plus an unsent post draft both surviving a round trip between sections.
- **Practice is gone.** `ToolNavigation` now holds Clinical, Calendar, Intake and Dashboard. Reports stays parked until it is real, and nothing routes to it from the shell.
- **Diagnosis of Practice settings, done 2026-09-21 at `6981f52`, acted on in UI-6f/UI-6g and recorded as [D-087](decisions/D-087.md).** The earlier framing here was wrong on a point that changed the slice, so it is corrected rather than repeated. `settings` renders `PracticeStaffWorkspace` (`app/components/global/PracticeStaffWorkspace.tsx`, 458 lines, rendered only from `GlobalWorkspaceShell.tsx:654`). It is titled **People** and owns exactly one thing: **organization administration** — provisioning a user, clinical role, membership role, membership status, patient-access scope, activation-link issuance, login-lockout clearing, and deactivate/reactivate.
  - It does **not** own the practice's default layouts. Those are already under profile/preferences: `WorkspaceProfileMenu`, `WorkspaceTopBar` and `PresetManagementModal` consume `app/lib/workspace-templates.ts` against `/api/organization/workspace-templates`. The "part preferences" half of the old framing rested on a role-*hint string* inside `PracticeStaffWorkspace` ("Sets the practice's default layouts") that describes what an owner can do elsewhere, not a control this surface hosts.
  - So the three-way overlap this entry feared does not exist. There is no preferences half to separate, and no HR half: HR (D-086) owns personnel material — insurance, licensing deadlines, coachings, goals — while this owns accounts and access. The two touch the same people and share no data, no service and no permission (`manage_organization` vs `manage_hr`).
  - That made the remaining work a **rehome and a rename**, not a decomposition. Done in UI-6f/UI-6g below: the account menu became the owner rather than the Preferences menu beside it, gated on `manage_organization` ([D-087](decisions/D-087.md)); the path was proven first; then `Practice -> Practice settings` and Practice itself were removed. The surface issues activation links, and the constraint that its new home must not be reachable more loosely than the old one is met by a stricter gate, with the `403` asserted rather than the hidden control trusted.

### UI-6d — HR: everyone's own record, and a boundary around everyone else's

Status: **Verified complete** for the authority boundary, the self-service record, and both presentations. Assignment UI is not built.

Owner direction, 2026-09-21: *"Everyone should have an HR tab, but only manager and owner / HR personal has access to other employees. The rest will have access to what is designated for them. Most likely insurance, licensing timeline and deadlines, coachings, goals, etc. It is assigned by office manager or owner."* Recorded as [D-086](decisions/D-086.md), which amends D-085's Staff/HR placement only.

- **Why this was urgent.** The `hr` module rendered a hard-coded roster of every employee's NPI, DEA number, license expirations, malpractice policy and FTE to any authenticated user, with no permission check. Nothing real leaked because the roster was fixture literals — but a screen whose only protection is that its data is fake cannot later be given real data.
- **Authorization.** New `manage_hr` permission, held inherently by organization owners and managers and grantable by them to a specific member through `organization_memberships.hr_access`. Clinical role grants nothing: a provider — the highest clinical role — is refused the directory. A member's own record needs no permission at all. Refusals are `403` with an explicit message, never an empty directory.
- **Data.** `hr_records` and `hr_record_items` (migration `2026-09-21-001-hr-records-and-designation`). One item table with an open category rather than four tables, because insurance, licensing deadlines, coachings and goals differ in what they mean to the practice, not in what the record stores — and the owner said "etc.".
- **Presentation (both, per the owner).** HR is a major workspace in the `+` launcher and a companion pinned to the right rail by default, reaching the same records through the same service. The companion shows only the viewer's own deadlines, soonest first; the directory is the workspace's job. Home's three major entities are unchanged.
- **Reaching existing layouts.** The `appliedRailBackfills` mechanism built for UI-5 now carries a list, so a saved rail that predates HR receives it once, beside Communication, and a later unpin still sticks.
- **Honesty.** The workspace states that credentialing and primary-source verification are not configured, and that the dates shown are what the practice recorded rather than verified status. License and DEA numbers are not invented in the synthetic fixtures; they read as pending verification.
- **Practice decomposition.** With HR owning the capability, `Staff directory` left the Practice menu (UI-6d). Practice now holds only `Practice settings`.
- **Evidence:**
  - Unit: `tests/hr-access-boundary.test.ts` — own record for all four personas; directory for owner, manager and designated member; refusal for an undesignated provider at both the directory and a named colleague; the self case still resolving through the call that refuses others; the designation granting `manage_hr` and *not* `manage_organization` or `view_financial`; and revocation taking the access but not the member's own record.
  - Browser: `tests/browser/hr-workspace.spec.ts` (6/6) — no People tab rendered for a provider, a 403 at the API rather than an empty list, owner and designated-member access, the companion's deadline ordering and escalation, and expand/redock with the rail reachable.
  - `tests/browser/practice-decomposition.spec.ts` (11/11) and `workspace-catalog`, `workspace-open-launcher`, `workspace-layering`, `prototype-containment` green.
  - Inner loop: `npm run check` (419/420 unit tests; the one failure is the pre-existing date-dependent defect below) and `npm run build`.
- **Assignment UI:** delivered as UI-6e below. At the close of UI-6d the service and schema supported assignment and the screens did not; that gap is now closed.

### UI-6e — HR assignment: creating records, assigning items, granting the designation

Status: **Verified complete** at working tree on 2026-09-21, from `3fa7500`.

UI-6d left HR readable and bounded but read-only: the service and schema supported
assignment, no screen did, and every record came from the seed. This closes that.

- **Two write authorities, not one.** D-086 named the owner's rule — "it is assigned by
  office manager or owner" — and implementing it forced the distinction the ADR now
  records. *Assigning* (setting up a record, adding an item) takes `manage_hr`: owners,
  managers, and a designated HR administrator, because doing HR administration is what
  the designation is for. *Designating* takes `manage_organization`: owners and managers
  only. A designated HR administrator can assign all day and cannot designate anyone —
  an access grant that reproduces itself without an administrator is not a boundary.
  A member holding neither cannot author HR material at all, including their own, which
  is the ADR's "an employee does not author their own HR record".
- **Refused, not disabled.** The designation is refused outright for an owner or
  manager, who already hold HR access inherently. A toggle that appeared to grant what
  is already held, and to revoke what it cannot take away, would be lying about who can
  read personnel data.
- **Separate acts, separately audited.** Assigning an item to a member with no record is
  refused rather than quietly creating one: setting somebody up is its own act with its
  own `hr_record_assigned` entry, and a personnel record that appeared as a side effect
  would hide that it happened. Designation changes write `hr_access_designation_changed`.
- **The screen reflects a server decision.** `/api/hr` and `/api/hr/directory` now carry
  `canAssign` and `canDesignate` beside `canReadOthers`, so a control is never offered
  for an act the next request would refuse — and every write re-reads the directory
  rather than merging locally, so what the screen shows is what was stored.
- **A fixture must not outrank a real assignment.** The seed rewrote every HR record on
  every boot, which was harmless while nothing else could write and would have silently
  deleted assigned items and reset granted designations the moment something could.
  `hr_record_items.source` (migration `2026-09-21-002-hr-item-source`, backfilling
  existing rows to `seed`) makes the origin explicit: the seed refreshes only rows it
  authored, leaves records it has already created alone, and applies a designation only
  when first establishing a record. Without the backfill the seed would also have hit a
  primary-key conflict on the next boot of any existing database.
- **Deferred with reason:** editing and removing an assigned item. Personnel-record
  retention is its own decision — what may be deleted, by whom, and what survives — and
  guessing it inside an assignment slice is how a retention rule gets set by accident.
  A typo is currently corrected by assigning a replacement.
- **Evidence:**
  - Unit: `tests/hr-assignment-authority.test.ts` — who may assign and who may designate
    across all four personas; a member refused authoring even their own record; setting
    up a record that does not exist (`team-taylor`, the one seeded member without one);
    an item refused before its record exists; validation refusing an empty title, an
    impossible date (`2027-02-31`) and an unknown category; a target outside the
    organization refused; a granted designation actually opening the directory and a
    revoked one closing it; the refusal for an owner or manager; and a re-run of
    `ensureHrSeed` leaving assigned items, employment details and a granted designation
    untouched while still refreshing its own rows exactly once.
  - Browser: `tests/browser/hr-workspace.spec.ts` (10/10, previously 6) — an owner sets
    up a record, assigns an item and finds it stored as `source: "assigned"`; a
    designated HR administrator gets the assignment forms, no designation control, and a
    403 from `PATCH /api/hr/designation`; an owner grants the designation and the granted
    member's previously-403 directory returns 200, then revokes it; a provider is offered
    no assignment controls and is refused both writes at the API. The suite restores the
    designation it grants, so it passes twice in a row on the same database — verified.
  - Regression: `tests/browser/practice-decomposition.spec.ts` (11/11),
    `workspace-catalog` (5/5), `workspace-open-launcher` (5/5), `workspace-layering`
    (12/12), `prototype-containment` (2/2) — 34/34 together.
  - Inner loop: `npm run check` — 420/421 unit tests, 0 lint errors, 0 type errors. The
    one failure is the pre-existing date-dependent `intake-workflow` defect below,
    reproduced identically in a clean worktree at `3fa7500` without these changes.
    `npm run build` succeeded; `/api/hr`, `/api/hr/items`, `/api/hr/designation` and
    `/api/hr/directory` all register.
  - Visual, in the running app with synthetic data: 1440x900 and 1280x800 two-column,
    1024x768 with the form rows wrapping and labels intact, and 640x400 (≈1280 at 200%
    zoom) with the People grid stacking to one column. Two layout defects found and
    fixed rather than deferred: `.hr-field`'s `flex: 1 1 14rem` was being read as a
    *height* on the column-direction form and stretching the two-row Detail textarea to
    14rem, and `.hr-people-grid`'s bare `1fr` floored the detail column at its
    min-content width, scrolling the whole People tab sideways at 200% zoom. Empty
    (a member with no record), typical and crowded (five categories) volumes all checked.

### UI-6f — Organization administration moves to the account menu

Status: **Verified complete** at `86c4c02`. Recorded as [D-087](decisions/D-087.md),
which amends D-085's "Settings to profile/preferences".

The additive half of UI-6's last child, taken from the diagnosis above: there was no
three-way split to make, so this is a rehome and a rename.

- **Where it went, and why not Preferences.** The account menu, beside the
  server-verified identity every clinical action uses — not the Preferences menu next to
  it, which owns workspace layout. Putting the administration of accounts and access
  inside the layout menu would have rebuilt the preferences-versus-administration
  conflation the diagnosis dissolved. It is not a Home entity and not a major `+`
  workspace, so the shell invariants are untouched: Home stays Clinical, Billing, Brand.
- **The same path, not a lookalike.** The entry issues `openGlobalModule("settings")`,
  the command the menu entry issued, so focus-existing singleton behaviour comes with it
  rather than being reimplemented.
- **Offered only to whoever may use it.** Rendered when the session's permission list —
  the server's own answer, from `permissionsForActor` via `/api/auth/me` — holds
  `manage_organization`. That is not the boundary: `/api/organization/members` refuses
  with a `403` either way, and the tests assert the refusal rather than trusting the
  hidden control. It matters here because provisioning mints an **activation link**, a
  response carrying a secret; the new home is reachable *more* strictly than the old
  menu entry, which rendered for everyone.
- **The rename.** "Organization administration" in the tab, the workspace header and the
  account menu; "Organization" where a short label is needed. The tool registry's
  "Settings / Preferences and account" was part of why this looked like a preferences
  screen. The module id stays `settings`: saved rails and the persisted module view name
  it, and renaming what a thing is called is not a reason to invalidate a workspace.
- **Evidence:**
  - Browser: `tests/browser/practice-decomposition.spec.ts` UI-6f (5/5) — an owner opens
    it from the account menu and the roster loads; re-opening focuses the existing tab
    rather than stacking a second; the entry is reachable and operable from the keyboard
    alone (avatar, Enter, Tab, Enter), which the migration invariants require of any
    replacement path; a member is not offered the entry; and both the roster read and
    provisioning refuse that member with a `403`.
  - Inner loop: `npm run check` — 420/421 unit tests, 0 lint errors, 0 type errors; the
    one failure is the pre-existing date-dependent `intake-workflow` defect below.
  - Visual, in the running app with synthetic data: account menu and workspace at
    1440x900, 1280x800, 1024x768 and 640x400 (≈1280 at 200% zoom). Screenshots under
    `test-results/ui6-*`. Two defects on this surface found and fixed rather than
    deferred: the "Add someone" button drew `person_add` twice, because `Button`'s own
    `icon` prop was passed alongside a child `Icon`; and `.staff-table-scroll` is a grid
    item, whose default `min-width: auto` is its content, so the wrapper grew to the
    table's width and its `overflow-x: auto` had nothing to scroll — at 200% zoom the
    practice-role and account controls ran off the right edge unreachable. `min-width: 0`
    lets it shrink and scroll.

### UI-6g — Practice settings, and Practice, leave the top navigation

Status: **Verified complete** at working tree on 2026-09-21, from `86c4c02`.

The subtractive half, taken only after UI-6f proved the account menu reaches the same
module. With its last child rehomed the group held nothing a clinician could open, so the
group went with it.

- **What was removed:** the `practice` group and its two items. Reports needed no home —
  the tool registry calls it `planned` and the menu filtered on that, so it never
  rendered a destination.
- **What stayed:** the `settings` module, its renderer, and its registry entry. This
  retires a menu entry, not a capability.
- **Tests moved with the product, not around it.** Assertions that asked "is this still
  in the Practice menu?" became unanswerable, and an unanswerable assertion passes for the
  wrong reason. They now read the whole top navigation with every menu expanded and assert
  the label is offered nowhere — a stricter question than the one they replaced. The UI-5
  source scan in `tests/communication-companion.test.ts` listed `practice` among the
  groups Team's retirement had to leave standing; it now asserts the group is absent, so a
  regression that restored it still fails there.
- **Evidence:**
  - Browser: `practice-decomposition` (16/16), including "Practice itself is gone, and
    nothing it held is stranded" — no work menu offers Billing, Website, Social media,
    Staff directory, Practice settings or Reports, and Clinical, Calendar, Intake and
    Dashboard remain. Regression across `workspace-catalog` (5/5),
    `workspace-open-launcher` (5/5), `workspace-layering` (12/12),
    `prototype-containment` (2/2), `team-retirement` (4/4) and `hr-workspace` (10/10) —
    54/54 together.
  - `tool-navigation.spec.ts` keeps the narrow-viewport menu-fit check on Clinical, and
    its "Reports is filtered out" assertion is now navigation-wide: a destination with
    nothing behind it is offered nowhere.
  - Inner loop: `npm run check` — 420/421 unit tests, 0 lint errors, 0 type errors, the
    same pre-existing failure. `npm run build` compiled successfully.
  - CI at `fb15e1e`: the `validate` job **failed** at *Clinical integration tests*
    (`npm test`). Lint and Typecheck passed; *Production build* and *Browser workspace
    verification* were **skipped** as a consequence rather than run and failed. The same
    step failed at `3538814`, a documentation-only commit, so this is the open defect
    below and not a UI-6 result — but it does mean this slice's build and browser evidence
    is local-only. The job log needs an authenticated download, so the failing test is
    identified from the local run of the same command on the same tree rather than read
    off CI. CI's verdict becomes meaningful again once the fixture repair lands, which is
    the first reason it is queued ahead of UI-7.

### UI-7 — Decompose Clinical one child at a time

Status: **In progress.** UI-7a, UI-7b and UI-7c are complete at working tree on
2026-09-21, from `b8abf78`. Prescribing has a decided owner and no proven one, so its
menu entry and the group stay.

| Clinical child | New owner | State |
| --- | --- | --- |
| Patients | The `+` launcher (and its Recent patients list) | **UI-7a done** — menu entry removed |
| Documents | The `+` launcher, which now reaches the practice Documents queue | **UI-7a done** — the route was repaired first, then the menu entry removed |
| Tasks | The right companion, whose expanded canvas is the practice queue itself ([D-089](decisions/D-089.md)) | **UI-7b done** — the companion was made a replacement first, then the menu entry removed |
| Labs | The `+` launcher, beside the other practice queue ([D-090](decisions/D-090.md)) | **UI-7c done** — the launcher was exercised against the queue's own counts, then the menu entry removed |
| Prescribing | The right companion ([D-090](decisions/D-090.md)) — decided, not built | Open, UI-7d. Blocked on being able to drive a non-empty queue; the entry stays until parity is verified |

- **UI-7a — Patients and Documents.** Both were already offered by the `+` launcher, so
  this looked like a parity proof with nothing to build. Patients was: the launcher issues
  `nav.openPatient` exactly as the menu did, and additionally restores the chart's last
  section and closes an open module, so the replacement is a superset of the command it
  replaces rather than a lookalike.
- **Documents was not, and the gate caught it.** The launcher's Documents opened nothing.
  Neither did the menu's. Neither did the menu's Labs. Diagnosed to
  `WorkspaceNavigationProvider`: `openGlobalModule` set the active module and then
  dispatched `ehr-switch-view`, and the provider's own listener for that event held a
  branch that set the active module back to `null` for exactly `documents` and `labs`.
  `use-persistent-workspace-tabs` held the matching branch. The premise — that the two are
  chart surfaces rather than module workspaces — is half right: the chart has Documents
  and Labs *sections*, and the practice has Documents and Labs *queues*. Nothing dispatches
  the event for the sections, so the branch only ever cancelled the command that emitted
  it. Both practice queues were unreachable from every surface in the shell from `948f003`
  (2026-09-18) until this slice. Removing both branches restored them; being ineligible for
  a tab is already `isTabEligibleModule`'s answer and does not need a second, contradictory
  expression as a refusal to open. The rule this violated is recorded as
  [D-088](decisions/D-088.md), amending D-081.
- **This closes the dead end CB-5 recorded** as "Labs and Documents are unreachable from
  navigation … P6 dead-end work, tracked separately". CB-5 had the symptom and the
  location right; the cause was a shell regression three days old, not missing queue work.
- **The count came with the destination.** The Clinical menu showed a standing
  unreviewed-documents count, published by `PracticeQueueWorkspaceShell` at load, and it
  was the shell's only ambient view of that queue. `useWorkspaceBadgeCounts` is now the
  one place that count is read, the `+` launcher renders it beside Documents, and the
  browser test compares it against the queue's own `Received` and `Needs review` filter
  counts rather than a literal. `WorkspaceTabStrip` holds the subscription because the
  popover is mounted only while open and would miss a count published before it opened.
- **Repaired en route, in the visual matrix.** At the matrix's 200%-equivalent viewport
  (720x450) the launcher popover ran off the right edge and clipped its own close
  control: its positioning clamp reserved 360px while `.open-workspace-popover` draws
  `min(380px, 100vw - 16px)`. Pre-existing, and tolerable while the Clinical menu was a
  second way in — not tolerable once this popover is the only route to Patients and
  Documents. The clamp now uses the same 380, and a spec case holds the popover inside
  the viewport with its dismissal reachable.
- **Evidence:**
  - Browser: new `tests/browser/clinical-decomposition.spec.ts` (7/7) — the launcher opens
    a chart from Home and focuses the already-open chart instead of docking a second tab;
    it opens the Documents queue; the unreviewed count in the launcher equals the queue's
    own `Received` plus `Needs review`; Clinical holds exactly Tasks, Labs and Prescribing
    and each still opens its surface; Patients and Documents are offered nowhere in the
    top navigation; the popover fits a 720x450 viewport; and the group itself stays until
    its remaining children are rehomed.
  - This is the first browser coverage either practice queue has ever had, which is why a
    three-day-old regression survived lint, types and 425 unit tests.
  - `tool-navigation.spec.ts`'s keyboard case now expects Tasks first in the Clinical menu.
    The contract under test is the keyboard behaviour, not the membership list.
  - Inner loop: `npm run check` — 425/425 unit tests, 0 lint errors, 0 type errors.
    `npm run build` exits 0.
  - Full browser suite on a deleted database: **163 passed / 5 failed of 168**, against a
    recorded baseline of 155/5/1 of 161 at `832a6a7`. Same five specs, no new failure, and
    the previously flaky `communication-companion` passed without a retry. Because this
    slice changes the launcher, `workspace-open-launcher` was not assumed pre-existing: it
    passes 5/5 alone on a fresh database, and the five-spec subset returns **21 passed / 4
    failed** — the same four tests, and the same figures, the baseline records at both
    `44ece69` and `832a6a7`.
  - Visual matrix at 1440x900, 1280x800, 1024x768 and 720x450 (200%-equivalent), with the
    synthetic clinic day: launcher, Clinical menu, the restored Documents queue and Home.
    Labels stay visible, the menu's Tasks and Labs counts are intact, and the queue's own
    `Received (1)` and `Needs review (2)` agree with the `3` the launcher shows.

- **UI-7b — Tasks.** The directive lists Tasks among companion tools, a companion for it
  was already pinned to the right rail by default, and it was still not a replacement.
  The menu's Tasks opened the practice queue as a labelled workspace tab with filters,
  patient links, completion, removal and a standing open-task count. The companion could
  add and tick; it could not filter, could not remove, could not reach a linked chart,
  had no expanded presentation at all, and called itself a "Personal clinical action
  list" while `GET /api/tasks` returned the practice queue. Deciding ownership was the
  easy half; the parity was the work.
- **One queue, two presentations.** `PracticeTaskQueue` is the queue the `tasks` module
  rendered, lifted out and rendered by both the module and the companion's expanded
  canvas. Two lookalike task lists would have drifted, and the first thing to drift is
  what a count means. What belongs to a presentation stays with it: each caller owns its
  filter and draft, and each supplies `onAddTask`, because a task added beside a chart is
  that patient's and one added from the practice queue is the practice's. Completing and
  removing announce `ehr-tasks-updated` after the server saves, and every surface showing
  the queue reloads from that one event — verified in a browser by adding from the
  expanded companion and watching the docked list, the module's filters and the rail's
  count move together, then removing it and watching them move back.
- **The tab came too.** A companion overlay cannot be a persistent labelled tab that
  survives reload beside an open chart, which is what the menu's Tasks opened. The
  companion therefore carries `Open Full Tasks Workspace`, the control HR and the compact
  Calendar already use, and the `tasks` module keeps the routes the omnibox planner,
  Clinical AI and the Communication companion already use. Nothing about this slice makes
  the module a second implementation: it renders the same component.
- **The count followed the destination**, by UI-7a's rule. `useWorkspaceBadgeCounts` is
  unchanged; the companion rail now reads it, and the open-task count the Clinical menu
  used to carry sits on the rail's Tasks button. The browser test compares it against the
  queue's own `Open (n)` rather than a literal.
- **Repaired en route.** Expanding any companion while a module workspace was open
  painted it *behind* the module — `--z-chrome-base` (18) against
  `--z-global-workspace` (28) — so the clinician saw nothing happen. Pre-existing since
  UI-4 and invisible while no companion owned a destination that also has a module tab.
  An expanded companion is now `--z-companion-expanded` (30), above the workspace it was
  expanded over and below every popover and menu.
- **Corrected with the move:** the docked panel's subtitle. It named a personal list;
  the endpoint returns the practice queue, and the panel is now the surface that owns it.
- **Evidence:**
  - Browser: `tests/browser/clinical-decomposition.spec.ts` gains a UI-7b describe (6
    tests, 13/13 in the file) — the expanded companion carries compose, all four
    filters, completion and removal with the rail still reachable; the rail's count
    equals the queue's own `Open`; a draft and a chosen filter survive expand, redock
    and expand again; Escape redocks before it dismisses; an add moves the queue and the
    count together and a removal puts both back; and the companion still opens the Tasks
    workspace tab. Tasks is then checked to be offered nowhere in the top navigation, and
    Clinical is checked to hold exactly Labs and Prescribing, each still opening.
  - `tool-navigation.spec.ts` exercises Prescribing where it used to exercise Tasks, and
    its keyboard case expects Labs first. The contracts under test — a menu destination
    opening over the workspace without taking the chart's tab away, and ArrowDown
    reaching the first child — are unchanged.
  - `ui-system.spec.ts` reaches the queue through the companion, expanded, the way its
    `railTool` helper already reached the Inbox through the Communication companion after
    UI-5. Its two task cases are the shared interaction system's own gate — a disabled
    control that says why, a filter that announces its pressed state and answers the
    keyboard — and they now hold on the surface that owns the queue. **They failed first.**
    A full run before this change returned 7 failures rather than the baseline's 5, and
    the two extra were these: the helper was still opening the Clinical menu. That is the
    mechanism the handoff warns about, working: a known-failing family is not a waiver,
    and every failure gets attributed before it is dismissed.
  - Unit: new `tests/task-queue-ownership.test.ts` (4/4) holds the ownership invariants
    the browser cannot see: the Clinical group offers exactly Labs and Prescribing;
    neither the module nor the companion grows its own queue rows; a saved change is
    announced and both surfaces subscribe; and a reload does not re-announce, which is
    what keeps the listeners from feeding each other.
  - Inner loop: `npm run check` — 429/429 unit tests, 0 lint errors, 0 type errors.
    `npm run build` exits 0.
  - The patient binding was checked by hand rather than assumed, because it is the one
    behaviour the two callers deliberately do differently: with David Kim's chart open,
    a task added from the docked box came back from the API bound to `david-kim` and due
    Today, while one added from the expanded queue is a practice task. The rail count
    moved with each and returned when the task was removed.
  - Full browser suite on a deleted database: **169 passed / 5 failed of 174**, against a
    recorded baseline of 163/5 of 168 at `e4ac7cd`. Same five specs, no new failure, and
    the six added tests pass. Because this slice changes the companion rail, which nearly
    every spec renders, `workspace-open-launcher` was re-checked rather than assumed: it
    passes 5/5 alone on a fresh database, and the five-spec subset returns **21 passed / 4
    failed** — the same four tests, and the same figures, the baseline records at both
    `44ece69` and `832a6a7`.
  - Visual matrix at 1440x900, 1280x800, 1024x768 and 720x450 (200%-equivalent): the
    expanded companion fills the canvas at every size with the rail and its count still
    on screen, and the docked panel keeps its compose box, its list and its workspace
    escalation at 720x450.
- **Deferred from this slice with reason:** one Escape press dismisses both the expanded
  companion and an open module underneath it. Recorded under the migration directive
  above; it needs a shared topmost-layer rule rather than another per-surface listener.

- **UI-7c — Labs, and the decision Prescribing could not be given.** The queue entry
  named both children. Exercising them separated them: one was UI-7a repeated, and the
  other could not be finished at all.
- **Labs is Documents' twin.** The same `PracticeQueueWorkspaceShell` renders both,
  neither is eligible for a workspace tab, each publishes a standing count, and each row
  opens the patient's chart at the matching section. Nothing about it argued for a
  different surface from the one Documents reached, so it is offered beside Documents in
  the `+` launcher and the unacknowledged-result count moved with the destination. The
  catalog entry reads "practice results awaiting acknowledgement" rather than "Labs",
  because the chart has a Labs *section* and the practice has a Labs *queue* — treating
  those as one thing is the mistake [D-088](decisions/D-088.md) records.
- **This time the replacement worked.** Unlike UI-7a's Documents, the launcher route
  needed no repair: D-088 had already removed the branch that cancelled
  `openGlobalModule("labs")`, and the launcher's Labs opens the queue through the same
  controller command the menu issued. What the slice added was the catalog entry, the
  launcher's "already open" reading for a module that cannot hold a tab, and the count.
- **Prescribing was decided and not implemented**, which is the honest half of this
  slice. [D-090](decisions/D-090.md) settles that its owner is the right companion, and
  argues it from the prescribing workflow: every action `PrescriptionOperationsWorkspace`
  offers is gated on the patient's chart being the *active* execution context; a
  full-canvas module and a chart cannot both own the active tab; therefore the queue can
  never execute its own actions from its own surface. The companion layer is the one that
  coexists with an open chart, and the per-patient half of the workflow already has a
  working owner in the chart's Medications section (`PatientPrescriptionWork`, which
  carries the same recovery actions and works because the chart is active by
  construction).
- **It could not be proven, so the entry stayed.** `prescription_transactions` is the
  queue's only source, and a transmission is refused before a transaction row exists when
  no adapter is enabled — verified in a browser by prescribing Bupropion XL 150 mg for
  Maya Chen and authorising it: the order reached `authorized`, `PATCH /api/orders`
  answered `External prescribing integration is not enabled for adapter
  drfirst-placeholder.`, and no transaction was written. The queue is structurally empty
  in any checkout of this repository, so its detail pane, patient-context gate, retry and
  evidence forms are unreachable. A companion built against that would be provable for
  the shell and unprovable for everything the menu entry reaches. Standing up a simulated
  transport to fill the queue is explicitly rejected, not merely skipped: it is the
  fabricated-transport-evidence failure AGENTS.md forbids, in the area where it is least
  acceptable.
- **Open defect, found here and owned by UI-7d.** "Activate patient chart" in the
  prescribing detail pane calls `openPatient`, which clears the active module and
  unmounts the workspace the clinician was working from, while every other control on
  that pane is disabled because `patientContextMatches` is false — as it always is from
  that surface. The tab survives so nothing is lost, but the recovery actions cannot be
  completed from the queue as it stands. The repair belongs to the move.
- **Evidence:**
  - Browser: `tests/browser/clinical-decomposition.spec.ts` gains a UI-7c describe (4
    tests, 17/17 in the file) — the launcher opens the Labs queue with its rows and its
    acknowledgement control, and Labs is offered nowhere in the top navigation; the
    launcher's count equals the queue's own `Needs review`; a second visit reports
    `Active` and does not grow a tab a non-tab-eligible queue cannot hold; and both
    practice queues are reachable from the one surface that now owns them, the second
    replacing the first rather than opening beside it.
  - `tool-navigation.spec.ts`'s keyboard case now expects Prescribing, the group's only
    remaining child, and additionally holds that the list still wraps rather than
    trapping focus. The contract under test — ArrowDown reaching the first child — is
    unchanged.
  - `ui-system.spec.ts`'s `railTool` fallback was re-pointed in comment only: it is
    called with `Inbox` and `Tasks`, both of which reach their companions.
  - Unit: `tests/workspace-catalog.test.ts` gains a D-090 case (the two practice queues
    are offered adjacently, Labs targets the labs module, stays a Clinical workspace, is
    findable by "results", and its description distinguishes the practice queue from a
    chart section) and its canonical-order case gains `labs`.
    `tests/task-queue-ownership.test.ts` now asserts the Clinical group offers exactly
    `prescribing`, so a regression that restored Labs to the menu still fails there.
  - Inner loop: `npm run check` — 430/430 unit tests, 0 lint errors, 0 type errors.
    `npm run build` exits 0.
  - Full browser suite on a deleted database: **173 passed / 5 failed of 178** — the same
    five specs the baseline records, no new failure, and the four added tests pass.
  - **An earlier run of the same tree returned six**, and the extra was reported rather
    than absorbed. `synthetic-visit`'s sign step timed out waiting for the signed
    record's Close button after the attestation was submitted. It passes alone on a fresh
    database (2/2), it passed in the repeat full run, and the base SHA `b8abf78` was
    re-run from a stash on a deleted database and returned exactly **169 passed / 5
    failed of 174** with `synthetic-visit` passing — so the failure is not this slice's,
    and it is not one of the recorded five either. It is a new intermittent under full-
    suite load, recorded in the open-defect section below rather than counted as known.
  - Because this slice changes the launcher, `workspace-open-launcher` was re-checked
    rather than assumed: with `workspace-catalog`, 10/10 on a fresh database.
  - Visual matrix at 1440x900, 1280x800, 1024x768 and 720x450 (200%-equivalent): the
    launcher carries nine destinations with Labs' count beside it, and at the
    200%-equivalent viewport it still sits inside the viewport (x 186, right edge 566 of
    720) with Labs and its count legible on scroll. The Labs queue keeps all four
    filters with their counts, its search, Refresh and a row's Acknowledge at 720x450.

#### UI-7d — Prescribing leaves the Clinical menu for the right companion, and Clinical leaves with it

Status: **Verified complete** — with one part explicitly unexercised, named below and in [D-092](decisions/D-092.md).

- **Why the companion, and why now.** [D-090](decisions/D-090.md) argued the owner from the workflow: every action the queue offers is gated on the patient's chart being the *active* execution context, a full-canvas module and a chart cannot both own the active tab, so the queue could never execute its own actions from its own surface. D-090 then declined to implement it because the queue cannot be made non-empty without a vendor. The owner decided on 2026-09-21 that the move should happen anyway — *"We don't need to buy DrFirst to get moved what is there"* — and [D-092](decisions/D-092.md) records both that decision and the reason the bar D-090 set was the wrong one: the Clinical menu reached the *same* empty queue, so parity, which is a comparison with the route being removed, was never at risk.
- **One component, two callers.** `PrescriptionOperationsWorkspace` gained a `presentation` prop and is rendered by both the `prescribing` module and the new `PrescribingPanel`, compact when docked and full when expanded. The companion is a container — header, workspace, escalation — and a unit test asserts it carries no second copy of the queue's retry or evidence rules. That is [D-089](decisions/D-089.md)'s contract, and here it is what keeps the unexercisable half from being a divergent copy.
- **The defect D-090 recorded is repaired by the move, in one path.** Before activating a chart, the queue asks for the Prescribing companion through a new general `WORKSPACE_OPEN_COMPANION_EVENT` — a no-op from the companion, and from the module the thing that stops `openPatient` unmounting the queue. The rail honours it only for a pinned tool, so an unknown id cannot conjure a panel. **The line is not exercised by any test**: reaching it needs a selected item. A source test asserts the ordering, which is the part a later edit could get wrong.
- **Nothing lost on the way out.** The `prescribing` module stays registered and the companion escalates to it, so a saved layout holding the tab is not stranded. A rail saved before the companion existed is backfilled with it — unlike the Communication and HR backfills this one prevents an outright loss of capability, because the Clinical menu was those layouts' last route — and a rail that already took the backfill and then unpinned it keeps that choice.
- **Clinical is gone.** Its last child had an owner first, which is the rule UI-6 followed to the end on Practice. Level 1 now holds Calendar, Intake and Dashboard as direct destinations and **no expandable group at all**.
- **What is proven, in a browser on a deleted database.** The companion opens docked and renders the authoritative queue's own summary counts, integration notice and empty state; expanded it holds the canvas with both panes while the rail stays reachable (RIGHT-05); Escape redocks before dismissing; the workspace tab still opens and renders the same component; Prescribing is offered nowhere in the top navigation. And the one that is the whole argument: **the queue stays on screen while a patient chart is the active tab**, with the shell resolving that tab to the patient — the precondition every recovery action reads, which a full-canvas module can never produce.
- **What is not proven, and cannot be here.** The detail pane, the patient-context gate's own controls, retry, and the three evidence forms. Each needs a row in `prescription_transactions`, and a transmission is refused before one is written when no prescribing integration is enabled. No transport is simulated to produce one; D-090's rejection of that stands and is the part D-092 does **not** amend. The honest, vendor-free route to exercising them is recorded under the migration directive above, along with the two things that must happen first.
- **Eight specs used the Clinical menu as their example of "a tool menu", and it is now the only kind of surface the work navigation does not have.** None of them was testing Clinical: they were testing popover dismissal, keyboard access, layering and the destination enumeration, and Clinical was the handy instance. Each was moved to a surface that still exists rather than deleted or loosened — the popover taxonomy in `dismissal` to the account menu, which carries the same three exits; `tool-navigation`'s "a destination opens over the workspace without taking the chart's tab away" to a direct destination; its arrow-key list to the `+` launcher, where `workspace-open-launcher.spec.ts` already owns that contract; the rest to the new enumeration. **A consequence for UI-8:** with no group carrying `items`, `ToolNavigation`'s popover machinery — the `open` state, the panel ref, the placement and the panel's keyboard handling — is now unreachable. It is deliberately left in place here rather than deleted mid-slice, and removing it belongs to UI-8.
- **Evidence.**
  - Unit: `tests/prescribing-queue-ownership.test.ts` (3 new) — one queue not two, the companion registered/pinned/backfilled, and the companion asked for before the chart is activated. `tests/workspace-personalization.test.ts` gains the deliberate-unpin case. `npm run check` **exit 0, 434/434, 0 lint errors, 0 type errors**; `npm run build` exit 0.
  - Browser: `tests/browser/clinical-decomposition.spec.ts` 23/23 on a deleted database, including six new UI-7d cases and the two UI-7a group tests rewritten for Clinical's removal. Full suite on a deleted database: **185 passed / 0 failed of 185**, `npx playwright test` exit 0 — the eight specs the removal broke were repaired first and re-run together (46/46, then 5/5) before the full run.
  - Visual matrix at 1440x900, 1280x800, 1024x768 and 720x450 (200%-equivalent): docked, the summary wraps and the panes stack; expanded, the two-pane layout returns with the rail still clickable; at 720x450 the panel sits inside the viewport (left 288, right 668 of 720) with its close control at 652 and the escalation reachable on scroll.


### UI-8 — the work-navigation row leaves the top bar, after its last destination has an owner

Status: **Implemented and verified at the slice level; the full browser suite was not re-run here** — see Evidence, which says exactly what was run and what was not.

- **The owner's report is what scheduled this, and it named the defect precisely.** Four surfaces reached the same functional domains — the top bar's text links, the workspace tabs, the `+` launcher, and the right icon rail — so `Intake` existed simultaneously as a persistent top-bar link and as an open tab with no deterministic answer to what clicking the link would do: open a tab, focus one, or replace the canvas. The instruction was to remove the static `Calendar | Intake | Dashboard` links and reserve row one for global identity, the omnibox, system utilities and the user profile. That is also [D-085](decisions/D-085.md)'s target and this roadmap's UI-8, so the decision recorded in [D-094](decisions/D-094.md) is about *sequencing the last removal*, not about whether to make it.
- **Dashboard is the whole substance of the slice, and it is the reason the row could not just be deleted.** UI-7a's lesson is that a destination already listed in the launcher proves nothing, and the inverse holds too: of the three links, **Calendar and Intake had launcher entries since UI-1, and Dashboard had none.** Its only routes were the link itself, its own tab while open, and Home's tile — which is labelled **Clinical**, not Dashboard. `closeDashboardTab` drops to Home, so a clinician who closed that tab and then lost the link would have been left recovering the practice dashboard from a tile named after something else. The entry went in first and the row came out after, which is the rule UI-5, UI-6 and UI-7 each followed one destination at a time.
- **Two catalog entries for one view, deliberately.** `workspace-catalog.ts` now holds `clinical` (Home's major-entity tile) and `dashboard` (the launcher's workspace), both resolving to `targetView: "today"`. Home still presents exactly three major entities and Dashboard is not one of them ([D-085](decisions/D-085.md) LEFT-01 is unchanged). The alternative was a launcher that hard-codes a destination the catalog does not list, which is the second truth the catalog exists to prevent; a unit test asserts the two entries resolve to the same view so they cannot drift.
- **What came out with the row.** `app/components/ToolNavigation.tsx` in full, including the popover machinery UI-7d recorded as unreachable and deliberately left for this slice; the `navigation` prop and `.topbar-navigation-slot` from `WorkspaceTopBar`; the row's rules and its grid column at every breakpoint; `--z-tool-navigation` from the stacking scale ([D-082](decisions/D-082.md)); the `.tool-navigation` observation in `useWorkspaceChromeGeometry`, which still observes the header the row sat inside; and `WorkspaceProfileMenu`'s `navigationTrigger` prop, which rendered Preferences as a `tool-menu-trigger` and was never passed `true` — removed with the class it named rather than left pointing at a selector that no longer exists.
- **What stayed, and why it is not an oversight.** `app/tool-navigation.css` now contains no tool-navigation rules — it is the two-level shell stylesheet, and mostly always was — and `three-row-shell` still names a two-row shell. Both are stale and both keep their names: they are cited by name across this document's evidence entries and in [D-091](decisions/D-091.md), the class is load-bearing across several hundred selectors, and renaming either trades readable history for tidy present tense. The file header says what it actually is.
- **One piece of dead code is named rather than removed.** `WORKSPACE_NAVIGATION_MENU_OPEN_EVENT` now has one dispatcher and one subscriber, both `WorkspaceProfileMenu`, and its subscription condition can no longer be true. Deleting a typed shell event belongs to the owner of that seam ([D-081](decisions/D-081.md)), not to a presentation cleanup — the same reasoning UI-7b used to defer the Escape-arbitration rule. It is recorded here so a later slice starts from it rather than rediscovering it.
- **Seventeen specs reached a destination through the row; none of them was testing the row.** They were testing Calendar geometry, companion viewports, intake workflow, layering and dismissal, and the row was simply the shortest route on screen. Those now call a shared `openWorkspaceFromLauncher` fixture, which takes the durable route. The specs that *were* about the row were rewritten rather than deleted or loosened, and each got stronger in the same move: `tool-navigation`'s desktop-fit walk of the row became "row one holds three regions and no navigation, at four widths"; its keyboard case became "the chrome a clinician is left with is keyboard-reachable at 640px, and the launcher opens Intake with no pointer at all"; `team-retirement`'s "Team is missing from the row" became "there is no row, so nothing can be restored to it"; both decomposition specs' `topNavigationDestinations` became `topBarDestinations`, which keeps every `not.toContain` and adds the case where a rehomed destination returns to the top bar by some other means; `workspace-open-launcher`'s UI-1 migration guard ("the old row still works") became its discharge ("the launcher is the route the row used to be").
- **Two tests were counting arrow presses.** Adding Dashboard above Calendar moved the launcher's second row, and `workspace-open-launcher`'s "ArrowDown then Enter opens Calendar" opened Dashboard instead. It failed as a missing Calendar tab — a symptom two steps from the cause. Both that case and the new keyboard case now assert `aria-selected` on the highlighted item before pressing Enter, so a future catalog reordering fails as a wrong highlight instead of silently opening a different workspace.
- **Evidence, stated as what was actually run.**
  - Unit: `npm run check` **exit 0 — 439/439 tests, 0 lint errors, 0 type errors.** `tests/workspace-catalog.test.ts` gains the D-094 case asserting Dashboard's presence, its target view and that it agrees with Home's Clinical tile; `tests/communication-companion.test.ts` and `tests/task-queue-ownership.test.ts` had their source assertions rewritten against the removed component.
  - Browser, on a deleted database, **by spec rather than as a full run**: `tool-navigation` 5/5, `workspace-open-launcher` 6/6, `workspace-catalog`, `clinical-decomposition`, `team-retirement`, `workspace-layering`, `ui-system` and `dismissal` together 71/72 → the one failure was `practice-decomposition`'s "nothing it held is stranded", which still asserted the row's three remaining labels; repaired and re-run 16/16. Then `calendar-event-lifecycle`, `companion-viewport`, `intake-workspace`, `patient-administration` and `communication-companion` together 24/24.
  - **Not run: the full suite in one pass, and `npm run build`.** Every spec this slice changed was run and passed, and so were the specs adjacent to them, but "185/185" is a figure about a full run and this slice does not have one. Re-run `npx playwright test` on a deleted database before quoting a suite figure, and note that `synthetic-visit` remains the recorded intermittent.
  - Visual, at 1440x900, 1024x800, 820x800 and 640x800 in a live dev server: row one holds the brand/Home block, the omnibox and the gear plus avatar at every width, with the omnibox taking the width the row used to occupy and nothing wrapping. Closing the Dashboard tab drops to Home; the launcher then offers Dashboard without an "Open tab" badge, opening it restores the tab as the active view, and choosing it again focuses the one tab rather than docking a second.

#### UI-8b — the companion rail stops duplicating Calendar, because the clinician can finally unpin it

Status: **Verified complete** — driven through the product's own control, with the local cache cleared so the result could only have come from the server.

- **UI-8 deferred this and the deferral was half right.** [D-094](decisions/D-094.md) argued that the rail's Calendar, Chat, Tasks and Settings are companion tools in the [D-085](decisions/D-085.md) lifecycle rather than workspace destinations, so the overlap might only need to be made legible. Driving the surface found something narrower and more concrete: Calendar genuinely is both a workspace destination and a rail companion, and **the clinician could not stop it being both.** The rail offers "Unpin from Companion Rail", it removes the icon, the write reaches the server — and the next load puts it back.
- **The other three on the owner's list are not duplicates, and were checked rather than assumed.** Tasks belongs to the companion by [D-089](decisions/D-089.md) and is deliberately absent from the `+` launcher; Communication is a panel-only tool with no workspace peer; the gear is in row one, not the rail. Calendar was the one real instance.
- **Two independent mechanisms put it back, and both had to go.**
  1. `rails.right` was spliced to re-insert Calendar at the head of **every read** — in `preference-engine.ts` and twice more in `workspace-tools.ts`. It predates `RAIL_BACKFILLS`, whose own comment states the rule it was breaking: *"Each runs once and is recorded, so a clinician who then unpins the tool keeps that choice."* Calendar is an ordinary backfill now. Every existing rail still receives it, once, at the head, and the receipt is recorded — so nobody loses the tool and an unpin is final.
  2. Removing the splice was **not enough**, and this is the part worth keeping: `PUT /api/preferences` still accepted a `rails` field from writers that had only ever read one. A page seeded from defaults — empty local cache, or a hydration that had not landed — PUT those defaults straight over the rail the clinician had just changed. That is [D-088](decisions/D-088.md)'s shape again: two writers for one field, disagreeing. `workspaceState` already had the carve-out for exactly this reason **in the same handler**; the rails did not.
- **The carve-out is per field, because ownership is per field.** Protecting the whole `rails` object broke the companion panel remembering which tool was open: `activeRightPanel` and `rightPanelOpen` live under `rails` too, the rails endpoint does not accept them, and the display-preferences path is their only writer. The existing personalization test caught it on the first run, which is the reason only `left`, `right`, `leftWidth` and `rightWidth` are taken from the stored record.
- **A consequence that had to be fixed with it.** `resetWorkspaceLayout` — the fixture promising every spec the default starting point — reset preferences through the whole-record endpoint, which now correctly ignores rails. It resets them through the rails endpoint as well, which is the same pair of writes the product's own "Reset defaults" already performed. Without that, the new browser test poisoned the shared database for its own next run, which is the failure mode CB-0b fixed for `care-completion` ([D-091](decisions/D-091.md) decision 3) and which caught this one on the second run rather than in production.
- **What this does and does not settle.** It does not decide whether a tool may appear on both the rail and the `+` launcher; it decides that when one does, the clinician chooses. Calendar stays pinned by default because that is what every existing layout holds — the difference is that the default is now a default rather than a fixture.
- **Evidence.**
  - Unit: `npm run check` **exit 0 — 441/441, 0 lint errors, 0 type errors.** Two new `mergeStoredPreferences` cases (a rail that never saw Calendar receives it at the head; an unpinned Calendar stays unpinned), and the write-ownership assertions added to the existing server round-trip test. **The write-ownership test was confirmed to fail without the route change** rather than assumed to cover it.
  - Browser, deleted database: `rail-personalization` 3/3 including the new end-to-end case — unpin through the rail's own context menu, clear `localStorage`, reload, and assert both the rendered rail and `/api/preferences` agree Calendar is gone — then re-run 3/3 to prove the spec restores what it changes. `team-retirement`, `communication-companion`, `companion-ai`, `calendar-companion-panel`, `companion-viewport`, `ui-system`, `workspace-open-launcher` and `tool-navigation` together **32/32**, run because the fixture change touches every spec.
  - **Not run: the full suite in one pass.** Same caveat as UI-8 above.

#### UI-9 — the foreground canvas owns peripheral context

Status: **Verified complete** for the owner's context-desynchronization report.

- **The two screenshots exposed one missing rule.** The selected patient tab stayed
  remembered while Intake was in front, and that background patient was passed directly
  to every companion. The Layout Customizer separately defaulted its own local state to
  Today regardless of the canvas that opened it. Both were context authorities competing
  with the tab/canvas the clinician could actually see.
- **One derived canvas identity now governs both.** A foreground module wins over a
  remembered chart; otherwise the active patient tab and section win, followed by the
  ordinary workspace views. Patient id is absent from workspace contexts rather than
  retained invisibly. The shell derives the context once and feeds the existing
  companion lifecycle, omnibox and customizer — no second router or per-tool patient
  store was introduced ([D-096](decisions/D-096.md)).
- **Visible behavior.** Communication changes from `Context: Maya Chen · Overview` to
  `Context: Intake workspace` when Intake comes forward. Patient-bound Messages refuses
  chart work on a practice canvas with a recovery sentence. The customizer names the
  current canvas and opens Documents on Patient Chart, Encounter on Encounter Note,
  Today on Today Dashboard, and practice workspaces on Density & Shell. Explicit
  recipient/patient choices inside tools survive and remain visible; only implicit
  background-chart inheritance is removed.
- **Layer improved.** This is a deeper presentation/workspace-context and clinical-safety
  rule, not a screenshot-specific patch. Clinical record authority is unchanged; CB-6's
  broader dock/expand/pop-out lifecycle gate remains unfinished.
- **Evidence.** `npm run check` exit 0 (445/445 unit tests; lint and typecheck pass) and
  `npm run build` exit 0. `tests/workspace-canvas-context.test.ts` adds four rule-level
  cases. `tests/browser/workspace-context-alignment.spec.ts` passes 2/2 through the real
  Maya -> Communication -> Intake and Maya -> Documents -> customizer flows. The visible
  context and recovery controls remain reachable at 1440x900, 1280x800, 1024x768 and
  720x450. This is focused browser proof, not a full browser-suite recertification.

#### D-093 — the Prescribing companion picks a patient

Status: **Verified complete**, and unlike the queue beside it, exercised end to end.

- **The defect it repairs is one UI-7d shipped.** The practice attention queue is structurally empty in every checkout, so a companion whose only content was that queue offered a clinician nothing to do with a prescription. [D-092](decisions/D-092.md) named the queue's unexercisable surfaces and considered the matter closed; it did not notice that naming the gap still left a tool on the rail that does nothing. The owner's reaction on seeing it — *"Why have a medication order tab without it... I need to be able to pick a patient in the side canvas"* — is the report that found it.
- **Prescribing has two halves and only one needs a vendor.** The cross-patient queue cannot be populated without an enabled integration. A patient's own prescribing work — staged intents, ready to authorize, ready to send, awaiting an external outcome — is populated by ordinary clinical work, because **staging and authorizing need no adapter at all**; only transmission is refused. That half was already implemented and reachable only through the chart's Medications section. The selector reaches it.
- **One component, two callers, again.** Choosing a patient renders the same `PatientPrescriptionWork` the chart renders, so the two cannot disagree about what a clinician may do to a prescription. The panel stays a container and carries no copy of either queue's rules.
- **Picking a patient sets what the pane is about; it never tags a form.** There is still no patient control inside the composer, and there should not be — choosing who a half-composed prescription is for is how prescriptions land on the wrong chart. The selector chooses whose record the pane shows *before* anything is composed, and the binding is explicit the whole way down: `x-ehr-patient-id` on the read, an explicit `patientId` into `orders.openComposer` through a new `onOpenPrescribeFor` that deliberately does **not** reuse `onOpenOrderCart` (which resolves the active chart), and a server that re-derives the patient from the record and refuses a mismatch.
- **The pane says whose it is.** Identity per independently usable pane is an `AGENTS.md` rule and this is the case it exists for: the companion can be on one patient while another's chart fills the canvas. The pane carries name, MRN and DOB of its own, and states the mismatch in words when there is one. The risk is not that a clinician may choose a patient; it is that they may not notice which one is chosen.
- **`WORKSPACE_ORDER_CREATED_EVENT` was declared and never dispatched.** Staging now dispatches it, because this is the first surface where a clinician can stage an order and watch the same panel go on saying the patient has no prescribing history.
- **Evidence.** `npm run check` **exit 0, 438/438**; `npm run build` exit 0. Browser, deleted database: `clinical-decomposition.spec.ts` 30/30 including four new D-093 cases, one of which drives the whole loop — pick a patient while another chart is active, open the composer, confirm it is bound to the companion's patient and not the chart's, stage a real prescription through `/api/orders`, and watch it arrive in the companion's own list as "Ready to authorize". Visual matrix at 1440x900, 1280x800, 1024x768 and 720x450: at the 200%-equivalent the panel sits inside the viewport (right edge 668 of 720) with the selector, both identity actions and the escalation all reachable.
- **What it does not change.** [D-092](decisions/D-092.md)'s unexercised list stands exactly as written: the *practice queue's* detail pane, patient-context gate, retry and evidence forms still need a non-empty `prescription_transactions`. Nothing here simulates a transport.


## Validation baseline and cleanup sequence (CB-0 to CB-5a)

| Order / ID | Deliverable | Dependency / exit condition | Current state |
| --- | --- | --- | --- |
| UI-1 | Universal `+` Open workspace launcher | Opens/focuses Home, Calendar, Patients, Intake, Documents, Billing, Brand and recent work without duplicate tabs; old top nav untouched | Verified complete |
| UI-2 | Shared Home / `+` workspace catalog | One destination registry; Home = Clinical / Billing / Brand; Staff/HR excluded from major-app launchers | Verified complete |
| UI-3 | Communication companion alongside existing Team menu | New right-canvas route reaches implemented communication capabilities while Team remains | Verified complete |
| UI-4 | Expand/redock Communication canvas with state preservation | Dock/expand/redock/minimize lifecycle passes CB-6 state, focus, resize and restoration gates | Verified complete |
| UI-5 | Retire Team top-bar entry | Only after UI-3/UI-4 parity and browser coverage | Verified complete |
| UI-6 | Decompose Practice one child at a time | Billing/Brand/Staff-HR/Settings/Reports each have verified owners before Practice is removed | **Verified complete** — every child rehomed and proven first; Practice removed last (UI-6g) |
| UI-7 | Decompose Clinical one child at a time | Every clinical child has a verified workspace or companion owner before group removal | **Verified complete** — five children rehomed, Clinical removed last. UI-7d moved Prescribing to the companion on the owner's decision (D-092); the surfaces that need a non-empty queue are named as unexercised |
| UI-8 | Final two-level chrome cleanup | Brand/Home + omnibox + account above labeled tabs + `+`; no left rail | **Complete** — Dashboard got the launcher entry it lacked, then the row was removed with its component, stacking token and grid column (D-094). Verified per spec, not by a full-suite run |
| CB-0 | Restore the validation baseline | Diagnose the 409; checks, build, and browser baseline actually run | Verified complete |
| CB-0a | Unit suite stops sharing a schedule with the demo clinic day | `npm run check` green on any calendar day, with no fixture, shift or assertion changed | Verified complete |
| CB-0b | Browser suite stops depending on the calendar day, and on controls the product replaced | Every standing browser failure attributed to a named cause and repaired, or left with one named cause | Verified complete — full suite green at 179/179; the shared mutable database is named and scoped as the next repair |
| CB-1 | One trustworthy AI entry path | Shared planner/context/proposals; no canned companion facts | Verified complete |
| CB-2 | Honest external-service and preview states | No simulated operational success through either entry point | Verified complete |
| CB-3 | Readable Home chrome and Calendar state cues | Context-preserving tabs and non-color waiting state | Verified complete |
| CB-4 | Compact patient overview without information loss | Identity/action/alert inventory preserved in every pane | Verified complete |
| CB-5 | Schedule-first dashboard and compact queue filters | Unique facts/actions and saved layouts preserved; DASH-12 honored | Verified complete |
| CB-5a | Repair the browser validation baseline | The 17 remaining pre-existing spec failures diagnosed; booking-conflict group fixed at its cause | Verified complete |

### CB-0 — Reestablish a trustworthy validation baseline

Status: **Verified complete**
- **Diagnosis:** The 409 status on `tests/api-authority-boundary.test.ts:301` was caused by a fixture date collision. In `app/server/db/seed.ts`, seed fixtures are dynamically shifted to align with `practiceToday()`. When `practiceToday()` advanced to 2026-09-19, `apt-2` (10:30 AM – 11:15 AM) shifted directly onto 2026-09-19, conflicting with the test's hardcoded tentative booking at 11:00 AM – 12:00 PM. Moved the test fixture date forward to `2026-11-19` (outside the shifted fixture window), preserving the underlying scheduling conflict rules.
- **Related repairs:** `GlobalWorkspaceShell.tsx` was fixed to ensure withdrawn modules like `financial_integration` are displayed via `ModuleNotBuilt` ("not built yet") upon restore while clearing persisted state (`billing-containment.spec.ts`), and `dismissal.spec.ts` stray-click target was updated to `.browser-tabs` to avoid intercepting the unified Level 1 omnibox.
- **Evidence:** `npm run check` (381/381 tests pass, 0 lints/type errors), `npm run build` succeeds, and targeted browser suites (`billing-containment.spec.ts`, `dismissal.spec.ts`) pass cleanly.

### CB-0a — The unit suite stops sharing a schedule with the demo clinic day

Status: **Verified complete** at `44ece69` + this slice.

- **Diagnosis.** `app/domain/schedule-seed.ts` writes the demo clinic days against one anchor Friday (`2026-09-04`) and `seedDatabaseIfEmpty` shifts the whole set onto `practiceToday()`, so a first install never opens on an empty week. That shift made the unit suite's result depend on the date it ran. The fixture day advances one slot per day until it reaches a date some test wrote down as empty; on 2026-09-21 it reached `tests/intake-workflow.test.ts`, whose 2026-09-25 10:00 AM tentative hold met the shifted `apt-tue-1` and was correctly refused by `assertAppointmentSlotAvailable`. Reproduced at `44ece69` before any change: `AppointmentScheduleConflictError … conflictingAppointmentId: 'apt-tue-1'`.
- **Why not another date.** CB-0 repaired this same class by moving the colliding test's date forward to `2026-11-19`, which the fixture window would not reach until mid-November. It did not survive that long, because the window only has to reach *some* test: two days later it reached `intake-workflow`'s 2026-09-25 instead. Freezing the shift instead only changes whose turn it is, which was checked rather than assumed: with the fixtures written at the anchor and nothing else on the schedule, `appointment-encounter-link`'s `apt-morning` booking raises `AppointmentScheduleConflictError … occupies 2026-09-04 at 09:00 AM, conflicting: apt-1` — the seeded row is `completed`, and `completed` still blocks the schedule. Every variant that keeps a demo clinic day in a unit-test database keeps the collision; only the victim changes.
- **The repair, at the fixture boundary.** A unit-test database is created without the demo clinic day, so it holds exactly the appointments the test under it booked, on any calendar day. `shouldSeedDemoSchedule()` in `app/server/db/seed.ts` reads `NODE_TEST_CONTEXT`, which Node sets in every `--test` worker, so a single file run on its own opts out the same way `npm test` does — which matters, because that is how the failure reproduces. `EHR_SEED_DEMO_SCHEDULE` overrides it either way; `playwright.config.ts` sets it to `"1"` so the browser suite's server keeps the populated practice it drives, rather than inheriting a decision the unit suite made.
- **What did not change.** No assertion was weakened, skipped or rewritten. No fixture row, date, or shift arithmetic was edited: the same 14 rows still land on the same shifted days for development, production and the browser suite, and `seededScheduleDate()` is the same computation the inline shift performed, named so it can be tested directly. Only the roster, encounters, messages, tasks and audit fixtures are still seeded under test; the dated clinic day is the single thing withheld.
- **Evidence.**
  - Unit tests: `tests/seed-schedule-fixture-boundary.test.ts` (4 passed) — a unit-test database has no appointments while keeping its roster; an install still receives all 14 rows moved by one shared offset with clock times untouched; the seeded date is computed correctly across a month end and a leap day; and the opt-out applies to the unit suite only and is overridable in both directions.
  - Regression: `tests/intake-workflow.test.ts` passes. `npm run check` **exit 0, 425/425 unit tests, 0 lint errors, 0 type errors** — the first green inner loop since the collision began. `npm run build` (Turbopack production build) exit 0.
  - Browser seeding unaffected: after a run on a deleted database, `test-results/browser-ehr.db` holds all 14 demo appointments shifted onto 2026-09-21 exactly as before. Full browser suite on a deleted database: 155 passed, 5 failed, 1 flaky of 161, and the five failures reproduce identically at `44ece69` without this slice — see the open defect entry for the side-by-side.
  - Comment accuracy: two stale comments in `tests/appointment-encounter-link.test.ts` that described the seeded practice sharing the test's date were corrected. Neither is an assertion.

**Inspect/reuse:** `app/server/db/seed.ts` (`shouldSeedDemoSchedule`, `seededScheduleDate`), `app/domain/schedule-seed.ts`, `app/lib/practice-calendar.ts`, `playwright.config.ts`, `tests/seed-schedule-fixture-boundary.test.ts`.

**Does not close:** the browser half of the calendar-day-dependent defect, which has a different cause and is re-diagnosed under *Review evidence and open defects*. **Now closed by CB-0b, below.**

### CB-0b — The browser suite stops depending on the calendar day, and on controls the product replaced

Status: **Verified complete** at `fa5fb37`..HEAD.

- **Diagnosis, per failure rather than per family.** The standing browser failures were recorded as one defect — "the fixture week moves under its specs". Reproduced on a deleted database at `fd26cc3`: **172 passed / 6 failed of 178**, with four different causes. Three were specs left behind by changes that were themselves correct (`8a573ee`'s Home tile rename, `94cdc8e`'s calendar-companion consolidation); one was the fixture week; one was a real ordering defect in the `+` launcher; one is an intermittent that had already been recorded separately. The full attribution, with the commit behind each, is under *Review evidence and open defects*.
- **The fixture repair, at the same boundary CB-0a used.** `seededScheduleDate` now places each block of the demo set by the relationship it was written to express — the anchor's week in days, so today is always the anchor day; a later week that many weeks after today's week, keeping its authored weekday. Weekday identity of the anchor is deliberately not preserved, and [D-091](decisions/D-091.md) records why: an empty clinic day on a fresh install is the worse failure, and the fixture weekdays exist only in comments and row ids.
- **The launcher repair.** `OpenWorkspaceLauncher` offered `roster.slice(0, 5)` against a name-ordered roster, so whether a chart could be reached from the launcher depended on the patient's initial — and a chart that was already open but sorted sixth could not be focused at all, which is the one thing UI-1 promises. Open charts now come first, the active one at the top.
- **The shared-practice rule.** `care-completion` books real follow-ups into the demo practice's current week and now removes them again. Its origin visits stay: they are dated weeks in the past, carry the encounter the board reads, and sit outside every week another spec looks at.
- **What did not change.** No assertion was weakened, skipped or rewritten to clear a failure. The two specs whose Home tile moved keep their assertions exactly and change only how they name the control; the interval-jump test asserts more than the deleted version did; `tool-navigation` reaches the clinic day through `is-today`, which is what its own comment asked for. `tests/seed-schedule-fixture-boundary.test.ts` changed because it described the old placement: it now states both relationships and the property the browser case depends on.
- **Evidence.**
  - Unit: `tests/seed-schedule-fixture-boundary.test.ts` (4 passed). `npm run check` **exit 0, 430/430, 0 lint errors, 0 type errors**; `npm run build` exit 0.
  - Placement probe over **400 consecutive clinic days**: today is the six-visit clinic on every one, no slot collisions, and the patient with a visit today and one next week never lands twice in one displayed week.
  - Browser, deleted database: `dismissal` + `home-assistant` + `calendar-interval-jump` 15/15; `care-completion` + `tool-navigation` 9/9; `workspace-open-launcher` + `workspace-catalog` 11/11 with the new ordering case, which fails against the old ordering.
  - Full suite, deleted database: **179 passed / 0 failed of 179**, `npx playwright test` exit 0. An earlier full run in the same slice returned 177/1 of 178, before the launcher repair; its one failure is the case that repair addresses.
- **Inspect/reuse:** `app/server/db/seed.ts` (`seededScheduleDate`), `app/domain/schedule-seed.ts`, `app/components/workspace/OpenWorkspaceLauncher.tsx`, `tests/browser/workspace-fixtures.ts` (`clinicalHomeTile`).
- **Does not close:** the shared mutable browser database. Isolating it per spec is the next bounded repair; `synthetic-visit` remains intermittent under full-suite load until then.

### CB-1 — Unify AI companion truth with the existing planner

Status: **Verified complete**
- **Changes:** Refactored `app/components/companion/ClinicalAiPanel.tsx` to eliminate all canned facts (hardcoded Friday September 4 2026 briefing, fake schedule chips, fake overdue surveillance facts, and local synthesis ladder). Preserved deterministic workspace layout commands (`parseAiPreferenceCommand`) and split-screen actions. All clinical and schedule queries now route via `requestOmniboxPlan` through the single permission-aware boundary at `/api/ai/omnibox/plan` and render the shared `<OmniboxPlanCard>` (D-064). Implemented monotonic request ID and current-scope tracking to eliminate stale responses and prevent cross-patient bleeding during chart switches. When in schedule view (`isScheduleView`), active patient ID is explicitly omitted rather than borrowing the last active chart.
- **Evidence:** Extended `tests/home-assistant-grounding.test.ts` to include `ClinicalAiPanel.tsx` in `answerSurfaces` and verified zero clinical value literals, reference ranges, or local answer ladders exist across all answer surfaces. Added `tests/browser/companion-ai.spec.ts` testing companion panel opening, server planner routing, plan card rendering, workspace commands, and patient switching isolation. Ran `npm run check` (382/382 tests passed, 0 lint/type errors), `npm run build` (Next.js build succeeded cleanly), and Playwright tests (`home-assistant.spec.ts`, `companion-ai.spec.ts` all passed).

**Requirements:** CMD-01 through CMD-06, RIGHT-01/04, PAT-06, TRUST-01/03; D-064 remains governing.

**Inspect/reuse:** `app/components/companion/ClinicalAiPanel.tsx`, `app/components/home/ZenHomeWindow.tsx`, `app/components/OmniboxPlannerBridge.tsx`, `app/components/omnibox/OmniboxPlanCard.tsx`, `app/lib/omnibox-plan-client.ts`, `app/lib/use-omnibox-controller.ts`, `app/lib/use-workspace-voice-input.ts`, `app/api/ai/omnibox/plan/route.ts`, `app/server/ai/omnibox-planner.ts`, and permission-aware context assembly.

**Implementation sequence:**
1. Inventory clinical questions, practice-summary chips, navigation, layout commands, proposals, and note insertion offered by all entry surfaces. Map each to an existing planner/navigation/action capability; explicitly identify unsupported capabilities. Preserve supported deterministic layout commands through the existing controller rather than deleting them in the unification.
2. Route companion clinical requests through the same client/endpoint and shared proposal semantics. Reuse the plan renderer where suitable; do not copy another keyword answer ladder. Remove hardcoded daily briefings, dates, lab status, patient assertions, and operational counts.
3. For practice summaries, bind the request to the selected practice date/timezone and permitted provider/organization scope. Use existing authorized schedule/queue projections. If the planner cannot support an intent yet, show an explicit unsupported state; extend one bounded read intent only when necessary to preserve a supported workflow. Do not borrow the last patient as the practice context.
4. Bind request/result/proposal to originating patient, workspace, surface and request identity. On patient/scope changes clear or explicitly retain the old result under its old identity, reset cached context, and reject stale response/proposal execution. A comparison against a value captured in the same async closure is not a current-context check.
5. Distinguish loaded-empty, failed, unknown and stale evidence. An empty/missing context must not produce "all monitoring current" or "no prior encounters" unless the owning read supports that conclusion. Consequential writes remain explicit clinician actions through existing authorized APIs; merely asking never stages/sends/signs silently.

**Verify:** extend the behavior coverage in `tests/home-assistant-grounding.test.ts`, `tests/omnibox-planning-boundary.test.ts`, and `tests/browser/home-assistant.spec.ts`, or add focused companion coverage. Test equivalent explicit-patient requests from all three surfaces; changed appointment/result data; selected-day changes; unnamed/ambiguous/unknown/unreachable patients; missing evidence; request failure; and a delayed A response after switching to B. Exercise a proposal after focus changes and verify no wrong-patient write or automatic execution. Test the actual companion, not only the server endpoint or a source-string scan.

**Accept:** all clinical answer entry points cross the common authority boundary; equivalent scope produces consistent evidence and uncertainty; no canned clinical/clinic-day facts remain. **Exclude:** new model vendors, broad agent autonomy, replacement clinical protocols, or a generic AI framework.

### CB-2 — Contain prototype operations and unsupported integrations

Status: **Verified complete**
- **Changes:** Contained all unconfigured prototype communication and practice workspaces (`EmailWorkspace`, `FaxWorkspace`, `PatientCommunicationWorkspace`, `SocialMediaWorkspace`, `HRStaffWorkspace`, `WebsiteManagerWorkspace`, `CommunityWorkspace`, and `TeamCollaborationDock`). Added persistent `practice-banner-notice` banners identifying unconfigured adapters/transports. Removed all fabricated timer-based success toasts ("Secure email dispatched", "CONF-EHR-XXXXX", "Encrypted SMS sent", live website publishing, fake reviews/reach metrics). Outbound messages, faxes, posts, and replies operate in local draft mode, preserving all user input and contact info without data loss. Replaced fictional provider credentials (Logan Carton, MD, NPI 1841920391) with synthetic demonstration identities in unverified states. Internal Team Chat and Tasks in `TeamCollaborationDock` remain fully functional via `teamApi`.
- **Evidence:** Added unit test suite `tests/prototype-containment.test.ts` (4/4 tests passed) asserting no simulated transport claims, credential honesty, banner presence, and team operation retention. Added browser Playwright suite `tests/browser/prototype-containment.spec.ts` (1/1 passed in 4.5s) exercising Email, Fax, SMS, Social Media, and HR workspaces for banner visibility, draft-mode operations, and absence of fake external dispatch strings. Ran `npm run check` (386/386 passed, 0 lint/type errors) and `npm run build` (Next.js build succeeded).

**Requirements:** TRUST-01/02/03, RX-05, DASH-02/11; reuse D-063's containment approach.

**Inspect:** `app/components/team/TeamCollaborationDock.tsx` and `app/components/workspaces/{EmailWorkspace,FaxWorkspace,PatientCommunicationWorkspace,CommunityWorkspace,SocialMediaWorkspace,HRStaffWorkspace,WebsiteManagerWorkspace}.tsx`; their navigation/menu entry points; integration readiness; `BillingWorkspace` and `tests/browser/billing-containment.spec.ts` as examples.

1. Build a capability inventory for both companion and full-workspace views: real internal operations, local drafts, external transport, and fixture previews. Keep working team messaging/tasks and actual record workflows intact.
2. Remove timer/local-state success claims for send/deliver/publish/credential verification. An unconfigured adapter must produce a truthful unavailable state; a local draft must say draft. Preserve draft text and target on failure. Do not invent a live connector to finish this slice.
3. Keep synthetic demonstrations behind explicit preview routing/presentation, separate from ordinary operational data/actions. Never mix fake counts, reviews, delivered faxes, EPCS state, or invented provider credentials with authoritative records. Avoid using Logan's identity with fictional MD/NPI/DEA details in normal UI.
4. Apply the same capability/readiness decision to menus, pop-outs, and full workspaces so another entry point cannot bypass containment. Preview fixtures cannot write into clinical records or imply a verified external connection.

**Verify:** browser tests exercise both entry points with no adapter, transport failure where supported, and any explicit preview. Attempt send/reply/publish and confirm no fake success appears or input is lost. Assert operational metrics are sourced or explicitly unknown, and internal team operations still work.

**Accept:** every visible success has matching authoritative evidence; preview and disconnected states are unmistakable. **Exclude:** activating DrFirst, buying/selecting new vendors, building social/HR/CMS backends, or adding repetitive warning banners to every unrelated screen.

### CB-3 — Fix shell readability and protect Calendar progress

Status: **Verified complete**
- **Changes:**
  1. `app/zen-home.css`: Harmonized the two-level shell contrast cascade. Eliminated conflicting dark-on-dark/white-on-white text overrides (`.view-zen-home .browser-tab { color: #ffffff }`) so open tabs remain crisp and legible against the light surface. Styled active Home button with high contrast and keyboard focus-visible indicator.
  2. `app/tool-navigation.css`: Completed Level 2 tab strip readability styling (`.three-row-shell .browser-tabs` with horizontal scroll, accessible close button contrast/hover/focus, and new-tab button focus). Resolved grid-column collision on `.three-row-shell .top-actions` (setting `grid-column: auto` so it does not wrap or collide with the omnibox) and updated omnibox top margin to 6px satisfying topbar vertical inset requirements.
  3. `app/components/workspaces/calendar/CalendarViews.tsx`: Added semantic non-color status badges (`.gcal-status-badge`) and month pills (`.gcal-month-status-cue`) with explicit `data-status-cue` attributes ("waiting" with "In Office" + `how_to_reg` icon, "tentative", "in-visit", "completed" with "Done" + `check` icon, and "cancelled"). Updated `aria-label` and `title` attributes on calendar events to explicitly include status name for screen readers.
  4. `app/google-calendar.css`: Styled calendar status badges and month status cues across waiting, tentative, in-visit, completed, and cancelled states with accessible contrast and semantic icons.
- **Evidence:** Added comprehensive tests to `tests/browser/tool-navigation.spec.ts` testing Home tab active state contrast, tab name readability, accessible close button contrast, keyboard focus, and non-color calendar status badges across week, day, and month views. All 5 browser tests in `tests/browser/tool-navigation.spec.ts` passed in 25.0s. Validated with `npm run check` (386/386 unit tests passed, 0 lint/type errors) and `npm run build` (production Next.js build completed cleanly).

**Requirements:** VIS-03/05/07/08, TAB-01 through TAB-04, LEFT-01/02, NAV-04.

**Inspect:** `app/zen-home.css`, `app/tool-navigation.css`, `app/components/workspace/WorkspaceTopBar.tsx`, existing tab owners, `app/google-calendar.css`, `app/components/workspaces/calendar/CalendarViews.tsx`, and `app/lib/calendar-grid-layout.ts`.

- Repair the Home tab foreground/background cascade. Keep open tab names, active state, close controls and keyboard focus readable on Home and ordinary workspaces; do not hide open work to mask contrast failures.
- Preserve intrinsic top-navigation sizing and the two-level shell. Many tabs should scroll or expose accessible overflow while names remain discoverable; do not force system modules to icon-only tabs.
- Retain compact Calendar headers, visit counts, tonal cards, quarter-hour creation, and calm empty-slot hover. Add a concise visible/non-color waiting/in-office cue in day/week/month representations and accessible status names; preserve type versus status semantics and all existing lifecycle actions.
- Preserve full-width crowded-slot rows and the shared time mapping. Do not implement fixed duration rectangles, density scaling, drag/drop or resizing in this corrective slice.

**Verify:** extend `tests/browser/tool-navigation.spec.ts` for Home with open tabs, many tabs, theme contrast and focus; retain bounding-box/overflow assertions. Extend calendar browser coverage for waiting, tentative, in-visit, completed and cancelled states, focused/clicked slots, and a crowded slot. A DOM-visible assertion alone does not prove readable text or unclipped controls.

**Accept:** Home labels are readable, all top-level destinations remain reachable, waiting is understandable without color, and existing Calendar interactions and geometry still work.

### CB-4 — Simplify the patient overview without losing meaning

Status: **Verified complete**
- **Changes:**
  1. `app/components/patient/PatientOverview.tsx`: Eliminated the redundant duplicate `patient-envelope-card` identity banner (former lines 498–576) that duplicated `PatientHeader.tsx`. Removed unused `StatusBadge` and `administrativeSummary`. Patient identity remains authoritative and visible in the single persistent per-pane `PatientHeader`.
  2. `app/components/patient/PatientOverview.tsx`: Replaced the repeated row of 4 loose header buttons on each card (Pin, Span, Collapse, Hide) with a consolidated, accessible `OverviewCardMenu` (`<details className="overview-card-menu">` with `aria-label="Card options"`). The menu closes cleanly on Escape or outside click and provides labeled options ("Unpin from top / Pin to top", "Narrow to 1 column / Expand to full width", "Expand card / Collapse card", "Hide card").
  3. `app/components/patient/PatientOverview.tsx` & `app/globals.css`: Elevated primary clinical actions (`Address in Note →`, `Manage Rx →`, `Full Timeline →`) to prominent `.card-primary-action-btn` buttons in card headers, clearly separating primary clinical workflow from secondary card layout controls.
  4. Preserved hidden card recovery via the existing `.overview-restore-bar` ("Restore: [Card Name]").
  5. `app/components/workspace/PatientChartSurface.tsx`: Connected the clinical alert review button in the chart header banner directly to `onSectionChange("Overview")` for seamless navigation to the alert details.
  6. `app/lib/patient-id-card-generator.ts` & `app/components/patient/PatientPhotoModal.tsx`: Fixed root cause of browser freeze when opening patient photo/ID cards by providing safe default fallbacks for synthetic patient license fields and restoring hook dependency stability.
- **Evidence:** Added comprehensive browser Playwright suite `tests/browser/patient-overview.spec.ts` (3/3 tests passed in 17.1s) verifying single identity header, visible primary clinical actions, card menu open/close/keyboard escape, and hide/restore functionality. Live browser verification with subagent confirmed zero Redbox errors, seamless photo/ID card inspection, and interactive responsiveness. Validated with `npm run check` (386/386 unit tests, 0 lint/typecheck errors) and `npm run build`.

**Inspect:** `app/components/workspace/PatientHeader.tsx`, `app/components/patient/PatientOverview.tsx`, `PatientWorkspace` controllers, existing clinical attention/protocol projections, and feature-owned styles under the D-082 stacking contract.

1. Inventory every unique identity fact, administrative/care-team action, encounter action, clinical concern, and card control. Map old location to retained location before removing a repeated container.
2. Keep one persistent identity header per pane. Remove the duplicate overview identity banner, moving any unique administration/care-team action into the existing identity access. Keep patient identity visible in detached/minimal/full-screen work and consequential dialogs.
3. Keep primary clinical actions such as Manage Rx / Address in Note visible. Place pin, expand, collapse and hide in a consistent visible `...` overflow. Reuse existing controls/state and preserve keyboard focus, Escape, dismissal and recovery.
4. Make header alerts and overview details projections of the same owning concern. Show one detailed alert with a compact reachable header indicator where useful. Deduplicate by clinical identity/source, not a broad text match; retain distinct concerns, severity and action paths.
5. Preserve clinician density/preset choices and personal card arrangement. Message composition and message-history navigation are different functions; do not remove one merely because their labels resemble each other.

**Verify:** before/after fact/action inventory, patient switching with a dirty draft, detached panes, header density modes, keyboard-only card actions, hidden-card restoration, multiple different risks, and saved layout reload. Inspect the actual first viewport at the shared visual matrix.

**Accept:** clinical content appears sooner with fewer repeated controls; all unique facts/actions remain reachable; identity and unresolved safety signals are clear in every pane. **Exclude:** new patient route hierarchy, rebuilding tab persistence, note editor replacement, protocol threshold changes, or merging clinical authorities.

### CB-5 — Simplify dashboard, Tasks/Inbox, and intake filtering

Status: **Verified complete**

- **Governing finding:** the clinic day was counted three times above the fold. The roster's own filter bar (`All / Tentative / Confirmed / In Office / In Visit / Upcoming / Completed`, each with a count) both counts *and* filters, so it is now the single owner of day status counts; Day at a Glance and the Practice Cockpit were restating it.
- **Changes:**
  1. `app/components/TodayDashboard.tsx`: the roster filter bar no longer sits behind `showScheduleSearch` — that preference gates the search input only. Turning search off previously removed the day's only actionable counts, which is how the duplicate copies upstream were justified. Day at a Glance is now one compact line naming who the day is waiting on (waiting / in-visit / next arrival / nothing booked / tentative holds / concluded) plus its action row, laid out as a single band in `app/globals.css`; it no longer restates `counts.booked/completed/waiting/tentative`. An empty day now says "No visits are booked for this date." instead of the finished-day sentence it used to share.
  2. `app/lib/preference-engine.ts`, `app/lib/use-today-layout.ts`, `app/lib/dashboard-layout-model.ts`: the Practice Cockpit ships **off** and sits after the roster in the default order. It remains a first-class window — listed in Customize → Today Dashboard, addable through the ordinary visibility path, and still on by default in the Psychopharm Cockpit preset. `shipsVisible` is now false so the hidden-sections bar does not report it as dismissed work, and `restoreAllSections` no longer turns it on. Stored preferences are untouched: a clinician who already had it keeps it.
  3. `app/components/GlobalWorkspaceShell.tsx`: the Tasks and Inbox count tiles (`.global-module-summary-strip`) are gone; their numbers moved onto the filters that produce them. Tasks gained a real `Patient-linked` filter — it was previously a tile counting a subset nothing could select. Inbox filters carry per-filter thread counts including `Refills`, which had none. Counts render without a number until the queue has loaded or when it errored (DASH-11).
  4. `app/components/global/GlobalLabsWorkspace.tsx`, `GlobalDocumentsWorkspace.tsx`, `app/components/PracticeQueueWorkspaceShell.tsx`: the same tile strips removed and counts moved onto their filters; Documents gained a `Filed` filter for the one tile that had no filter behind it. Both queues now receive a real `hasLoadedOnce` from their shell instead of inferring it from `rows.length`, so an unanswered queue shows no count while a genuinely empty one shows zero.
  5. `app/lib/adaptive-layout-engine.ts`: the shipped "Morning Pre-Clinic Prep" rule no longer forces the cockpit on. Adaptive mode is opt-in and reversible (DASH-09), but the rule's own description is about the briefing, patient flow and pre-visit readiness — the cockpit override contradicted both that and the new default. No other rule changed.
  6. `app/components/workspaces/IntakeWorkspace.tsx`, `app/intake-workspace.css`: a stage earns a tab when it holds someone; the selected stage keeps its tab at zero; everything else folds into an in-place `N more stages` disclosure listing them in `STAGE_ORDER`. The duplicate "N people" header count is gone (the All tab carries it) and stage counts wait for the queue to load. The disclosure expands under the tab row rather than over it, because the row scrolls horizontally and would clip an overlay.
- **Measured first viewport** (1440x900, shipped defaults, same six-visit synthetic day, measured before/after on the same database):

  | | Before | After |
  | --- | --- | --- |
  | Chrome above the schedule window | 328px | 159px |
  | Schedule window top | y=526 (58% of viewport) | y=357 (40%) |
  | Visit rows fully visible | 3 of 6 | 6 of 6 |
  | Places the day's status counts render | 3 | 1 |

- **Evidence:** `npm run check` (394/394 unit tests, 0 lint errors, 0 type errors) and `npm run build` both pass. New `tests/dashboard-first-viewport-economy.test.ts` (8 tests) pins the shipped defaults, the preserved-preference rule, cockpit addability, and the filter-bar ownership. New `tests/browser/queue-filter-counts.spec.ts` (5 tests) asserts in a browser that every filter's advertised count equals the rows pressing it returns, across the roster, Tasks, and Inbox, plus the intake overflow promotion path. Visual matrix checked at 1440x900, 1280x800, 1024px and 200%-equivalent (720x450): no horizontal overflow, the summary band wraps rather than truncating, and labels stay readable.
- **DASH-12:** this is contained cleanup inside the existing canvas — no new dashboard, no module removed, no persona default rewritten beyond the one opt-in toggle above — so it did not re-enter the owner visual-review gate. The measured before/after table is the evidence that gate asks for. The gate remains binding for a broad default-dashboard replacement.
- **Full browser gate, run on both sides with a fresh database:** this slice **86 passed / 17 failed**; unmodified `main` **18 failed** over the same specs. Failure sets compared by test name: **zero regressions introduced, one failure fixed.** Every one of the 17 remaining failures reproduces on `main`.
- **Repaired en route:** `tests/browser/window-lifecycle.spec.ts`'s hide/restore test had a stale `/Open Layout Customizer/i` locator (the control is "Customize layout") and had therefore been failing on `main`, leaving the restore path unexercised. It now runs, and additionally exercises adding the opt-in cockpit from Customize. This is the one failure CB-5 closes.
- **Labs and Documents are unreachable from navigation:** selecting either from the Clinical menu opens nothing — `activeModule` never reaches `PracticeQueueWorkspaceShell`. Pre-existing, no browser coverage exists for either queue, and the reason this slice's Labs/Documents filter counts are verified by type and unit checks rather than in a browser. P6 dead-end work, tracked separately. **Closed by UI-7a (2026-09-21).** The observation was exact and the attribution was not: `activeModule` never arrived because `openGlobalModule` dispatched an event whose own listener immediately cleared it for these two views — a regression introduced at `948f003` on 2026-09-18, one day before this was written, rather than queue work P6 had not reached. See [D-088](decisions/D-088.md) and the UI-7 entry above; both queues now open, and `clinical-decomposition.spec.ts` covers Documents in a browser.

### CB-5a — Repair the validation baseline regression

Status: **Verified complete**

CB-5a repaired the 17-failure browser baseline one root cause at a time instead of weakening assertions or scheduling safeguards.

- **Booking and fixture collisions:** Calendar `New Event` now chooses a real open default slot rather than hardcoding a time occupied by shifted seed data. Browser fixtures were made deterministic and care-completion visit fixtures were isolated while preserving the authoritative overlap guard.
- **Navigation and workspace ownership:** patient opens and schedule chart actions were routed through the existing navigation controller; module-tab fallback now synchronizes the active workspace view instead of leaving the shell between states.
- **Calendar and layering regressions:** waiting/in-office state remains visibly distinguishable in month view, the event editor owns Escape dismissal correctly, and layering tests follow the current contained website-preview controls.
- **State/test isolation:** browser preference caches reset with server defaults; stale inbox data remains visible with an explicit refresh failure; test selectors were aligned to current accessible labels instead of obsolete UI wording.
- **Clinical/encounter path:** clinical document summaries are normalized through the DTO boundary, and encounter drafts are durably persisted before the review/sign ceremony so the synthetic visit lifecycle reaches the authoritative signed state.
- **Final selector cleanup:** Preferences verification now targets the complete accessible name of the real `Customize layout` control rather than requiring an obsolete exact accessible-name match.

**Completion evidence:** resulting code SHA `ae0850bbd988b29ad60a61fb1a3f0d7be4787ee8`; CI run [35516899267](https://github.com/Logancarton/EHR/actions/runs/35516899267) passed lint, typecheck, clinical integration tests, production build, Chromium install, and **103/103 browser tests** with no failures or flaky tests reported in the final Playwright summary.

**Exit result:** the full browser validation gate is trustworthy and green again. CB-7 is no longer blocked by CB-5a. The next ordered slice is CB-6; CB-7 then performs the deeper manual encounter/recovery certification rather than re-litigating this repaired baseline.

## Validation history


The CB cleanup sequence is now materially implemented through CB-5a. The table below describes current `main`, not the pre-CB review snapshot:

| Surface | Current implementation | Remaining active gap |
| --- | --- | --- |
| Shell / Calendar | CB-3 closed the Home/tab contrast and non-color status-cue gaps. Calendar uses compact headers, tonal events, quarter-hour creation, and a fixed 96px/hour vertical scale; visually overlapping events tile horizontally instead of stretching time. CB-5a also repaired the Calendar/browser regressions without weakening scheduling conflict rules. | No open CB-3/CB-5a validation gap is currently recorded; later Calendar work should be treated as new scoped product work, not baseline repair. |
| Patient overview | CB-4 removed the duplicate identity banner, consolidated secondary card controls, preserved per-pane identity, elevated primary clinical actions, and retained hide/restore behavior. | No open CB-4 product gap is currently recorded; broader chart work belongs to later phase gates. |
| Dashboard / queues | CB-5 made the roster dominant, removed repeated day/count summaries, moved queue counts onto actionable filters, preserved layouts/presets, and compacted Intake filtering. UI-7a repaired the Labs/Documents navigation dead-end CB-5 recorded: it was a shell regression in the navigation controller ([D-088](decisions/D-088.md)), not missing P6 queue work, and both queues now open and carry browser coverage. | No open queue-navigation gap. Queue *resolution* workflow remains P6. |
| AI | CB-1 routes the companion, Home, and omnibox through the shared planner boundary with stale-response and patient-scope protections; canned clinical/clinic-day facts were removed. | Broad model/agent expansion remains deferred until the authoritative manual workflows and P12 gate justify it. |
| Communications / practice | CB-2 removed simulated external success and clearly separates real internal operations, local drafts, disconnected capabilities, and synthetic previews. | Live fax/email/SMS/social/lab/reminder/payment/clearinghouse transports remain vendor/access dependent rather than product-completeness claims. |

**Historical review evidence:** [run 35464310622](https://github.com/Logancarton/EHR/actions/runs/35464310622) captured the original 2026-09-19 pre-CB baseline: lint/typecheck passed and 380 of 381 tests passed, with the tentative-booking 409 that CB-0 subsequently diagnosed and repaired. Keep this run as provenance, not as the current health summary.

**Latest validated slice evidence:** CB-5a completed at `ae0850bbd988b29ad60a61fb1a3f0d7be4787ee8`. CI run [35516899267](https://github.com/Logancarton/EHR/actions/runs/35516899267) passed lint, typecheck, clinical integration tests, production build, Chromium installation, and the complete browser workspace verification with **103/103 Playwright tests passed**.

**Browser-gate history:** green at `ae0850bbd988b29ad60a61fb1a3f0d7be4787ee8` when CB-5a closed, which is when CB-5a stopped blocking CB-7. It went red afterwards, CB-0b returned it to green on 2026-09-21 at **179/179**, and UI-7d left it green at **185/185**. The only failure since is the recorded `synthetic-visit` intermittent. Read the entries immediately below before quoting this line, and re-run the suite before quoting a figure: one member of the old group was an intermittent, and it has not been repaired.

**Closed — the unit half of the calendar-day-dependent defect.** `tests/intake-workflow.test.ts` failed on 2026-09-21 because the shifted seed fixture `apt-tue-1` landed on its hardcoded 2026-09-25 10:00 AM slot. Verified identical at `2f7592e`, `3fa7500` and `3538814`, each with none of the work under test present. Repaired as **CB-0a**: a unit-test database is created without the demo clinic day, so no shifted fixture can arrive on a date a test wrote down as empty, on any calendar day. `npm run check` is green at 425/425. No assertion was weakened.

**Closed — the browser half of the calendar-day-dependent defect, and three failures that were never part of it.** Repaired as **CB-0b** at `fa5fb37`..HEAD. The entry this replaces described a *family*, and a family is not a diagnosis: reproduced on a deleted database at `fd26cc3` the group was **172 passed / 6 failed of 178**, and the six had four different causes. Each is now named with the commit that caused it.

- **`dismissal` and `home-assistant` — stale since UI-2 (`8a573ee`).** Both waited 45s for `getByRole("button", { name: "EHR" })`. The Home tile that leads back into the clinical workspace was labelled "EHR" until UI-2 made Home present the three major suite entities, where it became **Clinical**. Repaired by addressing it as `.zen-shortcut-item[data-workspace-id="clinical"]`, which the next rename cannot break and which cannot also match the top bar's Clinical group. No assertion changed.
- **`calendar-interval-jump` — stale since `94cdc8e`.** It drove `.interval-chip`, `.companion-active-interval-banner` and `.calc-days-input`: a companion-only scheduling UI removed on purpose when the Calendar companion became the same `CalendarWorkspace` the Calendar tab renders. Rewritten against what replaced it, and now asserts the date the calendar lands on (a `.gcal-preset-pill` is `active` only while the view is on that interval's target) rather than a banner's label.
- **`tool-navigation`'s CB-3 case — the real fixture-week defect.** Reproduced in isolation on a deleted database: `.gcal-event-row` filtered on `"Jordan Reed"` resolved to **two** elements, `apt-5` (waiting, 04:30 PM) and `apt-mon-1` (scheduled, 09:30 AM), which the +17-day shift pulled into one displayed week. Repaired at the fixture boundary — see [D-091](decisions/D-091.md) decision 2 — because the set expresses two relationships and was placed with one offset: the anchor's week is written in *days* (yesterday, today, tomorrow) and the block after it in *weeks* ("Upcoming Week"). Each is now placed by its own relationship, so today is always the anchor day and next week's Monday is a Monday next week. Verified over 400 consecutive clinic days: today is the six-visit clinic on every one, no slot collides, and the patient seen today and again next week is never drawn into one displayed week. The trade is stated rather than discovered: **weekday identity is deliberately not preserved**, so an install on a Sunday gets a Sunday clinic, and the spec reaches the clinic day through `.gcal-week-header-col.is-today` as its own comment always said it wanted.
- **`workspace-open-launcher` — a real product defect, not flake.** It failed only in full runs and passed alone, which had been filed as shared-database instability. The cause is exact: the launcher offered `roster.slice(0, 5)` and the roster is ordered by name, so on the demo roster Maya Chen sits **fifth of six** and any patient a run registers ahead of her pushes the chart under test off the list. That also broke UI-1's own rule — a chart whose patient sorts sixth could not be focused from the launcher at all. Open charts now come first, the active one at the top, and `an open chart is offered even when its patient sorts past the end of the list` guards it with Sofia Martinez, who sorts last; it fails against the old ordering.
- **`synthetic-visit` — the intermittent UI-7c recorded, still intermittent.** It failed in the `fd26cc3` baseline run and passed in the CB-0b run of the same suite, with nothing between the two that touches it. It stays recorded on its own evidence rather than merged into anything.

**Current browser gate: 188 passed, 1 failed of 189** (full suite, deleted database, 2026-09-21). The one failure is `synthetic-visit`, the recorded intermittent: same locator, same line, same signature, and it passes 2/2 alone on a deleted database. It is **not repaired** and is not treated as a waiver. The suite was 185/185 after UI-7d and 179/179 after CB-0b; D-093 added four cases. An intermediate run at 177/1 of 178 was taken before the launcher repair landed in the same slice; the remaining failure was the launcher case that repair addresses, and the count rose to 179 because CB-0b adds one test. `synthetic-visit` is **not** declared repaired: it is a known intermittent that failed under full-suite load during UI-7c and again in the `fd26cc3` baseline, and has passed in the two runs since. A green run is evidence about that run. Re-run the suite before quoting a figure.

Standing rules, unchanged and still earned: do not weaken assertions; attribute a failure on its own evidence before adding it to any recorded defect, including the ones already inside it; delete `test-results/browser-ehr.db*` before a run that is meant to mean something; and do not edit source while a run is in flight, because the suite's dev server recompiles underneath it. `next dev` also rewrites `next-env.d.ts`, which `repository-hygiene.test.ts` catches — put it back before committing.

**Open — the suite shares one mutable database across every spec.** This is what is actually left of the old family, and it is now the only entry in it. `care-completion` books real follow-ups four weeks after an origin visit it dates a few weeks back, for two patients already on the demo schedule, so its bookings land inside the demo practice's current week; in the `fd26cc3` full run that put a *third* Jordan Reed at 11:00 AM into the week `tool-navigation` was reading. CB-0b made that spec take its own future bookings back out ([D-091](decisions/D-091.md) decision 3), which is the fix that costs nothing, but the structural problem remains: any spec may write into the practice every later spec reads, and `synthetic-visit` is still intermittent under full-suite load. Isolating the database per spec (or per file) is the next bounded repair and is larger than a cleanup rule.

**The surveys below are historical.** Each counts "the same five specs" as one family, which CB-0b showed they never were; read them for the run-to-run figures and for what each slice re-checked, not for the diagnosis. The attribution above supersedes their grouping.

**Re-surveyed during UI-7c (2026-09-21), full suite on a deleted database: 173 passed, 5 failed of 178.** The same five specs, and the four added tests pass. The interesting part is a run that was *not* clean, and what it cost to attribute rather than absorb: an earlier full run of the identical tree returned **172 passed / 6 failed**, the sixth being `synthetic-visit`'s sign step, which timed out waiting for the signed record's Close button after the attestation was submitted. It is **not** a member of the family below and it is **not** this slice's: `synthetic-visit` passes alone on a fresh database (2/2), it passed in the repeat full run, and the starting SHA `b8abf78` was restored from a stash and re-run in full on a deleted database, returning exactly **169 passed / 5 failed of 174** with `synthetic-visit` passing. So it is a new intermittent that appears only under full-suite load, first observed here, and it should be attributed on its own evidence next time rather than folded into the five. `workspace-open-launcher` was re-checked rather than assumed because UI-7c changes the launcher: with `workspace-catalog`, 10/10 on a fresh database.

**Re-surveyed during UI-7b (2026-09-21), full suite on a deleted database: 169 passed, 5 failed of 174.** The same five specs, and the six added tests pass. Two points worth keeping. First, a run taken *before* this slice's test updates returned **7** failures, and the two extra were the slice's own: `ui-system`'s `railTool` helper still opened the Clinical menu to reach Tasks. The family below is not a waiver, and reading a count rather than the list would have hidden a real break. Second, do not edit source while a run is in flight — the suite's dev server recompiles underneath it, and a run taken across an edit cannot be quoted. Because UI-7b changes the companion rail, which nearly every spec renders, `workspace-open-launcher` was re-checked rather than assumed: 5/5 alone on a fresh database, and the five-spec subset returns 21 passed / 4 failed — the same figures and the same four tests as at `44ece69` and `832a6a7`.

**Re-surveyed during UI-7a (2026-09-21), full suite on a deleted database: 163 passed, 5 failed of 168.** The five are the same five specs below; the seven added tests pass, and `communication-companion` passed without the retry it needed last time. UI-7a touched the `+` launcher, so `workspace-open-launcher` was re-checked rather than assumed: 5/5 alone on a fresh database, and the five-spec subset returns 21 passed / 4 failed — the same figures and the same four tests as at `44ece69` and `832a6a7`.

**Survey at `832a6a7` (2026-09-21), full suite on a deleted database: 155 passed, 5 failed, 1 flaky of 161.** Failing: `calendar-interval-jump`, `dismissal` (the home launcher's answer closing on Escape), `home-assistant` (the shared answer card), `tool-navigation` (CB-3 status cues), and `workspace-open-launcher` (opening patient charts from the launcher). Flaky: `communication-companion`'s Team channel, which passed on retry. Every one of these was checked against the baseline rather than assumed pre-existing: the same five specs run as their own 25-test subset on a fresh database return **21 passed / 4 failed at `44ece69` and identically at `832a6a7`** — same four tests, none of CB-0a's changes present in the first. `workspace-open-launcher` passes in that subset at both SHAs and fails only in the full run, which is the shared-database instability described above rather than a fifth member of the fixture-week family.
