# Proose Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give this fork its own application identity — **"Proose"** (`proose`) — so it installs and runs side by side with upstream **"Goose"** (also installed, with a live desktop app) without collision. Level C: desktop identity + CLI binary + own backend config dir.

**Architecture:** Direct hardcoded rename of identity values across three surfaces — (1) Rust backend `app_name` + CLI `[[bin]]` name, (2) the desktop's server-binary discovery + Justfile build/copy wiring, (3) Electron app identity (productName, protocol, packaging metadata). No parameterized brand (YAGNI).

**Tech Stack:** Rust (`cargo`, `etcetera` crate), Electron + electron-forge, TypeScript, pnpm, `just`. Toolchain is hermit: `source bin/activate-hermit`. pnpm from `bin/pnpm` after activate-hermit; commands from `ui/desktop/`.

## Global Constraints

- **Identity values (verbatim):** display/product name = `Proose`; binary + config-dir + protocol-scheme = `proose`; protocol registration name = `ProoseProtocol`; deb/rpm package `name` and `bin` = `Proose`; flatpak `id` = `io.github.thepermission.Proose`.
- **Backend dir:** `AppStrategyArgs.app_name` = `"proose"` → `~/.config/proose` (Linux). Leave `top_level_domain`/`author` = `"Block"` (only `app_name` sets the Linux leaf dir). `GOOSE_PATH_ROOT` and ALL `GOOSE_*` env-var NAMES stay unchanged.
- **Binary discovery MUST match the binary:** `ui/desktop/src/gooseServe.ts` `binaryName` and the `Justfile` copy step must reference `proose`, or the desktop cannot spawn its backend.
- **productName drives coexistence:** `productName: "Proose"` → Electron `userData` = `~/.config/Proose` + its own single-instance lock (this is what avoids colliding with the running upstream app that holds `~/.config/Goose`).
- **Out of scope (do NOT touch):** cosmetic UI-text rebrand (Level D), renaming `GOOSE_*` env vars, `~/.agents/plugins` (stays shared), the icon, macOS entitlement/usage strings, `@electron-forge/publisher-github` owner/repo, `src/app-update.yml`.
- **Workflow:** implement on `feature/proose-rebrand` off `corporate`; TDD-ish; frequent commits. Never push to `upstream`. Do not disturb the running upstream desktop app — isolate any live run with `XDG_CONFIG_HOME` + `GOOSE_PATH_ROOT`.

---

### Task 1: Rename backend config dir + CLI binary

**Files:**
- Modify: `crates/goose/src/config/paths.rs:25`
- Modify: `crates/goose-cli/Cargo.toml:15`

**Interfaces:**
- Produces: a CLI binary named `proose` at `target/{debug,release}/proose`; the backend resolves its config dir to `~/.config/proose` on Linux (via `app_name = "proose"`). Task 2's binary-discovery + copy wiring depends on this binary name.

- [ ] **Step 1: Rename the backend app dir**

In `crates/goose/src/config/paths.rs`, inside `choose_app_strategy(AppStrategyArgs { ... })`:

```rust
// before
                app_name: "goose".to_string(),
// after
                app_name: "proose".to_string(),
```

Leave `top_level_domain: "Block"` and `author: "Block"` unchanged.

- [ ] **Step 2: Rename the CLI binary**

In `crates/goose-cli/Cargo.toml`, the first `[[bin]]` block:

```toml
# before
[[bin]]
name = "goose"
path = "src/main.rs"
# after
[[bin]]
name = "proose"
path = "src/main.rs"
```

- [ ] **Step 3: Build**

Run: `source bin/activate-hermit && cargo build -p goose-cli`
Expected: builds; binary at `./target/debug/proose` exists (`test -x ./target/debug/proose`).

- [ ] **Step 4: Verify the binary works and the app dir is `proose`**

Run:
```bash
./target/debug/proose --version
SB=$(mktemp -d)
HOME="$SB" XDG_CONFIG_HOME="$SB/.config" XDG_DATA_HOME="$SB/.local/share" \
  ./target/debug/proose marketplace add /tmp/nonexistent --kind claude --name probe 2>&1 | head -3 || true
ls -d "$SB/.config/proose" 2>&1
rm -rf "$SB"
```
Expected: `--version` prints a version; the `marketplace add` invocation creates `$SB/.config/proose/` (the config dir now uses `proose`, proving `app_name` took effect). (`add` may print an error about the fake path — that is fine; it still writes the config dir/file.)

- [ ] **Step 5: Regression tests**

