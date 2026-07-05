# Task 7 Report: Playwright E2E — add → browse → install against a local git fixture marketplace

## Status: DONE_WITH_CONCERNS

The three deliverable files were implemented verbatim per the brief (no selector
corrections were needed — see below). The E2E spec is real and exercises the
actual shipped UI end-to-end, but it did not go green in this sandbox because
the shared, pre-existing `tests/e2e/fixtures.ts` `goosePage` fixture has a
hardcoded 10-second CDP-connect retry budget that this environment's
`pnpm run start-gui` cold-start pipeline structurally cannot fit into
(measured ~12.7s). This is reproduced identically on a pre-existing spec
(`loading-state.spec.ts`), proving it is an environment-timing issue, not a
bug in the new spec or the Tasks 1–6 UI. Per Plan 2b's documented fallback,
the fixture builder, spec, and manual runbook are committed anyway.

## What was implemented

- `ui/desktop/tests/e2e/marketplace-fixture.ts` — `createMarketplaceFixture()`,
  written verbatim from the brief. Builds a local git repo with the Claude
  marketplace layout (`.claude-plugin/marketplace.json` +
  `plugins/demo/.claude-plugin/plugin.json` + `plugins/demo/skills/x/SKILL.md`)
  and commits it. Verified byte-for-byte identical in shape to the backend's
  own `e2e_register_fetch_install_from_local_git_marketplace` fixture in
  `crates/goose/src/marketplace/install.rs` (same marketplace.json shape,
  same plugin.json, same SKILL.md body).
- `ui/desktop/tests/e2e/marketplaces.spec.ts` — written verbatim from the
  brief. Navigates to `#/marketplaces` via `window.location.hash`, adds the
  fixture as a `claude`-kind source, browses it, selects the `demo` plugin via
  its checkbox, installs through the Trust dialog, asserts
  `installed-plugin-demo` becomes visible, then best-effort removes the
  source.
- `ui/desktop/tests/e2e/MARKETPLACES-RUNBOOK.md` — written verbatim from the
  brief, the manual fallback runbook.

## Selector/mismatch check (none found)

Before trusting the brief's selectors, I grepped the actually-committed Task
2–4 components (`SourcesSection.tsx`, `BrowseSection.tsx`, `InstalledSection.tsx`,
`TrustDialog.tsx`) for every `data-testid` and the checkbox `aria-label` the
spec depends on:

| Selector | Found in |
|---|---|
| `marketplace-source-name` / `-location` / `-kind` / `-add` | `SourcesSection.tsx` (Input/select/Button) |
| `marketplace-source-remove-${s.name}` | `SourcesSection.tsx` |
| `marketplace-browse-select` / `marketplace-browse` / `marketplace-install` | `BrowseSection.tsx` |
| catalog checkbox `aria-label={p.name}` | `BrowseSection.tsx` line 126, `role="checkbox"` implicit on `<input type="checkbox">` |
| `marketplace-trust-confirm` | `TrustDialog.tsx` |
| `installed-plugin-${plugin.name}` | `InstalledSection.tsx` |

Every one matches exactly what the brief's spec uses — **no mismatches, no
spec edits were needed**. The spec is committed byte-for-byte as specified in
the brief.

## What I ran and results

### Environment setup
- `source bin/activate-hermit` — hermit toolchain (cargo 1.92.0, rustc 1.92.0)
  activated correctly; cargo/rustc were on `PATH` directly (unlike Task 6,
  no shim was needed for cargo).
- `pnpm` was not on `PATH` (same issue as Task 6). Reused the Task 6 fix:
  `export PATH="/tmp/corepack-bin:/home/sascha/.cache/hermit/pkg/node-24.15.0/bin:$PATH"`
  with a pinned `/tmp/corepack-bin/pnpm` shim execing `corepack pnpm@10.30.0`.
  `pnpm --version` → `10.30.0`.
- `cargo build -p goose-cli` (full workspace, cold — no prior `target/` in
  this worktree) — **948 crates compiled, `Finished dev profile ... in 4m
  45s`**, producing `/home/sascha/Projects/corporategoose/goose-mp-2b/target/debug/goose`
  (804.7 MB debug binary), which is what `gooseServe.ts`'s `findGooseBinaryPath`
  resolves to in dev mode (`process.cwd()/../../target/debug/goose` relative
  to `ui/desktop`).
- `pnpm install` in `ui/desktop` — succeeded (only benign
  cross-platform-optional-dep warnings for `goose-binary-*`).
- Confirmed ambient user config (`~/.config/goose/config.yaml`) already has
  `active_provider: claude-code` configured, so the app's `OnboardingGuard`
  is satisfied and `/marketplaces` renders directly (not blocked behind the
  onboarding screen).

### Final verification gates (per brief)
- `pnpm test:run` → **58 test files, 533 tests, all passed.**
- `pnpm lint:check` (`tsc --noEmit` + `eslint --max-warnings 0` + `i18n:check`)
  → **green**, no output/warnings. Also ran `npx eslint` directly against the
  two new `.ts` files — clean (silent = pass). Confirmed `tests/e2e` is indeed
  outside `tsconfig.json`'s `include` (`"include": ["src", "tests/integration"]`),
  matching the brief's note — the new files are not part of `tsc --noEmit`.

### E2E run
Command: `pnpm test-e2e:single "add a source, browse the catalog, and install a plugin"`

Result — **FAIL**, consistently reproduced across 3 separate runs:

