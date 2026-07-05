### Task 1: Version script + workflow skeleton + Ubuntu deb job

**Files:**
- Create: `scripts/proose-set-version.sh`
- Create: `.github/workflows/proose-release.yml`

**Interfaces:**
- Produces: `scripts/proose-set-version.sh <version>` (stamps `ui/desktop/package.json` `.version` and `Cargo.toml` `[workspace.package] version`); the workflow file with `on:` triggers, a `build-ubuntu-deb` job uploading artifacts named `deb` and `cli-ubuntu`. Tasks 2-4 append jobs to the same workflow and reuse the version-derivation + staging pattern established here.

- [ ] **Step 1: Write the version-stamp script**

Create `scripts/proose-set-version.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
ver="${1:?usage: proose-set-version.sh <version>}"
node -e 'const fs=require("fs");const p="ui/desktop/package.json";const j=JSON.parse(fs.readFileSync(p,"utf8"));j.version=process.argv[1];fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n")' "$ver"
# Root Cargo.toml: only the [workspace.package] `version = "..."` line is anchored at col 0.
perl -0pi -e 's/^version = "[^"]*"/version = "'"$ver"'"/m' Cargo.toml
echo "stamped version $ver into ui/desktop/package.json + Cargo.toml"
grep -m1 '"version"' ui/desktop/package.json
grep -m1 '^version = ' Cargo.toml
```
Make it executable: `chmod +x scripts/proose-set-version.sh`.

- [ ] **Step 2: Verify the script stamps both files**

Run:
```bash
cp ui/desktop/package.json /tmp/pj.bak; cp Cargo.toml /tmp/ct.bak
bash scripts/proose-set-version.sh 9.9.9-test
grep -m1 '"version"' ui/desktop/package.json   # expect 9.9.9-test
grep -m1 '^version = ' Cargo.toml               # expect version = "9.9.9-test"
cp /tmp/pj.bak ui/desktop/package.json; cp /tmp/ct.bak Cargo.toml   # restore
```
Expected: both files showed `9.9.9-test`, then restored to `1.41.0`.

- [ ] **Step 3: Write the workflow skeleton + Ubuntu deb job**

Create `.github/workflows/proose-release.yml`:
```yaml
name: Proose Release
on:
  push:
    tags: ['proose-v*']
  workflow_dispatch:
    inputs:
      version:
        description: 'Version without prefix, e.g. 1.41.0'
        required: true
        type: string
permissions:
  contents: write
jobs:
  build-ubuntu-deb:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - uses: pnpm/action-setup@v4
        with:
          version: '10.30.0'
      - name: Derive + stamp version
        run: |
          VERSION="${{ github.event.inputs.version || github.ref_name }}"
          VERSION="${VERSION#proose-v}"
          echo "VERSION=$VERSION" >> "$GITHUB_ENV"
          bash scripts/proose-set-version.sh "$VERSION"
      - name: Install deps
        run: pnpm --dir ui install --frozen-lockfile
      - name: Build proose CLI binary
        run: cargo build --release -p goose-cli --bin proose
      - name: Stage binary for the desktop bundle
        run: |
          mkdir -p ui/desktop/src/bin
          cp -p target/release/proose ui/desktop/src/bin/proose
      - name: Make .deb
        working-directory: ui/desktop
        env:
          ELECTRON_ARCH: x64
        run: pnpm run make -- --arch=x64 --targets @electron-forge/maker-deb
      - name: Collect artifacts
        run: |
          mkdir -p dist
          find ui/desktop/out/make -name '*.deb' -exec cp {} dist/ \;
          cp target/release/proose dist/proose-linux-x86_64-ubuntu
      - uses: actions/upload-artifact@v4
        with:
          name: proose-ubuntu
          path: dist/*
```

- [ ] **Step 4: Lint the workflow YAML**

Run:
```bash
# install actionlint if absent
command -v actionlint || (curl -sSfL https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash | bash && sudo mv actionlint /usr/local/bin/ 2>/dev/null || mv actionlint ./)
actionlint .github/workflows/proose-release.yml 2>&1 | head
```
Expected: no errors (empty output). If `actionlint` cannot be installed offline, run `python3 -c 'import yaml,sys; yaml.safe_load(open(".github/workflows/proose-release.yml"))'` (must exit 0) and note actionlint was unavailable.

- [ ] **Step 5: Locally verify the Ubuntu build chain actually produces a proose .deb**

Run (this is the real test — the same commands the job runs):
```bash
source bin/activate-hermit   # local convenience for cargo/pnpm; CI uses setup actions
cargo build --release -p goose-cli --bin proose
mkdir -p ui/desktop/src/bin && cp -p target/release/proose ui/desktop/src/bin/proose
cd ui/desktop && ELECTRON_ARCH=x64 pnpm run make -- --arch=x64 --targets @electron-forge/maker-deb
deb=$(find out/make -name '*.deb' | head -1); ls -1 "$deb" && dpkg-deb -f "$deb" Package
```
Expected: a `proose_1.41.0_amd64.deb` exists and `Package: proose`. (Confirms the job's build commands + output path are correct.)

- [ ] **Step 6: Commit**

```bash
git add scripts/proose-set-version.sh .github/workflows/proose-release.yml
git commit -m "ci(proose): release workflow skeleton + Ubuntu deb job"
```

---

