# Task 1 Report: Rename backend config dir + CLI binary to `proose`

**Branch:** `feature/proose-rebrand` (confirmed via `git branch --show-current`, not switched/created)
**Commit:** `056cb9d3a` — "feat(proose): rename backend config dir + CLI binary to proose"

## Edits made

### 1. `crates/goose/src/config/paths.rs` (line 25)

```diff
-                app_name: "goose".to_string(),
+                app_name: "proose".to_string(),
```

`top_level_domain: "Block"` and `author: "Block"` left unchanged, as instructed. The
`.expect("goose requires a home dir")` message on the next line was also left unchanged
(not part of the brief's scope — it's just an error string, not a functional path
component).

### 2. `crates/goose-cli/Cargo.toml` (first `[[bin]]` block, line 15)

```diff
 [[bin]]
-name = "goose"
+name = "proose"
 path = "src/main.rs"
```

The second `[[bin]]` block (`generate_manpages`) was left untouched, as expected.

## Step 3: Build

```
source bin/activate-hermit && cargo build -p goose-cli
```

Result: `Finished \`dev\` profile [unoptimized + debuginfo] target(s) in 34.86s` (10 crates
compiled). No errors or warnings related to the rename.

```
test -x ./target/debug/proose && echo "BINARY_EXISTS_AND_EXECUTABLE"
```
→ `BINARY_EXISTS_AND_EXECUTABLE`

```
ls -la ./target/debug/proose
```
→ `-rwxrwxr-x 2 sascha sascha 843766928 Jul  5 16:40 ./target/debug/proose`

## Step 4: Verify binary + app dir rename

Pre-check: confirmed `marketplace add` subcommand exists (`proose marketplace --help`
lists `add`, `list`, `remove`, `browse`, `install`).

Recorded real `~/.config/goose` state before the sandboxed run (for later untouched-check):
- `md5sum ~/.config/goose/config.yaml` → `00b7acc21e0a08779588bb410cd98163`
- mtime of `config.yaml`: `1783188905`
- mtime of `~/.config/goose` dir: `1783260580`

Ran the isolated verification exactly as specified in the brief:

```bash
./target/debug/proose --version
SB=$(mktemp -d)
HOME="$SB" XDG_CONFIG_HOME="$SB/.config" XDG_DATA_HOME="$SB/.local/share" \
  ./target/debug/proose marketplace add /tmp/nonexistent --kind claude --name probe 2>&1 | head -3 || true
ls -d "$SB/.config/proose" 2>&1
rm -rf "$SB"
```

Output:
```
--version:  1.41.0
marketplace add: ✓ Added marketplace 'probe'   (exit code 0 — no error, better than the
                  brief's "may print an error, that's fine" allowance)
ls -d "$SB/.config/proose": /tmp/tmp.0UkUe363Gg/.config/proose   (exists)
```

Full sandbox tree before cleanup (via `find "$SB"`):
```
/tmp/tmp.0UkUe363Gg
/tmp/tmp.0UkUe363Gg/.local
/tmp/tmp.0UkUe363Gg/.config
/tmp/tmp.0UkUe363Gg/.local/state
/tmp/tmp.0UkUe363Gg/.local/share
/tmp/tmp.0UkUe363Gg/.config/proose
/tmp/tmp.0UkUe363Gg/.local/state/proose
/tmp/tmp.0UkUe363Gg/.local/share/proose
/tmp/tmp.0UkUe363Gg/.config/proose/config.yaml
/tmp/tmp.0UkUe363Gg/.local/state/proose/logs
/tmp/tmp.0UkUe363Gg/.local/share/proose/projects.json
/tmp/tmp.0UkUe363Gg/.local/state/proose/logs/cli
/tmp/tmp.0UkUe363Gg/.local/state/proose/logs/cli/2026-07-05
/tmp/tmp.0UkUe363Gg/.local/state/proose/logs/cli/2026-07-05/20260705_164109.log
```

