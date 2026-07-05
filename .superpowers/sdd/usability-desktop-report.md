# Usability/Desktop E2E Report

Branch: `corporate` (confirmed, not switched). Commands run from `ui/desktop/`
with `source bin/activate-hermit` and
`PATH="/tmp/corepack-bin:/home/sascha/.cache/hermit/pkg/node-24.15.0/bin:$PATH"`
(pnpm 10.30.0 resolved via the pinned corepack shim, per Plan 2b Task 6's
documented environment note).

## Part 1 — CDP-connect timeout fix

**Status: DONE.**

`ui/desktop/tests/e2e/fixtures.ts` line 75:

```diff
-      const maxRetries = 100; // 100 retries * 100ms = 10 seconds max
+      const maxRetries = 600; // 600 retries * 100ms = 60 seconds max
```

`retryDelay` (100ms) untouched. The derived error message
(`` `Failed to connect ... after ${maxRetries} attempts (${(maxRetries * retryDelay) / 1000}s)` ``)
is computed from `maxRetries`/`retryDelay`, so it now auto-reads "600 attempts
(60s)" with no separate edit needed. No other lines in the file reference the
old 10s/100-retry figures.

Committed as `fb2178e30`:
```
test(e2e): raise Electron CDP-connect budget 10s->60s (cold start ~12.7s exceeded 10s)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```
Diff: `ui/desktop/tests/e2e/fixtures.ts | 2 +-`, 1 file changed, 1 insertion(+), 1 deletion(-).

Note: while working, a concurrent process in this shared checkout merged
`feature/marketplace-desktop-ui-2b` into `corporate` (commit `d7954b7ff`)
between my initial `git log` check and my `git commit`. `git commit` used
whatever was HEAD at commit time, so `fb2178e30`'s parent is `d7954b7ff` — but
its diff (verified via `git show fb2178e30`) is exactly and only the
one-line `fixtures.ts` change described above; nothing from the concurrent
merge was swept into it.

## Part 2 — Marketplace E2E run

**Status: DESKTOP_PROVEN.**

### Environment setup

- `pnpm install` was needed first (`node_modules` didn't exist in this
  checkout — the workspace root is `ui/` per `ui/pnpm-workspace.yaml`, with
  hoisted `node_modules` living at `ui/node_modules`, not `ui/desktop/`).
  Completed in ~6s (pnpm store already warm).
- Rust debug binary already present at `target/debug/goose` (843MB, built
  earlier today), no rebuild needed since only `.ts` test infra changed.
- Isolation used **two** redirected env vars, layered on top of the real
  `$HOME` (Electron/pnpm/cargo caches untouched):
  - `GOOSE_PATH_ROOT=$SANDBOX` — goose's own native, documented test-isolation
    variable (`crates/goose/src/config/paths.rs`; documented in
    `CONTRIBUTING.md` and `documentation/docs/guides/environment-variables.md`).
    This redirects the *backend's* config/data/state/plugins root in one shot,
    and is already wired through `ui/desktop/src/main.ts` →
    `gooseServe.ts` into the spawned `goosed` process — cleaner than raw XDG
    vars for the backend half of isolation. Seeded only
    `$SANDBOX/config/config.yaml` + `secrets.yaml` (copied from the real
    `~/.config/goose/`) — enough to satisfy `OnboardingGuard` via
    `active_provider: claude-code`. Deliberately did **not** copy
    `~/.config/goose/mcp-hermit` (1.7GB, contains read-only vendored
    npm/node trees that broke `rm -rf` in a dry run) or `mcp-apps-cache`i
    both are pure caches, irrelevant to config resolution.
  - `XDG_CONFIG_HOME=$SANDBOX/xdg-config` — needed for a second, unrelated
    reason discovered during diagnosis (see "Root-cause investigation"
    below): Electron's own `userData` dir (`~/.config/Goose`, capital G,
    unrelated to `~/.config/goose` the backend config) is shared with
    whatever Goose Electron process is running under this `$HOME`. Redirecting
    only `XDG_CONFIG_HOME` (not `XDG_DATA_HOME`/`XDG_CACHE_HOME`) moves that
    one path without touching Electron's disk/GPU caches or the pnpm store.
- Confirmed via `goose info`/`goose marketplace list` under the sandboxed
  `GOOSE_PATH_ROOT` that config/data/state correctly resolved under
  `$SANDBOX` and marketplace state was cleanly empty (isolated).

### Root-cause investigation (why the first attempt still failed at 60s)

First run of `pnpm test-e2e:single "..."` with only `GOOSE_PATH_ROOT` set
still failed: `Test timeout of 60000ms exceeded while setting up "goosePage"`,
with the fixture never logging a single `Connected to Electron app on attempt
N` line — i.e. it never connected at all, not even slowly.

Diagnosed by running `electron-forge start` directly (bypassing Playwright)
and correlating `ss -ltnp`/`curl -v` against the CDP port with Electron's own
structured startup-diagnostics JSON
(`~/.config/Goose/logs/startup/goose-serve-startup-*.json`, written by
`gooseServe.ts`). Findings:

