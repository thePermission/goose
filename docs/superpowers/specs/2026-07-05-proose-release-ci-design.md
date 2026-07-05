# Proose Release CI — Design

**Date:** 2026-07-05
**Branch base:** `corporate`
**Goal:** A tag-triggered GitHub Actions pipeline that builds the **Proose** desktop app **and** the standalone `proose` CLI for **Windows, Ubuntu, and AlmaLinux 9**, and publishes them as assets on a GitHub Release in `thePermission/goose`.

## Decisions (from brainstorming)

- **Trigger:** push of a tag matching `proose-v*` → build all platforms → create a GitHub Release with the artifacts. Also `workflow_dispatch` (manual, with a `version` input) for test runs.
- **Release destination:** GitHub Release assets (durable), on the fork `thePermission/goose`.
- **Windows format:** portable **ZIP** (`@electron-forge/maker-zip`) — no installer, no signing.
- **AlmaLinux target:** **AlmaLinux 9** → the Linux **rpm** is built inside an `almalinux:9` container (glibc 2.34) so it runs on Alma 9+. The Ubuntu **deb** is built independently on the Ubuntu runner.
- **What ships:** the desktop app per platform (`.deb`, `.rpm`, `.zip`) **and** the standalone `proose` CLI binary per platform (6 assets total).
- **Existing workflows:** untouched. Only the new `proose-release.yml` is added; it is tag-triggered so it never runs on ordinary pushes. Cleaning up inherited/broken upstream workflows is a separate future pass.
- **Signing:** none (unsigned zip; deb/rpm without repo signature; no macOS).
- **Toolchain in CI:** standard setup actions (`dtolnay/rust-toolchain@stable`, `actions/setup-node`, `pnpm/action-setup` pinned to the `engines.pnpm` floor `10.30.x`) — **not** hermit, for portability across runners and the container.

## Versioning

The release version is derived from the tag (`proose-v1.2.3` → `1.2.3`). Before building, the pipeline stamps that version into `ui/desktop/package.json` `version` (and the Cargo workspace version if straightforward) so artifact filenames match the release. `workflow_dispatch` uses its `version` input instead of a tag.

## Pipeline — `.github/workflows/proose-release.yml`

**Permissions:** `contents: write` (create releases + upload assets).

### Job 1 — `build-ubuntu-deb` (runs-on `ubuntu-22.04`)
Rust (stable) + Node + pnpm via setup actions → `cargo build --release -p goose-cli --bin proose` → `just copy-binary release` → `cd ui/desktop && pnpm install --frozen-lockfile && pnpm run make -- --targets @electron-forge/maker-deb`.
Uploads: `proose_<ver>_amd64.deb`, and the standalone `target/release/proose` renamed `proose-linux-x86_64-ubuntu`.

### Job 2 — `build-almalinux-rpm` (runs-on `ubuntu-latest`, `container: almalinux:9`)
`dnf` install of build deps (C toolchain, `rustup`/rust, Node.js, pnpm, `rpm-build`, and the Electron/Chromium runtime + packaging libraries electron-forge maker-rpm needs) → same build chain → `pnpm run make -- --targets @electron-forge/maker-rpm`.
Uploads: `proose-<ver>.x86_64.rpm`, and the standalone binary renamed `proose-linux-x86_64-alma9`.
(Fiddliest job — the exact `dnf` package set is pinned in the implementation plan and verified by a real container build.)

### Job 3 — `build-windows-zip` (runs-on `windows-latest`)
Rust (msvc) + Node + pnpm → `cargo build --release -p goose-cli --bin proose` → Windows copy step (the Justfile Windows copy recipe / PowerShell copy of `proose.exe` into `ui/desktop/src/bin`) → `pnpm install --frozen-lockfile && pnpm run make -- --targets @electron-forge/maker-zip`.
Uploads: `Proose-win32-x64-<ver>.zip`, and `proose.exe` renamed `proose-windows-x86_64.exe`.

### Job 4 — `release` (needs Jobs 1-3)
Downloads all artifacts and creates/updates the GitHub Release for the tag via `softprops/action-gh-release`, attaching the **6 assets** (3 desktop bundles + 3 CLI binaries). On `workflow_dispatch`, creates a release for the input version (or a prerelease).

## Verification

Cannot execute GitHub Actions locally. Verify by: (1) `actionlint` on the YAML; (2) dry-run the build commands locally where feasible — the Ubuntu deb chain, and the AlmaLinux rpm chain in a local `almalinux:9` Docker container if Docker is available (else statically pin the `dnf` set and rely on the first CI run); Windows cannot be built locally. (3) Ultimate proof: push a `proose-v*` test tag and confirm the Release gets 6 correct assets — done at handoff (by the user or, on request, by the assistant).

## Out of scope

Code signing / notarization; macOS builds; auto-update/update feeds; publishing to apt/yum repos, winget, or npm; rebranding or fixing the inherited upstream workflows; ARM builds.

## Open items to confirm during planning

- Exact `dnf` package set for a successful `electron-forge make --targets maker-rpm` inside `almalinux:9` (Node version availability, rust via rustup vs dnf, electron sandbox libs).
- The Windows binary-copy path into `ui/desktop/src/bin` (reuse the Justfile Windows recipe).
- Version-stamping mechanism (jq/sed on package.json; Cargo `[workspace.package] version` if present).
- `ubuntu-22.04` vs `ubuntu-latest` for the deb glibc floor.
