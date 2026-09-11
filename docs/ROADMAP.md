# EHR Roadmap — Pre-AI Product Completion

Last fully reviewed: 2026-09-10  
Source of truth reviewed: `main` at `99b4f6b78bad2048e09f17429b3d82946faa7721`
P0 completed 2026-09-10. P1-A/P1-B landed 2026-09-11 (shared primitives + interaction states, see `UI_SYSTEM.md` and D-043); the next work is **P1-C**, converting the remaining surfaces in the order below.

This roadmap is the execution plan for turning Clinical Bond from a strong development foundation into a complete, polished psychiatric EHR before major AI expansion.

`PRODUCT_VISION.md` remains the canonical interaction target.  
`ARCHITECTURE.md` remains the canonical system-boundary description.  
`DECISIONS.md` records durable architectural decisions.  
This file owns **sequencing, implementation method, dependencies, validation gates, and the next work agents should perform**.

---

## 1. Product direction

The immediate goal is not to add more AI.

The immediate goal is to make Clinical Bond a strong EHR even if every AI surface is disabled.

The pre-AI product must support this end-to-end loop:

`schedule -> find/open patient -> understand chart -> document encounter -> manage medications -> order/review labs -> manage documents/messages/tasks -> sign -> create follow-up work -> schedule next visit -> continue to next patient`

The product should continue to feel like:

`Chrome + Google Workspace + a clinical operating environment`

The product should **not** drift into a conventional collection of disconnected legacy EHR modules.

Patient remains a persistent workspace. Related information should open in context. Clinical truth stays structured and authoritative. Vendors stay behind adapters. UI state never becomes clinical truth.

Major AI expansion resumes only after the pre-AI completion gate at the end of this document is satisfied.

Existing AI safety architecture must remain intact while AI feature development is paused:
- AI cannot silently mutate clinical truth.
- AI proposals remain distinguishable from committed records.
- `ClinicalActionGateway` remains the human clinical mutation boundary.
- `ContextAssembler` remains permission-aware.
- Existing AI tests must remain passing even when AI is not the active development focus.

---

## 2. Current verdict

The project is architecturally ahead of its visible product completeness.

Strong foundations already exist for:
- authenticated server sessions;
- server-derived roles and permissions;
- organization membership and patient-access isolation;
- patient-bound clinical actions;
- immutable signed encounters;
- encounter autosave and revision conflict protection;
- normalized medication, allergy, problem, observation/result, insurance, pharmacy, and document foundations;
- version history and provenance;
- audit logging;
- document versioning and workflow;
- medication reconciliation;
- prescription intent separated from medication truth;
- outbound prescription transaction state;
- refill, change-request, cancellation, callback, and uncertain-send recovery workflows;
- workspace persistence;
- browser-style patient tabs;
- detachable/resizable/snap-able patient workspaces;
- customizable rails and layouts;
- clinician-owned and practice-owned workspace layouts;
- organization people/account administration;
- Playwright browser verification.

The principal gap is now **product completeness and coherence**, not lack of core architecture.

### Current P0 defects / unfinished transitions

Agents must treat these as active blockers rather than adding unrelated features:

1. ~~**Current main is not fully browser-green.**~~ **Resolved** — the `window-lifecycle.spec.ts` failure was a measurement race, not a layout regression: hiding both rails does return 84px to the workspace, but `.workspace` animates `margin-right`, so the single measurement read a frame of the transition. The assertion now polls. Full CI is green.

2. ~~**Runtime patient state is still partially fixture-driven.**~~ **Resolved** — every live surface now resolves patients through `app/lib/patient-roster.ts`, which reads the access-filtered `GET /api/patients`. See D-042. The synthetic array is frozen seed data imported at runtime only by `app/server/db/seed.ts`, enforced by a test.

3. **Several global destinations are visible before they are real products.**  
   Billing, Reports, and portions of Settings/global queues still contain placeholder behavior. A polished product must either implement a destination or keep it out of default production-facing navigation.

4. **Visual consistency improved substantially, but not all major workflows have received the same interaction pass.**  
   Encounter received a focused visual pass. Today, Schedule, Overview, Medications, Labs, Documents, Messages, global queues, and administrative surfaces still need to converge on the same UI language and state behavior.

---

# 3. Pre-AI definition of done

Major AI work may resume only when all of the following are true.

## 3.1 Authoritative runtime data

- The authenticated backend is the only runtime source of patient roster truth.
- UI fixture arrays are used only for seed/test data.
- Appointment, patient, task, message, document, medication, lab/result, encounter, organization, and preference surfaces load from authoritative APIs/repositories.
- A reload cannot reconstruct a different chart state from hard-coded client fixtures.
- Access filtering is enforced server-side, not simulated by the client.

## 3.2 Complete clinician workflow

A clinician can complete a synthetic workday without AI:
- review the day;
- open any accessible patient;
- review current problems/allergies/medications;
- review longitudinal history;
- document an encounter;
- reconcile medication information;
- stage and authorize appropriate orders;
- review labs/results;
- review/file documents;
- read and chart patient communications;
- create/complete follow-up tasks;
- sign the encounter;
- schedule or record follow-up;
- move to the next patient.

No required step may depend on developer tools, direct database editing, or a fake success state.

## 3.3 Complete patient envelope

The chart contains the administrative and clinical information needed to safely operate a psychiatric practice:
- demographics and identity;
- contact information;
- legal/guardian relationships;
- emergency contacts;
- preferred communication;
- pharmacy;
- PCP/referring clinician;
- insurance/subscriber information;
- active problems/diagnoses;
- allergies/intolerances;
- medications and reconciliation;
- vitals and longitudinal measurements;
- psychiatric history;
- substance-use history;
- hospitalization/self-harm/suicide history as clinically appropriate;
- family/social history;
- structured assessments;
- encounters;
- labs/results;
- documents;
- messages;
- tasks;
- follow-up state.

## 3.4 UI quality

- All major workspaces use the same design system.
- Empty, loading, error, saving, saved, failed, disabled, and destructive states are predictable.
- Keyboard focus is visible.
- State is not communicated by color alone.
- Dense data is progressively disclosed rather than always shown.
- Minimal layouts retain patient identity and unresolved safety/pending-work signals.
- No default navigation path leads to a dead placeholder.
- Common workflows do not require unnecessary modal chains or page changes.

