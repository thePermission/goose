# Task 3 Report: Desktop app identity (name, protocol, packaging metadata)

**Status:** DONE
**Branch:** feature/proose-rebrand (confirmed, not switched)
**Commit:** f12f3f59c1a39f5c7e782cc63465fd193107b8de — "feat(proose): rebrand desktop app identity (name, proose:// protocol, packaging)"

## Changes

### ui/desktop/package.json
- `name`: `"goose-app"` → `"proose-app"`
- `productName`: `"Goose"` → `"Proose"`
- Version (`1.41.0`) and `description` ("Goose App") left unchanged per brief scope (description is cosmetic UI text, out of scope).

### ui/desktop/forge.config.ts
- Protocol block: `name: 'GooseProtocol'` → `'ProoseProtocol'`, `schemes: ['goose']` → `['proose']`
- maker-deb: `name`/`bin` `'Goose'` → `'Proose'`
- maker-rpm: `name`/`bin` `'Goose'` → `'Proose'`
- maker-flatpak: `id: 'io.github.block.Goose'` → `'io.github.thepermission.Proose'` (also dropped the now-inapplicable `// NOTE: kept for backwards compat with existing installs` comment, since that comment explained the old id's compat rationale, which doesn't apply to the new distinct id)
- maker-flatpak: `bin: 'Goose'` → `'Proose'`
- Left unchanged (per brief): `homepage` (`https://goose-docs.ai/`), `categories`, `icon`, `GITHUB_OWNER`/`GITHUB_REPO` env defaults, and the macOS `NSCalendarsUsageDescription`/`NSRemindersUsageDescription` strings.

### ui/desktop/src/main.ts
Replaced the `goose` deep-link scheme everywhere:
- Line 411 (log string): `'...for goose://'` → `'...for proose://'`
- Line 412: `app.setAsDefaultProtocolClient('goose')` → `('proose')`
- Line 417 (beyond the brief's enumerated line list, but same protocol-reset mechanism as line 412 immediately above it): `spawn('open', [..., '--reset-protocol-handler', 'goose'], ...)` → `'proose'`. Verified via `grep -rn "reset-protocol-handler"` that nothing in the codebase reads this arg back, so it's currently inert, but leaving it saying `goose` while the actual scheme is `proose` would be a stale/confusing identity string, so I fixed it for consistency.
- Line 427: `app.setAsDefaultProtocolClient('goose')` → `('proose')`
- Line 441: `commandLine.find((arg) => arg.startsWith('goose://'))` → `'proose://'`
- Line 504: `process.argv.find((arg) => arg.startsWith('goose://'))` → `'proose://'`
- Line 602 (log string): `'Ignoring goose://resume URL...'` → `'Ignoring proose://resume URL...'`

Confirmed via `grep -n "goose" ui/desktop/src/main.ts` that all other `goose` occurrences in the file (e.g. `startGooseServe`, `GooseServeLease`, `'goose serve'` subprocess log/error strings, `'persist:goose'` session partition names, `GooseApp` interface) are unrelated to the deep-link protocol/app identity and out of scope for this task — matches the brief's note that CLI `goose serve` subprocess strings are not part of this task.

## Verify

```
grep -nE "goose://|setAsDefaultProtocolClient\('goose'\)|'GooseProtocol'|schemes: \['goose'\]" ui/desktop/src/main.ts ui/desktop/forge.config.ts
```
→ empty (exit 1, no matches). PASS.

```
grep -rn "goose-app" ui/desktop --include=*.json --include=*.ts | grep -v node_modules
```
→ empty. No stray `goose-app` references found (0 found/updated beyond the package.json rename itself).

```
cd ui/desktop && pnpm run typecheck && pnpm run lint:check
```
→ Both green. `typecheck` (tsc --noEmit) clean. `lint:check` (typecheck + eslint --max-warnings 0 + i18n:check) clean; i18n locale validation passed for all 15 locales (1556 messages). Only noise was pnpm's unrelated "Unsupported platform" warnings for cross-platform `goose-binary` optional deps (darwin/win32 arch packages skipped on this linux x64 host) — not an error, not related to this change.

## Self-review

- productName is `Proose` → drives Electron's default `userData` path to `~/.config/Proose` (Linux) — the coexistence key vs. upstream's `~/.config/Goose`. Confirmed by grep: no other `userData` override exists in main.ts that would fix it to something else.
- Protocol is fully `proose://` end-to-end: registration (`setAsDefaultProtocolClient`), dev-mode reset hack, second-instance argv parsing, startup argv parsing, and the resume-URL warning log all consistently use `proose`.
- Flatpak id `io.github.thepermission.Proose` is a new, distinct id from upstream's `io.github.block.Goose` — will not collide with an existing Goose flatpak install.
- No stale `goose://`, `GooseProtocol`, or `['goose']` scheme references remain in either file (grep-verified).
- No cosmetic UI text was touched (package.json `description`, forge.config.ts `homepage`/`categories`/`icon`/`NS*UsageDescription` all left as-is) — correctly out of scope per brief.
- Went one line beyond the brief's literal enumeration (main.ts:417) for internal consistency of the protocol-reset dev-mode hack; verified it's currently a no-op elsewhere in the codebase so this is a safe, low-risk addition, not a scope-creep risk.

## Not run (out of scope for this task per brief's "Final Verification" section — that section is a repo-wide bar for the full 3-task rebrand, not this task alone)

Did not run: cargo build -p goose-cli / just copy-binary, the isolated-HOME backend smoke test, the concurrent dev-app-vs-upstream launch smoke test, `pnpm run make` + `.deb` inspection, or the full `cargo test`/`clippy`/`fmt --check`/`pnpm test:run` suites. Steps 1-4 of "Edits" and "Verify" as scoped to this task (package.json, forge.config.ts, main.ts + typecheck/lint:check) are complete and green. If the full final verification bar is needed now, it should be run as an explicit follow-up (it also depends on Tasks 1-2's backend rename being in place, which this task brief says is already done).
