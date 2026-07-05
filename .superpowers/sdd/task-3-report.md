# Task 3 Report: `marketplace`-Modul + Registry (CRUD über `config.yaml`)

## Summary

Implemented the `marketplace` module exactly as specified in the task brief. The
`Config` API signatures confirmed in Step 1 matched the brief's assumptions
verbatim, so no adaptation of the CRUD/test code was needed — only one small
gap in the brief's own example was fixed (see "Deviations from the brief" below).

## Step 1 — CONFIRMED Config API (crates/goose/src/config/base.rs)

```rust
pub fn global() -> &'static Config                                   // line 394
pub fn new<P: AsRef<Path>>(config_path: P, service: &str)
    -> Result<Self, ConfigError>                                     // line 402
pub fn get_param<T: for<'de> Deserialize<'de>>(&self, key: &str)
    -> Result<T, ConfigError>                                        // line 731
pub fn set_param<V: Serialize>(&self, key: &str, value: V)
    -> Result<(), ConfigError>                                       // line 786
```

- A per-test `Config` instance **is** constructible via `Config::new(path, service_str)`
  — no singleton/keyring dependency for the config-file path. This is the exact
  signature the brief's `temp_config()` helper assumed
  (`Config::new(tmp.path().join("config.yaml"), "test-key")`), so the helper
  needed **no changes**.
- Precedent for this exact pattern already exists in the codebase:
  `crates/goose/src/plugins/discovery.rs` has `fn test_config(dir: &Path) -> Config { Config::new(dir.join("config.yaml"), "goose-discovery-test").unwrap() }`
  and a `_with_config(&Config, ...)` split identical in shape to what this task
  needed (`filter_by_config` / `discover_enabled_plugins_with_config`).
- `ConfigError` (thiserror-based, all fields `String`/`std::io::Error`) is
  `Send + Sync + 'static`, so `?` on `Result<_, ConfigError>` converts cleanly
  into `anyhow::Result` inside `registry.rs` without any manual mapping.
- Secrets storage (keyring) is irrelevant here — `marketplaces` is a plain
  non-secret param stored via `get_param`/`set_param`, which only touches
  `config.yaml`, never the keyring/secrets file.

No `NEEDS_CONTEXT` — API matched exactly, proceeded with implementation.

## Files changed

- **New** `crates/goose/src/marketplace/mod.rs` — `MarketplaceKind` (`Claude`/`Codex`,
  `#[serde(rename_all = "lowercase")]`), `MarketplaceSource { name, kind, location,
  enabled }` (`enabled` defaults to `true` via `default_true()`), `pub mod registry;`.
- **New** `crates/goose/src/marketplace/registry.rs` — CRUD: `list_marketplaces[_with_config]`,
  `add_marketplace[_with_config]` (bails on duplicate `name`), `remove_marketplace[_with_config]`
  (returns whether anything was removed), plus `#[cfg(test)] mod tests` with the
  two brief-specified tests.
- **Modified** `crates/goose/src/lib.rs` — added `pub mod marketplace;`, inserted
  alphabetically between `logging` and `mcp_utils` to match the file's existing
  ordering convention.

## Deviations from the brief

One line in the brief's own Step 2 test code doesn't compile as written against
the brief's own Step 4/5 code: `registry.rs`'s top-level imports (Step 5) only
bring `MarketplaceSource` into scope (`use crate::marketplace::MarketplaceSource;`),
but the test module's `use super::*;` (Step 2) also needs `MarketplaceKind` for
`MarketplaceKind::Claude` / `MarketplaceKind::Codex`. Fixed by adding
`use crate::marketplace::MarketplaceKind;` **inside** `mod tests` (not at the
top of `registry.rs`) — adding it at the top level instead compiles but produces
an `unused_imports` warning on plain (non-test) builds, since `MarketplaceKind`
isn't otherwise used in `registry.rs`'s production code. Confirmed via
`cargo check -p goose --lib` before/after: warning present with the top-level
import, gone once moved into the test module. Everything else in the brief was
used verbatim (types, field order, CRUD logic, `KEY = "marketplaces"`, error
messages).

Minor behavioral note (not changed, matches brief verbatim): `remove_marketplace_with_config`
unconditionally calls `set_param` even when nothing was removed (e.g. removing
from an already-empty registry writes `marketplaces: []` to `config.yaml`).
Harmless/idempotent, flagging for awareness only.

## TDD evidence

**RED** — `cargo test -p goose marketplace::registry` before any implementation
(only the test module existed, referencing not-yet-defined types/functions):

