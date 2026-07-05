# Acceptance Verification (Bar b) — Proose Rebrand

Branch: `feature/proose-rebrand` (confirmed via `git branch --show-current`, not switched/created).
Toolchain: `source bin/activate-hermit` (cargo 1.92.0, pnpm 10.30.3, just 1.40.0).

**Overall status: VERIFIED_WITH_CONCERNS**

The rebrand builds, runs, and installs as a distinct app; the CLI/backend and desktop
GUI both coexist cleanly alongside the live upstream Goose without touching real user
config. One genuine, previously-undetected functional bug was found in §4 (Linux
`.desktop` launcher templates were never rebranded), and one pnpm test flake was
diagnosed as CPU-contention, not a regression. Neither blocks the branch's core claims,
but the §4 bug should be fixed before shipping installers.

## §0 — Whole-branch diff sanity

```
git diff --stat b29b945b3..HEAD
```

```
 .gitignore                        |  1 +
 Justfile                          | 30 +++++++++++++++---------------
 crates/goose-cli/Cargo.toml       |  2 +-
 crates/goose/src/config/paths.rs  |  2 +-
 ui/desktop/forge.config.ts        | 16 ++++++++--------
 ui/desktop/package.json           |  4 ++--
 ui/desktop/src/gooseServe.test.ts |  2 +-
 ui/desktop/src/gooseServe.ts      |  2 +-
 ui/desktop/src/main.ts            | 14 +++++++-------
 9 files changed, 37 insertions(+), 36 deletions(-)
```

Exact match with the expected file list. 4 commits on the branch, all `feat(proose):`/
`fix(proose):` scoped. `.superpowers/sdd/proose/` (plan/briefs/reports/review-diffs) is
present but **untracked** (not part of the diff — expected, matches Task 1-3's own
reports which note this directory is deliberately not committed).

**No surprises.**

