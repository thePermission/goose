### Task 3: Windows zip job

**Files:**
- Modify: `.github/workflows/proose-release.yml` (add the `build-windows-zip` job)

**Interfaces:**
- Produces: a `build-windows-zip` job uploading artifact `proose-windows` (zip + `proose-windows-x86_64.exe`).

- [ ] **Step 1: Add the Windows zip job**

Append under `jobs:`:
```yaml
  build-windows-zip:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: x86_64-pc-windows-msvc
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - uses: pnpm/action-setup@v4
        with:
          version: '10.30.0'
      - name: Derive + stamp version
        shell: bash
        run: |
          VERSION="${{ github.event.inputs.version || github.ref_name }}"
          VERSION="${VERSION#proose-v}"
          echo "VERSION=$VERSION" >> "$GITHUB_ENV"
          bash scripts/proose-set-version.sh "$VERSION"
      - name: Install deps
        run: pnpm --dir ui install --frozen-lockfile
      - name: Build proose CLI binary
        run: cargo build --release --target x86_64-pc-windows-msvc -p goose-cli --bin proose
      - name: Stage binary for the desktop bundle
        shell: pwsh
        run: |
          New-Item -ItemType Directory -Force ui/desktop/src/bin | Out-Null
          Copy-Item -Force target/x86_64-pc-windows-msvc/release/proose.exe ui/desktop/src/bin/proose.exe
      - name: Make .zip
        working-directory: ui/desktop
        env:
          ELECTRON_ARCH: x64
        run: pnpm run make --arch=x64 --targets @electron-forge/maker-zip
      - name: Collect artifacts
        shell: pwsh
        run: |
          New-Item -ItemType Directory -Force dist | Out-Null
          Get-ChildItem -Recurse ui/desktop/out/make -Filter *.zip | Copy-Item -Destination dist/
          Copy-Item target/x86_64-pc-windows-msvc/release/proose.exe dist/proose-windows-x86_64.exe
      - uses: actions/upload-artifact@v4
        with:
          name: proose-windows
          path: dist/*
```

- [ ] **Step 2: Lint**

Run: `actionlint .github/workflows/proose-release.yml` (or yaml.safe_load fallback). Expected: no errors. (Windows cannot be built locally in this environment; the build commands mirror the repo's existing, already-`proose`-updated `release-windows` / `copy-binary-windows` Justfile recipes — real proof comes from the first CI run.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/proose-release.yml
git commit -m "ci(proose): Windows zip build job"
```

---

