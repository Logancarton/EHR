# UI System

The shared interaction grammar for Clinical Bond. `PRODUCT_VISION.md` owns what the
product should feel like; this file owns the primitives that make every surface feel
like the same product, and the rules they enforce.

Roadmap phase P1 created it. Surfaces are converted incrementally — this document
records what exists, what it guarantees, and what has not been converted yet.

---

## 1. Why it exists

The visual tokens landed before anything shared consumed them, so each surface kept
growing its own controls. Measured on `main` at the start of P1:

| Finding | Count |
| --- | --- |
| CSS rules across 19 stylesheets | 2,365 (16,245 lines) |
| Rules whose selector names a button | 207 |
| Distinct button visual signatures (background/colour/border/radius/padding/size/weight) | 151 |
| `--radius-*` tokens defined | 4 |
| Uses of those tokens | **0** |
| Hard-coded `border-radius` values | 8px ×198, 12px ×105, 16px ×70, 999px ×46, 4px ×40 |
| Hard-coded `#ffffff` | 223 |
| Stray glyphs used as chrome instead of the icon system (`＋`, `▶`, `◄`, `✎`, `◫`, …) | ~90 |
| Surfaces re-implementing `loading → empty → rows` by hand | 8 |

The radius scale is the clearest symptom: it was `6/10/16`, which matched nothing the
product actually drew, so every rule reached for a pixel value instead. It is now
`4/8/12/16/pill` — the values already on screen.

The eight hand-written async chains matter more. Most had no error branch, so a queue
that failed to load rendered "No documents match these filters." In a clinical queue,
"nothing to review" and "this did not load" mean opposite things.

---

## 2. What the primitives guarantee

Behaviour lives in `app/lib/ui-system.ts` as plain functions, tested in
`tests/ui-system.test.ts`. The components in `app/components/ui/` render it.

### Button — `ui/Button.tsx`

Variants: `primary`, `secondary`, `tertiary`, `destructive`, `icon`. Sizes `sm`/`md`.

Three different kinds of "cannot use this right now", kept distinct because they mean
different things to the person looking at the control:

| Prop | Meaning | Behaviour |
| --- | --- | --- |
| `loading` | *this* control's action is running | stays focusable, `aria-busy`, click swallowed |
| `busy` | another change on the surface is saving | disabled, explains itself automatically |
| `disabled` | the action is unavailable on its own terms | disabled, `disabledReason` required |

- **An action in flight stays focusable.** `loading` sets `aria-busy` and
  `aria-disabled`, never native `disabled` — marking it natively disabled would eject
  a keyboard user from the control they just activated. The click is swallowed, so it
  cannot be fired twice.
- **An unavailable action explains itself.** `disabled` requires `disabledReason`,
  enforced by the prop types. A dead control with no explanation is the defect, not
  the disabling.
- **A toggle reports its state.** `pressed` sets `aria-pressed` and a fill/weight
  change, so the active filter is not distinguished by tint alone.

### AsyncSection — `ui/AsyncSection.tsx`

One lifecycle for every list-shaped surface:

```
idle -> loading -> ready | empty
idle -> loading -> error -> retry
```

- A **failed load is never shown as an empty one**, and always carries a retry the
  clinician can reach from where it failed.
- A **refresh over content keeps the content** and marks the region `aria-busy`,
  rather than blanking a list someone is reading.
- A **retry in flight shows progress**, not the error it is already addressing.

`EmptyState`, `LoadingState` and `InlineError` are exported for surfaces that need one
piece on its own — an action that failed while the surface itself loaded fine, for
example.

### SaveStateIndicator — `ui/SaveStateIndicator.tsx`

`unsaved | saving | saved | failed`, in the same words everywhere.

- **"Saved" is only said after the server confirmed it**, stamped with when it landed.
- A **failure is announced assertively** and offers a retry; routine progress is
  announced politely.