Confirms `app_name = "proose"` propagates to config dir, data dir, and state dir
(all under `proose/`, not `goose/`).

After `rm -rf "$SB"`:
```
ls -d "$SB" → "Zugriff auf '/tmp/tmp.0UkUe363Gg' nicht möglich: Datei oder Verzeichnis nicht gefunden"
```
Confirmed sandbox fully removed.

**Real `~/.config/goose` untouched-check (after the sandboxed run):**
- `md5sum ~/.config/goose/config.yaml` → `00b7acc21e0a08779588bb410cd98163` (unchanged)
- mtime of `config.yaml` → `1783188905` (unchanged)
- mtime of `~/.config/goose` dir → `1783260580` (unchanged)
- `ls -d ~/.config/proose` → does not exist (no real proose config dir was created)

All identical to the before-snapshot. Real user config was not touched by the sandboxed
run, and no real `~/.config/proose` was created outside the sandbox.

## Step 5: Regression tests

```
cargo test -p goose --lib
```

Result: `1355 passed; 5 failed`. The 5 failures:

- `agents::prompt_manager::tests::test_all_platform_extensions` — insta snapshot mismatch
  (missing a `## code_execution` extension block in the rendered system prompt — a
  feature-gating/build-config issue, snapshot vs. current cargo feature set).
- `providers::chatgpt_codex::tests::test_parse_jwt_claims_verified_with_issuer`
- `providers::gcpauth::tests::test_service_account_jwt_creation`
- `providers::gcpauth::tests::test_token_expiration`
- `providers::gcpauth::tests::test_token_refresh_race_condition`

  These 4 all fail with the same root cause: `jsonwebtoken` crate's rustls/aws-lc-rs
  `CryptoProvider` isn't installed by default in this test binary
  (`Could not automatically determine the process-level CryptoProvider ...`).

**Confirmed pre-existing / unrelated to this change:** `git stash`'d both edits (files
verified back to `app_name: "goose"` / `name = "goose"`), reran just these 5 tests —
identical failures (`0 passed; 5 failed`, same panic messages, same snapshot diff).
`git stash pop` restored the edits (`git diff --stat` showed the same 2-file, 2-line diff
as before). Rebuilt `cargo build -p goose-cli` afterward to confirm the binary still
builds and runs (`./target/debug/proose --version` → ` 1.41.0`) before committing.

Also verified via `grep`-style review of `paths.rs` (read in full) that no test in that
file hardcodes `"goose"` as a path assertion — the file has no `#[cfg(test)]` module at
all, consistent with the brief's expectation.

## Step 6: Commit

```
git add crates/goose/src/config/paths.rs crates/goose-cli/Cargo.toml
git commit -m "feat(proose): rename backend config dir + CLI binary to proose"
```

Result: commit `056cb9d3a173da0e3d4fea46cb7735fdebb8b81c` on branch
`feature/proose-rebrand`.

```
 crates/goose-cli/Cargo.toml      | 2 +-
 crates/goose/src/config/paths.rs | 2 +-
 2 files changed, 2 insertions(+), 2 deletions(-)
```

Only the intended two files/lines changed; nothing else staged or committed (the
`.superpowers/sdd/proose/` report directory remains untracked, as expected — not part of
this commit).

## Self-review checklist

- [x] Config dir actually becomes `proose`: verified via sandboxed `marketplace add` run
      creating `$SB/.config/proose/config.yaml`, `$SB/.local/share/proose/`,
      `$SB/.local/state/proose/`.
- [x] Binary actually named `proose`: `target/debug/proose` exists, is executable, and
      `--version` runs successfully.
- [x] Real user config untouched: `~/.config/goose/config.yaml` md5sum and mtimes
      identical before/after; no `~/.config/proose` created in the real HOME.
- [x] Sandbox cleaned up: `rm -rf "$SB"` confirmed removed.
- [x] Regression tests: the 5 failures are pre-existing (confirmed via stash/pop
      bisection), unrelated to the two-line rename.
- [x] No unintended files changed in the commit.