## 3.5 Reliability

- Typecheck passes.
- Node/domain/integration tests pass.
- Production build passes.
- Playwright browser tests pass.
- Workspace restoration passes with multiple patients and unfinished work.
- Late async responses remain bound to the originating patient.
- Consequential mutations are idempotent or protected against duplicate execution as appropriate.
- Visible success is not shown before authoritative persistence succeeds.

## 3.6 Production readiness before real PHI

- production persistence is intentionally selected and deployed;
- encryption/secrets handling is production appropriate;
- document/object storage is protected;
- backup scheduling and offsite retention exist;
- restore has been rehearsed;
- audit access and retention are defined;
- monitoring and alerting exist;
- incident-response procedures exist;
- authentication recovery exists;
- tenant/organization access controls are tested;
- no real PHI is introduced before this gate.

---

# 4. Mandatory agent operating rules

Every implementation agent must follow this sequence before modifying code:

1. Inspect current GitHub `main`.
2. Read `AGENTS.md`.
3. Read `docs/INDEX.md`.
4. Read `docs/PRODUCT_VISION.md`.
5. Read `docs/ARCHITECTURE.md`.
6. Read this roadmap.
7. Read the domain-specific documentation relevant to the chosen slice.
8. Read `.codex/skills/ehr-builder/SKILL.md`.
9. Inspect existing code before designing a replacement.
10. Choose the highest-priority incomplete slice whose prerequisites are satisfied.

Agents must not skip ahead merely because another feature is easier or more interesting.

## Required signal-flow analysis before coding

For every feature, write the intended flow mentally or in the completion report:

`clinician action -> presentation state -> domain intent -> authenticated API/service -> authoritative persistence -> audit/provenance -> returned state -> UI feedback`

For patient-scoped work, include:

`originating workspace/patient -> expected patient binding -> server access check -> mutation/read -> result returned only to originating context`

If a vendor is involved:

`EHR domain state -> adapter -> vendor -> normalized response/evidence -> EHR workflow state`

Vendor responses must never directly become unrelated clinical truth.

## Prohibited shortcuts

Do not:
- add another runtime patient-data source;
- create a second patient workspace framework;
- bypass `ClinicalActionGateway` for consequential clinical writes;
- make React state canonical clinical truth;
- add fake success states;
- mark mock external connectivity as working integration;
- create AI features to compensate for missing deterministic product workflows;
- rebuild working medication/prescription lifecycle infrastructure;
- create duplicate task/message/document systems;
- introduce a generic graph/database abstraction without a concrete workflow requiring it;
- put real PHI or production secrets into the repository;
- make a launcher destination appear complete when it is still a placeholder;
- perform broad refactors without preserving behavior and adding regression evidence.

---

# 5. Master dependency order

Agents should work in this order unless a blocking defect requires otherwise:

**P0. Restore green main and remove runtime fixture dependence** — complete  
↓  
**P1. Finish shared UI system and shell consistency** — P1-A/P1-B done, P1-C in progress  
↓  
**P2. Complete patient administrative foundation**  
↓  
**P3. Complete longitudinal clinical chart foundation**  
↓  
**P4. Complete scheduling and front-office workflow**  
↓  
**P5. Finish the AI-independent encounter loop**  
↓  
**P6. Finish operational queues and related-object workflows**  
↓  
**P7. Finish forms, consents, assessments, and patient-facing intake**  
↓  
**P8. Finish prescribing/lab integration readiness and external workflow shells**  
↓  
**P9. Finish billing/revenue-cycle foundation**  
↓  
**P10. Finish interoperability and data portability**  
↓  
**P11. Production infrastructure / PHI readiness**  
↓  
**P12. Full pre-AI acceptance certification**  
↓  
**Resume major AI expansion**

A later phase may be explored only when doing so does not leave a prerequisite phase structurally incomplete.

---

# 6. Phase P0 — Stabilize main and establish one runtime source of truth

Priority: **Immediate / blocking**

## Goal

Return `main` to fully green and ensure every live patient workspace is driven by the authenticated backend roster rather than the static synthetic patient array.

## P0-A — Repair current browser regression — **complete**

### Inspect
- latest CI run;
- `tests/browser/window-lifecycle.spec.ts`;
- rail width CSS variables;
- body/sidebar hidden-state selectors;
- `DynamicSidebar.tsx`;
- right-rail visibility behavior in `PatientWorkspace.tsx`;
- `workspace-split.css`, `sidebar.css`, and relevant global layout rules.

### Implement
- identify whether the failure is a real layout regression or an obsolete assertion;
- preserve the product requirement: hiding a rail must return usable space to the central workspace;
- preserve a reachable affordance to restore each hidden rail;
- ensure left and right rail state do not leave invisible reserved columns;
- keep resize persistence intact.

### Validate
- targeted Playwright test;
- full `npm run test:browser`;
- `npm run typecheck`;
- `npm test`;
- `npm run build`.

### Exit gate
Full CI green on current `main`. **Met** — typecheck, 101 node/integration tests, production build, and 13 browser tests pass.

---

## P0-B — Replace static patient runtime dependence — **complete**

### Current problem

`app/domain/patient.ts` contains synthetic patients and helper resolution functions. Major runtime components still import that array. This creates two patient truths: backend data and browser fixture data.

### Target architecture

`authenticated session -> GET /api/patients -> accessible backend roster -> workspace patient store -> tabs/search/global workspaces`

Synthetic patient constants may remain for:
- database seeding;
- unit fixtures;
- browser test setup.

They must not be the normal runtime roster.

### Implementation steps

1. Define or reuse one client-side patient-roster loading boundary.
2. Fetch the accessible roster through `/api/patients`.
3. Normalize the API response into the existing patient presentation type or evolve that type deliberately.
4. Replace direct `patients.find(...)` runtime calls in `PatientWorkspace.tsx`.
5. Replace patient iteration in `GlobalWorkspaceShell.tsx`.
6. Replace hard-coded initial patient IDs with safe restored/default logic:
   - restore accessible open workspaces;
   - remove inaccessible/stale IDs;
   - if none remain, start on Today rather than inventing a patient.