```
error[E0425]: cannot find function `list_marketplaces_with_config` in this scope
error[E0433]: failed to resolve: use of undeclared type `MarketplaceKind`
error[E0425]: cannot find function `add_marketplace_with_config` in this scope
error[E0425]: cannot find function `remove_marketplace_with_config` in this scope
```
(9 compile errors total across both tests — full list captured in the session log.)

**GREEN** — after implementing `mod.rs` + `registry.rs`:

```
$ cargo test -p goose marketplace::registry
cargo test: 2 passed, 1536 filtered out (24 suites, 0.01s)
```

**Clean build check** — `cargo check -p goose --lib`:

```
cargo build (1 crates compiled)
Finished `dev` profile [unoptimized + debuginfo] target(s) in 4.63s
```
(zero warnings)

**Clippy** — `cargo clippy -p goose --lib --tests -- -D warnings`:

```
cargo clippy: No issues found
```

**Full crate test suite** — `cargo test -p goose --lib` (required once before
commit to confirm the whole crate still compiles/tests):

```
test result: FAILED. 1339 passed; 5 failed; 0 ignored; 0 measured; 0 filtered out; finished in 7.98s
```

The 5 failures are **pre-existing and unrelated** to this change:
- `agents::prompt_manager::tests::test_all_platform_extensions` — an `insta`
  snapshot mismatch about a `code_execution` extension block, unrelated to config/marketplace.
- 4x `providers::{chatgpt_codex,gcpauth}::tests::*` — all fail with
  `Could not automatically determine the process-level CryptoProvider from
  jsonwebtoken crate features` (rustls/aws-lc-rs provider race under parallel
  test execution).

Verified pre-existing by `git stash`-ing all marketplace changes (module dirs +
`lib.rs` edit) and re-running `cargo test -p goose --lib` on the untouched
tree: same category of failures occurred (7 failed that run, incl. the same
`gcpauth`/`chatgpt_codex` CryptoProvider panics — count varies 5–7 run to run,
consistent with a parallel-test race, not a deterministic regression). Then
`git stash pop` restored the marketplace changes cleanly (confirmed via
`git status --short`).

The two new `marketplace::registry` tests pass consistently and are the only
tests this task's code affects.

## Self-review

- No network access anywhere in the new code — `list/add/remove_marketplace[_with_config]`
  only touch `Config` (file I/O to `config.yaml`), consistent with the "no
  network in tests" constraint.
- Tests use `tempfile::tempdir()` per-test (already a normal, non-dev
  dependency of the `goose` crate) and `Config::new(...)` for full isolation —
  no shared global state, no interference with `Config::global()`, no leaked
  temp files (dir dropped at end of scope, following the same pattern as
  `crates/goose/src/plugins/discovery.rs` tests).
- `MarketplaceKind` serializes lowercase as required
  (`#[serde(rename_all = "lowercase")]` → `"claude"`/`"codex"`); not
  independently asserted by a dedicated serde test in this task since the brief
  didn't request one and Task 3's only required interface tests are the CRUD
  roundtrip/duplicate-name tests — flagging in case a later task wants explicit
  wire-format coverage.
- `add_marketplace`/`list_marketplaces`/`remove_marketplace` (no-arg, `Config::global()`-backed
  public entrypoints) are implemented but have no test coverage of their own
  (untestable in isolation without hitting the real global config) — this
  matches the brief's intent (`_with_config` variants exist precisely so tests
  don't need to touch the global singleton) and is consistent with the
  `discovery.rs` precedent, which tests only the `_with_config` variant too.
- Module registered alphabetically in `lib.rs` matching existing file convention.

## Concerns

- None blocking. The pre-existing flaky failures in the full `--lib` run
  (jsonwebtoken `CryptoProvider`, one `insta` snapshot) are out of scope for
  this task and were not introduced by it (verified via `git stash`).
- The brief's `remove_marketplace_with_config` always writes on call, even as a
  no-op; noted above but left as specified (verbatim per task instructions).

---

## Fix Report — Review Finding: `Err(_) => Ok(Vec::new())` swallows genuine errors

### Finding (Important — correctness / data-loss)

`list_marketplaces_with_config` treated *every* `get_param` failure (not just
"key not set") as an empty list. Because `add_marketplace_with_config` /
`remove_marketplace_with_config` do read-modify-write (`list` → mutate →
`set_param`), a genuine deserialization/IO error on read would be silently
swallowed to `[]`, and the very next add/remove would overwrite the
`marketplaces` key in `config.yaml` with a truncated list — permanent data
loss for any marketplaces that couldn't be deserialized (e.g. after a
breaking `MarketplaceSource` schema change, or manual/corrupted edits to
`config.yaml`).