Notable *gap*, not surprise: `ui/desktop/forge.deb.desktop` and
`ui/desktop/forge.rpm.desktop` (the Linux `.desktop` launcher templates referenced by
`forge.config.ts`'s `desktopTemplate` option) were **not** in this diff and were never
touched by any of the 3 tasks — see §4 finding below, this is the direct cause of a real
bug in the packaged artifact.

## §1 — Build

```
cargo build -p goose-cli
```
`Finished \`dev\` profile [unoptimized + debuginfo] target(s) in 27.28s` (10 crates
compiled), no errors/warnings.

```
$ ls -la ./target/debug/proose
-rwxrwxr-x 1 sascha sascha 804.7M ... target/debug/proose   (ELF, executable)
```

```
just copy-binary debug
$ ls -la ./ui/desktop/src/bin/proose
-rwxrwxr-x 1 sascha sascha 843766928 ... ui/desktop/src/bin/proose   (executable)
```

Both artifacts exist and are executable. **PASS.**

## §2 — Backend dir independence (isolated marketplace flow)

Built a local-git Claude marketplace fixture (`.claude-plugin/marketplace.json` +
`plugins/demo/{.claude-plugin/plugin.json, skills/demo-skill/SKILL.md}`, committed with
`git init`), mirroring `crates/goose/src/marketplace/install.rs`'s expected layout
(`RelativePath` source, `.claude-plugin/marketplace.json` manifest resolution per
`fetch.rs::resolve_manifest_path`).

Baseline: `md5sum ~/.config/goose/config.yaml` = `00b7acc21e0a08779588bb410cd98163`.

```
SB=$(mktemp -d)
HOME="$SB" XDG_CONFIG_HOME="$SB/.config" XDG_DATA_HOME="$SB/.local/share" \
  ./target/debug/proose marketplace add <fixture> --kind claude --name t
... marketplace browse t
... marketplace install t demo
```

Output:
```
✓ Added marketplace 't'
1 plugins in 't':
  • demo — demo plugin for verification
✓ Installed claude plugin 'demo' (1.0.0)
    source: t → ./plugins/demo (local to marketplace)
    skills:
      - demo:demo-skill
    installed at: /tmp/proose-verify-w4k37z/.agents/plugins/demo
```

Sandbox tree confirms `$SB/.config/proose/config.yaml` (not `goose`) and
`$SB/.local/share/proose/projects.json`. Real `~/.config/goose/config.yaml` md5 after
== before (`00b7acc21e0a08779588bb410cd98163`). Sandbox `rm -rf`'d afterward.

**PASS**, with one environmental observation (not caused by this test — see Concerns):
a **pre-existing** real `~/.config/proose/` directory (containing `databricks/oauth/*`
and `gemini_oauth/` subdirs) was already present on disk before this verification
session started (mtime `2026-07-05 16:41:32`, i.e. before this session's own build even
finished at 17:03, and *after* Task 1's own report — which explicitly confirmed no real
`~/.config/proose` existed right after its sandboxed test). It is not attributable to
any command run in this verification session (every `proose` invocation here used
`HOME=$SB`/`XDG_*` overrides; confirmed the directory's mtime was unchanged before vs.
after my §2 test). Origin unknown — not documented in any Task 1-3 report. Flagged as a
concern for the branch owner, not a failure of this verification.

## §3 — Desktop coexistence (Proose alongside the live upstream Goose)

Pre-check: live upstream app confirmed running — `pid 3283 /usr/lib/goose/Goose`
(alive since 13:48), holding `~/.config/Goose/Singleton{Lock,Cookie,Socket}`
(`SingletonLock -> sascha-ThinkPad-P15-Gen-2i-3283`).

```
SB2=$(mktemp -d); mkdir -p "$SB2/xdg-config" "$SB2/config"
cp ~/.config/goose/{config.yaml,secrets.yaml} "$SB2/config/"
cd ui/desktop && GOOSE_PATH_ROOT="$SB2" XDG_CONFIG_HOME="$SB2/xdg-config" DISPLAY=:0 \
  pnpm run test-e2e:single "add a source, browse the catalog, and install a plugin"
```

Ran **once**. Result:
```
> proose-app@1.41.0 test-e2e:single
Launching fresh Electron app for test: ...
Connected to Electron app on attempt 128 (~12.8s)
App ready, starting test...
  ✓  1 tests/e2e/marketplaces.spec.ts:5:7 › Marketplaces › add a source, browse the
     catalog, and install a plugin (18.4s)
  1 passed (19.3s)
```

This is the coexistence proof: the dev Electron process connected over CDP and stayed
up long enough to complete the full add-source → browse-catalog → install-plugin flow
(through the real Trust dialog, asserting `installed-plugin-demo` became visible) —
i.e. it did **not** lose the single-instance race to the live upstream app, because
`productName: 'Proose'` + `XDG_CONFIG_HOME=$SB2/xdg-config` resolved Electron's
`userData` to `$SB2/xdg-config/Proose` (confirmed present on disk post-run, containing
its own `SingletonLock`/`Cache`/`logs`/etc.) rather than `~/.config/Goose`.

Post-run verification:
- Real `~/.config/goose/config.yaml` md5: unchanged (`00b7acc21e0a08779588bb410cd98163`).
- `~/.config/Goose/Singleton{Lock,Cookie,Socket}` targets unchanged (`sascha-ThinkPad-P15-Gen-2i-3283`, `5523153480047062292`, `/tmp/scoped_dir8Txe3S/SingletonSocket`).
- Upstream `pid 3283` confirmed alive throughout and after.
- No leftover `proose`/dev-electron processes after the test (Playwright's own teardown cleaned up; verified via `ps aux`).
- `$SB2` and the marketplace fixture removed with `rm -rf`.

**PASS.** (GUI did launch in-sandbox; the CDP/E2E path — already proven and budgeted at
60s per the prior desktop usability report — was used directly rather than needed as a
fallback.)

## §4 — Installable artifact

```
cd ui/desktop && pnpm exec electron-forge make --targets @electron-forge/maker-deb
```
Succeeded (exit 0) after a full production Vite build + packaging pass. Artifact:
`ui/desktop/out/make/deb/x64/proose_1.41.0_amd64.deb`.

```
$ dpkg-deb -f proose_1.41.0_amd64.deb Package
proose
$ dpkg-deb -c proose_1.41.0_amd64.deb | grep -iE "proose|goose"
./usr/lib/proose/Proose                       (main binary, distinct dir+name)
./usr/bin/proose -> ../lib/proose/Proose       (symlink, distinct from goose)
./usr/lib/proose/resources/bin/proose          (843MB — the bundled CLI/server binary)
./usr/share/applications/proose.desktop        (filename distinct)
```

Package name/bin/install-dir/bundled-server-binary are all `proose`, cleanly distinct
from `goose`. **Not `dpkg -i`'d.**

**Real functional bug found** (not previously caught by Tasks 1-3, and outside the
diff's touched-file list per §0): the packaged `./usr/share/applications/proose.desktop`
file's **contents** were never rebranded —
`ui/desktop/forge.deb.desktop`/`forge.rpm.desktop` (referenced by `forge.config.ts`'s
`desktopTemplate` option) still read:
```
Name=Goose
Exec=/usr/lib/goose/Goose %U
Icon=/usr/share/pixmaps/goose.png
MimeType=x-scheme-handler/goose;
```
i.e. a real install of this `.deb` would register an application-menu launcher entry
that execs `/usr/lib/goose/Goose` — a path that **does not exist** in the Proose
package (the actual binary is at `/usr/lib/proose/Proose`) — and registers as the
`x-scheme-handler/goose` protocol handler, not `proose` (which is what `main.ts`
actually calls `app.setAsDefaultProtocolClient` with post-rebrand). Launching Proose
from a desktop application menu, or opening a `proose://` deep link, would silently do
nothing / fail via this launcher entry. The rpm template has the analogous issue
(`Exec=/usr/lib/Goose/Goose`, `Icon=.../Goose.png`).

## §5 — Suites

**`cargo test -p goose --lib`:**
```
test result: FAILED. 1355 passed; 5 failed; 0 ignored; 0 measured; 0 filtered out
```
Failing tests — identical set and count to Task 1's documented pre-existing baseline:
- `agents::prompt_manager::tests::test_all_platform_extensions` (insta snapshot mismatch)
- `providers::chatgpt_codex::tests::test_parse_jwt_claims_verified_with_issuer`
- `providers::gcpauth::tests::{test_service_account_jwt_creation, test_token_expiration, test_token_refresh_race_condition}`
  (all 4 same root cause: `jsonwebtoken`/rustls `CryptoProvider` not installed in this
  test binary)

No new failures. **PASS (matches documented baseline exactly).**

**`cargo clippy -p goose -p goose-cli --all-targets -- -D warnings`:** clean, exit 0,
`Finished` after 2m36s, zero warnings/errors printed. **PASS.**

**`cargo fmt --check`:** clean, no diff output. **PASS.**

**`pnpm test:run`:** First full run: `538 passed | 2 failed` (540 total) — both
failures in `ExtensionModal.test.tsx` (`creates a http_streamable extension`,
`captures a pending env var typed but not "+ Added"...`), both `Error: Test timed out
in 5000ms`, while this repo's `cargo clippy` (2m36s) and `electron-forge make` (full
production build) were running concurrently in the background — heavy CPU contention.
Re-ran that file in isolation once those jobs finished:
```
$ pnpm exec vitest run src/components/settings/extensions/modal/ExtensionModal.test.tsx
Test Files  1 passed (1)
     Tests  7 passed (7)
```
All 7 pass in isolation, confirming this was contention-induced flakiness (userEvent
keystroke simulation vs. a starved event loop), not a rebrand-caused regression —
`ExtensionModal` has no relationship to the branch's diff. **Effectively PASS
(540/540 when not resource-starved); flagged as a flaky-under-load test, not a defect
introduced by this branch.**

**`pnpm lint:check`:** clean, exit 0 (`typecheck` + `eslint --max-warnings 0` +
`i18n:check`, i18n locale validation passed for 15 locales). **PASS.**

## Concerns

1. **Real bug (§4):** `ui/desktop/forge.deb.desktop` / `forge.rpm.desktop` were missed
   by the rebrand — packaged `.desktop` launcher entries reference the old
   `/usr/lib/goose/Goose` (deb) / `/usr/lib/Goose/Goose` (rpm) exec paths, old icon
   paths, and the old `x-scheme-handler/goose` MIME association, none of which match
   the actual Proose install layout or the `proose://` protocol registered in
   `main.ts`. Recommend a 4th small task to update both templates
   (`Name=Proose`, `Exec=/usr/lib/proose/Proose %U`, icon path, `MimeType=x-scheme-handler/proose;`) before shipping installers.
2. **Unexplained environment artifact:** a real (non-sandboxed) `~/.config/proose/`
   already existed before this verification session began (with live
   `databricks`/`gemini_oauth` OAuth data), despite Task 1's report confirming no such
   directory existed right after its own sandboxed test. Not created by any command in
   this session (verified unchanged before/after §2). Cause/origin undetermined —
   someone/something ran an unsandboxed `proose` invocation between Task 1's report and
   this verification. Worth investigating so it doesn't happen again, but it does not
   indicate this verification's own isolation failed.
3. **Minor cosmetic leftovers (not blocking, not in scope of the 3 tasks' stated
   diff):** `ui/desktop/package.json`'s `description` field ("Goose App") and
   `forge.config.ts`'s `extendInfo.NSCalendarsUsageDescription`/
   `NSRemindersUsageDescription` macOS permission strings still say "Goose" — purely
   cosmetic, user-facing text only, no functional impact.
4. **Flaky test under load (§5):** `ExtensionModal.test.tsx` two tests can time out at
   the default 5000ms vitest timeout under heavy concurrent CPU load; confirmed
   deterministic pass in isolation. Not caused by this branch; pre-existing test
   fragility unrelated to the rebrand diff.

## Artifacts left behind (intentionally, outside repo/config)

- `ui/desktop/out/` (build output incl. the `.deb`) — left in place per instructions
  ("Do NOT `dpkg -i`"); not installed on the system.
- `ui/desktop/src/bin/proose` — staged debug binary (gitignored per the branch's
  `.gitignore` change).
- All `/tmp/proose-*` sandboxes created during this verification were `rm -rf`'d.

## Files touched by this verification

None — read-only verification only (no repository files were modified). All fixture/
sandbox work happened under `/tmp` and was cleaned up. This report is the only new
file, at `.superpowers/sdd/proose/final-verification-report.md`.
