# Task 1 Report: `useMarketplace` hook + context

## What was implemented

Exactly per the brief, no deviations:

- `ui/desktop/src/components/marketplaces/errorMessage.ts` — `errorMessage(e: unknown): string` helper.
- `ui/desktop/src/components/marketplaces/MarketplaceContext.tsx` — `MarketplaceProvider` + `useMarketplace()`:
  - State: `sources`, `catalog`, `browsedSource`, `installedPlugins`, `loading` (`MarketplaceLoading`), `errors` (`MarketplaceErrors`).
  - Actions: `refreshSources`, `addSource`, `removeSource`, `browse`, `install`, `refreshInstalled`, `setPluginEnabled`, `updatePlugin` — all thin wrappers around `ui/desktop/src/acp/marketplace.ts` with per-field loading/error bookkeeping.
  - `install(marketplace, plugins, autoUpdate?)` calls `installMarketplacePlugin` sequentially per plugin, collects `InstallOutcome[]` (continues past individual failures), refreshes `installedPlugins` once at the end, and records a joined `"plugin: error; ..."` string in `errors.install` if any failed.
  - On mount, `refreshSources()` and `refreshInstalled()` both fire once via `useEffect`.
  - Context value is memoized; `useMarketplace()` throws if used outside a `MarketplaceProvider`.
- `ui/desktop/src/components/marketplaces/MarketplaceContext.test.tsx` — the 6 test brief verbatim, mocking `../../acp/marketplace`.

The existing wrapper `ui/desktop/src/acp/marketplace.ts` was read-only verified against the brief's listed interface — it matches exactly (function names, signatures, return types). SDK types (`MarketplaceSourceInfo`, `CatalogPluginInfo`, `InstalledPluginInfo`, `InstalledPluginResult_unstable`) were confirmed present and exported from `@aaif/goose-sdk` (`ui/sdk/src/generated/types.gen.ts` / `index.ts`). No SDK/ACP/generated files were touched.

## Files changed

- `ui/desktop/src/components/marketplaces/errorMessage.ts` (new)
- `ui/desktop/src/components/marketplaces/MarketplaceContext.tsx` (new)
- `ui/desktop/src/components/marketplaces/MarketplaceContext.test.tsx` (new)

Commit: `124a7dedd` — `feat(marketplaces): add useMarketplace hook and context` (branch `feature/marketplace-desktop-ui-2b`, not pushed).

## TDD evidence

**RED** — wrote the test file first, before creating any implementation files, then ran:

```
pnpm test:run -- src/components/marketplaces/MarketplaceContext.test.tsx
```

Output (relevant excerpt):

```
❯ src/components/marketplaces/MarketplaceContext.test.tsx (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/components/marketplaces/MarketplaceContext.test.tsx [ src/components/marketplaces/MarketplaceContext.test.tsx ]
Error: Failed to resolve import "./MarketplaceContext" from "src/components/marketplaces/MarketplaceContext.test.tsx". Does the file exist?
  Plugin: vite:import-analysis
  ...
 Test Files  1 failed | 51 passed (52)
      Tests  506 passed (506)
```

This matches the brief's expected failure exactly ("cannot resolve import `./MarketplaceContext`"). The other 51 suites/506 tests were pre-existing and unaffected.

**GREEN** — after creating `errorMessage.ts` and `MarketplaceContext.tsx` per the brief's exact code:

```
pnpm test:run -- src/components/marketplaces/MarketplaceContext.test.tsx
```
```
 Test Files  52 passed (52)
      Tests  512 passed (512)
```

(506 pre-existing + 6 new = 512, all green, no regressions.)

Per-test breakdown (via `vitest run ... --reporter=verbose`), all 6 pass:
```
✓ useMarketplace > loads sources and installed plugins on mount
✓ useMarketplace > addSource calls the wrapper then refreshes sources
✓ useMarketplace > browse populates catalog and browsedSource on success
✓ useMarketplace > browse failure records an error and clears the catalog
✓ useMarketplace > install collects per-plugin outcomes, keeps going after a failure, and refreshes installed
✓ useMarketplace > setPluginEnabled and updatePlugin call the wrapper then refresh installed

Test Files  1 passed (1)
     Tests  6 passed (6)
```

