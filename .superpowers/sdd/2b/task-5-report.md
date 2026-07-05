# Task 5 report — MarketplacesView composition + navigation registration

## What I built/modified

Implemented the brief verbatim; the real file structures matched the brief's assumptions closely (see "Where the brief's line numbers differed" below).

- **Created** `ui/desktop/src/components/marketplaces/MarketplacesView.tsx` — composes `SourcesSection`, `BrowseSection`, `InstalledSection` inside `MainPanelLayout`, with an `<h1>` heading + description, exactly as specified in the brief. No `React` import (automatic JSX runtime), no `): JSX.Element` return annotation (repo has no global `JSX` namespace).
- **Modified** `ui/desktop/src/utils/navigationUtils.ts`:
  - Added `'marketplaces'` to the `View` union, immediately after `'extensions'` (before `'moreModels'`).
  - Added `case 'marketplaces': navigate('/marketplaces', { state: options }); break;` in `createNavigationHandler`, immediately after the `extensions` case.
- **Modified** `ui/desktop/src/hooks/useNavigationItems.ts`:
  - Added `Store` to the `lucide-react` import.
  - Added `{ id: 'marketplaces', path: '/marketplaces', label: 'Marketplaces', icon: Store }` to `NAV_ITEMS`, immediately after the `extensions` entry (before `sessions`).
  - Added the `marketplaces: { id: 'navigation.itemMarketplaces', defaultMessage: 'Marketplaces' }` descriptor to `navItemMessages`, immediately after `extensions` (before `sessions`).
- **Modified** `ui/desktop/src/App.tsx`:
  - Added imports `MarketplacesView` (`./components/marketplaces/MarketplacesView`) and `MarketplaceProvider` (`./components/marketplaces/MarketplaceContext`) near the other view imports.
  - Added a `MarketplacesRoute` component (wraps `MarketplacesView` in `MarketplaceProvider`), placed right after `ExtensionsRoute`/before `AppInner`.
  - Registered `<Route path="marketplaces" element={<MarketplacesRoute />} />` inside the layout `<Route path="/">` block, immediately after the `extensions` `<Route>` and before `apps` — so it renders inside `AppLayout`/`OnboardingGuard` with full sidebar chrome, same as every other top-level view.

## Files changed
- Created: `ui/desktop/src/components/marketplaces/MarketplacesView.tsx`
- Created: `ui/desktop/src/components/marketplaces/MarketplacesView.test.tsx`
- Created: `ui/desktop/src/utils/navigationUtils.test.ts`
- Created: `ui/desktop/src/hooks/useNavigationItems.test.ts`
- Modified: `ui/desktop/src/utils/navigationUtils.ts`
- Modified: `ui/desktop/src/hooks/useNavigationItems.ts`
- Modified: `ui/desktop/src/App.tsx`

## TDD evidence

**RED** — wrote all three test files verbatim from the brief's Step 1, ran the full suite (`corepack pnpm@10.30.0 test:run`, scoping via `-- <file>` does not work in this repo per the task instructions):
```
❯ src/components/marketplaces/MarketplacesView.test.tsx (0 test)
  Error: Failed to resolve import "./MarketplacesView" ... Does the file exist?
❯ src/utils/navigationUtils.test.ts (1 test | 1 failed)
  × navigates to /marketplaces for the marketplaces view
  AssertionError: expected "vi.fn()" to be called with [ '/marketplaces', … ]
  Received: [ '/', { state: undefined } ]   (falls through to default case)
❯ src/hooks/useNavigationItems.test.ts (2 tests | 2 failed)
  × registers a Marketplaces item at /marketplaces — AssertionError: expected undefined to be defined
  × localizes the Marketplaces label — TypeError: Cannot read properties of undefined (reading 'id')

Test Files  3 failed | 55 passed (58)
     Tests  3 failed | 529 passed (532)
```
All three failures matched the brief's predicted failure modes exactly.

**GREEN** — implemented `MarketplacesView.tsx` and the three navigation-registration edits verbatim from the brief's Step 3, reran the full suite:
```
Test Files  58 passed (58)
     Tests  533 passed (533)
```
(529 pre-existing + 4 new brief tests, all green; no regressions.)

## Verification commands (all clean)
- `corepack pnpm@10.30.0 test:run` → 58 files / 533 tests passed
- `corepack pnpm@10.30.0 typecheck` → exit 0, no output
- `corepack pnpm@10.30.0 exec eslint "src/components/marketplaces/**/*.{ts,tsx}" "src/utils/navigationUtils.ts" "src/hooks/useNavigationItems.ts" "src/App.tsx" --max-warnings 0 --no-warn-ignored` → exit 0, no output
- Also ran eslint over the three new test files individually → exit 0, no output
- `corepack pnpm@10.30.0 exec prettier --check` on all 7 changed/created files → "All matched files use Prettier code style!"

