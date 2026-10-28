# Firmus — Architecture

Personal life-dashboard PWA (water, focus/Pomodoro, finance — the day's rhythm taken from the
real prayer times) for a single user. React + TypeScript + Vite, Firebase (Firestore + Auth),
deployed to GitHub Pages. A companion Discord bot (`backend/`) sends reminders.

This document explains **how the code is organized and why**, so it stays this way
as it grows — whether the next change is made by Hamed, by Claude, or by any other
agent. Read this before adding a file, and see `CLAUDE.md` for the short version.

## The layers

```
src/
  app/        the shell — routing, providers, ErrorBoundary, top-level layout
  data/       Firestore + device-auth. The ONLY place that talks to Firebase.
  domain/     business rules as pure functions + types. No React, no Firestore, no DOM.
  features/   one folder per screen/capability — the React layer
  ui/         design-system primitives (Card, Button, Modal, …) — no business logic
  lib/        framework-agnostic helpers with no Rakeeen rules baked in
  constants/  static data (the Focus week's seed, the salary in finance.json, …)
  styles/     global.css — design tokens live here (see "Design system" below)
```

**The dependency direction only ever points one way:**

```
app  →  features  →  ui
              ↓
           domain  ←  data
              ↑
             lib
```

- `domain/` never imports from `features/`, `ui/`, or `data/`. It's the one layer
  that's safe to read in isolation and safe to unit test without touching React.
- `data/` never imports from `features/`. Components ask `data/` for state; `data/`
  doesn't know which screen is asking.
- `features/<name>/` may import `domain/`, `data/`, `ui/`, and `lib/` — but never
  reaches into *another* feature's folder. If two features need the same thing,
  that thing belongs in `domain/`, `ui/`, or `lib/`, not borrowed from a sibling.
- `ui/` never imports `domain/` or `data/` — it only knows about props.

## Why this shape (in plain terms)

Before this refactor, everything lived in `components/` + `hooks/` grouped by *kind*
(all components together, all hooks together), and business logic — reset rollovers,
prayer-time math, deposit splitting — was written inline inside 1000+ line React
components, indistinguishable from rendering code and impossible to unit test.

Grouping by **feature** instead of by kind means opening `features/finance/` shows
everything about finance in one place. Pulling business rules into `domain/` as pure
functions means:
- they can be unit tested without rendering anything or touching Firestore
- they can't accidentally depend on render timing, refs, or effect order
- reading `domain/finance/subscriptions.ts` tells you the actual business rule
  without wading through JSX

## Rules

### 1. No business logic in components
If a computation doesn't need `useState`, a ref, or a DOM/Firestore call, it doesn't
belong inside a component or hook body. Extract it to `domain/<area>/`, write it as
a plain function, and give it a test. The component calls the function; it doesn't
recompute the rule inline. (See `domain/finance/subscriptions.ts` or
`domain/devotion/prayer.ts` for the pattern.)

### 2. Time-dependent logic takes `now` as a parameter
Never call `new Date()` inside a pure function. Take `now: Date = new Date()` as
the last parameter instead — the default preserves real behavior, and tests pass a
fixed date. Every function in `domain/` follows this.

### 3. Nothing outside `data/` imports `firebase/*`
If a feature needs Firestore-backed state, it uses `useFirebaseSync` (or a future
`data/` primitive) — never `doc()`/`onSnapshot()`/`getFirestore()` directly.

### 4. Imports use the `@/` alias, never `../../..`
`@/features/finance/useFinance`, not `../../hooks/useFinance`. This is what makes
moving a file safe: a file's own imports never break when *it* moves, only when
something *it imports* moves — and that's a greppable, mechanical fix.

### 5. One feature never reaches into another feature's folder
Cross-feature needs go through `domain/`, `ui/`, or `lib/`. If `features/water/`
needs something from `features/finance/`, that's a sign the thing should live in
`domain/` instead.

