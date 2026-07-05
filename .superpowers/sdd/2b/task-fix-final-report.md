# Fix Wave Report: Final whole-branch code review (Plan 2b, Marketplaces frontend)

Branch: `feature/marketplace-desktop-ui-2b`. Fixed exactly the three findings from
the final review below; nothing else touched.

## Environment note

`pnpm` was not on `PATH` (same issue as Task 6). Used the same fix:

```bash
export PATH="/tmp/corepack-bin:/home/sascha/.cache/hermit/pkg/node-24.15.0/bin:$PATH"
```

(`/tmp/corepack-bin/pnpm` is a pre-existing pinned shim that execs
`corepack pnpm@10.30.0 "$@"`.) `pnpm --version` resolved to `10.30.0`.

## Finding 1: mount-time load errors are captured but never surfaced

**Mechanism chosen: inline `role="alert"` — the same mechanism already used for
`errors.browse`, not a toast.** Rationale: the review explicitly says "mirror the
EXISTING pattern for `errors.browse`," and `errors.browse` is rendered as a raw
error string in an inline `<p role="alert">`, not via `toastService`. Using a
toast here would introduce a second, inconsistent error-surfacing mechanism for
what is conceptually the same class of error (a failed ACP/context load) as
`errors.browse`. Inline alert also matches the field's lifecycle — it's a
persistent piece of state (`errors.sources` / `errors.installed`) that stays set
until the next successful refresh, which fits a persistent inline banner better
than a transient toast.

- `ui/desktop/src/components/marketplaces/SourcesSection.tsx:33` — destructure
  `errors` from `useMarketplace()`.
- `ui/desktop/src/components/marketplaces/SourcesSection.tsx:76-80` — render
  `errors.sources` as `<p role="alert" className="text-sm text-red-500 mb-3">`
  right after the heading, before the sources list/empty-state (explains why the
  list may look empty).
- `ui/desktop/src/components/marketplaces/InstalledSection.tsx:97` — destructure
  `errors` from `useMarketplace()`.
- `ui/desktop/src/components/marketplaces/InstalledSection.tsx:102-106` — render
  `errors.installed` as the same `role="alert"` pattern, right after the heading,
  before the loading/empty/list branch.

Both render blocks display the raw error string directly (`{errors.sources}` /
`{errors.installed}`), exactly like the existing `{errors.browse}` block in
`BrowseSection.tsx` — **no new static user-facing copy was introduced**, so no
new i18n key was needed for this finding.

### Test coverage (real-failure-path preferred, per the brief)

- `ui/desktop/src/components/marketplaces/MarketplaceContext.test.tsx` — added
  two tests mirroring the existing "browse failure records an error" test,
  mocking the ACP wrapper to reject on mount:
  - `records an error on errors.sources when the mount-time sources load fails`
    (mocks `listMarketplaces` to reject, asserts `result.current.errors.sources`).
  - `records an error on errors.installed when the mount-time installed load
    fails` (mocks `listInstalledPlugins` to reject, asserts
    `result.current.errors.installed`).
  This verifies the context genuinely sets the error field on a real ACP
  failure, not just that some code sets it.
- `ui/desktop/src/components/marketplaces/SourcesSection.test.tsx` — added
  `renders an alert when errors.sources is set (e.g. mount-time load failure)`,
  which drives the actual bug being fixed here (the component previously never
  read `errors.sources` at all): with the (already-mocked, per this file's
  existing pattern) hook returning `errors.sources` set, asserts
  `getByRole('alert')` contains the text.
- `ui/desktop/src/components/marketplaces/InstalledSection.test.tsx` — added the
  equivalent `renders an alert when errors.installed is set...` test.

I kept `SourcesSection.test.tsx`/`InstalledSection.test.tsx` on their established
mocked-hook style (all other tests in those files also mock `useMarketplace`
directly) rather than switching just one test to a full `MarketplaceProvider`
render — the real-failure-path assertion instead lives in
`MarketplaceContext.test.tsx`, where mocking the ACP wrapper is the natural
(and existing) pattern. Together these two levels cover both "the context sets
the error on real failure" and "the section actually renders it."

## Finding 2: browse empty-state stacks under the error alert

- `ui/desktop/src/components/marketplaces/BrowseSection.tsx:112` — added
  `&& errors.browse === null` to the empty-state render guard:
  ```tsx
  {browsedSource !== null && catalog.length === 0 && !loading.browse && errors.browse === null && (
  ```

### Tests