Run: `cargo test -p goose --lib`
Expected: pass (no path assertions hardcode `"goose"`; verified none exist in `paths.rs`).

- [ ] **Step 6: Commit**

```bash
git add crates/goose/src/config/paths.rs crates/goose-cli/Cargo.toml
git commit -m "feat(proose): rename backend config dir + CLI binary to proose"
```

---

### Task 2: Point desktop server-binary discovery + build/copy at `proose`

**Files:**
- Modify: `ui/desktop/src/gooseServe.ts:78`
- Modify: `ui/desktop/src/gooseServe.test.ts:7`
- Modify: `Justfile` (`release-binary` line 22; `copy-binary` lines 44-48; `copy-binary-intel` lines 56-60; and the Windows copy block if present)

**Interfaces:**
- Consumes: the `proose` binary from Task 1 (`target/{debug,release}/proose`).
- Produces: `ui/desktop/src/bin/proose` (copied binary) and a `findGooseBinaryPath` that resolves the `proose` binary in dev and packaged builds.

- [ ] **Step 1: Update the test's expected binary name (RED)**

In `ui/desktop/src/gooseServe.test.ts`:
```ts
// before
const binaryName = process.platform === 'win32' ? 'goose.exe' : 'goose';
// after
const binaryName = process.platform === 'win32' ? 'proose.exe' : 'proose';
```

- [ ] **Step 2: Run the test to see it fail**

Run (from `ui/desktop/`): `pnpm exec vitest run src/gooseServe.test.ts`
Expected: FAIL — `findGooseBinaryPath` still looks for `goose`, so the staged/`target` path assertions using `proose` no longer match.

- [ ] **Step 3: Update the discovery to `proose`**

In `ui/desktop/src/gooseServe.ts`:
```ts
// before
  const binaryName = process.platform === 'win32' ? 'goose.exe' : 'goose';
// after
  const binaryName = process.platform === 'win32' ? 'proose.exe' : 'proose';
```

- [ ] **Step 4: Run the test to see it pass**

Run (from `ui/desktop/`): `pnpm exec vitest run src/gooseServe.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the Justfile build/copy wiring**

`release-binary` (build the renamed bin):
```
# before
    cargo build --release -p goose-cli --bin goose
# after
    cargo build --release -p goose-cli --bin proose
```
`copy-binary` (lines 45-48) — build the renamed bin into `src/bin`:
```
# before
    @if [ -f ./target/{{BUILD_MODE}}/goose ]; then \
        echo "Copying goose CLI binary from target/{{BUILD_MODE}}..."; \
        rm -f ./ui/desktop/src/bin/goose; \
        cp -p ./target/{{BUILD_MODE}}/goose ./ui/desktop/src/bin/; \
# after
    @if [ -f ./target/{{BUILD_MODE}}/proose ]; then \
        echo "Copying proose CLI binary from target/{{BUILD_MODE}}..."; \
        rm -f ./ui/desktop/src/bin/proose; \
        cp -p ./target/{{BUILD_MODE}}/proose ./ui/desktop/src/bin/; \
```
Apply the same `goose`→`proose` rename in `copy-binary-intel` (lines 57-60: the `target/x86_64-apple-darwin/release/goose` path, the `rm -f`, and the `cp`) and in the Windows copy block if it references `goose`. Leave the `rm -f ./ui/desktop/src/bin/goosed` cleanup lines as-is (legacy no-op).

- [ ] **Step 6: Verify the copy step stages `proose`**

Run (repo root, after Task 1 built `target/debug/proose`): `just copy-binary debug`
Expected: prints "Copying proose CLI binary…" and `./ui/desktop/src/bin/proose` exists (`test -x ./ui/desktop/src/bin/proose`).

- [ ] **Step 7: Commit**

```bash
# NOTE: do NOT add ui/desktop/src/bin/proose — it is a build artifact (large binary, git-ignored). Commit only source/wiring.
git add ui/desktop/src/gooseServe.ts ui/desktop/src/gooseServe.test.ts Justfile
git commit -m "feat(proose): resolve + bundle the proose server binary"
```

---

### Task 3: Desktop app identity (name, protocol, packaging metadata)

**Files:**
- Modify: `ui/desktop/package.json:2-3`
- Modify: `ui/desktop/forge.config.ts` (protocol block lines 22-23; deb maker `name`/`bin` ~90-91; rpm maker `name`/`bin` ~106-107; flatpak `id` ~123)
- Modify: `ui/desktop/src/main.ts` (protocol lines 411, 412, 427, 441, 504, 602)

**Interfaces:**
- Consumes: nothing from earlier tasks (identity strings only).
- Produces: Electron app identified as `Proose` (userData `~/.config/Proose`), deep-link scheme `proose://`, and packaging metadata (`Proose` / `io.github.thepermission.Proose`) distinct from upstream.