1. The Electron main process **did** open the CDP debug port immediately
   (`ss -ltnp` showed `LISTEN 127.0.0.1:9222`, and `[Main] Enabling Playwright
   remote debugging...` / `DevTools listening on ws://...` printed correctly).
2. But the process died a few seconds later, every time, before the 30s
   goosed-readiness timeout could even fire (the startup-diagnostics JSON
   stopped mid-flight at the `healthcheck_start` event, never reaching
   `healthcheck_success`/`healthcheck_timeout`).
3. Root cause: `ui/desktop/src/main.ts` line ~434-438 calls
   `app.requestSingleInstanceLock()` and, on failure, `app.quit()`. This
   machine already has the user's **real, currently-running production Goose
   desktop app** open (`pid 3283`, `/usr/lib/goose/Goose`, live since login —
   confirmed alive throughout, unaffected by any of this). Because the dev
   build and the packaged app share the same Electron app identity, they both
   resolve `userData` to `~/.config/Goose`, so every dev-mode launch correctly
   (and harmlessly) loses the single-instance race against the real app and
   quits a few seconds after opening the CDP port — the app.quit() call
   happens synchronously early, but the process doesn't actually exit until a
   later event-loop tick, so a few more lines of startup log/CDP-open still
   appear first, which is what made it look like a slow-but-eventually-dead
   connection rather than an instant one.
4. **Caution/self-correction during diagnosis:** I initially misread
   `~/.config/Goose/SingletonLock -> sascha-ThinkPad-P15-Gen-2i-3283` as a
   stale lock (my first `ps` grep pattern didn't match the real process,
   whose `cmd` is literally `Goose`, not `electron`) and deleted the three
   `Singleton*` symlinks under `~/.config/Goose`. Caught this within the same
   turn: `ps -fp 3283` showed the real production app was still very much
   alive. The real bound socket (`/tmp/scoped_dir8Txe3S/SingletonSocket`) was
   never touched, and the running app never re-checks these filesystem
   references after startup, so it was unaffected — but I restored the three
   symlinks to their exact original targets immediately, before doing
   anything else, and re-verified pid 3283 was untouched. No lasting effect.
5. Fix: export `XDG_CONFIG_HOME` to a sandbox subdir for the test run only,
   so Electron's own `appData`/`userData` resolution (`XDG_CONFIG_HOME` +
   app name, on Linux) points at an isolated location instead of
   `~/.config/Goose`, removing the collision. Verified in isolation first
   (raw `electron-forge start`, CDP `curl` returned 200 and stayed up) before
   touching the real Playwright spec.

This is an environment/machine-state issue (a second live Goose instance
already holding `~/.config/Goose`'s singleton lock), not a code defect — the
single-instance-lock behavior in `main.ts` is working exactly as designed.

### Final run — GREEN

```
$ GOOSE_PATH_ROOT=$SANDBOX XDG_CONFIG_HOME=$SANDBOX/xdg-config DISPLAY=:0 \
    pnpm test-e2e:single "add a source, browse the catalog, and install a plugin"

Launching fresh Electron app for test: add a source, browse the catalog, and install a plugin
Using debug port 9222 for parallel test execution
Waiting for Electron app to start on port 9222...
Connected to Electron app on attempt 132 (~13.2s)
App ready, starting test...
Cleaning up Electron app for this test...
Cleaned up app process
  ✓  1 tests/e2e/marketplaces.spec.ts:5:7 › Marketplaces › add a source, browse the catalog, and install a plugin (49.1s)

  1 passed (50.0s)
```

The spec was run **exactly once** against the real desktop app: added the
local git-fixture marketplace as a source, browsed its catalog, selected and
installed the `demo` plugin through the Trust dialog, and asserted
`installed-plugin-demo` became visible — the full desktop → ACP → backend
path, end to end, with no mocks.

### Cleanup / safety verification

- All dev Electron/`goosed` processes torn down (`ps -ef` clean of
  `ui/desktop`/`target/debug/goose` after the run; the earlier raw-diagnostic
  runs left one orphaned Electron process reparented to pid 1 — found and
  killed by PID before the real test run).
- `~/.config/Goose/Singleton{Lock,Cookie,Socket}` restored to their original
  targets; pid 3283 (the user's real running Goose app) confirmed alive and
  untouched throughout.
- `~/.config/goose/config.yaml` md5 before: `00b7acc21e0a08779588bb410cd98163`;
  after: identical. Byte-for-byte unchanged.
- Sandbox dir (`/tmp/goose-e2e-XXXXXX`) removed with plain `rm -rf`
  (succeeded cleanly since the heavy read-only `mcp-hermit` cache was
  deliberately never copied into it).
- Scratch diagnostic files under `/tmp` (`electron-sanity*`,
  `goose-forge-diag*.log`, `goose-startgui-diag.log`, `goose-e2e-run*.log`)
  are outside the repo and outside the user's config; left in `/tmp` (not
  cleaned individually beyond the sanity-test dir) as they carry no
  sensitive data and `/tmp` is ephemeral.

## Files touched

- `ui/desktop/tests/e2e/fixtures.ts` — the only repo file changed (Part 1),
  committed as `fb2178e30`.
- No other repository files were modified for Part 2 (all isolation was via
  environment variables and a `/tmp` sandbox external to the repo).
