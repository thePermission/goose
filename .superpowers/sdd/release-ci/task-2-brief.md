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

