# Firmus

(The name is Firmus; the repo, the site's URL and the Firebase project are still called Rakeeen-Home.)

Personal life-dashboard for Hamed — water, focus/Pomodoro and finance, with the day's
rhythm taken from the real prayer times. React + TypeScript + Vite + Firebase (Firestore + Auth), deployed
to GitHub Pages via `.github/workflows/deploy.yml` on push to `main`. A companion
Discord bot lives in `backend/` (Payit reminders, the Discord panels and the daily PDF
report — not deployed by the same workflow, run separately).

**Read `docs/ARCHITECTURE.md` before adding or moving a file.** This file is the
short version; that one explains the layers and the reasoning.

## Commands

```
npm run dev         # local dev server (http://localhost:5173/Rakeeen-Home/)
npm run build         # production build — esbuild-based; this is the real smoke test
npm run test:run       # vitest, single run
npm run typecheck       # tsc --noEmit — strict, no unused locals/params; must stay at 0 errors
```

`npm run build` (esbuild) catches resolution errors but not type errors, so run
`typecheck` as well before calling something done. The project has no eslint setup.

## The five rules that matter most

1. **No business logic inside components.** If it doesn't need `useState`/a
   ref/a DOM or Firestore call, it's a pure function — put it in `domain/<area>/`
   with a test, and call it from the component.
2. **Time-dependent functions take `now: Date = new Date()`** as their last
   param — never call `new Date()` inside pure logic. This is what makes them
   testable without mocking the clock.
3. **Only `src/data/` imports `firebase/*`.** Everything else uses
   `useFirebaseSync` (or asks for a `data/` primitive).
4. **Imports use the `@/` alias** (`@/features/finance/useFinance`), never
   `../../..`. Never import across feature folders — shared logic goes in
   `domain/`, `ui/`, or `lib/`.
5. **Before changing behavior or UI, know what "unchanged" looks like.** Most
   refactors in this codebase are meant to be invisible — run the build, run the
   tests, and actually load the page (see "Local verification" below) before
   calling something done.

## Local verification (do this before saying a change is finished)

1. `npm run build` — must be clean.
2. `npm run test:run` — must pass.
3. Load the app locally and look at the page(s) you touched. Auth is behind
   Google sign-in; for local UI checks without a real login, `useAuth.tsx` has
   historically been temporarily patched with a `localStorage`-gated dev bypass
   (`__dev_skip_auth`) — add it, verify, then **remove it before committing**.
   Don't leave it in.

## Things that look like bugs but are load-bearing

- `getLogicalDate()` (`domain/day.ts`) rolls the "day" at 04:00, not midnight —
  water and the daily snapshot use this. Focus sessions use `getPomoLogicalDate()`
  instead, which is the real calendar day (no rollback).
- `useFirebaseSync`'s `setValue` is `useCallback`-memoized on purpose — an
  earlier version recreated it every render, which made a consumer's `useEffect`
  re-run constantly and contributed to a Firestore client crash
  (`INTERNAL ASSERTION FAILED`). Don't remove the memoization.
- `src/data/firebase.ts` forces `experimentalForceLongPolling` — that's the actual
  fix for the crash above. Don't revert it "to try WebSockets".

## Icon system

**Sharp, not rounded, is a deliberate identity choice** — it matches the
brutalist card/border language everywhere else (hard edges, no soft corners).
It lives entirely in `src/ui/icons.tsx`, the **only** file allowed to import
from `@hugeicons/core-free-icons` (raw path data — `@hugeicons/react` isn't a
dependency at all; we render the paths ourselves). Three exported constants
are the whole system:

- `ICON_STROKE_WIDTH` (2)
- `ICON_STROKE_LINECAP` (`'square'`)
- `ICON_STROKE_LINEJOIN` (`'miter'`)

`createIcon()` applies all three to every icon, overriding Hugeicons' own
rounded defaults. Features import icons from `@/ui/icons` (`Icon<Name>`),
never from an icon library directly — so the library, the stroke width, and
the sharp-vs-rounded choice are each a one-line edit instead of a
find-and-replace across every screen. New icon → add it to `icons.tsx` first.

A hand-drawn icon that can't go through `createIcon()` (its own component, not
a static Hugeicons path set) still **imports these same three constants**
instead of hardcoding its own numbers — see the TouchID fingerprint glyph
(`TouchIDGate.tsx`) for the pattern. Genuine exceptions, with their own
hand-tuned stroke unrelated to this system: the Pomodoro focus ring (scales
with its own size), Recharts chart internals, the `MonthFingerprint` dot
weight (encodes a data value), and `CustomCursor`'s shape outline.

## Don't

- Don't add a new top-level folder under `src/` without updating
  `docs/ARCHITECTURE.md`.
- Don't import an icon from any icon library directly in a feature file —
  add it to `src/ui/icons.tsx` and import it from `@/ui/icons`.
- Don't hardcode `strokeLinecap`/`strokeLinejoin`/a stroke-width number on any
  hand-drawn icon-like SVG — import `ICON_STROKE_LINECAP` /
  `ICON_STROKE_LINEJOIN` / `ICON_STROKE_WIDTH` from `@/ui/icons` instead.
- Don't put a Firestore call inside a `features/` component — go through
  `useFirebaseSync`.
- Don't reach into another feature's folder (`features/water/` importing from
  `features/finance/`) — promote the shared thing to `domain/`, `ui/`, or `lib/`.
- Don't hand-roll a boxed tab/segmented control or a day/month/year button group —
  use `ui/Tabs` (navigation) or `ui/FilterSelect` (filtering a list or chart).
- Don't use the browser's native `title="…"` for a hover hint — put `data-tip="…"` on the element
  (`ui/TooltipLayer.tsx` draws it in the app's own style); an icon-only button also needs an `aria-label`.
- Don't put a secret in a `VITE_` variable: it is compiled into the website's public JavaScript, whatever
  GitHub Secrets does for the repo. Anything that must stay secret (a webhook, a token) is used by the bot —
  the app writes an event to Firestore and the bot acts on it (see the focus timer's Discord messages).
- Don't commit with a dev-auth bypass still active, or with `.env.local` /
  secrets in the diff.
