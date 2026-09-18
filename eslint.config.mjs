import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // eslint-config-next only wires a narrow slice of jsx-a11y (ARIA validity).
  // This is a keyboard-heavy clinical workspace (modals, icon-only controls,
  // tabs, custom interactive elements), so bring in the plugin's full
  // recommended set for the checks that slice leaves out.
  {
    rules: jsxA11y.configs.recommended.rules,
  },

  // Type-aware correctness rules. Async clinical actions (orders, prescriptions,
  // signing, audit writes) must not fail silently, so mishandled promises are
  // hard errors rather than warnings. `projectService` is the current
  // typescript-eslint mechanism for type-aware linting without a hand-maintained
  // `project` glob list.
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      // React event handlers that are `async` (e.g. onClick={async () => {...}})
      // are a normal pattern here, not a misuse of Promise-returning callbacks;
      // only flag genuine mismatches (async passed where a non-void return is
      // checked, Promise misused in a boolean/spread context, etc.).
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/only-throw-error": "error",
    },
  },

  {
    rules: {
      // TypeScript-aware unused-variable checking, in place of core no-unused-vars
      // (see eslint-config-next/typescript, which already turns the core rule
      // off for TS files). Underscore-prefixed names are how this codebase spells
      // "intentionally unused" (adapter stubs, reserved callback params).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // STAGED, not disabled: the baseline run found ~636 pre-existing explicit
      // `any` uses across ~109 files. Fixing them requires case-by-case judgment
      // (real type vs. genuinely dynamic value), so the rule stays on as visible
      // signal (`npm run lint` prints it) without failing the build. Tighten to
      // "error" once the backlog is worked down. See docs/DECISIONS.md.
      "@typescript-eslint/no-explicit-any": "warn",

      // STAGED: eslint-plugin-react-hooks v7's `recommended` config bundles the
      // newer React Compiler readiness rules as hard errors. Three of them
      // (`refs`, `immutability`, `preserve-manual-memoization`) surfaced real
      // pre-existing patterns — syncing a ref during render, a callback closing
      // over state declared later in the same component, a useMemo dependency
      // array that doesn't structurally match what the compiler infers — that
      // are common, working React code today but would need real hook-architecture
      // changes to satisfy, not local fixes. `rules-of-hooks` (correctness) and
      // `exhaustive-deps` (already warn upstream) are unaffected. See
      // docs/DECISIONS.md for the full baseline and rationale.
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/set-state-in-effect": "warn",

      // Dialogs and inline "add" forms here are opened by an explicit clinician
      // action (not present on initial page load), so moving focus straight to
      // the first field is the WCAG-recommended behavior, not the page-load
      // autofocus anti-pattern this rule targets. Every occurrence in the
      // baseline is that pattern.
      "jsx-a11y/no-autofocus": "off",

      // STAGED: enabling the plugin's full recommended set (above) surfaced
      // real, widespread pre-existing debt, not one-off mistakes:
      //  - label-has-associated-control (137, 18 files): this codebase also
      //    uses bare `<label>` as a generic field-caption/typography element
      //    for read-only display fields that have no control to associate
      //    with at all, not only for real form inputs. Resolving this means
      //    sorting "real form label" from "field caption that should be a
      //    <span>/<dt>" file by file.
      //  - click-events-have-key-events / no-static-element-interactions (71,
      //    60): the modal-backdrop-click-to-dismiss `<div onClick>` pattern
      //    used throughout (see app/components/compliance/AuditComplianceModal.tsx
      //    for a representative instance) plus similar clickable rows/cards.
      //    Every modal in the baseline also exposes a real `<button>` close
      //    control, so the backdrop click is a mouse-only convenience layered
      //    on an already-keyboard-reachable dismissal, not a keyboard trap —
      //    but the rule can't see that, and a correct fix (shared
      //    ModalBackdrop primitive with a synthetic key handler) is a real
      //    component, not a per-file patch.
      //  - no-noninteractive-element-interactions (14): the same family of
      //    issue on non-div elements.
      // Kept on as visible signal; tighten per-rule once each backlog above
      // is worked through. See docs/DECISIONS.md.
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
    },
  },

  {
    // node:test's `test(name, fn)` is registered, not awaited, at the top
    // level of every file in this suite — the runner drains the queue itself.
    // That is the idiom, not a bug: type-aware no-floating-promises has no way
    // to special-case it, so it would otherwise flag ~340 correct call sites
    // across the whole suite. Scoped to `*.test.ts` only; `tests/browser/**`
    // Playwright specs and app source keep the rule at "error".
    files: ["tests/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
    },
  },

  // Repo-wide Prettier adoption is deferred (see docs/DECISIONS.md — it would
  // reformat ~476 of ~480 TS/TSX files, all unrelated to this change). This
  // just turns off the handful of ESLint formatting rules that would fight a
  // future Prettier run; it doesn't format anything itself. Must stay last.
  prettier,

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // This repo's own generated/output paths:
    ".next-playwright/**",
    "playwright-report/**",
    "test-results/**",
    "data/**",
  ]),
]);

export default eslintConfig;