7. Make omnibox patient search use the authoritative roster.
8. Make detached windows resolve patient metadata from the authoritative roster.
9. Make order composer target resolution use the authoritative roster.
10. Make schedule/start-visit navigation open authoritative patient records.
11. Remove code that mutates fixture patient objects after encounter signing.
12. Re-fetch or update authoritative state after relevant mutations rather than mutating imported constants.
13. Ensure organization/patient-access scope changes take effect without requiring code changes.

### Required tests

- roster loads from authenticated API;
- no-session roster request fails;
- assigned-only user sees only assigned patients;
- stale saved tab for inaccessible patient is discarded;
- zero-patient state lands safely on Today;
- opening patient from omnibox uses backend patient;
- encounter signing does not mutate a client fixture;
- global Inbox/Tasks patient labels resolve from authoritative roster;
- patient switch during async load cannot misbind another patient.

### Exit gate

A code search for the exported synthetic patient array shows runtime usage only in seed/test/fixture code or explicitly documented compatibility paths. **Met** — `app/server/db/seed.ts` is the sole runtime importer, and `tests/patient-roster-runtime.test.ts` fails if another one appears.

### What this exposed

Two defects were hidden by the fixture defaults, because the workspace previously opened two hard-coded charts and never exercised the paths that reopen one:

- Choosing a patient from the omnibox left the input holding DOM focus while the component recorded it as unfocused, so the next re-focus fired no event and the results never reappeared. The box now follows the input's real focus, and selecting a result blurs it.
- Workspace restoration drives the live DOM frame by frame, and animation frames stop in a background tab, so a workspace reopened in a tab that was not on screen came back empty. Frame settling now falls back to a timer.

### Still fixture-backed (not part of this phase)

`app/lib/schedule-data.ts` still supplies the initial schedule and action queue before `/api/appointments` answers, and tasks/messages/scratch notes keep their seed arrays as pre-hydration fallbacks. Section 3.1 requires these to converge on authoritative APIs; the patient roster was the one that created a second *patient* truth and is done.

---

# 7. Phase P1 — Finish the shared UI system

Priority: **Highest after P0**

## Goal

Make the product feel deliberately designed rather than like multiple independently evolved prototypes.

The recent token/icon pass established the visual foundation. This phase turns it into a reusable UI grammar.

## P1-A — Inventory recurring UI primitives — **complete**

The inventory and its numbers live in [`UI_SYSTEM.md`](UI_SYSTEM.md). Headline: 207
button rules across 151 distinct visual signatures, a `--radius-*` scale used zero
times while 459 rules hard-coded a pixel radius, and the same `loading → empty → rows`
chain hand-written in eight surfaces — most with no error branch, so a failed load
rendered as an empty queue.

Primitives extracted from that repetition, each over pure rules in
`app/lib/ui-system.ts`: `Button` (primary/secondary/tertiary/destructive/icon, loading,
disabled-with-reason, pressed), `AsyncSection` with `EmptyState`/`LoadingState`/
`InlineError`, `SaveStateIndicator`, `StatusBadge`. The radius scale is now `4/8/12/16/pill`.

Deliberately **not** built, because the repetition is not there yet: modal/dialog shell,
drawer/popover, table/list shell, row action menu, toolbar, timeline item, patient
identity chip, related-object link, toast. Extract each when a third surface needs it.


Agents should inspect all major surfaces and identify repeated patterns before creating new components.

Create or consolidate primitives only where repetition is real:

- Button:
  - primary;
  - secondary;
  - tertiary/text;
  - destructive;
  - icon;
  - loading;
  - disabled.
- Input:
  - text;
  - search;
  - textarea;
  - select;
  - date/time;
  - validation message.
- Status:
  - badge;
  - pill;
  - non-color-only state marker.
- Workspace header.
- Section header.
- Toolbar.
- Table/list shell.
- Row action menu.
- Modal/dialog.
- Drawer/popover.
- Empty state.
- Loading state/skeleton.
- Inline error.
- Save-state indicator.
- Confirmation/destructive-action pattern.
- Filter/search controls.
- Count badge.
- Timeline item.
- Patient identity chip.
- Related-object link.
- Toast/notice behavior.

Do not build an abstract component library for hypothetical needs. Extract from real repeated use.

## P1-B — Normalize interaction states — **complete for converted surfaces**

The lifecycle is enforced by `AsyncSection` and `SaveStateIndicator` rather than by
convention; see D-043. Surfaces not yet converted (P1-C) still carry their own.


Every async surface should expose a predictable lifecycle:

`idle -> loading/saving -> success or persisted state`

and

`idle -> loading/saving -> error -> retry`

Avoid:
- buttons that appear to succeed before server response;
- silent failed persistence;
- indefinite spinners;
- disabled controls with no explanation;
- toast-only errors that disappear before they can be understood.

## P1-C — Apply the system surface-by-surface — **in progress**

Converted: shell/omnibox/tabs, Today, global Inbox, global Tasks, global Documents
queue, global Labs queue, prescribing operations queue, patient Labs, encounter
toolbar save/record state. `UI_SYSTEM.md` holds the live conversion table.

Converting Today also removed invented content: the briefing's fallback action and
three of four "Daily Shortcuts" named hard-coded charts and described clinical detail
nothing in the record backed. They are now derived from the day's schedule and action
queue. `patientLabHistory` and the per-id medication lists behind the overdue-lab
calculation remain fixture-backed and belong with P3.


Recommended order:

1. shell/top omnibox/tabs;
2. Today;
3. Schedule;
4. Patient header and section tabs;
5. Overview;
6. Encounter;
7. Medications/reconciliation;
8. Labs/results;
9. Documents;
10. Messages;
11. History;
12. Inbox;
13. Tasks;
14. Prescribing operations;
15. People/Settings.

For each surface:
- remove one-off colors/radii/shadows;
- remove unexplained emoji glyphs where the icon system should be used;
- normalize spacing/typography;
- normalize toolbar placement;
- normalize error/empty/loading behavior;
- verify keyboard focus;
- verify narrow viewport behavior;
- verify minimal/compact/comfortable layout where applicable.

## P1-D — Reduce oversized orchestration components carefully

Large components currently include `PatientWorkspace.tsx`, `TodayDashboard.tsx`, `EncounterWorkspace.tsx`, and `OrderCartModal.tsx`.

Do not rewrite them wholesale.

