# Proose Release CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tag-triggered GitHub Actions workflow that builds the Proose desktop app + standalone `proose` CLI for Windows (zip), Ubuntu (deb), and AlmaLinux 9 (rpm), and publishes all six as GitHub Release assets on `thePermission/goose`.

**Architecture:** One self-contained workflow `.github/workflows/proose-release.yml` with three parallel build jobs (Ubuntu runner → deb; `almalinux:9` container → rpm; Windows runner → zip) plus a release job that uploads the six artifacts via `softprops/action-gh-release`. A helper script stamps the release version (from the tag) into `ui/desktop/package.json` and the Cargo workspace before building. CI uses standard setup actions (not hermit); the binary-staging copy is inlined as shell (no `just` dependency).

**Tech Stack:** GitHub Actions, electron-forge makers (deb/rpm/zip), Rust (cargo), Node 24 + pnpm 10.30, `dtolnay/rust-toolchain`, `actions/setup-node`, `pnpm/action-setup`, `softprops/action-gh-release`.

## Global Constraints

- **Trigger:** tag `proose-v*` push, plus `workflow_dispatch` with a `version` input. Version = tag minus `proose-v` prefix (or the dispatch input).
- **Arch:** x86_64 only. electron-forge maker-zip defaults to `arm64` unless `ELECTRON_ARCH=x64`; every `make` runs with `ELECTRON_ARCH=x64` and `--arch=x64`.
- **Versions:** Node `^24.10.0` (use 24), pnpm `>=10.30.0` (pin `10.30.0`). pnpm workspace root is `ui/`.
- **AlmaLinux rpm** is built inside `container: almalinux:9` (glibc 2.34) so it runs on Alma 9+. The Ubuntu deb is built on `ubuntu-22.04`.
- **Six assets:** `.deb`, `.rpm`, `.zip` (desktop) + `proose-linux-x86_64-ubuntu`, `proose-linux-x86_64-alma9`, `proose-windows-x86_64.exe` (CLI binaries).
- **Unsigned**; no macOS; no auto-update; do NOT modify any existing workflow. We use `electron-forge make` (NOT `publish`) so the `publisher-github` config is irrelevant.
- **Binary name is `proose`** (CLI) / product `Proose` (app). Stage the built binary into `ui/desktop/src/bin/proose[.exe]` before `make`.
- Cannot fully verify GitHub Actions locally: validate YAML with `actionlint`, run the Linux build chains locally where feasible, and confirm end-to-end with a real `proose-v*` test tag at handoff.