- [ ] **Step 1: Rename the app in package.json**

In `ui/desktop/package.json`:
```json
// before
  "name": "goose-app",
  "productName": "Goose",
// after
  "name": "proose-app",
  "productName": "Proose",
```
Then check nothing references the old npm name: `grep -rn "goose-app" ui/desktop --include=*.json --include=*.ts | grep -v node_modules` — Expected: no non-generated references (if any exist, update them). Version line unchanged.

- [ ] **Step 2: Rename protocol + packaging in forge.config.ts**

```ts
// protocol block (lines ~22-23)
      name: 'ProoseProtocol',   // was 'GooseProtocol'
      schemes: ['proose'],      // was ['goose']
```
```ts
// maker-deb (lines ~90-91) and maker-rpm (lines ~106-107)
        name: 'Proose',   // was 'Goose'
        bin: 'Proose',    // was 'Goose'
```
```ts
// maker-flatpak (line ~123)
          id: 'io.github.thepermission.Proose',   // was 'io.github.block.Goose'
```
Leave `homepage`, `categories`, `icon`, and the macOS `NS*UsageDescription` strings unchanged.

- [ ] **Step 3: Rename the protocol scheme in main.ts**

In `ui/desktop/src/main.ts`, replace the `goose` deep-link scheme everywhere it appears (lines 411, 412, 427, 441, 504, 602):
- `app.setAsDefaultProtocolClient('goose')` → `app.setAsDefaultProtocolClient('proose')` (lines 412, 427)
- every `'goose://'` / `startsWith('goose://')` / `.find((arg) => arg.startsWith('goose://'))` → `'proose://'` (lines 411 log string, 441, 504, 602)

- [ ] **Step 4: Verify no stale identity remains + typecheck/lint**

Run:
```bash
grep -nE "goose://|setAsDefaultProtocolClient\('goose'\)|'GooseProtocol'|schemes: \['goose'\]" ui/desktop/src/main.ts ui/desktop/forge.config.ts
cd ui/desktop && pnpm run typecheck && pnpm run lint:check
```
Expected: the grep returns NOTHING; `typecheck` and `lint:check` both green.

- [ ] **Step 5: Commit**

```bash
git add ui/desktop/package.json ui/desktop/forge.config.ts ui/desktop/src/main.ts
git commit -m "feat(proose): rebrand desktop app identity (name, proose:// protocol, packaging)"
```

---

## Final Verification (bar b — run before handoff)

From repo root, `source bin/activate-hermit` first.

1. **Build:** `cargo build -p goose-cli` → `./target/debug/proose` exists; `just copy-binary debug` → `./ui/desktop/src/bin/proose` exists.
2. **Backend dir is independent:** run `./target/debug/proose` against an isolated fresh HOME/XDG and add a real local-git-fixture marketplace source (reuse the fixture shape from `crates/goose/src/marketplace/install.rs`); confirm `~/.config/proose/config.yaml` (under the sandbox) is created and `~/.config/goose` (real) is untouched.
3. **Desktop runs as Proose alongside upstream:** with the upstream app still running, launch the dev app isolated:
   ```bash
   SB=$(mktemp -d); mkdir -p "$SB/xdg-config" "$SB/config"; cp ~/.config/goose/config.yaml ~/.config/goose/secrets.yaml "$SB/config/" 2>/dev/null
   cd ui/desktop && GOOSE_PATH_ROOT="$SB" XDG_CONFIG_HOME="$SB/xdg-config" DISPLAY=:0 pnpm run start-gui
   ```
   Confirm: it launches (does NOT lose the single-instance race — proves distinct `userData`), the sidebar shows Marketplaces, and a quick add→browse→install smoke works. Tear down `$SB` and any dev processes; confirm the real upstream app (and `~/.config/goose`, `~/.config/Goose/Singleton*`) untouched.
4. **Installable artifact metadata:** `cd ui/desktop && pnpm run make` (or `pnpm exec electron-forge make --targets @electron-forge/maker-deb` on Linux); inspect the produced `.deb` (`dpkg-deb -f <pkg>.deb Package` / `dpkg-deb -c`) → package/bin = `Proose`, distinct from `goose`. Do NOT `dpkg -i`.
5. **Suites green:** `cargo test -p goose --lib`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`; `cd ui/desktop && pnpm test:run` (540) and `pnpm lint:check`.
