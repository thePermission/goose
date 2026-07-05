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
