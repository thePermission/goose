# Task 3 report — Browse section + Trust dialog

Branch: `feature/marketplace-desktop-ui-2b`
Commit: `febaeb8aa` — "feat(marketplaces): add Browse section with catalog select, multi-install and Trust dialog"

## What was built

- `ui/desktop/src/components/marketplaces/TrustDialog.tsx` (new) — custom modal (`role="dialog"`, no Radix), shows source (`name · kind · location`), the list of selected plugins, a generic hooks/MCP trust warning, and Cancel/Install (`data-testid="marketplace-trust-confirm"`) buttons that disable while `installing`.
- `ui/desktop/src/components/marketplaces/BrowseSection.tsx` (new) — source `<select>` (`marketplace-browse-select`) defaulting to the first configured source, a Browse button (`marketplace-browse`) that calls `browse(activeSource)`, a catalog list with per-plugin checkboxes (`aria-label={plugin.name}`, disabled when `!installable`, with an "(Unsupported)" marker), an Install button (`marketplace-install`, disabled when nothing selected or `loading.install`) that opens the Trust dialog, a confirm handler that calls `install(marketplace, selectedPlugins)` and renders per-outcome results (success: `{name}: installed (skills: N, hooks: yes/no, MCP: yes/no)`; failure: `{name}: failed — {error}`), and a toast (`toastService.success`/`.error`) reflecting full vs. partial success.
- `ui/desktop/src/components/marketplaces/BrowseSection.test.tsx` (new) — 5 tests per brief, `useMarketplace` and `toastService` mocked.

Deviation from the brief (pre-approved by the calling task): dropped the explicit `): JSX.Element` / `): JSX.Element | null` return-type annotations on both `TrustDialog` and `BrowseSection` — this repo's `@types/react@^19` + `react-jsx` runtime has no global `JSX` namespace, so the annotation as written fails `tsc`. `TrustDialog` still does the early `if (!open) return null;`. Everything else implemented verbatim from the brief.

## TDD evidence

**RED** — `corepack pnpm@10.30.0 test:run` before creating the implementation files (only the test file existed):
```
FAIL src/components/marketplaces/BrowseSection.test.tsx
Error: Failed to resolve import "./BrowseSection" from ".../BrowseSection.test.tsx". Does the file exist?
Test Files  1 failed | 53 passed (54)
     Tests  517 passed (517)
```

**GREEN** — after adding `TrustDialog.tsx` and `BrowseSection.tsx`, full suite:
```
Test Files  54 passed (54)
     Tests  522 passed (522)
```
(517 pre-existing + 5 new `BrowseSection` tests, all passing; no regressions.)

## Verification

- `corepack pnpm@10.30.0 test:run` → 54/54 files, 522/522 tests passed.
- `corepack pnpm@10.30.0 typecheck` → clean, no errors.
- `corepack pnpm@10.30.0 exec eslint "src/components/marketplaces/**/*.{ts,tsx}" --max-warnings 0 --no-warn-ignored` → exit 0, no output.

Note on environment: neither `pnpm` nor `corepack` were on `PATH` directly; `corepack` was found at `/home/sascha/.config/goose/mcp-hermit/bin/corepack` (hermit-managed Node 24.15.0 toolchain) and prepended to `PATH` for all commands. `pnpm test:run -- <file>` does not scope in this repo (confirmed) — used the full-suite `test:run` per instructions.

## Files changed

- `ui/desktop/src/components/marketplaces/TrustDialog.tsx` (new, 75 lines)
- `ui/desktop/src/components/marketplaces/BrowseSection.tsx` (new, 193 lines)
- `ui/desktop/src/components/marketplaces/BrowseSection.test.tsx` (new, 100 lines)

## Self-review (completeness / quality / YAGNI / test realism)

- **Completeness vs. brief**: all required data-testids (`marketplace-browse-select`, `marketplace-browse`, `marketplace-install`, `marketplace-trust-confirm`), the `aria-label={plugin.name}` checkboxes, the Unsupported-disabled behavior, the Trust dialog's source + plugins + hooks/MCP warning, and the post-install per-plugin result rendering (skills/hooks/MCP from `InstalledPluginResult_unstable`) with partial-failure toast are all present and exercised by the 5 tests.
- **Scope boundary confirmed**: checked `docs/superpowers/plans/2026-07-05-marketplace-desktop-plan-2b-frontend.md` — "Installed section" is Task 4 and `MarketplacesView` composition/navigation wiring is Task 5, so `BrowseSection` intentionally isn't wired into any page yet. Correctly out of scope here.
- **YAGNI**: implementation is exactly the brief's minimal version — no extra state, no premature abstraction (e.g., no generic "selection" hook, no dedicated results component). `browsedSource ?? activeSource` correctly ties the install call and Trust-dialog source lookup to the source that was actually browsed, not a since-changed-but-not-yet-browsed dropdown value — this is deliberate, not gold-plating.
- **Test realism**: tests mock only `useMarketplace` and `toastService` (the two collaborators the brief calls out); they exercise real DOM interactions via `fireEvent`/`screen` with jsdom rendering of the actual component tree (including the real `Button` and the real `TrustDialog`, not mocked) and real `IntlProvider` message formatting (`resultSuccess`/`resultFailure` templates), so the assertions verify actual rendered output, not mock call inspection alone.
- **No behavior changes to Task 1/2 code**: `MarketplaceContext.tsx`, `SourcesSection.tsx` and their tests are untouched.

## Concerns

- Carried-over, pre-existing, plan-mandated minors from Tasks 1–2 (per `.superpowers/sdd/2b/progress.md`) are unaffected by this task and remain deferred to the final pass (e.g., no unmount guard on async state updates in the context, no browse() call sequencing). `BrowseSection`'s `handleConfirmInstall` awaits `install(...)` and then calls `setResults`/`setTrustOpen`/`setSelected`; if the component unmounts mid-install this would warn (not fail) in a real app — same class of issue as the pre-existing ones, not introduced by this task, not covered by a test, and consistent with how `SourcesSection` already behaves.
- No dedicated test asserts the Trust dialog closes automatically after a successful confirm (implicitly covered since `results` render replaces the visible outcome list); not required by the brief's acceptance criteria, noted as a minor gap in explicitness only.
- No new i18n locale work was done (`defineMessages` only, as instructed — Task 6 owns `i18n:check`/locale fill).
