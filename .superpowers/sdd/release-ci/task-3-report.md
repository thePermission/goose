# Task 3 Report: Windows zip build job

## Status: DONE

## Summary
Appended the `build-windows-zip` job to `.github/workflows/proose-release.yml`, mirroring the
structure of the existing `build-ubuntu-deb` / `build-almalinux-rpm` jobs (Tasks 1 and 2) and the
repo's own `release-windows` / `copy-binary-windows` Justfile recipes for path conventions.

## Job details
- `runs-on: windows-latest`
- Steps: checkout (`actions/checkout@v4`) → Rust toolchain (`dtolnay/rust-toolchain@stable` with
  `targets: x86_64-pc-windows-msvc`) → Node (`actions/setup-node@v4`, node-version `'24'`) →
  pnpm (`pnpm/action-setup@v4`, version `'10.30.0'`) → derive+stamp version (`shell: bash`, using
  `${VERSION#proose-v}` bash parameter expansion) → `pnpm --dir ui install --frozen-lockfile` →
  `cargo build --release --target x86_64-pc-windows-msvc -p goose-cli --bin proose` → stage binary
  via PowerShell (`shell: pwsh`, `Copy-Item -Force target/x86_64-pc-windows-msvc/release/proose.exe
  ui/desktop/src/bin/proose.exe`) → make zip (`working-directory: ui/desktop`, `env:
  ELECTRON_ARCH: x64`, `pnpm run make --arch=x64 --targets @electron-forge/maker-zip` — no `--`
  bug) → collect artifacts via PowerShell recursive `Get-ChildItem -Recurse ui/desktop/out/make
  -Filter *.zip` plus `proose-windows-x86_64.exe` copy → upload artifact `proose-windows` with
  `path: dist/*`.

## Verification
- `actionlint .github/workflows/proose-release.yml` → exit 0, no errors/warnings.
- `python3 -c "import yaml; yaml.safe_load(...)"` → YAML valid (secondary confirmation).
- Manual diff review confirmed:
  - No `--` before `--arch=x64 --targets ...` in the make step (the bug found in Task 1 is
    avoided).
  - `ELECTRON_ARCH: x64` present in the make step's `env:`.
  - `shell: bash` set on the "Derive + stamp version" step so `${VERSION#proose-v}` works on the
    Windows runner (default shell there is `pwsh`, which doesn't support this syntax).
  - `targets: x86_64-pc-windows-msvc` present on the `dtolnay/rust-toolchain@stable` step, and the
    same triple used consistently in the `cargo build --target`, staging `Copy-Item`, and final
    exe artifact paths.
  - Binary staging path matches the existing `copy-binary-windows` Justfile recipe's target path
    (`target/x86_64-pc-windows-msvc/release/proose.exe`).

## Caveats
Windows cannot be built in this Linux sandbox, so the `cargo build`, `pnpm run make`, and
PowerShell steps were not executed end-to-end — verification relies on `actionlint` YAML/schema
validation plus structural mirroring of the deb/rpm jobs and the repo's proven Justfile Windows
recipes. Real proof comes from the first CI run on this workflow.

## Commit
`dd820e6339fd3a9a66cf8236c7a6f6d0c88ab714` — "ci(proose): Windows zip build job"
(1 file changed, 44 insertions)