Note on tooling (consistent with prior tasks' reports): `pnpm`/`corepack` were not directly on `PATH`; prepended `/home/sascha/.config/goose/mcp-hermit/bin` (goose's hermit-managed Node/corepack) to run the above. No repo changes needed for this — purely an environment/shell detail.

## Where the real code differed from the brief's line refs
- `navigationUtils.ts`: `View` union is lines 5-20 as the brief said; inserted after `'extensions'` (line 9), before `'moreModels'` — matches. `createNavigationHandler`'s `extensions` case is at lines 75-77 (brief said "~line 75") — matched exactly, inserted the new case immediately after.
- `useNavigationItems.ts`: imports are lines 1-10 (brief said 1-11, off by one, immaterial). `NAV_ITEMS`'s `extensions` entry is at line 30 (brief said "~line 30") — matched, inserted `marketplaces` immediately after, before `sessions`. `navItemMessages`'s `extensions` block is lines 65-68 (brief said "~line 65") — matched, inserted immediately after.
- `App.tsx`: view imports are around lines 47-51 (brief said "~line 34-47" — the file has grown since the brief was written, real range is a bit lower but same relative location, right after `ExtensionsView`'s import). `ExtensionsRoute` is defined at lines 274-305 (brief said "~line 305" for adding after it — matched, `MarketplacesRoute` added right after `ExtensionsRoute`, before `export function AppInner()`). The `extensions` `<Route>` in the brief was said to be "~line 657"; in the real file it's lines 660-667 (immaterial drift from prior tasks landing). Registered `<Route path="marketplaces" .../>` immediately after it, before the `apps` route — same relative position the brief intended.
- No structural mismatches: `View` union, nav registration mechanism (`NAV_ITEMS` array + `navItemMessages` + `getNavItemLabel`), and route nesting (nested `<Route>` under the `/` layout route, same as `extensions`/`sessions`/`recipes`/etc.) all matched the brief's assumptions exactly — no need to stop and ask before editing.

## Self-review
- **Navigation registration matches the `extensions` pattern exactly**: `View` union member, `createNavigationHandler` case, `NAV_ITEMS` entry + icon, `navItemMessages` descriptor — all inserted in the same relative position as the corresponding `extensions` entries, no reordering of existing entries.
- **Route is wrapped in `MarketplaceProvider`**: confirmed `MarketplacesRoute` wraps `<MarketplacesView />` in `<MarketplaceProvider>`, and the `<Route path="marketplaces" element={<MarketplacesRoute />} />` registration is nested inside the `path="/"` layout route (same level as `extensions`, `apps`, `sessions`, etc.), so it renders inside `AppLayout`/`OnboardingGuard` with full sidebar chrome — verified by reading the route tree in `App.tsx` after the edit (lines ~640-669).
- **Judgment call — no `ChatProvider` wrapping**: the `extensions` route additionally wraps `ExtensionsRoute` in `<ChatProvider chat={chat} setChat={setChat} contextKey="extensions">`, because `ExtensionsView` touches chat state. `MarketplacesView`/its sections don't consume chat context at all — they only use `useMarketplace()` — so `MarketplacesRoute` intentionally omits `ChatProvider` and only wraps in `MarketplaceProvider` (its own equivalent state-provider), per the brief's literal Step 3 code. This is "mirroring the pattern" (view → provider-wrapped route component → nested `<Route>` → nav item) rather than mirroring `ExtensionsRoute`'s incidental `ChatProvider` dependency, which doesn't apply here.
- Verified child section headings actually render as brief's test expects: `SourcesSection`/`BrowseSection`/`InstalledSection` each render exactly one `<h2>` with text "Sources"/"Browse"/"Installed" respectively when given the empty-state context from `makeCtx()` (`BrowseSection` has two possible `<h2 heading>` render branches — empty-sources vs. has-sources — but with `sources: []` in `makeCtx()`, only the empty-state branch renders, giving a single "Browse" heading as expected).
- Confirmed `MarketplaceContextValue` shape used in the test's `makeCtx()` exactly matches the real interface in `MarketplaceContext.tsx` (same 14 fields) — no drift to reconcile.
- No unused imports; `React` not imported anywhere in the new file (verified via clean eslint run with `--max-warnings 0`, which enforces `no-unused-vars` and the repo's react-hooks/jsx-runtime rules).
- Confirmed `git status` is clean after commit (`63242c052`), only the pre-existing untracked `.superpowers/sdd/2b/` directory remains (expected — these plan/report artifacts, per project convention, aren't part of the code commit).

## Concerns
None outstanding. All four scoped verification commands (tests, typecheck, eslint, prettier) are clean, no regressions in the full 533-test suite, and the composition/navigation wiring mirrors the `extensions` pattern in every respect that applies to a provider-based (non-chat) view.