```
Error: Failed to connect to Electron app after 100 attempts (10s). Last error: browserType.connectOverCDP: connect ECONNREFUSED 127.0.0.1:9222
    Call log:
      - <ws preparing> retrieving websocket url from http://127.0.0.1:9222
       at fixtures.ts:86
```

### Root-cause diagnosis (not a selector bug, not a missing build step)

1. Ruled out "no goosed binary": built it via `cargo build -p goose-cli` above.
2. Ruled out "no provider / onboarding blocking": ambient config already has
   `claude-code` as active provider.
3. Ruled out "our spec's selectors are wrong": confirmed via the table above
   that every selector matches the committed components exactly.
4. Ruled out "spec-specific bug": ran the **pre-existing** (Task-7-unrelated)
   `tests/e2e/loading-state.spec.ts` through the identical `goosePage` fixture
   — it failed with the **exact same** `ECONNREFUSED 127.0.0.1:9222` after
   10s. This is decisive: the failure is in the shared fixture/environment,
   not in anything Task 7 introduced.
5. Quantified the actual cause. `tests/e2e/fixtures.ts`'s `goosePage` fixture
   spawns `pnpm run start-gui` (`build-goose-sdk && i18n:compile &&
   electron-forge start`) and retries the CDP connection for a **hardcoded
   10s** (`maxRetries=100 * retryDelay=100ms`, not configurable via env).
   Timed each stage with `time`/`/usr/bin/time -v` in this sandbox:
   - `pnpm run build-goose-sdk` (npm generate-schema + tsc from scratch,
     no incremental cache) → **~4.8–4.9s**, reproducible across two runs.
   - `pnpm run i18n:compile` → **~3.9–4.0s**, reproducible across two runs.
   - Instrumented a full `pnpm run start-gui` invocation end-to-end (polling
     the log for forge's own "Launched Electron app" line): **ready at
     12.66s** — i.e. the app hadn't even finished launching by the time the
     fixture's 10s budget was already exhausted, before the CDP port would
     even be expected to accept connections.
   - `nproc` = 16, `free -h` showed 27 GiB available, load average ~2.7–6.8
     (not memory/CPU starved) — this is a real timing/pipeline-length
     mismatch, not resource exhaustion.

This matches the brief's explicit, permitted fallback condition verbatim:
"Playwright + goosed are genuinely unstable/unrunnable in THIS environment
(not a selector bug you can fix, not a build step you can do)." `fixtures.ts`
is shared, pre-existing test infrastructure outside this task's file list
(only `marketplace-fixture.ts`, `marketplaces.spec.ts`,
`MARKETPLACES-RUNBOOK.md` were mine to create) — I did not modify it, since
doing so would affect every other e2e spec and is out of this task's scope.

## Files changed

Commit `a3dfe847e`:
```
ui/desktop/tests/e2e/MARKETPLACES-RUNBOOK.md    | new file, 18 lines
ui/desktop/tests/e2e/marketplace-fixture.ts     | new file, 38 lines
ui/desktop/tests/e2e/marketplaces.spec.ts       | new file, 38 lines
3 files changed, 94 insertions(+)
```

No other files were modified. `.superpowers/sdd/2b/` (task briefs/reports) is
untracked, as in prior tasks.

## Self-review

- **Does the spec exercise the real UI end-to-end, not mocks?** Yes — it
  drives the actual `MarketplacesView`/`SourcesSection`/`BrowseSection`/
  `TrustDialog`/`InstalledSection` components through a real Electron
  renderer connected via CDP, talking to a real spawned `goosed`/`goose`
  process over the real ACP websocket, against a real local git repo fixture
  on disk. Nothing is mocked or stubbed.
- **Do the selectors match the committed components?** Yes, verified by grep
  against every one of the five relevant component files (table above); no
  edits to the spec were required.
- **Is the test output pristine?** `pnpm lint:check` and `pnpm test:run` are
  fully green with no warnings. The E2E run itself fails with a single, clean,
  well-understood error (CDP connect timeout), not a flaky/ambiguous failure —
  I did not observe any stack traces, unhandled rejections, or console errors
  from the app itself (the app never got far enough to log any renderer
  console output before the retry budget was exhausted).

## Concerns

1. **The E2E did not go green in this sandbox** — root cause is fully
   diagnosed and is an environment/pipeline-timing issue in shared,
   pre-existing `fixtures.ts` (10s hardcoded CDP-connect budget vs. this
   sandbox's measured ~12.7s `pnpm run start-gui` cold-start latency), not a
   defect in Tasks 1–6's UI or in this task's spec. Confirmed by reproducing
   the identical failure on an unrelated, pre-existing spec
   (`loading-state.spec.ts`).
2. Per the task's explicit instructions, I did not attempt to fix this by
   modifying `fixtures.ts` (out of scope — shared infra affecting all e2e
   specs, not listed as a file to create/modify in the brief). If a future
   task wants a real green run in environments like this one, the fix would
   likely be either: (a) increase `maxRetries`/`retryDelay` in
   `tests/e2e/fixtures.ts`, or (b) pre-warm `build-goose-sdk`/`i18n:compile`
   outputs and short-circuit `start-gui` when nothing changed, or (c) launch
   Electron directly (skip electron-forge's vite dev bundling) for the e2e
   harness.
3. `MARKETPLACES-RUNBOOK.md` is the documented fallback per Plan 2b's test
   constraint and has not been manually executed end-to-end by me (I do not
   have a way to click through the real Electron app's UI manually in this
   session) — it is transcribed verbatim from the brief, which was itself
   derived from the same components I verified selector-by-selector.