Extract by responsibility when a seam is obvious:
- data loading;
- tab/workspace orchestration;
- omnibox results;
- order composer;
- visual shell;
- persistence coordination.

Every extraction must preserve current behavior and tests.

## P1-E — Navigation hygiene

Every visible launcher tool must satisfy one of two conditions:
1. it opens a meaningful working surface; or
2. it is intentionally not exposed by default.

Billing/Reports/unfinished Settings must not look production-complete while rendering placeholder text.

## P1 validation matrix

For every converted surface test:
- keyboard navigation;
- focus visibility;
- escape dismissal where appropriate;
- outside-click dismissal where appropriate;
- loading;
- empty;
- error;
- retry;
- success;
- narrow viewport;
- no color-only critical state;
- active patient identity remains visible.

## P1 exit gate

A clinician moving among Today, Schedule, Patient Overview, Encounter, Meds, Labs, Documents, Messages and operational queues experiences one consistent interaction system.

---

# 8. Phase P2 — Complete the patient administrative foundation

Priority: **Core pre-AI product requirement**

## Goal

Make a patient record operationally complete enough that a real practice could manage the patient without relying on another EHR for basic demographics and administrative context.

## P2-A — Patient identity model

Extend the current patient domain deliberately rather than adding arbitrary JSON blobs.

Required concepts:
- legal name;
- preferred name;
- date of birth;
- sex where operationally/clinically required;
- gender identity where collected;
- pronouns;
- MRN;
- active/inactive/deceased/archive status as appropriate;
- preferred language;
- time zone if needed for telehealth/communications;
- photo/avatar optional;
- internal alerts with explicit semantics.

Do not derive mutable age as canonical stored truth when DOB can derive it.

## P2-B — Contact model

Create structured contact information:
- mobile phone;
- alternate phone;
- email;
- mailing address;
- preferred contact method;
- communication permission/preferences.

Changes should be auditable where appropriate.

## P2-C — Related people

Support:
- emergency contact;
- parent/guardian;
- legal representative;
- caregiver/authorized contact;
- relationship;
- contact information;
- communication/consent scope where relevant.

This is particularly important for adolescent psychiatry.

Avoid encoding every relationship directly into the patient row. Prefer a durable related-person/contact model.

## P2-D — Care network

Support:
- PCP;
- referring provider;
- therapist;
- other relevant treating clinicians;
- organization/practice;
- phone/fax/contact;
- relationship to patient.

This becomes the foundation for future record exchange and coordination.

## P2-E — Pharmacy

Use the existing pharmacy/medication architecture where possible.

Patient-facing capabilities:
- preferred pharmacy;
- alternate pharmacies;
- pharmacy identity/contact;
- currently selected prescribing destination;
- historical pharmacy references where required.

Do not make a vendor pharmacy identifier the internal pharmacy primary key.

## P2-F — Insurance / coverage

Architecture already references normalized insurance policies. Complete the user-facing model:

- payer;
- plan;
- member ID;
- group number;
- subscriber relationship;
- subscriber name/DOB when required;
- effective dates;
- primary/secondary order;
- status;
- self-pay state;
- uploaded insurance-card documents if supported.

Eligibility verification belongs to a later integration/revenue phase; coverage capture belongs here.

## P2-G — Patient administration UI

Create one coherent patient-information editor reachable from the patient workspace.

Do not force demographics into the clinical Overview cards.

Recommended presentation:
- persistent concise patient identity header;
- patient-information drawer/workspace for administrative editing;
- progressive sections for demographics/contact, related people, care team, pharmacies, coverage.

Changes should:
- validate before save;
- show saving/saved/failed state;
- reload from authoritative record;
- write audit/provenance where applicable;
- preserve patient binding.

## P2 tests

- create patient with minimum valid information;
- edit patient;
- duplicate MRN rejection;
- guardian/contact CRUD;
- coverage CRUD;
- pharmacy assignment;
- wrong-patient mutation rejection;
- cross-organization access rejection;
- stale client update handling where needed;
- required patient identity remains visible after editing.

## P2 exit gate

A staff member can create and maintain the administrative record required to operate a psychiatric patient chart without touching the database.

---

# 9. Phase P3 — Complete the longitudinal clinical chart

Priority: **Core clinical completeness**

## Goal

Make the patient chart explain the patient over time, not merely present encounters.

## P3-A — Problem/diagnosis workspace

Existing normalized lifecycle foundations should be exposed fully.

Capabilities:
- add diagnosis/problem;
- status: active/resolved/inactive/entered-in-error as already supported;
- onset/date where applicable;
- diagnosis code where applicable;
- source/provenance;
- history of changes;
- reopen/reactivate where appropriate;
- distinguish diagnosis from historical/problem-list context if model supports it.

Overview should show active items; History should preserve prior items.

## P3-B — Allergy/intolerance workspace

Capabilities:
- allergen;
- reaction;
- severity if known;
- type/category;
- status;
- explicit NKDA only when assessed;
- unassessed/unknown remains distinct;
- entered-in-error;
- provenance/history.

Patient header/facts bar must never imply NKDA from an empty query result.

## P3-C — Medication longitudinal truth

Continue using normalized medication truth as authoritative.

Expose:
- active medications;
- historical medications;
- start/stop;
- dose/route/frequency;
- indication where useful;
- prescriber/source;
- reconciliation status;
- external/patient evidence separately;
- relationship to prescription orders without collapsing the concepts.

Support common clinician tasks:
- start;
- modify;
- discontinue;
- mark patient-reported discrepancy;
- reconcile;
- review prior dose trajectory.

## P3-D — Vitals and measurements

Create a first-class longitudinal measurement model/UI for:
- blood pressure;
- pulse;
- weight;
- height;
- BMI derived where appropriate;
- other relevant observations.

Needs:
- date/time;
- source;
- entered by/imported from;
- units;
- trend;
- abnormal/attention state only when rules are governed and clear.

For psychiatry, make medication-relevant trends easy to see.

## P3-E — Structured psychiatric history

Avoid one giant free-text JSON object.

Support meaningful sections such as:
- prior psychiatric diagnoses;
- prior medication trials and outcomes;
- psychotherapy history;
- psychiatric hospitalization;
- suicide attempts/self-harm history;
- violence/aggression history where collected;
- substance-use history;
- trauma history;
- family psychiatric history;
- social history;
- developmental/education history when appropriate.