- `ui/desktop/src/components/marketplaces/BrowseSection.test.tsx` — added:
  - `shows the empty-catalog message when a browse genuinely returns nothing`
    (no prior test asserted this at all; added for baseline coverage of the
    guard's positive case — catalog empty, no error, alert absent).
  - `shows only the error alert, not the empty-catalog message, when a browse
    fails` (catalog empty, `errors.browse` set — asserts the alert is present
    and the empty-catalog text is absent). This is the finding's regression
    test.

## Finding 3: enable/disable Switch not disabled during in-flight toggle

- `ui/desktop/src/components/marketplaces/InstalledSection.tsx:28` — added
  `const [toggling, setToggling] = useState(false);` per-row.
- `ui/desktop/src/components/marketplaces/InstalledSection.tsx:30-45` —
  `handleToggle` now sets `toggling` true before calling `setPluginEnabled` and
  clears it in a `finally` block (so it clears on both success and failure).
- `ui/desktop/src/components/marketplaces/InstalledSection.tsx:87` — `<Switch
  ... disabled={toggling} ... />`.

### Tests

- `ui/desktop/src/components/marketplaces/InstalledSection.test.tsx` — added
  `disables the Switch while a toggle is in flight, guarding against a rapid
  double-click`: clicks the switch with a never-resolving
  `setPluginEnabled`, waits for `disabled`, clicks again, and asserts
  `setPluginEnabled` was still only called once (the second click is a no-op
  because a disabled native control does not dispatch a click/change event).
- Extended the existing `reverts the optimistic toggle and shows a toast when
  setPluginEnabled fails` test with `expect(... ).not.toBeDisabled()` after the
  toggle settles back, confirming the `finally` block clears `toggling` on the
  failure path too (not just success).

## i18n

**No new i18n key was added.** Both new alert blocks (Findings 1) render the
raw `errors.sources` / `errors.installed` string directly, exactly matching how
`errors.browse` is already rendered elsewhere in `BrowseSection.tsx` — there is
no new static copy to extract. Confirmed via:
- `pnpm i18n:extract` was not run (nothing new to extract) — `pnpm i18n:check`
  was run as part of `pnpm lint:check` (see below) and passed with the exact
  same message count as before this change (**1556 messages**, all 15
  non-English catalogs), i.e. no catalog drift was introduced.
- `git diff --stat` confirms zero files under
  `ui/desktop/src/i18n/messages/` were touched.

## Tests: focused run

```
cd ui/desktop
export PATH="/tmp/corepack-bin:/home/sascha/.cache/hermit/pkg/node-24.15.0/bin:$PATH"
pnpm exec vitest run \
  src/components/marketplaces/BrowseSection.test.tsx \
  src/components/marketplaces/SourcesSection.test.tsx \
  src/components/marketplaces/InstalledSection.test.tsx \
  src/components/marketplaces/MarketplaceContext.test.tsx
```
Result: **30/30 passed** (23 pre-existing + 7 new: 2 in BrowseSection, 1 in
SourcesSection, 2 in InstalledSection, 2 in MarketplaceContext).

## Full gate

`pnpm test:run`:
```
 Test Files  58 passed (58)
      Tests  540 passed (540)
```
(540 = the 533 reported green at the end of Task 6 + 7 new tests added here.)

`pnpm lint:check` (= `tsc --noEmit` && `eslint --max-warnings 0 --no-warn-ignored` && `i18n:check`):
```
> tsc --noEmit
(no output = success)
(eslint: no output = success, 0 warnings/errors)
> node scripts/i18n-check.js && node scripts/i18n-validate-locale.js
i18n locale validation passed for de, es, fr, hi, id, it, ja, ko, ms, pt, ru, tr, vi, zh-CN, zh-TW (1556 messages).
```
Both commands exited 0. Output is pristine (only the pre-existing, unrelated
pnpm workspace "Unsupported platform" warnings for `goose-binary-*` optional
deps, identical to what Task 6's report also observed).

## Files changed

```
ui/desktop/src/components/marketplaces/BrowseSection.tsx        |  2 +-
ui/desktop/src/components/marketplaces/BrowseSection.test.tsx   | 20 +++++++++++
ui/desktop/src/components/marketplaces/InstalledSection.tsx     | 12 ++++++-
ui/desktop/src/components/marketplaces/InstalledSection.test.tsx| 26 +++++++++++++
ui/desktop/src/components/marketplaces/MarketplaceContext.test.tsx | 16 ++++++++
ui/desktop/src/components/marketplaces/SourcesSection.tsx       |  8 ++++-
ui/desktop/src/components/marketplaces/SourcesSection.test.tsx  |  8 ++++
7 files changed, 89 insertions(+), 3 deletions(-)
```

No generated files, no `ui/desktop/src/acp/marketplace.ts`, no
`tests/e2e/fixtures.ts`, and no i18n catalog files were touched.

## Status

DONE — all three findings fixed, all touched/added tests green, full gate
(`pnpm test:run`, `pnpm lint:check`) green with pristine output, no i18n catalog
churn.
