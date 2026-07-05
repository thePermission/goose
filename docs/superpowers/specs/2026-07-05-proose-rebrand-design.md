# Proose Rebrand — Design (Fork identity split for coexistence)

**Date:** 2026-07-05
**Branch base:** `corporate`
**Goal:** Give this fork its own application identity — **"Proose"** (CLI/paths: `proose`) — so it can be **installed and run side by side with the upstream "Goose"** (which is also installed on the user's machine, incl. a currently-running desktop app) without any collision.

## Scope — Level C, Approach ① (direct rename)

Cumulative level **C** (chosen): (A) desktop app identity + (B) CLI binary name + (C) own backend config/data directory. **Not** level D (no full cosmetic rebrand of user-visible UI text, no new icon).

**Approach ① (direct rename):** identity values are hardcoded to `Proose`/`proose` in source. A dedicated fork *is* proose; a parameterized goose|proose build (Approach ②) was rejected as unnecessary complexity (YAGNI). Trade-off accepted: future upstream syncs may conflict on a small, known set of identity lines.

## Fixed decisions

- **Env vars stay `GOOSE_*`** (e.g. `GOOSE_PATH_ROOT`, `GOOSE_PROVIDER`). They do not collide across the two apps and renaming would break recipes/configs/docs.
- **Plugin dir `~/.agents/plugins` stays shared** (home-level, cross-tool convention). Marketplace **sources** and plugin **enabled/disabled** state live in `~/.config/proose` → per-app independent; only the physically installed plugin files are shared (install-once).
- **Icon unchanged** (reuse existing `src/images/icon*`).
- **Flatpak app id:** `io.github.thepermission.Proose` (new, distinct from `io.github.block.Goose` → separate Flatpak app entry).
- **Verification bar = (b):** source rebrand + build an installable artifact and inspect its metadata; **no** system-wide install.

## Changes

### 1. Desktop identity — `ui/desktop/`
- `package.json`: `productName` `"Goose"→"Proose"`; `name` `"goose-app"→"proose-app"`. Version unchanged.
- `forge.config.ts`:
  - protocol: `name` `'GooseProtocol'→'ProoseProtocol'`, `schemes` `['goose']→['proose']`.
  - maker-deb & maker-rpm: `name` `'Goose'→'Proose'`, `bin` `'Goose'→'Proose'`.
  - maker-flatpak: `id` `'io.github.block.Goose'→'io.github.thepermission.Proose'`.
- `main.ts`: every `goose://` → `proose://` and `app.setAsDefaultProtocolClient('goose')` → `'proose'`; ensure `app.getName()` resolves to `"Proose"` in **dev** too (set the app name early if needed) so `userData` = `~/.config/Proose` with its own single-instance lock (this is what removes the collision with the running upstream app that holds `~/.config/Goose`).

### 2. CLI binary — `crates/goose-cli/Cargo.toml`
- `[[bin]] name` `"goose"→"proose"` → binary `target/{debug,release}/proose`.
- **Required wiring (verify during planning):** the desktop's server-binary discovery (`ui/desktop/src/gooseServe.ts` — `binaryName` used by `findGooseBinaryPath`) and the build/copy step that bundles the binary into the packaged app (Justfile `release-binary` and/or Forge hooks) must reference `proose`, or the desktop app cannot spawn its backend. The dev-mode `GOOSE_BINARY` override remains available.

### 3. Backend config/data dir — `crates/goose/src/config/paths.rs`
- `AppStrategyArgs.app_name` `"goose"→"proose"` → `~/.config/proose`, `~/.local/share/proose`, state dir accordingly. `GOOSE_PATH_ROOT` override name unchanged.
- **Verify during planning:** whether `AppStrategyArgs` carries other identity fields (`author`/`top_level_domain`) that must change too, and whether any other source hardcodes the `goose` app-dir name.
- Consequence (intended): proose starts with empty config → its own onboarding, sessions, providers, and marketplace sources.

## Verification (bar b)
1. `cargo build -p goose-cli` → produces `proose` binary.
2. Dev desktop launches as **Proose** isolated **alongside the running upstream app**: confirm `userData`=`~/.config/Proose` (or isolated), backend config resolves to `~/.config/proose`, protocol `proose://`, and it spawns the `proose` server binary. Quick marketplace smoke (add→browse→install a local fixture).
3. `pnpm make` builds a `.deb`; inspect metadata (package name `Proose`, `bin` `Proose`, flatpak/appid distinct from goose) — **no** `dpkg -i`.
4. Affected tests green: `crates/goose` paths tests, `gooseServe.test.ts` (binary discovery), UI Vitest suite (540), `cargo clippy`/`fmt`, `pnpm lint:check`.

## Out of scope
Full cosmetic UI-text rebrand (level D); renaming `GOOSE_*` env vars; physically isolating `~/.agents/plugins`; macOS entitlement permission strings; `@electron-forge/publisher-github` owner/repo; a new icon.

## Workflow
Implement on `feature/proose-rebrand` off `corporate`; merge into `corporate` (everything lands on corporate); clean up the branch afterward. Never push to `upstream`.