Re-ran once more after the commit — same clean 6/6 result (see "Final verification" below).

**Typecheck**
```
pnpm typecheck
> tsc --noEmit
```
Exit 0, no output/errors.

**Lint**
```
pnpm exec eslint "src/components/marketplaces/**/*.{ts,tsx}" --max-warnings 0 --no-warn-ignored
```
Output: `ESLint: No issues found`. Exit 0.

## Final verification (post-commit)

Re-ran the focused test after committing, as instructed:
```
pnpm exec vitest run src/components/marketplaces/MarketplaceContext.test.tsx --reporter=verbose
```
```
Test Files  1 passed (1)
     Tests  6 passed (6)
```
Pristine, no warnings/errors in output.

## Environment note (not a code concern, flagging for transparency)

`pnpm` was not directly on `PATH` in this shell. `corepack pnpm` defaulted to a very new pnpm (11.10.0) which failed (`ERR_PNPM_EXOTIC_SUBDEP` on `@electron/node-gyp`, plus the workspace's `engines.pnpm` requires `>=10.30.0` while the lockfile is `lockfileVersion: 9.0`). Resolved by using `corepack pnpm@10.30.0` for `install`/`test:run`/`typecheck`/`eslint`, via a small local shim on `PATH` so the `postinstall` script's internal `pnpm run build-goose-sdk` call (executed by the SDK's own postinstall) could also resolve `pnpm`. No repo files were changed by this — confirmed via `git status` that only the intended 3 new files were added (no lockfile/package.json drift, `node_modules` is gitignored). This is purely a local-shell toolchain workaround, not a code change; doesn't affect other tasks unless their shell also lacks `pnpm` on `PATH`.

## Self-review (completeness / quality / YAGNI / tests)

- **Completeness**: All exports listed in "Produces" match exactly — `errorMessage`, `InstallOutcome`, `MarketplaceLoading`, `MarketplaceErrors`, `MarketplaceContextValue`, `MarketplaceProvider`, `useMarketplace`. All 8 consumed wrapper functions are used. Both SDK-typed collections (`sources`, `installedPlugins`) are loaded on mount as required for Tasks 2–5 to consume immediately.
- **Quality**: State updates use functional updates (`setX((p) => ({...p, field: ...}))`) to avoid stale-closure bugs across concurrent async actions (e.g., `browse` and `install` running loading/error updates independently doesn't clobber other fields). Context value and all action callbacks are memoized (`useCallback`/`useMemo`) to avoid unnecessary re-renders in consumers. `useMarketplace()` throws outside a provider, consistent with other context patterns in this codebase (e.g. `ConfigContext.tsx`, `ModelAndProviderContext.tsx` live directly under `src/components/`, matching this file's placement).
- **YAGNI**: No extra state, actions, or exports beyond the brief. `install`'s `autoUpdate` default (`false`) mirrors the wrapper's own default so behavior is consistent whether called directly or through the wrapper.
- **Tests**: All 6 brief-specified tests pass, covering: initial load, refresh-after-mutation semantics (`addSource`), browse success/failure paths, partial-failure `install` outcome collection + joined error message, and enable/update actions triggering a single shared refresh path. No additional tests were deemed necessary at this task's scope — UI-level behavior (rendering, per-plugin outcome display) belongs to later tasks per the plan.
- No TODOs, no dead code, no unused imports (confirmed by clean `tsc --noEmit` and `eslint --max-warnings 0`).

## Concerns

None. Implementation matches the brief verbatim; all specified checks (focused test, typecheck, lint) pass cleanly; no SDK/ACP/generated files were modified; no lockfile or package.json drift from the environment workaround.