Implementation may use sectioned versioned records rather than dozens of rigid columns. The key requirements are:
- longitudinal editability;
- provenance;
- readable clinical presentation;
- no silent overwriting of historical context.

## P3-F — Assessments as clinical records

PHQ-9/GAD-7 and future tools should not exist only as calculators.

Create a general assessment-result model capable of holding:
- instrument identity/version;
- responses;
- score;
- interpretation metadata;
- completion time;
- source: patient/staff/clinician;
- encounter association if applicable;
- review status.

Start with the instruments already present in the product.

Show longitudinal trend without implying diagnostic conclusions beyond the instrument.

## P3-G — Unified patient Overview

After underlying data exists, redesign Overview to answer:

1. Who is this patient?
2. What is being treated?
3. What medications are active?
4. What changed recently?
5. What needs attention?
6. What is next?

Overview should summarize authoritative records and link into the detailed workspace.

Do not duplicate separate stores for Overview.

## P3-H — Longitudinal History/timeline

Unify relevant events into a chronological view:
- encounters;
- medication changes;
- diagnoses/problems;
- important results;
- documents;
- communications charted to record;
- assessment scores;
- significant orders/workflow events.

Timeline entries should link to the source object.

Do not flatten all event types into indistinguishable text.

## P3 exit gate

A clinician can understand current treatment and meaningful longitudinal change without opening and rereading a stack of encounter notes.

---

# 10. Phase P4 — Complete scheduling and front-office workflow

Priority: **Required for a usable practice EHR**

## Goal

Turn the existing Today/Schedule foundation into a real appointment workflow.

## P4-A — Appointment domain completeness

Required appointment concepts:
- patient;
- provider;
- date/time;
- duration;
- appointment type;
- location/modality;
- status;
- reason;
- notes where appropriate;
- created/updated metadata.

Statuses should be explicit and controlled, such as:
- scheduled;
- confirmed;
- arrived/waiting;
- in visit;
- completed;
- cancelled;
- no-show.

Avoid state changes that only modify UI state.

## P4-B — Scheduling actions

Implement:
- create appointment;
- reschedule;
- change duration;
- cancel;
- mark no-show;
- check in/arrived;
- start visit;
- complete visit workflow linkage;
- schedule follow-up.

Every action writes through an authoritative API/repository and returns the updated appointment.

## P4-C — Calendar interaction

Support:
- day/week views as appropriate;
- clear current day;
- clinician/provider filter when teams expand;
- click appointment -> patient context;
- create from empty slot;
- visible status;
- no overlapping modal chaos;
- responsive/narrow screen behavior.

Drag/drop rescheduling is optional until ordinary explicit rescheduling is robust.

## P4-D — Today workspace

Today should become an operational cockpit, not a decorative dashboard.

Recommended default information:
- today’s schedule;
- next appointments;
- waiting/arrived patients;
- unresolved tasks/messages/results relevant to today;
- late/no-show status;
- quick open chart/start visit.

Hide metrics that do not change clinician action.

## P4-E — Follow-up loop

From a signed or completed encounter:
- create/suggest follow-up interval deterministically from clinician choice;
- open scheduling flow;
- schedule next appointment;
- return to encounter or Today without losing context.

## P4 tests

- create/reschedule/cancel/no-show;
- start visit opens correct patient and encounter;
- two-patient scheduling cannot cross-bind;
- Today updates after appointment status change;
- reload preserves server state;
- unauthorized user cannot mutate inaccessible appointment/patient.

## P4 exit gate

Front-office and clinician workflows can move a patient from scheduled -> arrived -> visit -> completed -> follow-up without external manual tracking.

---

# 11. Phase P5 — Finish the AI-independent encounter loop

Priority: **Core clinician workflow**

## Goal

Make documentation excellent without requiring scribe or AI.

Existing autosave, section structure, ROS, MSE, risk, follow-up, signing, coding shell, and immutable record foundations should be retained.

## P5-A — Encounter creation/opening

- starting a visit creates or opens the correct draft;
- duplicate accidental drafts are prevented or clearly resolved;
- encounter identity remains patient-bound;
- encounter type and appointment linkage are explicit where useful.

## P5-B — Documentation UX

Ensure clinically useful sections support direct typing and structured assistance without AI:
- chief complaint;
- HPI/interval history;
- review of systems;
- treatment response;
- side effects;
- MSE;
- assessment;
- risk assessment;
- plan;
- follow-up.

Template/vocabulary tools should accelerate entry but never force inaccurate wording.

Every structured picker should retain an escape route such as Other/free text when clinically necessary.

## P5-C — Autosave/recovery

Browser tests must cover:
- typing then switching patient;
- detach/redock;
- refresh;
- close/reopen;
- failed save then retry;
- late response;
- revision conflict;
- signing while a save is pending.

The clinician should always understand whether work is:
- unsaved;
- saving;
- saved;
- failed;
- signed.

## P5-D — Review before signing

Signing UI should clearly show:
- patient;
- date;
- encounter type;
- unresolved required fields if any;
- pending orders/actions that are not part of signing;
- final note sections.

Signing must:
- flush the reviewed draft;
- preserve the exact signed snapshot;
- audit actor/time;
- prevent ordinary editing afterward;
- use addenda/amendments for corrections.

## P5-E — Coding support without AI dependence

Keep coding deterministic/manual unless evidence is governed.

Clinician should be able to:
- select/edit CPT/visit level;
- inspect the evidence inputs the product uses;
- avoid any UI language implying payer acceptance.

## P5 exit gate

A full synthetic psychiatric encounter can be started, documented, recovered, reviewed, signed, reopened, and amended without AI and without losing patient context.

---

# 12. Phase P6 — Finish operational queues and related-object workflows

Priority: **Makes the EHR operational rather than chart-only**

## Goal

Every important incoming or pending item should lead to a concrete object, related context, and action.

The navigation pattern is:

`queue item -> source object -> patient context -> related evidence -> authorized action -> queue resolution`

## P6-A — Inbox/messages

Finish global patient communication workflow:
- unread/read;
- category;
- urgency;
- patient binding;
- open thread;
- reply;
- chart selected communication;
- create task;
- open refill/prescribing workflow when appropriate.

