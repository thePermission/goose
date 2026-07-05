# Task 2 Report: AlmaLinux 9 rpm build job

**Status:** DONE_WITH_CONCERNS
**Commit:** `4d46dbb83` — `ci(proose): AlmaLinux 9 rpm build job`
**Branch:** `feature/proose-release-ci` (confirmed, not switched)

## What was done

Appended a `build-almalinux-rpm` job to `.github/workflows/proose-release.yml`
following the brief's exact YAML:

- `runs-on: ubuntu-latest`, `container: almalinux:9`
- First step `Install container build deps` runs `dnf -y install ...` BEFORE
  `actions/checkout@v4` (git required for checkout).
- `dtolnay/rust-toolchain@stable`, `actions/setup-node@v4` (node 24),
  `pnpm/action-setup@v4` (version 10.30.0) — pinned action refs matching the
  existing Task 1 Ubuntu job's style (the brief's summary shorthand
  `@24`/`@10.30.0` maps to these `with:` inputs).
- Derive + stamp version (strips `proose-v` prefix, runs
  `scripts/proose-set-version.sh`).
- `pnpm --dir ui install --frozen-lockfile`.
- `cargo build --release -p goose-cli --bin proose`.
- Stage binary into `ui/desktop/src/bin/proose`.
- Make .rpm: `working-directory: ui/desktop`, `ELECTRON_ARCH: x64`,
  `pnpm run make --arch=x64 --targets @electron-forge/maker-rpm`.
  NO `--` before `--arch`/`--targets` (Task 1 finding preserved).
- Collect artifacts: copy `*.rpm` into `dist/`, copy binary as
  `dist/proose-linux-x86_64-alma9`.
- `actions/upload-artifact@v4` name `proose-almalinux`, path `dist/*`.

## Verification

- **actionlint**: clean (exit 0). YAML also validated via `yaml.safe_load`
  (jobs: `build-ubuntu-deb`, `build-almalinux-rpm`).
- **make invocation**: confirmed no `--` bug (line 86).
- **Docker verify**: Docker IS available in this sandbox and the chain was run
  inside `almalinux:9` (`docker run -e CI=true ...` — `CI=true` needed locally
  because pnpm aborts modules removal with no TTY; GitHub Actions sets `CI`
  automatically so the workflow needs no change for this).
  - The `dnf -y install git gcc gcc-c++ make rpm-build openssl-devel pkgconfig
    perl which findutils tar xz gzip` step completed cleanly — **all 12 package
    names are valid, installable AlmaLinux 9 packages** (grep found NO "No match
    for argument" / "nothing provides" / "No package available" errors).
  - rust (pinned 1.92 via `rust-toolchain.toml`), node 24, and pnpm 10.30.0
    installed successfully; `pnpm --dir ui install --frozen-lockfile` completed
    ("Done in 7.4s using pnpm v10.30.0").
  - `cargo build --release` then started; because the container's cargo
    registry cache is not shared with the host, it re-downloads and recompiles
    the entire goose workspace from scratch, which takes many minutes
    (20-40+ for a full release build). Per the brief/coordinator guidance
    (acceptable outcome), polling was stopped and the container killed rather
    than blocking the turn on the full compile.
  - Therefore the rpm packaging step (`maker-rpm` → `rpmbuild`) was NOT reached
    in this run, so a `proose-*.x86_64.rpm` was not produced locally and
    `rpm -qp --qf %{NAME}` could not be confirmed.

## Final dnf package list used (workflow + local docker cmd, identical)

```
git gcc gcc-c++ make rpm-build openssl-devel pkgconfig perl which findutils tar xz gzip
```

## Concerns

- rpm packaging (maker-rpm) sufficiency of the dnf list was NOT fully proven
  locally because the full Rust release compile exceeds a reasonable
  in-sandbox time budget. All package NAMES are verified installable and the
  list is the conventional complete set for building Rust + an electron rpm on
  EL9 (`openssl-devel` + `perl` cover `openssl-sys`; `rpm-build` provides
  `rpmbuild` used by `@electron-forge/maker-rpm`). Any residual missing
  system library (most likely a `*-sys` crate link dep, or an extra tool the
  rpm maker shells out to) will surface on the first CI run and can be added
  to the "Install container build deps" step. This is the acceptable
  DONE_WITH_CONCERNS outcome noted in the brief.