### Root cause confirmed

`crate::config::base::Config::get_param` returns `Result<T, ConfigError>`
where `ConfigError` (defined in `crates/goose/src/config/base.rs:46-61`,
`#[derive(Error, Debug)]`, re-exported from `crates/goose/src/config/mod.rs`)
has a dedicated `NotFound(String)` variant used only when the key is absent
(`base.rs:741`: `.ok_or_else(|| ConfigError::NotFound(key.to_string()))`).
Deserialization failures instead surface as `ConfigError::DeserializeError`
(via `From<serde_json::Error>` / `From<serde_yaml::Error>`). The old code
matched on `Err(_)` and conflated the two.

### Fix

`crates/goose/src/marketplace/registry.rs`:

```rust
use crate::config::{Config, ConfigError};
...
pub fn list_marketplaces_with_config(config: &Config) -> Result<Vec<MarketplaceSource>> {
    match config.get_param::<Vec<MarketplaceSource>>(KEY) {
        Ok(v) => Ok(v),
        Err(ConfigError::NotFound(_)) => Ok(Vec::new()), // Key nicht gesetzt -> leer
        Err(e) => Err(e.into()), // genuine error (e.g. deserialization) must propagate
    }
}
```

Only `ConfigError::NotFound` (real variant, confirmed in `base.rs:48`) is
treated as "empty"; every other `ConfigError` (e.g. `DeserializeError`,
`FileError`, `LockError`) now propagates via `.into()` into the function's
`anyhow::Result`. `ConfigError` is `#[derive(Error, Debug)]` (thiserror) and
thus `std::error::Error + Send + Sync + 'static`, so `.into()` converts
cleanly to `anyhow::Error` with no extra mapping needed.

### Optional minor also applied

`set_param`'s real signature is `pub fn set_param<V: Serialize>(&self, key: &str, value: V) -> Result<(), ConfigError>`
(`base.rs:786`) — it serializes internally via `serde_yaml::to_value(value)?`
(`base.rs:789`). The old call sites pre-serialized to `serde_json::Value` via
`serde_json::to_value(&all)?` before calling `set_param`, causing a redundant
JSON round-trip before the YAML serialization inside `set_param`. Both call
sites (`add_marketplace_with_config`, `remove_marketplace_with_config`) now
pass `&all` directly: `config.set_param(KEY, &all)?;`.

### New regression test — TDD RED → GREEN

Added to the existing `#[cfg(test)] mod tests` in `registry.rs`:

- `unset_key_returns_empty` — explicit regression-safety test confirming an
  unset key still returns `Ok(vec![])` (behavior preserved by the fix).
- `malformed_stored_value_is_not_swallowed` — stores
  `serde_json::json!("not-a-list")` under `KEY` directly via
  `cfg.set_param(KEY, ...)` (a value that cannot deserialize into
  `Vec<MarketplaceSource>`), then asserts
  `list_marketplaces_with_config(&cfg).is_err()`.

**RED** (written against the pre-fix `Err(_) => Ok(Vec::new())` code):

```
$ cargo test -p goose marketplace::registry
---- marketplace::registry::tests::malformed_stored_value_is_not_swallowed stdout ----

thread 'marketplace::registry::tests::malformed_stored_value_is_not_swallowed' (479408) panicked at crates/goose/src/marketplace/registry.rs:106:9:
a genuine deserialization error must be propagated, not swallowed as empty
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace

test result: FAILED. 3 passed; 1 failed; 0 ignored; 0 measured; 1342 filtered out; finished in 0.01s
```

**GREEN** (after applying the `ConfigError::NotFound` fix):

```
$ cargo test -p goose marketplace::registry
cargo test: 4 passed, 1536 filtered out (24 suites, 0.01s)
```

### Verification commands (post-fix, both pristine)

```
$ cargo test -p goose marketplace::registry
cargo test: 4 passed, 1536 filtered out (24 suites, 0.01s)

$ cargo clippy -p goose -- -D warnings
cargo clippy: No issues found
```

### Concerns

None. `ConfigError::NotFound` is the sole "absent key" variant produced by
`get_param` (confirmed by reading `base.rs`), so no other legitimate "empty by
design" case is being turned into an error by this fix.