### 6. Split a file before it crosses ~300–400 lines
Pull out anything presentational and closure-free (icons, small display
components, constant tables) into `features/<name>/components/`. Pull out anything
computational into `domain/`. What's left should be mostly state wiring and JSX
composition. (`Home.tsx` and `Finance.tsx` are still catching up on this — see the
open items below.)

### 7. Name things by what they mean, not how they're stored
`focusMinutesThisWeek`, not `fmw`. `subMatchesFilter`, not `check2`. A reader
should understand a name without opening the function body.

### 8. Every pure function in `domain/` gets tests
Not exhaustive property-testing — a handful of cases that pin the real behavior
(the normal case, the boundary, the one weird edge the comments warn about). See
`domain/day.test.ts` for the shape: one `describe` per function, cases named after
what they prove.

## Where new things go

| Adding… | Goes in |
|---|---|
| A new screen/feature | `features/<name>/` — its own folder, own hook if it needs state wiring |
| A business rule (splitting, scheduling, eligibility, formatting specific to Rakeeen) | `domain/<area>/<thing>.ts` + a test file next to it |
| A generic helper with no Rakeeen-specific rule (date math, a fetch wrapper) | `lib/` |
| A reusable visual primitive used by 2+ features | `ui/` |
| Firestore-backed state | `data/useFirebaseSync` from inside a feature hook |
| A constant data table | `constants/` |

## Design system

Tokens (color, the brutalist card/border language, dark mode) live in
`src/styles/global.css` as CSS custom properties. `ui/` components consume those
tokens — they don't hardcode colors. When the visual design changes, it changes in `global.css` + `ui/`, and every
feature inherits it automatically instead of being edited screen by screen.

**Colour classes.** The runtime palette in `global.css` (`--ink`, `--paper`, `--paper-dark`,
`--bg`, `--sepia`, `--rust`, `--forest`, `--ink-faded`) is exposed to Tailwind through an
`@theme inline` block, so `text-ink/40`, `border-ink/10`, `bg-paper-dark`, `text-forest`…
all work and follow dark mode on their own. Add a new palette colour in both places
(the `:root` / `.dark-theme` variables, then the `@theme inline` line).

**Switchers.** `ui/Tabs.tsx` is page-level navigation (plain labels, a sliding line
under the current one); `ui/FilterSelect.tsx` narrows a list or chart (a button
that opens a short list). Don't hand-roll a boxed segmented control again.

**Tooltips.** A hover hint is `data-tip="…"` on any element — never the native `title` attribute. One
`ui/TooltipLayer.tsx`, mounted once in `App`, draws it as a dark mono chip; it tracks the pointer's position
(not hover events), so it also works on disabled buttons.

**Theme.** `lib/theme.ts` owns dark/light: `main.tsx` applies the saved choice before
the first render (so every route starts in it), and `setTheme()` switches and saves.

**Icons** are their own small design system, all in one file:
`src/ui/icons.tsx` is the only file that imports from
`@hugeicons/core-free-icons` (raw path data — `@hugeicons/react` isn't a
dependency; we render the paths ourselves). Three exported constants define
the whole look — `ICON_STROKE_WIDTH` (2), `ICON_STROKE_LINECAP` (`'square'`),
`ICON_STROKE_LINEJOIN` (`'miter'`) — and `createIcon()` applies all three to
every icon, overriding Hugeicons' own rounded defaults. **Sharp, not rounded,
is deliberate**: it matches the brutalist card/border language above, not an
oversight. Features import icons from `@/ui/icons` as `Icon<Name>`, never
straight from an icon library — that's what makes "which icons exist", "what
library they're from", and "sharp vs rounded" each a one-file answer instead
of a grep across every screen. New icon → add it to `icons.tsx` first.

**Retro** is used in exactly two places, on purpose. Finance › Thndr is dressed as an amber-phosphor
terminal (the `.retro-crt` panel in `global.css`, with its own local colours — it stays a dark screen in
both themes). The Focus timer's third face (`ui/RulerTimer.tsx`) is a tick ruler in the Focus accent with
dot-matrix digits and a glow; its tick/slide logic is `domain/focus/ruler.ts`. The ruler is plain HTML
moved by one `transform` per animation frame — no filters or SVG masks, which is what keeps it smooth.