Do not make AI triage required to use the inbox.

Patient-facing transport remains a separate integration concern; internal workflow should already be correct.

## P6-B — Tasks

Support:
- create;
- assign where allowed;
- due date;
- patient-linked or practice-level;
- complete/reopen;
- cancel/delete semantics;
- filter;
- open related chart/object.

Clarify the distinction between scratchpad content and durable tasks.

## P6-C — Lab/result queue

Global results workspace should show:
- new/unreviewed;
- abnormal where represented;
- patient;
- test/date;
- source;
- review/acknowledgement state.

Action:
- open patient result;
- review source details;
- acknowledge/result action through authoritative lifecycle;
- create follow-up task/order where appropriate.

Do not build diagnostic AI into the queue as a prerequisite.

## P6-D — Document queue

Global Documents should expose the existing document workflow:
- received;
- needs review;
- reviewed;
- filed;
- superseded.

Support:
- actual uploaded bytes/document object;
- preview/reopen exact version;
- patient assignment/correlation if workflow permits;
- review/file;
- version history;
- error/retry;
- wrong-patient protection.

## P6-E — Prescribing operations

Preserve existing architecture and make operations discoverable:
- staged prescription intents;
- authorized/pending transmission;
- submitted/uncertain/failed;
- cancellation;
- refill/renewal;
- change requests;
- recovery items.

Do not equate transaction success with medication truth.

## P6-F — No dead ends

For each queue verify:
- where did this item come from?
- which patient does it belong to?
- what related evidence is needed?
- what action can be taken?
- how does the user return to the queue?
- what closes/resolves the item?

## P6 exit gate

A clinician or staff member can work all major queues to resolution without opening duplicate disconnected dashboards.

---

# 13. Phase P7 — Forms, consents, assessments, and patient-facing intake

Priority: **Needed before replacing a conventional EHR in practice**

## Goal

Move pre-visit information collection into the same authoritative patient record.

## P7-A — Form definition model

Support versioned form definitions:
- form ID;
- title;
- version;
- fields;
- required/optional;
- active/inactive;
- intended use.

Do not hard-code every future form as a bespoke React page.

## P7-B — Form completion model

Store:
- patient;
- form/version;
- respondent;
- answers;
- submitted time;
- review state;
- linked encounter/appointment if appropriate.

Submitted forms are records; edits should be versioned or create a new submission rather than silently replacing signed/submitted responses.

## P7-C — Initial psychiatric intake

Implement a clinically useful intake form using the general form system, covering practice-selected information such as:
- presenting concerns;
- medication history;
- psychiatric history;
- substance use;
- relevant medical history;
- social/developmental history;
- safety history.

Do not automatically convert every patient answer into clinician-verified clinical truth. Patient-submitted evidence should remain identifiable until reviewed where appropriate.

## P7-D — Standard assessments

Use the assessment-result model from P3:
- PHQ-9;
- GAD-7;
- other instruments only when intentionally added.

Allow:
- staff launch;
- patient completion;
- clinician review;
- trend display.

## P7-E — Consents and acknowledgements

Support versioned:
- treatment consent;
- privacy acknowledgements;
- telehealth consent;
- practice policies;
- release-of-information workflows as appropriate.

Capture signer/relationship/time/version.

Electronic-signature implementation must be deliberate; do not represent a simple checkbox as legally sufficient signature if requirements demand more.

## P7-F — Patient-facing access boundary

Build patient authentication/access as a distinct authority model from clinician sessions.

Do not expose clinician APIs directly to patients by hiding buttons.

Patient portal/API requirements:
- patient identity;
- allowed record scope;
- appointment/forms/messages workflows;
- strict patient-to-record binding;
- revocation/recovery.

## P7 exit gate

A new synthetic patient can be onboarded, provide required information/assessments/consents, and have those records reviewed inside the EHR.

---

# 14. Phase P8 — External clinical integration readiness

Priority: **After internal workflows are complete**

## Goal

Make external integrations attach to mature internal workflows rather than shape the product.

## P8-A — DrFirst / EPCS

DrFirst remains the selected planned prescribing vendor.

Do not implement against guessed vendor contracts.

When access is available:
1. obtain authoritative vendor interface/product documentation;
2. document required enrollment/certification;
3. map DrFirst identifiers/events into the existing vendor-neutral adapter boundary;
4. preserve EHR-owned prescription intent and medication truth;
5. verify callbacks;
6. test uncertain outcomes;
7. test refill/change/cancel flows;
8. test EPCS through the supported vendor workflow;
9. preserve patient context entering/leaving vendor UI;
10. build operational support/recovery.

Mock PIN/OTP or local transport is not EPCS proof.

## P8-B — Laboratory integration

Choose one initial supported lab interface.

Map:
`EHR lab order -> adapter -> vendor order -> inbound result -> normalized observation/result -> review queue`

Required:
- patient correlation;
- order correlation;
- duplicate/replay handling;
- units/reference ranges;
- source provenance;
- result correction/amendment;
- failure/retry;
- acknowledgement.

## P8-C — Communications transport

Attach SMS/email/portal transport behind the existing message workflow.

Internal charted message truth remains distinct from transport delivery evidence.

## P8-D — Scheduling/reminder transport

Connect reminders/booking only after internal appointment state is authoritative.

## P8 exit gate

At least one external adapter can be replaced without rewriting core patient/clinical workflow.

---

# 15. Phase P9 — Billing and revenue-cycle foundation

Priority: **Required for an all-in-one commercial EHR; may remain hidden until implemented**

## Goal

Turn the Billing destination into a real operational workflow rather than a placeholder.

Keep financial truth separate from clinical truth.

## P9-A — Coverage/eligibility

Using coverage captured in P2:
- eligibility request record;
- request/result timestamps;
- payer/vendor reference;
- normalized coverage result;
- errors/unknown state.

Never convert no response into “eligible.”

## P9-B — Charge/coding record

Create a durable financial record tied to:
- patient;
- encounter;
- selected code(s);
- diagnosis linkage;
- clinician review;
- status.

Do not treat suggested coding as submitted billing evidence.

## P9-C — Claim lifecycle

Model:
`prepared -> reviewed -> submitted -> accepted/rejected/pending -> adjudicated -> paid/denied/partially paid -> reconciled`