- A signed or otherwise finished record is *not* a save state — use `StatusBadge`.

### StatusBadge — `ui/StatusBadge.tsx`

Tones `neutral | info | success | warning | danger`, each with its own glyph and a
word. **No state is carried by colour alone**: some of these mark overdue monitoring
and unacknowledged results.

---

## 3. Converted surfaces

| Surface | Status |
| --- | --- |
| Global Inbox | converted — lifecycle, filters, refresh |
| Global Tasks | converted — lifecycle, filters, compose |
| Global Documents queue | converted — lifecycle, filters, refresh |
| Global Labs queue | converted — lifecycle, filters, acknowledge, action error |
| Prescribing operations queue | converted — lifecycle |
| Patient Labs | converted — lifecycle plus retry; inline styles removed |
| Encounter toolbar | converted — shared save indicator and signed badge |
| Shell / omnibox / tabs | converted — filter chips from one registry, answer-card actions, tab strip glyphs |
| Today | converted — header, date nav, briefing actions, roster filters, schedule row actions, action queue |
| Schedule (zoomable calendar) | converted — date nav, zoom controls with stated limits, card actions |
| Patient header | converted — all three densities |
| Section tabs | converted — a real tablist with arrow-key navigation |
| Clinical facts bar | converted — its CSS-module button family replaced by the shared one |
| Overview | converted — status badge, timeline types, restore pills |
| Patient administration drawer | converted — built on the grammar from the start |
| Medications & reconciliation | converted — row actions, review form, reconciliation choices |
| Patient Documents | converted — lifecycle with an error branch and retry it never had |
| Patient Messages | converted — filters, compose, chart-to-record actions |
| Patient History | converted — stream filters from one registry, shared inline error |
| Patient Labs, prescription work | converted |
| People / Settings | converted |
| Dashboard design preview (`/preview/dashboard`) | built on the grammar from the start — lifecycle, buttons, status badges, tokens only |
| Encounter body (scribe, context rail, sign modal) | not yet — only the toolbar is converted |
| Order cart, Clinical AI panel, workspace customizer, team dock, audit modal | not yet — modals and companion panels are not on the P1-C list |

About 270 raw `<button>` elements remain app-wide. Most are either structural chrome
with their own established styling (rails, browser tabs, launcher, card controls) or
sit in the surfaces listed above as unconverted. The count is recorded rather than
rounded down: the phase is not finished, and the table says where.

### Fixed while converting

Conversion is also where invented content surfaces. On Today, the morning briefing's
fallback action and three of the four "Daily Shortcuts" pointed at hard-coded charts
and described clinical detail — a titration, an intake baseline — that nothing in the
record backed. They are now derived from the day's schedule and the practice action
queue, and are simply absent when the day contains nothing to offer.

Still fixture-backed on Today and out of this phase's scope: `patientLabHistory` and
the per-patient-id medication lists behind the overdue-lab calculation. Those belong
with the longitudinal chart work in P3.

Unconverted surfaces still work; they just have not been brought onto the shared
grammar. Convert them in the P1-C order in `ROADMAP.md`, one surface per change, with
the P1 validation matrix run against each.

---

## 4. Rules for new work

1. Reach for a primitive before writing a control. If none fits, say why in the
   commit rather than adding a 208th button rule.
2. Never hard-code a colour or radius in a new rule — the tokens in `globals.css`
   cover both, and the radius scale now matches what the product draws.
3. Every async surface uses `AsyncSection` or gives the same four states by hand,
   error branch included.
4. Every disabled control carries a reason.
5. Every status marker carries a word and a glyph.
6. Extract a new primitive only from repetition that already exists in at least three
   surfaces. This is not a component library for hypothetical needs.
