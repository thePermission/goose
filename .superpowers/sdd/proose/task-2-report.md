# Task 2 Report: Point desktop server-binary discovery + build/copy at `proose`

## Status: DONE_WITH_CONCERNS

## Summary

Followed the brief's TDD order exactly:

1. **RED**: Updated `ui/desktop/src/gooseServe.test.ts:7` binary name from `goose`/`goose.exe` to
   `proose`/`proose.exe`. Ran `pnpm exec vitest run src/gooseServe.test.ts` from `ui/desktop/`
   (via `source bin/activate-hermit`) — confirmed baseline was 10/10 PASS before the edit, then
   2 tests failed after the test-file edit ("prefers the staged binary over target builds...",
   "uses the bundled goose binary in packaged builds") because `findGooseBinaryPath` still
   resolved `goose`.
2. **GREEN**: Updated `ui/desktop/src/gooseServe.ts:78` — `binaryName` now resolves `proose` /
   `proose.exe` (win32), keeping the ternary structure unchanged. Re-ran the same test command:
   10/10 PASS.
3. Updated `Justfile`:
   - `release-binary` (line 22): `cargo build --release -p goose-cli --bin goose` → `--bin proose`.
   - `copy-binary` (lines 45-51): renamed the `target/{{BUILD_MODE}}/goose` check, the log message,
     the `rm -f`, and the `cp -p` target to `proose`. Left the `rm -f ./ui/desktop/src/bin/goosed`
     legacy-cleanup line untouched.
   - `copy-binary-intel`: same rename for the `x86_64-apple-darwin/release/goose` path, log message,
     `rm -f`, and `cp -p`. Left the `goosed` cleanup line untouched.
   - `copy-binary-windows` ([windows] block): renamed `goose.exe` → `proose.exe` in the
     `Test-Path` check and the `Copy-Item` source. Left the `Remove-Item ... goosed.exe` legacy
     cleanup line untouched.
4. Verified staging end-to-end: `source bin/activate-hermit && just copy-binary debug` printed
   `Copying proose CLI binary from target/debug...` and `test -x ./ui/desktop/src/bin/proose`
   succeeds (843 MB executable, matches `target/debug/proose` produced by Task 1). `just` was
   available directly after `activate-hermit` (no manual fallback needed).
5. Committed only the three authorized files:
   `git add ui/desktop/src/gooseServe.ts ui/desktop/src/gooseServe.test.ts Justfile` →
   commit `bd65a33df` "feat(proose): resolve + bundle the proose server binary".
   `git show --stat HEAD` confirms exactly those 3 files, 15 insertions / 15 deletions, no stray
   edits. `ui/desktop/src/bin/proose` was left untracked/unstaged as instructed.

## Self-review against the brief's success criteria

- Packaged path (`resourcesPath/bin/proose`, `resourcesPath/proose`): now resolves `proose` — yes.
- Dev paths (`src/bin/proose`, `target/release/proose`, `target/debug/proose`): now resolves
  `proose` — yes.
- `gooseServe.test.ts`: PASS (10/10) after the change.
- `copy-binary debug`: stages `ui/desktop/src/bin/proose`, executable — yes.

## Concern: `ui/desktop/src/bin/proose` is NOT git-ignored

Checked with `git check-ignore -v ui/desktop/src/bin/proose` → exit code 1 (no match, i.e. NOT
ignored). Root cause: the repo's root `.gitignore` has a name-specific (non-wildcard) entry:

```
/ui/desktop/src/bin/goose
```

(line 63 of `/home/sascha/Projects/corporategoose/goose/.gitignore`). This ignored the old
`goose` binary by exact name only — it does not match the new `proose` binary name, so
`git status` now shows `ui/desktop/src/bin/proose` as an untracked file, not an ignored one.

Per the task instructions, I did **not** stage or commit `ui/desktop/src/bin/proose`, and I did
**not** modify `.gitignore` myself (it's outside the brief's authorized file list: only
`gooseServe.ts`, `gooseServe.test.ts`, and `Justfile` were in scope, and the commit instruction
explicitly listed only those three files). However, this is a real hazard: any future
`git add -A`/`git add .` in this repo would now stage an 843 MB binary. **Recommend a follow-up
edit to `.gitignore` line 63**, changing `/ui/desktop/src/bin/goose` to
`/ui/desktop/src/bin/proose`.

## Secondary concern (out of Task 2 scope, flagged for awareness)

Two other `Justfile` recipes still reference the old `--bin goose` / `goose.exe` name and were
**not** touched because they fall outside the brief's explicit file/line list (`release-binary`
line 22, `copy-binary`, `copy-binary-intel`, and "the Windows copy block" were the only items
listed; these two are a separate Windows *build* recipe and a dev-run recipe, not part of the
copy-binary chain):

- `release-windows` ([windows] recipe, ~line 35): `cargo build --release --target
  x86_64-pc-windows-msvc -p goose-cli --bin goose` — will fail to build since Task 1 removed the
  `goose` bin target from `crates/goose-cli/Cargo.toml` (confirmed via `[[bin]] name = "proose"`
  is now the only CLI bin target).
- `run-server` (~line 150): `cargo run -p goose-cli --bin goose -- serve ...` — same issue, will
  fail to build.

These are real breakages introduced by Task 1's rename that neither Task 2 nor Task 3 (per the
stated interfaces) appear to cover. Flagging so the orchestrator can assign a follow-up task or
confirm these are intentionally out of scope for this rebrand pass.

## Files changed (commit bd65a33df)

- `/home/sascha/Projects/corporategoose/goose/ui/desktop/src/gooseServe.ts`
- `/home/sascha/Projects/corporategoose/goose/ui/desktop/src/gooseServe.test.ts`
- `/home/sascha/Projects/corporategoose/goose/Justfile`

## Files NOT changed (flagged only)

- `/home/sascha/Projects/corporategoose/goose/.gitignore` (stale `goose` entry, see concern above)
- `/home/sascha/Projects/corporategoose/goose/Justfile` `release-windows` and `run-server` recipes
  (stale `--bin goose` references, see secondary concern above)