Use an adapter for clearinghouse/payer communication.

Store normalized status plus external evidence/provenance.

## P9-D — Remittance / ERA

Support:
- claim correlation;
- payer payment;
- adjustment/reason codes;
- patient responsibility;
- reconciliation state.

## P9-E — Denial queue

A denial should be an actionable object:
- claim;
- reason;
- source;
- deadline if known;
- related encounter/coverage;
- follow-up task/action.

## P9-F — Patient balance

Keep account balance derived from authoritative charges/payments/adjustments rather than a manually overwritten total.

## P9 exit gate

One complete synthetic claim can move from signed encounter to reconciled payment/denial lifecycle with no fabricated payer state.

---

# 16. Phase P10 — Interoperability and data portability

Priority: **Architecture protection and future commercial readiness**

## Goal

Allow data to enter/leave the EHR without forcing the internal product to become a FHIR-shaped UI.

## P10-A — Export

Support patient-level export of appropriate structured records and documents.

Start with:
- demographics;
- problems;
- allergies;
- medications;
- encounters;
- observations/results;
- documents metadata/content where allowed.

## P10-B — Import/reconciliation

Incoming records are evidence, not automatically authoritative truth.

Flow:
`import -> parse/map -> patient correlation -> candidate evidence -> clinician review/reconciliation -> authoritative update`

Medication import must reuse medication reconciliation rather than writing directly to active medications.

## P10-C — Standards boundary

Keep FHIR/USCDI/other external formats at the adapter/interoperability layer.

Do not redesign internal UI state around external resource shapes.

## P10-D — Provenance

Imported data must retain:
- source system;
- source identifier;
- received time;
- original version/reference where appropriate;
- reconciliation status.

## P10 exit gate

A synthetic patient can be exported and an external clinical record can be imported as reviewable evidence without corrupting internal truth.

---

# 17. Phase P11 — Production infrastructure and PHI readiness

Priority: **Blocking before real PHI**

## Goal

Move from development-safe architecture to intentionally operated healthcare infrastructure.

## P11-A — Production database

Select and implement production persistence such as PostgreSQL or another deliberately reviewed production database.

Requirements:
- formal migrations;
- transactional correctness;
- tenant/organization isolation;
- connection/security configuration;
- backups;
- restore;
- performance indexes;
- immutable/signed-record guarantees preserved.

Migration from SQLite must preserve:
- IDs;
- clinical history;
- provenance;
- version history;
- signed snapshots;
- audit records;
- prescription lineage.

## P11-B — Secrets and encryption

- no production secrets in repo;
- managed secret storage;
- rotation process;
- encryption in transit;
- encryption at rest;
- document encryption/storage controls;
- least-privilege service credentials.

## P11-C — Authentication/session hardening

Existing account activation/password/login throttling is a foundation.

Complete:
- forgotten-password recovery;
- secure recovery-token lifecycle;
- optional/required MFA decision;
- device/session inventory if selected;
- session termination;
- source-address throttling behind trusted infrastructure;
- SSO if required by target customers.

## P11-D — Protected document/object storage

Replace development/local document assumptions with protected object storage.

Required:
- access authorization;
- object key isolation;
- content hash/integrity;
- version preservation;
- malware/content controls as appropriate;
- backup/retention;
- no public bucket/object URLs.

## P11-E — Audit operations

Define:
- retained events;
- retention period;
- access to audit data;
- organization isolation;
- export/review;
- alert-worthy security events.

## P11-F — Backup and disaster recovery

Automate:
- database backup schedule;
- object storage backup/versioning as appropriate;
- offsite separation;
- retention;
- restore rehearsal;
- documented recovery procedure.

Development backup success is not production DR.

## P11-G — Monitoring and incident response

Monitor:
- service availability;
- error rate;
- database failures;
- job/integration failures;
- security/auth anomalies;
- backup failures;
- storage failures.

Document:
- who is alerted;
- severity;
- response steps;
- recovery;
- post-incident review.

## P11-H — Deployment controls

- environment separation;
- production configuration validation;
- migrations before/with deploy;
- rollback/recovery strategy;
- CI gate;
- dependency reproducibility;
- no synthetic test user accidentally granted production access.

## P11 exit gate

An explicit production-readiness review authorizes introduction of PHI. Until then, synthetic data only.

---

# 18. Phase P12 — Pre-AI acceptance certification

Priority: **Final gate before AI expansion**

## Goal

Prove the EHR works as a product, not merely that individual features exist.

## Acceptance scenario A — New patient

1. Staff signs in.
2. Creates a patient.
3. Adds contact information.
4. Adds guardian/emergency contact as applicable.
5. Adds coverage.
6. Adds pharmacy.
7. Schedules intake.
8. Sends/assigns intake forms.
9. Patient completes forms/assessments in the synthetic portal flow.
10. Staff/clinician reviews submissions.
11. Patient appears correctly on schedule.

## Acceptance scenario B — Psychiatric intake

1. Open patient from Today or omnibox.
2. Verify identity and administrative information.
3. Review submitted intake.
4. Start encounter.
5. Add/review problems/allergies.
6. Review medication history/reconciliation.
7. Document assessment/MSE/risk/plan.
8. Add medication/order if appropriate.
9. Order labs if appropriate.
10. Sign encounter.
11. Schedule follow-up.
12. Reopen chart and confirm all data persisted.

## Acceptance scenario C — Follow-up med management

1. Open existing patient.
2. Review longitudinal medication trajectory.
3. Review recent labs/vitals/assessment trend.
4. Start follow-up encounter.
5. Modify medication.
6. Create prescription intent.
7. Complete internal authorization flow.
8. Document response/side effects/risk/plan.
9. Sign.
10. Create follow-up task and appointment.

No AI required.

## Acceptance scenario D — Inbox/refill

1. Patient message/refill request appears.
2. Staff/clinician opens item.
3. Patient context is obvious.
4. Source message remains visible.
5. Refill/change workflow opens.
6. New intent is staged rather than rewriting prior prescription.
7. Clinician reviews/authorizes.
8. Queue item resolves appropriately.
9. Chart/message history retains evidence.

## Acceptance scenario E — Abnormal/new result

1. Result enters queue.
2. User opens result.
3. Correct patient opens.
4. Prior relevant data is reachable without losing result context.
5. Result is reviewed/acknowledged.
6. Follow-up task/order/message can be created.
7. Queue state updates.

