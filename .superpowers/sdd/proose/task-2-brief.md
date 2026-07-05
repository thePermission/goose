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