---

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
        run: pnpm run make --arch=x64 --targets @electron-forge/maker-deb
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
cd ui/desktop && ELECTRON_ARCH=x64 pnpm run make --arch=x64 --targets @electron-forge/maker-deb
deb=$(find out/make -name '*.deb' | head -1); ls -1 "$deb" && dpkg-deb -f "$deb" Package
```
Expected: a `proose_1.41.0_amd64.deb` exists and `Package: proose`. (Confirms the job's build commands + output path are correct.)

- [ ] **Step 6: Commit**

```bash
git add scripts/proose-set-version.sh .github/workflows/proose-release.yml
git commit -m "ci(proose): release workflow skeleton + Ubuntu deb job"
```

---

### Task 2: AlmaLinux 9 rpm job

**Files:**
- Modify: `.github/workflows/proose-release.yml` (add the `build-almalinux-rpm` job)

**Interfaces:**
- Consumes: the version-derivation + staging pattern from Task 1.
- Produces: a `build-almalinux-rpm` job uploading artifact `proose-almalinux` (rpm + `proose-linux-x86_64-alma9`).

- [ ] **Step 1: Add the AlmaLinux rpm job**

Append under `jobs:` in `.github/workflows/proose-release.yml`:
```yaml
  build-almalinux-rpm:
    runs-on: ubuntu-latest
    container: almalinux:9
    steps:
      - name: Install container build deps
        run: |
          dnf -y install git gcc gcc-c++ make rpm-build openssl-devel pkgconfig perl which findutils tar xz gzip
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
      - name: Make .rpm
        working-directory: ui/desktop
        env:
          ELECTRON_ARCH: x64
        run: pnpm run make --arch=x64 --targets @electron-forge/maker-rpm
      - name: Collect artifacts
        run: |
          mkdir -p dist
          find ui/desktop/out/make -name '*.rpm' -exec cp {} dist/ \;
          cp target/release/proose dist/proose-linux-x86_64-alma9
      - uses: actions/upload-artifact@v4
        with:
          name: proose-almalinux
          path: dist/*
```

- [ ] **Step 2: Lint**

Run: `actionlint .github/workflows/proose-release.yml` (or the yaml.safe_load fallback). Expected: no errors.

- [ ] **Step 3: Verify the rpm build chain in a real AlmaLinux 9 container (nail the dnf list)**

If Docker is available locally, run the job's chain in `almalinux:9` to confirm the `dnf` set is sufficient and a proose rpm is produced:
```bash
command -v docker && docker run --rm -v "$PWD":/w -w /w almalinux:9 bash -euxc '
  dnf -y install git gcc gcc-c++ make rpm-build openssl-devel pkgconfig perl which findutils tar xz gzip
  curl -fsSL https://sh.rustup.rs | sh -s -- -y; . "$HOME/.cargo/env"
  curl -fsSL https://rpm.nodesource.com/setup_24.x | bash - && dnf -y install nodejs
  corepack enable && corepack prepare pnpm@10.30.0 --activate
  pnpm --dir ui install --frozen-lockfile
  cargo build --release -p goose-cli --bin proose
  mkdir -p ui/desktop/src/bin && cp -p target/release/proose ui/desktop/src/bin/proose
  cd ui/desktop && ELECTRON_ARCH=x64 pnpm run make --arch=x64 --targets @electron-forge/maker-rpm
  rpm=$(find out/make -name "*.rpm" | head -1); ls -1 "$rpm" && rpm -qp --qf "%{NAME}\n" "$rpm"
' 2>&1 | tail -30
```
Expected: a `proose-*.x86_64.rpm` is produced and `rpm -qp --qf %{NAME}` prints `proose`. If a build step fails on a missing library, add the exact `dnf` package to BOTH the local command and the workflow's "Install container build deps" step, and re-run until green. If Docker is unavailable, note that and record the current `dnf` list as best-effort to be refined by the first CI run.
(Note: the local Docker check installs Node/rust/pnpm inside the container to mirror what the `setup-node`/`rust-toolchain`/`pnpm` actions do on CI; on CI those actions provide them, so the workflow's `dnf` step only needs the C/rpm/build libraries.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/proose-release.yml
git commit -m "ci(proose): AlmaLinux 9 rpm build job"
```

---

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

### Task 4: Release job + assemble

**Files:**
- Modify: `.github/workflows/proose-release.yml` (add the `release` job)

**Interfaces:**
- Consumes: artifacts `proose-ubuntu`, `proose-almalinux`, `proose-windows` from Tasks 1-3.
- Produces: a `release` job that publishes all six assets to a GitHub Release.

- [ ] **Step 1: Add the release job**

Append under `jobs:`:
```yaml
  release:
    needs: [build-ubuntu-deb, build-almalinux-rpm, build-windows-zip]
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Download all build artifacts
        uses: actions/download-artifact@v4
        with:
          path: dist
      - name: Flatten
        run: |
          mkdir -p release-assets
          find dist -type f -exec cp {} release-assets/ \;
          ls -1 release-assets
      - name: Compute tag
        run: |
          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            echo "TAG=proose-v${{ github.event.inputs.version }}" >> "$GITHUB_ENV"
          else
            echo "TAG=${{ github.ref_name }}" >> "$GITHUB_ENV"
          fi
      - name: Publish GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ env.TAG }}
          files: release-assets/*
          prerelease: false
          fail_on_unmatched_files: true
```

- [ ] **Step 2: Lint the complete workflow**

Run: `actionlint .github/workflows/proose-release.yml`. Expected: no errors across all four jobs.

- [ ] **Step 3: Sanity-check the asset set is six files**

Read the workflow and confirm the union of uploaded files is exactly: `*.deb`, `*.rpm`, `*.zip`, `proose-linux-x86_64-ubuntu`, `proose-linux-x86_64-alma9`, `proose-windows-x86_64.exe`. Confirm `release` `needs` lists all three build jobs and `permissions: contents: write` is present (job-level and top-level).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/proose-release.yml
git commit -m "ci(proose): release job — publish 6 assets to GitHub Release"
```

---

## Final Verification (run before handoff)

- `actionlint .github/workflows/proose-release.yml` — clean.
- Task 1 Step 5 (local Ubuntu deb build) succeeded, producing `proose_*_amd64.deb` (`Package: proose`).
- Task 2 Step 3 (AlmaLinux 9 container build) succeeded if Docker was available (proose rpm produced); otherwise the `dnf` list is recorded as best-effort for the first CI run.
- **Real end-to-end proof (at handoff, needs a push):** tag a test release — `git tag proose-v0.0.1-test && git push origin proose-v0.0.1-test` — watch the Actions run, confirm the Release gets all six assets, then delete the test tag/release. Do this only with the user's go-ahead (it pushes to the fork and creates a public prerelease). Alternatively trigger via `workflow_dispatch` with `version: 0.0.1-test`.