## Acceptance scenario F — Multi-patient workspace

1. Open patient A.
2. Begin unsaved encounter work.
3. Open patient B.
4. Detach B.
5. Resize/snap B.
6. Return to A.
7. A retains draft/section/scroll.
8. Reload.
9. Accessible workspaces restore.
10. No response or action crosses patient identity.

## Acceptance scenario G — Administrative account change

1. Owner opens People.
2. Adds staff member.
3. Sets role/access.
4. Issues activation.
5. New user activates.
6. Assigned-only user cannot access other patients.
7. Revoking membership invalidates access/session as designed.

## Acceptance scenario H — Recovery

1. Simulate save/network failure.
2. UI shows failure.
3. Retry succeeds.
4. No duplicate consequential action is created.
5. Restart application.
6. Durable records and workspace state recover.
7. Backup/restore rehearsal preserves signed and versioned records.

## P12 exit gate

The full acceptance suite passes using synthetic data and ordinary UI interactions.

At this point the product is considered **pre-AI complete**.

---

# 19. AI work after the pre-AI gate

Only after P12 should major AI expansion become the main workstream.

The advantage is that AI will then operate on stable primitives instead of compensating for unfinished application behavior.

Target AI interaction becomes:

`intent -> retrieve authoritative context -> reason/draft/propose -> show sources/uncertainty -> clinician review -> existing authorized action primitive`

Examples:
- summarize longitudinal course;
- prepare pre-visit briefing;
- draft note from transcript;
- compare symptom/vital/lab trajectories;
- identify unresolved follow-up;
- propose orders;
- propose medication reconciliation actions;
- draft patient replies;
- surface coding evidence;
- operate layout/workspace controls.

AI should reuse actions already proven manually:
- open patient;
- navigate section;
- create task;
- stage order;
- insert reviewed text;
- open related evidence;
- prepare draft reply;
- reconfigure workspace.

AI must not introduce separate hidden mutation paths.

---

# 20. Immediate implementation queue

Agents should take these in order unless current `main` changes materially.

## Next 1 — Restore fully green CI
Fix the rail-collapse browser regression. Verify all CI layers.

## Next 2 — Authoritative patient roster
Remove static patient-array dependence from `PatientWorkspace.tsx` and related live runtime surfaces.

## Next 3 — Authoritative global workspace patient resolution
Make Global Inbox/Tasks and other global surfaces resolve patients from the authenticated roster rather than fixtures.

## Next 4 — Runtime-state cleanup
Remove remaining direct fixture mutations and hard-coded patient IDs. Ensure empty/stale-restoration behavior is safe.

## Next 5 — UI primitive inventory and extraction
Standardize buttons, fields, dialogs, status badges, empty/loading/error/save states, and workspace headers based on existing repeated patterns.

## Next 6 — Today visual/workflow pass
Apply the design system and remove low-value dashboard density. Make Today action-oriented.

## Next 7 — Schedule visual/workflow pass
Complete appointment create/edit/reschedule/cancel/no-show/check-in/start-visit/follow-up basics.

## Next 8 — Patient administrative model
Implement structured demographics/contact/related-person/care-network data.

## Next 9 — Patient administrative UI
Make those records editable from a coherent patient-information workspace.

## Next 10 — Coverage and pharmacy UI
Expose existing/extended normalized coverage/pharmacy concepts.

## Next 11 — Vitals/measurement lifecycle
Implement authoritative longitudinal vitals and trends.

## Next 12 — Structured psychiatric history
Add versioned/reviewable history sections.

## Next 13 — Assessments as records
Move PHQ-9/GAD-7 from calculator-only behavior into longitudinal assessment records.

## Next 14 — Overview rebuild on authoritative data
Once underlying records exist, redesign Overview around current state/change/pending attention.

## Next 15 — Complete deterministic encounter acceptance
Browser-test the entire encounter lifecycle without AI.

## Next 16 — Finish Labs/Documents/Inbox/Tasks global queues
Eliminate placeholder/dead-end behavior and prove queue-to-action navigation.

## Next 17 — Forms/intake/consents
Build the generic form lifecycle and first psychiatric intake workflow.

## Next 18 — Production infrastructure
Complete protected storage, auth recovery, secrets, audit operations, automated backup/restore, monitoring and deployment controls.

Do not jump to Next 12 because Next 5 is tedious. The dependency order is intentional.

---

# 21. Completion requirements for every implementation slice

Before calling a slice complete, the agent must report:

1. **Starting main SHA**
2. **Resulting main SHA**
3. **Files changed**
4. **Clinician capability added/fixed**
5. **Relevant Product Vision requirement IDs**
6. **Signal flow used**
7. **Authority/source-of-truth boundary**
8. **Tests added/updated**
9. **Typecheck result**
10. **Integration/unit test result**
11. **Production build result**
12. **Browser test result where UI behavior changed**
13. **Known remaining limitation**
14. **Exact next roadmap slice**

If a check fails, do not report the work as complete.

---

# 22. Roadmap maintenance rules

This roadmap must stay aligned with the code.

After a meaningful implementation:
- update the relevant phase status;
- mark completed sub-slices with commit evidence;
- do not delete still-valid requirements;
- do not rewrite history to imply broader completion than tests prove;
- move the Immediate Implementation Queue forward;
- record true architectural decisions in `DECISIONS.md`, not only here.

Status language:
- **Implemented foundation** — architecture/code exists with focused tests.
- **Partial** — useful slice exists but the workflow or product surface is incomplete.
- **Verified** — intended behavior has appropriate automated/manual evidence.
- **Deferred** — intentionally postponed.
- **Blocked** — cannot proceed until a named dependency is resolved.

Avoid percent-complete claims in durable roadmap state unless the calculation method is explicit. Use gates and evidence instead.

---

# 23. North-star test for every future feature

Before adding anything, ask:

**Does this make it easier for a clinician to find the correct patient/context, understand what changed, keep relevant evidence visible, complete an authorized action, and resume work without losing state?**

If yes, determine where it belongs in the dependency order.

If no, it is probably not the next thing to build.

The final pre-AI product should feel calm, fast, obvious, recoverable, and clinically trustworthy before it feels intelligent.
