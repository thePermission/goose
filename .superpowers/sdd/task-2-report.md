# Task 2 Report: `set_plugin_enabled()`

## Summary

Implemented the writer half of the plugin-enabled toggle: a path-keyed setter
in `discovery.rs` and a name-keyed public wrapper in `mod.rs`, per
`task-2-brief.md`, verbatim.

## TDD cycle

1. **RED**: Added `set_plugin_enabled_path_roundtrip` test to
   `crates/goose/src/plugins/discovery.rs` (`#[cfg(test)] mod tests`).
   `cargo test -p goose --lib plugins::discovery::tests::set_plugin_enabled_path_roundtrip`
   failed to compile: `error[E0425]: cannot find function
   set_plugin_enabled_path in this scope`. Confirmed the test exercises code
   that does not exist yet.
2. **GREEN**: Implemented `pub(crate) fn set_plugin_enabled_path(config: &Config,
   path_key: &str, enabled: bool) -> anyhow::Result<()>` in `discovery.rs`
   (reads the existing `plugins` map via `PLUGINS_CONFIG_KEY`, upserts the
   entry for `path_key`, writes back via `config.set_param`). Added
   `pub fn set_plugin_enabled(name: &str, enabled: bool) -> Result<()>` in
   `mod.rs`, resolving `plugin_install_dir().join(name)` and delegating to the
   path-keyed setter with `Config::global()`. Target test passes.

## Files changed

- `crates/goose/src/plugins/discovery.rs`
  - `pub(crate) fn set_plugin_enabled_path(...)` — new setter, placed directly
    after `plugin_enabled_map` (the Task-1 reader it pairs with).
  - `#[test] fn set_plugin_enabled_path_roundtrip()` — new unit test.
- `crates/goose/src/plugins/mod.rs`
  - `pub fn set_plugin_enabled(name: &str, enabled: bool) -> Result<()>` — new
    name→path wrapper, placed after `list_installed_plugins_at_root` /
    before `installed_plugin_skill_dirs`.

Both additions match the brief's code blocks verbatim (confirmed via
`git diff`; only `cargo fmt` line-wrapped the multi-line `assert_eq!` in the
test).

## Verification

- `cargo test -p goose --lib plugins::discovery::tests::set_plugin_enabled_path_roundtrip`
  → 1 passed.
- `cargo test -p goose --lib plugins:: -- --test-threads=1` → 33 passed (full
  `plugins` module, discovery + mod.rs tests), single-threaded.
- `cargo fmt -p goose` → applied (whitespace-only diff in the test's
  `assert_eq!` call).
- `cargo clippy -p goose -- -D warnings` → "No issues found".

## Self-review

- Setter is `pub(crate)` (module-internal, matches Task-1's
  `plugin_enabled_map` visibility) — only `mod.rs` calls it, via the public
  `set_plugin_enabled` wrapper. Consistent with the existing
  discovery/mod split (discovery.rs owns config-map I/O; mod.rs exposes the
  plugin-name-facing API).
- `set_plugin_enabled_path` follows the exact same read-modify-write pattern
  already used by `filter_by_config` in the same file (read map with
  `unwrap_or_default`, mutate, `set_param` back) — no new pattern introduced.
- No behavior change to existing reader (`plugin_enabled_map`) or to
  `filter_by_config`'s auto-enable-on-discovery logic.
- Test is network-free and isolated: `tempfile::tempdir()` + a fresh
  `Config::new(path, "k")`, no shared global state.

## Concerns

- **Pre-existing test flakiness (not introduced by this task)**: running the
  full `plugins::` test suite with default (parallel) `cargo test` threading
  intermittently fails 1–3 unrelated `discovery::tests::*` tests
  (`enabled_in_config_keeps_plugin_without_modifying_config`,
  `finds_project_scope_plugin`, `newly_discovered_plugin_is_added_to_config_as_enabled`,
  etc.) with `assertion failed: found.iter().any(|p| p.name == "demo")`.
  Root cause: `project_scope_overrides_user_scope` mutates the process-global
  `GOOSE_PATH_ROOT` env var (`unsafe { std::env::set_var(...) }`) while other
  tests read it concurrently via `user_settings_path()`. Reproduced this
  flakiness on `git stash` (i.e. on the Task-1 HEAD, before any Task-2 edit),
  confirming it predates this task. Not fixed here (out of scope for Task 2 —
  the brief's test command targets a single test name, which is unaffected).
  Flagging for a follow-up: either serialize these tests
  (`#[serial]`/single-threaded) or stop mutating a global env var in tests.
  Verified this task's own test and the full module suite pass cleanly with
  `--test-threads=1`.
- No other concerns; implementation is a small, mechanical read-modify-write
  matching the brief exactly.