7. A design preview is a consumer of this grammar, never an exception to it. The
   DB-1 dashboard prototype introduced no colour or radius value of its own and no
   eighth primitive; it is worth reviewing precisely because it is drawn in the
   product's own material. Two surface-level traps it hit are worth knowing before
   the next one: `body` is `overflow: hidden` for the workspace's sake, so a new
   full-page surface must own the viewport height and hand scrolling to a column
   rather than ask for `min-height: 100vh`; and `overflow: hidden` on a card clips
   the popovers that open out of it, so round the header's corners instead.
8. **Never style bare elements across a surface's descendants.** A rule like
   `.snapshot-grid span { display: block }` outranks `.ui-status` and silently
   re-styles any primitive dropped into that card — a status badge landed as a
   full-width block because of exactly this. Scope surface rules to the elements the
   surface actually owns (`> div > span:not([class])`), so anything that opted into a
   class keeps its own styling. Expect to hit this on each surface you convert.


## 5. Three-row navigation (2026-09-16)

`ToolNavigation` groups existing destinations into labeled rounded tool buttons below
the global header. Use the shared Icon family and visual tokens. Menus close on selection,
outside click, focus leaving the navigation, or Escape; Escape restores trigger focus and
does not dismiss the underlying workspace. Arrow Down enters a destination list; arrows,
Home and End move within it. Workspace retains the existing saved-layout controls.

The left sidebar is not mounted. Its stored preferences remain backward compatible but
must not reintroduce a gutter. Account/preferences stay in the global header, including
narrow screens. All content overlays use the measured tab-strip bottom rather than a
hard-coded two-row height. Tests that formerly drove the sidebar now use the tool menus;
companion personalization coverage remains active.

### Dashboard visual density

Dashboard cards use quiet borders rather than raised shadows. Full-screen access remains in each header; movement, width, collapse, configuration, and hiding live under the keyboard-accessible More options disclosure. The date and provider share a compact heading on wide screens. Empty roster days use a shorter month calendar while retaining date selection. The global search shows “Search or ask AI…” when idle.

---

## 6. CSS ownership and stacking

Clinical Bond uses globally loaded CSS, but **global loading does not mean global
ownership**. A selector belongs in the narrowest stylesheet that owns the surface.
`globals.css` is reserved for reset/document defaults, root design tokens, typography,
application-shell geometry, shared accessibility/focus conventions, and application-level
stacking tokens. Feature presentation belongs in the existing feature stylesheet
(`command-bar.css`, `workspace-split.css`, `sidebar.css`, `google-calendar.css`,
`encounter-note.css`, and so on). CSS Modules remain appropriate for naturally isolated
components; there is no repo-wide module-conversion target.

### Stacking contract

The governing rule is **scope first, layer second, number last**.

Before adding or increasing a z-index, first ask which stacking context should own the
element. Calendar event chips, Intake timeline markers, encounter toolbar/dock chrome,
and similar feature-local layers use small local values inside an isolated/owned feature
context. They must not be promoted to application-level tokens merely because they have
a z-index.

Only surfaces that genuinely compete across application boundaries use the root tokens
declared in `globals.css`:

| Token family | Intended use |
| --- | --- |
| `--z-chrome-base`, `--z-chrome`, `--z-chrome-edge` | persistent shell chrome and its resize edge |
| `--z-drawer-inline`, `--z-global-workspace` | cross-feature drawers/workspaces that sit above in-canvas chrome |
| `--z-popover`, `--z-menu`, `--z-app-launcher` | application menus/popovers that may cross feature boundaries |
| `--z-floating-pane`, `--z-window-tray`, `--z-dock` | detached/floating workspace surfaces and global docks |
| `--z-toast` | application-level notifications |
| `--z-modal`, `--z-modal-elevated`, `--z-submodal` | full-app modal layers with explicit escalation |
| `--z-command` | command/omnibox surfaces that intentionally sit above ordinary application UI |
| `--z-system` | exceptional system/authentication overlay only |

