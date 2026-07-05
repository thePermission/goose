# Task 1 Report — `list_installed_plugins()` + `InstalledPlugin`

## What was implemented

Per the task brief, verbatim (assumptions about `formats::open_plugins::read_manifest`'s
signature/visibility and `Config::new` were checked against the actual code first and matched
exactly, so no clarification was needed):

1. **`crates/goose/src/plugins/discovery.rs`** — added `pub(crate) fn plugin_enabled_map(config: &Config) -> HashMap<String, bool>`,
   reading the existing `plugins` config-map (`PLUGINS_CONFIG_KEY` / `PluginConfigEntry`) and
   projecting it to `path -> enabled`. Placed directly above `is_enabled`.

2. **`crates/goose/src/plugins/mod.rs`**:
   - New `pub struct InstalledPlugin { name, version, source, enabled, auto_update, updatable }`
     (`Debug, Clone, PartialEq, Eq`).
   - `pub fn list_installed_plugins() -> Vec<InstalledPlugin>` — thin wrapper calling the
     `_at_root` variant with `plugin_install_dir()` and `Config::global()`.
   - Private `fn list_installed_plugins_at_root(root: &Path, config: &Config) -> Vec<InstalledPlugin>`
     — reads the enabled-map via `discovery::plugin_enabled_map`, walks `root`'s child dirs,
     reads the plugin version via `formats::open_plugins::read_manifest(&dir, "")` (falling back
     to `"unknown"`), reads install metadata via the existing private `read_install_metadata`
     (source / auto_update / `updatable = source_type == "git"`, defaulting to
     `("", false, false)` when metadata is missing), looks up `enabled` in the map keyed by the
     absolute directory path (default `true` when absent — i.e. newly-discovered/undecided
     plugins are enabled by default, consistent with `filter_by_config`'s existing behavior).
     Results sorted by name.
   - Placed the new struct/functions right after the `InstallMetadata` struct, before
     `installed_plugin_skill_dirs`.
   - Added `#[test] fn lists_installed_plugins_with_state()` to the existing `#[cfg(test)] mod tests`
     block (inserted as the first test, before `rejects_repo_without_supported_manifest`),
     exactly as specified in the brief.

## TDD evidence

**RED** — before adding the struct/functions (test added first):
```
cargo test -p goose --lib plugins::tests::lists_installed_plugins_with_state
error[E0425]: cannot find function `list_installed_plugins_at_root` in this scope
   --> crates/goose/src/plugins/mod.rs:497:20
cargo test: 1 errors, 0 warnings
```

**GREEN** — after adding `discovery::plugin_enabled_map` + the `mod.rs` additions:
```
cargo test -p goose --lib plugins::tests::lists_installed_plugins_with_state
cargo test: 1 passed, 1358 filtered out (1 suite, 0.01s)
```

**Full module regression** (single-threaded, to avoid an unrelated pre-existing race — see
Concerns below):
```
cargo test -p goose --lib plugins:: -- --test-threads=1
cargo test: 32 passed, 1327 filtered out (1 suite, 0.30s)
```

**Formatting / lints:**
```
cargo fmt -p goose            → no diff beyond the new code (already formatted)
cargo clippy -p goose -- -D warnings → "No issues found"
```

## Files changed

- `crates/goose/src/plugins/mod.rs` (+91 lines: struct, 2 fns, 1 test)
- `crates/goose/src/plugins/discovery.rs` (+7 lines: `plugin_enabled_map`)

Diff matches the brief's Step 3/Step 4 code blocks verbatim (only `cargo fmt`-normalized
whitespace, no logic changes).

## Self-review

- `InstalledPlugin` derives `PartialEq, Eq` as specified — useful for assertion/dedup in later
  ACP-layer tests.
- Default-enabled-when-absent (`.unwrap_or(true)`) matches the existing convention in
  `discovery::filter_by_config` (newly discovered plugins default to enabled).
- `updatable` is derived purely from `source_type == "git"`, independent of `auto_update` — a
  plugin can be `updatable: true, auto_update: false` (manual updates allowed, no background
  auto-update), which matches `update_plugin_at_root`'s own gate (`source_type != "git"` is the
  only hard block on `update_plugin`).
- Missing/corrupt `.goose-plugin-install.json` degrades gracefully to
  `(source: "", auto_update: false, updatable: false)` rather than dropping the plugin from the
  list — the plugin still shows up (with `version` from its manifest, if any), just without
  update metadata. This seems intentional/desirable for a UI listing (an installed-but-metadata-less
  plugin — e.g. hand-copied into the plugins dir — should still be visible and toggle-able).
- No new `unwrap`/panics introduced; all fallible paths degrade to safe defaults, consistent with
  sibling functions in the same file (`auto_update_plugins_at_root`, `installed_plugin_skill_dirs`).

## Concerns

1. **Pre-existing test flake, unrelated to this change**: running the full `plugins::` test
   module with the default parallel test runner intermittently fails
   `plugins::discovery::tests::enabled_in_config_keeps_plugin_without_modifying_config` with
   `assertion failed: found.iter().any(|p| p.name == "demo")`. Reproduced identically on the
   pre-task commit (`git stash` back to `8a6d5791a`) with the same `--test-threads` count, so
   this is **not** caused by Task 1's changes — it's a test-isolation race, most likely from
   `plugins::discovery::tests::project_scope_overrides_user_scope` mutating the process-global
   `GOOSE_PATH_ROOT` env var concurrently with other tests reading it (unsafe `set_var`/`remove_var`
   plus no serialization across tests in the same binary). Single-threaded, all 32 plugins tests
   pass reliably. Flagging for a separate fix (e.g. `#[serial]` or a mutex around env-var-mutating
   tests) — out of scope for this task per the brief, but worth tracking before this suite is
   relied on in CI at higher parallelism.
2. The task brief's target test command
   (`cargo test -p goose --lib plugins::tests::lists_installed_plugins_with_state`) passes
   reliably in isolation and is unaffected by the above flake.
