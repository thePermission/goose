# Task 1 Report: Version script + workflow skeleton + Ubuntu deb job

## Status: DONE_WITH_CONCERNS

## Commit
`14618463b` — "ci(proose): release workflow skeleton + Ubuntu deb job"
Files: `scripts/proose-set-version.sh` (new, executable), `.github/workflows/proose-release.yml` (new).

## Step 1/2: Version-stamp script
Wrote `scripts/proose-set-version.sh` exactly per the brief and made it executable.

Verification (Step 2): stamped both files to `9.9.9-test` and confirmed via grep, then restored to `1.41.0`. Confirmed both:
- `ui/desktop/package.json` → `"version": "9.9.9-test"` → restored `"version": "1.41.0"`
- `Cargo.toml` → `version = "9.9.9-test"` → restored `version = "1.41.0"`

**Local environment quirk (not a script bug):** on first attempt (without `source bin/activate-hermit`), the shell's `node` resolved to `/usr/lib/goose/resources/bin/node` — a wrapper script bundled with the Goose desktop app that `cd`s into a hermit-managed npm cache dir as a side effect and also swallows the real node process's exit code (`node "$@" || log ...` always "succeeds" from the wrapper's perspective). This caused the `node -e` step in the script to fail silently with `ENOENT: ui/desktop/package.json` (wrong cwd) while `set -euo pipefail` didn't catch it, because the wrapper itself exited 0. Re-running after `source bin/activate-hermit` (which puts the repo's own `bin/node` first on PATH) fixed it immediately — this is purely local dev-machine PATH pollution, unrelated to the script or to CI (which uses `actions/setup-node`, not this wrapper). No code change was needed; flagging so nobody chases a phantom bug if they hit the same symptom locally without hermit active.

## Step 3: Workflow skeleton
Wrote `.github/workflows/proose-release.yml` per the brief's Step 3 YAML verbatim, with one fix applied after Step 5 testing (see below).

## Step 4: actionlint
Installed actionlint v1.7.12 via the official `download-actionlint.bash` script (network access worked), placed at `~/.local/bin/actionlint` (sudo mv failed — fingerprint prompt fell through — so used the local-bin fallback the brief's script already handles).

**Result: clean.** `actionlint .github/workflows/proose-release.yml` → no output, exit 0. Re-ran after the Step 5 fix — still clean.

## Step 5: Local Ubuntu build chain (the real test)
Ran with `source bin/activate-hermit` active (cargo 1.92.0, node v24.10.0, pnpm 10.30.3):

1. `cargo build --release -p goose-cli --bin proose` → succeeded (9m22s clean build).
2. Staged binary: `mkdir -p ui/desktop/src/bin && cp -p target/release/proose ui/desktop/src/bin/proose` (299MB, x86-64 ELF, confirmed via `file`). `ui/desktop/src/bin/proose` is gitignored (`.gitignore:64`), so it's never accidentally committed.
3. `cd ui/desktop && ELECTRON_ARCH=x64 pnpm run make -- --arch=x64 --targets @electron-forge/maker-deb` **as written in the brief FAILED**: it tried to build for `rpm` too (missing `rpmbuild`) and errored out. Root cause: `pnpm run make -- --arch=x64 ...` forwards the literal `--` into the underlying chained script (`... && electron-forge make -- --arch=x64 --targets ...`); electron-forge's CLI (Commander-based) treats `--` as "end of options," so `--arch` and `--targets` land as ignored positional args instead of being parsed — forge falls back to its full configured target list (deb + rpm + zip), and the run fails on the missing `rpmbuild` binary.
4. **Fix applied:** dropped the extra `--` — `pnpm run make --arch=x64 --targets @electron-forge/maker-deb` (pnpm forwards these flags straight through since they don't collide with pnpm's own flags). Re-ran: succeeded cleanly, only building the deb target (log: "Making a deb distributable for linux/x64", no rpm step attempted).
5. Result: `ui/desktop/out/make/deb/x64/proose_1.41.0_amd64.deb` (162.7MB).
   - `dpkg-deb -f ... Package` → `proose`
   - `dpkg-deb -f ... Version` → `1.41.0`
   - `dpkg-deb -f ... Architecture` → `amd64`
6. Verified the workflow's exact "Collect artifacts" commands (`find ui/desktop/out/make -name '*.deb' -exec cp {} dist/ \;` + `cp target/release/proose dist/proose-linux-x86_64-ubuntu`) against this real output tree — both land correctly in `dist/`: `proose_1.41.0_amd64.deb` and `proose-linux-x86_64-ubuntu`.
7. Cleaned up local build artifacts (`dist/`, `ui/desktop/out/make/`) before committing; `ui/desktop/src/bin/proose` left in place but gitignored.

## Workflow adjustment vs. the brief
Changed the "Make .deb" step's `run:` line from:
```
run: pnpm run make -- --arch=x64 --targets @electron-forge/maker-deb
```
to:
```
run: pnpm run make --arch=x64 --targets @electron-forge/maker-deb
```
(dropped the `--` separator). Without this fix the CI job would silently attempt to build rpm/zip targets too and fail on missing `rpmbuild` on the ubuntu-22.04 runner — this was caught only by actually running the chain locally, not by actionlint or static review.

## Self-review checklist
- Script stamps both files: yes, verified.
- Workflow YAML actionlint-clean: yes, both before and after the make-step fix.
- Deb build locally produced a proose .deb: yes — `proose_1.41.0_amd64.deb`, `Package: proose`.
- Artifact collection uses robust globs: yes — `find ... -name '*.deb'` is arch-subdir-agnostic (confirmed it correctly reaches into `out/make/deb/x64/`).

## Concerns
- The one substantive risk in this task (the `--` swallowing the make flags) is fixed and locally verified. Tasks 2-4 will append jobs reusing the same version-derivation + staging pattern — they should double check any electron-forge `make` invocations they add don't reintroduce the same double-`--` pattern.
- Not independently verified against actual GitHub Actions infrastructure (only local hermit-based reproduction of the same commands) — recommend a dry run via `workflow_dispatch` once pushed.