A hand-drawn icon-like SVG that can't be a static Hugeicons path set (its own
component, e.g. the TouchID fingerprint glyph in `TouchIDGate.tsx`, a one-off
animated scan effect) still imports these same three constants instead of
hardcoding its own numbers, so it stays visually consistent with everything
built through `createIcon()`. Genuine exceptions, with their own hand-tuned
stroke unrelated to this system: the Pomodoro focus ring (scales with its own
size), Recharts `ReferenceLine`/chart internals, the `MonthFingerprint` dot
weight (encodes a data value, not a fixed style), and `CustomCursor`'s shape
outline.

## The Discord bot (`backend/`)

Separate package, not part of the web build. `bot.js` only wires things together and schedules them;
the work lives in small modules: `src/features/` (`subscriptions` — the Payit reminders, honouring each plan's
billing cycle; `cleanup`; `finance`/`water`/`focus` — the Discord panels; `focusNotifications` — the focus
timer's messages; `report`), `src/lib/` (`alerts`,
Firestore and prayer-time helpers) and `src/server.js` (the small HTTP API the web app calls).
Their pure parts are tested from the root `npm run test:run`.

`backend/src/features/report/` builds the **daily report**
(20:00 Cairo, `bot.js`): `collect.js` reads the dashboard values from Firestore, `data.js` turns them into
the report (pure — the finance, focus and subscription rules are ported by hand from `src/domain/`, and
tested from the root with `npm run test:run`), `render.js` draws the PDF, `send.js` posts it. Try it without
sending anything: `npm run report:preview` (writes a PDF to the temp folder); `npm run report:send` sends it
now. Anything in `data.js` that mirrors `src/domain/` must be changed in both places — except the salary, which both
read from `src/constants/finance.json`.

## The website holds no secrets

Everything compiled into the site is public, so nothing secret is a `VITE_` variable. When the app needs
Discord to say something, it writes an event to Firestore and the bot posts it: the focus timer writes
`focus_notification` (`usePomodoro`), and `backend/src/features/focusNotifications.js` turns it into a message
through the webhook in `backend/.env`. The one key the site does still carry is the gold API's
(`VITE_GOLD_API_KEY`), because the app is what fetches gold prices — see below.

## Gold prices

The web app is the only thing that calls the gold API. `app/GoldPriceRefresher.tsx` (mounted once, next to
`DailyResetManager`) checks whether a Fajr or Maghrib has passed since the last fetch
(`domain/finance/goldRefresh.ts`) and, if so, fetches once and stores the prices in Firestore (`gold_prices`).
Everything else only reads that document — the Finance screens through `useGoldPrices`, the Discord bot
straight from Firestore — so the prices stay put between refreshes and the API sees two calls a day. A refresh
missed because the app was closed happens the next time it is open.

## Testing & commands

```
npm run dev        # local dev server
npm run build       # production build — esbuild, so it catches resolution errors
                     # but not type errors
npm run typecheck    # tsc --noEmit (strict + no unused locals/params) — keep it at 0
npm test             # vitest, watch mode
npm run test:run     # vitest, single run — use this one in CI / before committing
```

There is no React-rendering test setup yet (no Testing Library). `domain/` tests run
in plain Node (`environment: 'node'` in `vite.config.ts`) because none of that code
touches the DOM. Add `@testing-library/react` + a `jsdom` environment only when a
`features/` hook or component genuinely needs a rendered test — don't add it
speculatively.

## Open items (known, deliberately deferred)

- `Home.tsx` (~970 lines) still mixes state wiring, modals and JSX composition in one file. Its
  presentational, closure-free pieces are split out (`features/home/components/`); splitting the stateful
  parts further is higher-risk and is best done alongside a visual change rather than as a separate pass.
  (Finance is already split into one component per tab.)
