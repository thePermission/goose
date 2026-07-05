# Task 4 report — Installed section

## What I built

`InstalledSection` (`ui/desktop/src/components/marketplaces/InstalledSection.tsx`), implemented verbatim from the brief with one repo-convention deviation: dropped the `): JSX.Element` return annotation (no global `JSX` namespace in this repo, confirmed by Tasks 2–3 review notes).

- Lists installed plugins via `useMarketplace().installedPlugins`, each row `data-testid="installed-plugin-<name>"` showing name, version, source, and a display-only "Auto-update: on/off" line (no control to change it — deferred item correctly NOT built).
- Enable/disable via `Switch` (Radix, `role="switch"`, `checked`/`onCheckedChange`), `aria-label="Enable <name>"`, with **optimistic** local `enabled` state: flips immediately on click, calls `setPluginEnabled(name, next)`, and on throw **reverts** the local state back and surfaces `toastService.error(...)` — per the Task 1 review note that `setPluginEnabled`/`updatePlugin` throw and expose no `errors.*` field.
- `Update` button rendered only when `plugin.updatable`, with local per-row `updating` busy state (`disabled` + "Updating…" label while in flight); on throw shows `toastService.error(...)` in a `finally` that always clears the busy flag.
- Empty state ("No plugins installed yet.") when `installedPlugins` is empty; a loading state ("Loading installed plugins…") when `loading.installed` is true and the list is still empty.
- All strings via `defineMessages`/`useIntl` (i18n), consistent with `SourcesSection`/`BrowseSection`.

## Files changed
- Created `ui/desktop/src/components/marketplaces/InstalledSection.tsx`
- Created `ui/desktop/src/components/marketplaces/InstalledSection.test.tsx`

## TDD evidence

**RED** — wrote the test file first (verbatim from brief Step 1), ran the full suite:
```
corepack pnpm@10.30.0 test:run
...
FAIL src/components/marketplaces/InstalledSection.test.tsx
Error: Failed to resolve import "./InstalledSection" from "...InstalledSection.test.tsx". Does the file exist?
Test Files  1 failed | 54 passed (55)
     Tests  522 passed
```
Confirmed failure was the expected "module not found" (component didn't exist yet), not an unrelated error.

**GREEN** — added `InstalledSection.tsx` verbatim from brief Step 3, reran full suite:
```
Test Files  55 passed (55)
     Tests  527 passed
```
(522 pre-existing + 5 new brief tests, all green.)

**Self-review addendum** — the brief's 5 verbatim tests never actually exercise the failure/revert path that the cross-task note flags as the important behavior (only a never-resolving promise is used for the toggle test, and `updatePlugin`'s test only covers the success path). To verify the revert-on-failure and update-failure-toast behavior actually works rather than trusting the code by inspection, I added two more tests to the same file (kept the brief's 5 untouched):
- `reverts the optimistic toggle and shows a toast when setPluginEnabled fails` — clicks the switch, asserts it optimistically flips to `false`, then asserts it reverts back to `true` after the rejected promise settles, and `toastService.error` was called exactly once.
- `shows a toast when updatePlugin fails and clears the busy state` — clicks Update, asserts `toastService.error` fires and the button returns to enabled ("Update", not disabled) afterward.

Final full suite:
```
corepack pnpm@10.30.0 test:run
Test Files  55 passed (55)
     Tests  529 passed
```

## Verification commands (all clean)
- `corepack pnpm@10.30.0 test:run` → 55 files / 529 tests passed
- `corepack pnpm@10.30.0 typecheck` → exit 0, no output
- `corepack pnpm@10.30.0 exec eslint "src/components/marketplaces/**/*.{ts,tsx}" --max-warnings 0 --no-warn-ignored` → exit 0, no output

Note on tooling: `pnpm`/`corepack` were not directly on `PATH` in this environment; had to prepend `/home/sascha/.config/goose/mcp-hermit/bin` (where goose's hermit-managed Node/corepack live) to run any of the above. No repo changes needed for this — purely an environment/shell detail.

## Self-review
- Verified the brief's interface list matches reality: `useMarketplace()` shape, `InstalledPluginInfo` fields (`name`, `version`, `source`, `enabled`, `autoUpdate`, `updatable`) in `@aaif/goose-sdk` generated types, `Switch` (Radix `@radix-ui/react-switch` wrapper, `checked`/`onCheckedChange`, renders `role="switch"`/`aria-checked`), `Button` (`data-slot="button"`) — all exact matches, no brief/reality conflicts, so no need to stop and ask.
- Confirmed via the added tests (not just code reading) that: (a) the optimistic switch reverts to the pre-toggle value when `setPluginEnabled` rejects, (b) exactly one toast fires (not swallowed, not duplicated), (c) the Update button's busy state always clears via `finally` even on failure, and a failure toast fires.
- Confirmed the deferred item (a control to change `autoUpdate`) was NOT built — it's display-only text, no button/switch/input touches `autoUpdate`.
- Confirmed `InstalledSection` is not yet wired into a parent Marketplaces page/tab (grepped `src` — no non-test, non-self file imports `SourcesSection`/`BrowseSection` either), so this is consistent with plan structure; wiring is presumably a later task, not in Task 4's scope per `task-4-brief.md`.
- No `React` import needed/added (automatic JSX runtime), matching `SourcesSection.tsx`/`BrowseSection.tsx` convention.

## Concerns
- Minor, consistent with the "defer to final fix wave" pattern already used for Tasks 1–3 (see `progress.md`): no unmount guard on the two async handlers in `InstalledPluginRow` (`setEnabled`/`setUpdating` after unmount is a silent no-op in React 18+/19, not a crash, but not guarded). Not fixed here to stay verbatim with the brief and consistent with how Tasks 1–3 treated equivalent minors.
- The two extra tests I added are additive coverage beyond the brief's verbatim Step 1 test file; they don't change brief-mandated test count/content, just append real-behavior verification for the cross-task-flagged concern.