The numeric values preserve the existing ordering contract; they are not a ladder for new
features to climb. A new `z-index: 73` or `z-index: 9999` at root scope is a design
smell. Establish or reuse the correct stacking context first, then use the semantic token
only if the element truly participates in root-level stacking.

The encounter and Calendar roots intentionally isolate their internal chrome. Do not
remove those boundaries to solve an overlap. Likewise, New Intake remains docked below
the measured workspace tab strip rather than becoming a viewport-blanketing modal.

### Stacking topology

This is the root-level map programmers should consult before adding a layer. It is
intentionally about ownership and boundaries, not just numeric order.

| Surface | CSS owner | Context / positioning | Contract |
| --- | --- | --- | --- |
| Application top bar + workspace tabs | `globals.css` / workspace chrome styles | root application chrome | stays above ordinary canvas content; measured tab-strip bottom publishes `--workspace-chrome-h` |
| Tool navigation, launcher, profile/rail menus | `tool-navigation.css`, `sidebar.css`, shell styles | root popover/menu layer | may cross feature boundaries; use semantic menu/popover tokens |
| Global module shell | `global-workspaces.css` | fixed root-level workspace | above Calendar/Encounter in-canvas chrome, below persistent tabs and higher app overlays |
| Detached patient panes / window tray | `workspace-split.css`, `window-manager.css` | floating app workspace | participates in app-level floating/window ordering |
| Patient information drawer | `ui-system.css` | app drawer | above owning canvas, below true modal/submodal surfaces |
| Encounter toolbar + coding dock | `encounter-note.css` | local to `.encounter-workspace-root` with `isolation: isolate` | local z-index only; must never pierce global workspaces |
| Encounter signing ceremony / app toast | encounter/app overlay styles | outside encounter isolation | genuine app-level modal/toast surfaces |
| Calendar header, now-line, events, hover states | `google-calendar.css` | local to `.gcal-root` with `isolation: isolate` | local 1/4/8/9/10/15/20-style ordering stays local |
| Calendar event editor / detail popover | `google-calendar.css` | Calendar-owned overlay inside isolated root | above Calendar events/header without becoming a global token |
| Calendar patient drawer | `google-calendar.css` + patient drawer primitive | Calendar-scoped drawer | above Calendar editor/content as currently specified, still trapped by Calendar root |
| Intake New Intake dock | `intake-workspace.css` | fixed app overlay beginning at `--workspace-chrome-h` | right-docked, leaves tabs reachable, uses the existing elevated modal token |
| Intake scheduling canvas cards/preview/now marker | `intake-workspace.css` | local Intake canvas | small local z-index scale only |
| Command/omnibox surface | `command-bar.css` / omnibox styles | root command layer | intentionally above ordinary app UI; use `--z-command` |
| Full application modal / submodal / system gate | shared/app overlay styles | root overlay | use `--z-modal`, `--z-modal-elevated`, `--z-submodal`, or `--z-system` according to intent |

A transform, opacity/filter, backdrop filter, positioned flex/grid item, or containment
rule can create a stacking context even without an explicit high z-index. When a layer
looks wrong, inspect that boundary before changing a number.

### Ownership examples

- `command-bar.css` owns `.patient-search-wrap` and omnibox result presentation;
  `globals.css` owns the topbar shell column that contains it.
- `workspace-split.css` owns `.workspace`, `.workspace-body`,
  `.primary-workspace-pane`, detached panes, and split-window geometry; the application
  grid remains global.
- `sidebar.css` owns the dynamic shortcut rail's presentation and animations. Shared
  rail/companion resizing and cross-feature menu layers may remain global when both
  surfaces intentionally consume them.
- A repeated selector is not automatically duplicate code. Breakpoint/state overrides
  and intentional later cascade layers remain valid when their ownership is explicit.

When moving CSS, preserve import-order behavior and computed appearance first. Do not
optimize for `globals.css` line count, and do not replace a justified `!important`
with a more specific selector merely to reduce the keyword count.

