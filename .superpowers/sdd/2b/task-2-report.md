# Task 2 Report: Sources section (Plan 2b)

## Status: DONE

## What was built

`SourcesSection.tsx` — a component that:
- Lists configured marketplace sources (name, kind, location) from `useMarketplace().sources`, with an empty-state message when none are configured.
- Renders an add-source form (Name input, Location input, Kind `<select>` with `claude`/`codex` options, Add button) with the exact `data-testid`s required by the brief: `marketplace-source-name`, `marketplace-source-location`, `marketplace-source-kind`, `marketplace-source-add`, `marketplace-source-remove-<name>`.
- Client-side validates that name and location are non-empty before calling `addSource`; shows an inline `role="alert"` message ("Name and location are required.") and does not call `addSource` if validation fails.
- Calls `addSource(name, kind, location)` (trimmed) on success, clears the form and resets kind to `claude`.
- `try/catch`es `addSource` and `removeSource` for real (not swallowed) — on failure it surfaces a `toastService.error({ title, msg, traceback })` toast (add failures also set the inline form error so the message doesn't just flash-and-disappear).
- Renders a per-source Remove button (icon button, `Trash2`, `aria-label="Remove"`) that calls `removeSource(name)`.
- All strings are defined via `defineMessages` under the `marketplaces.sources.*` id namespace (i18n:check / locale parity deliberately deferred to Task 6, per instructions — not run here).

Files:
- Created: `ui/desktop/src/components/marketplaces/SourcesSection.tsx`
- Created: `ui/desktop/src/components/marketplaces/SourcesSection.test.tsx`

## TDD evidence

**RED** — before creating `SourcesSection.tsx`, ran:
```
pnpm test:run -- src/components/marketplaces/SourcesSection.test.tsx
```
Result: `FAIL` — `Error: Failed to resolve import "./SourcesSection" from ".../SourcesSection.test.tsx". Does the file exist?` (Test Files: 1 failed | 52 passed (53); Tests: 512 passed). Confirms the test was exercising real, missing code.

**GREEN** — after creating the implementation, re-ran the same command:
```
Test Files  53 passed (53)
     Tests  517 passed (517)
```
All 5 new `SourcesSection` tests pass, and the pre-existing 512 tests remain green (no regressions).

Note: the `pnpm test:run -- <path>` invocation (as literally specified in the brief) does not actually scope Vitest to the single file in this repo's config — both the RED and GREEN runs executed the full 53-file suite (confirmed by the "(53)" / "(512)"→"(517)" totals). This doesn't affect the validity of the RED/GREEN signal (the target file's failure/pass is what changed between runs), and a full-suite run was required before committing anyway, so this was run in addition.

## Verification results

- `pnpm test:run -- src/components/marketplaces/SourcesSection.test.tsx`: **PASS** (53 files / 517 tests, effectively full suite — see note above).
- `pnpm test:run` (explicit full suite): **PASS** (53 files / 517 tests).
- `pnpm typecheck`: **PASS** (after one fix — see Concerns/Deviations below).
- `pnpm exec eslint "src/components/marketplaces/**/*.{ts,tsx}" --max-warnings 0 --no-warn-ignored`: **PASS** (no output, exit 0).

Environment note: `pnpm` was not on `PATH`; per the task instructions used `corepack pnpm@10.30.0` after `source ~/.nvm/nvm.sh` (the system `corepack` binary lives under nvm's Node install, not the `/usr/lib/goose` Node used by default). Version confirmed: `corepack pnpm@10.30.0 --version` → `10.30.0`.

## Deviation from brief (asked-vs-fixed)

The brief's literal code specifies:
```ts
export default function SourcesSection(): JSX.Element {
```
This fails `pnpm typecheck` in this repo: `error TS2503: Cannot find namespace 'JSX'` — this repo is on React 19 / `@types/react@^19.2.14`, where the global `JSX` namespace was removed in favor of `React.JSX` (or no explicit return-type annotation, relying on inference with the `react-jsx` automatic runtime). I checked the rest of the codebase's convention: every other `export default function ComponentName(...)` in `src/components/**/*.tsx` omits an explicit return type (the one file with `React.ReactElement` explicitly imports `React` for it, which would go against the brief's own note that "`React` is an eslint global with the JSX automatic runtime" and implies no explicit `import React`). This is a mechanical, non-behavioral fix, not a design/interface decision, so I fixed it directly rather than blocking on it: dropped the explicit return-type annotation (`export default function SourcesSection() {`), letting TS infer it. No other part of the brief's interface (props, exports, testids, `addSource`/`removeSource` call signatures, i18n ids) needed changes — everything else matched repo reality exactly (confirmed by reading `MarketplaceContext.tsx`, `errorMessage.ts`, `toasts.tsx`, `ui/button.tsx`, `ui/input.tsx`, `i18n/index.ts`, `i18n/test-utils.tsx` before writing code).

## Self-review

- Confirmed `MarketplaceSourceInfo.kind`/`.location`/`.name` are typed `string` in the generated SDK (`ui/sdk/src/generated/types.gen.ts`), matching usage.
- Confirmed the catch paths in `handleAdd`/`handleRemove` are real: both call `toastService.error(...)`, not just logging — satisfies the Task-1-review cross-task note that `addSource`/`removeSource` throw and have no `errors.*` field to rely on.
- Confirmed all 5 required `data-testid`s are present and wired to the correct elements.
- Confirmed accessible names line up with the test's `getByLabelText`/`getByRole` queries (`aria-label` on `Input`s and the `<select>`, `aria-label` "Remove" on the icon button, `role="alert"` on the validation message).
- No new dependencies added; no changes to `MarketplaceContext.tsx`, `acp/marketplace.ts`, or generated SDK files.
- Ran the scoped eslint glob and full typecheck/test suite before committing; both clean.

## Concerns

- Minor, already covered above: had to drop the brief's literal `: JSX.Element` return-type annotation due to a React 19 `@types/react` incompatibility in this repo — fixed to match established codebase convention (implicit return type), no interface/behavior change.
- `pnpm test:run -- <file>` doesn't scope to the single file in this project's Vitest setup (runs the whole suite regardless); harmless here but worth knowing for future focused-test runs in this repo.
- Per instructions, i18n locale catalogs were **not** updated and `i18n:check` was **not** run — the new `marketplaces.sources.*` message ids exist only via `defineMessages`/`defaultMessage`, deferred to Task 6.

## Commit

`6cff4e1a4 feat(marketplaces): add Sources section (add/validate/list/remove)` on branch `feature/marketplace-desktop-ui-2b`. Not pushed.

---

# Review-fix report: disambiguate Sources remove aria-label (Important finding)

## Status: DONE

## Finding addressed

`SourcesSection.tsx`'s per-source Remove button used a generic `aria-label` ("Remove"), identical across all sources — ambiguous for assistive tech and for `getByRole('button', { name: 'Remove' })` once more than one source exists. `data-testid` already disambiguated by name; `aria-label` did not.

## What changed

- `ui/desktop/src/components/marketplaces/SourcesSection.tsx`:
  - `defineMessages` `remove` entry: `defaultMessage` changed from `'Remove'` to `'Remove {name}'` (id unchanged: `marketplaces.sources.remove`).
  - Button's `aria-label` changed from `intl.formatMessage(i18n.remove)` to `intl.formatMessage(i18n.remove, { name: s.name })`, so each source's remove button now has a distinct accessible name (e.g. "Remove alpha", "Remove beta").
  - No changes to `data-testid` values or any other behavior/markup.
- `ui/desktop/src/components/marketplaces/SourcesSection.test.tsx`:
  - Strengthened the `'removes a source when its remove button is clicked'` test to render **two** sources (`alpha`, `beta`) instead of one.
  - Asserts `getByRole('button', { name: /Remove alpha/ })` and `getByRole('button', { name: /Remove beta/ })` resolve to distinct elements.
  - Clicks the `beta` remove button and asserts `removeSource` was called with `'beta'` and never with `'alpha'`.

Locale catalog files were **not** touched (Task 6 owns `i18n:check` / locale parity), per instructions.

## TDD evidence (RED before GREEN)

Temporarily reverted only `SourcesSection.tsx` (via `git stash push -- src/components/marketplaces/SourcesSection.tsx`) while keeping the strengthened test, then ran the full suite:

```
corepack pnpm@10.30.0 test:run
```
Result: **RED** — `Test Files 1 failed | 52 passed (53)`, `Tests 1 failed | 516 passed (517)`. Failure was in `SourcesSection.test.tsx` at the `getByRole('button', { name: /Remove alp… })` line — with the old single "Remove" label, no button matched "Remove alpha" (both buttons only exposed the generic "Remove" name), confirming the strengthened test genuinely exercises the bug.

Restored the fix (`git stash pop`) and re-ran the same command — **GREEN**, see below.

## Verification commands and output

1. `export PATH="/home/sascha/.config/goose/mcp-hermit/bin:$PATH"; corepack pnpm@10.30.0 test:run`
   → `Test Files  53 passed (53)` / `Tests  517 passed (517)`.

2. `corepack pnpm@10.30.0 exec eslint "src/components/marketplaces/**/*.{ts,tsx}" --max-warnings 0 --no-warn-ignored`
   → no output, exit 0 (clean).

3. `corepack pnpm@10.30.0 typecheck` (`tsc --noEmit`)
   → no output, exit 0 (clean).

Environment note: `pnpm` was not directly on `PATH`; added `/home/sascha/.config/goose/mcp-hermit/bin` (where `corepack`/`npm` live) to `PATH` and used `corepack pnpm@10.30.0 <cmd>` per instructions. `corepack pnpm@10.30.0 --version` confirmed `10.30.0`.

## Diff scope

Only the two intended files changed (confirmed via `git status --short` / `git diff --stat` before commit):
```
 src/components/marketplaces/SourcesSection.test.tsx | 13 ++++++++++---
 src/components/marketplaces/SourcesSection.tsx      |  4 ++--
 2 files changed, 12 insertions(+), 5 deletions(-)
```
No locale catalog files, no other component files, touched.

## Commit

`93811885f8fc9e4714e1b4bf599cda191617e816 fix(marketplaces): disambiguate Sources remove aria-label by source name` on branch `feature/marketplace-desktop-ui-2b`. Not pushed.
