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
| Shell / omnibox / tabs | not yet |
| Today, Schedule | not yet |
| Patient header, Overview, Meds, Documents, Messages, History | not yet |
| People / Settings | not yet |

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
