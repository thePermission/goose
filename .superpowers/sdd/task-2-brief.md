### Task 2: Rust core — `set_plugin_enabled()`

**Files:**
- Modify: `crates/goose/src/plugins/discovery.rs` (path-keyed setter)
- Modify: `crates/goose/src/plugins/mod.rs` (name → path wrapper)
- Test: `crates/goose/src/plugins/discovery.rs` (`#[cfg(test)]`)

**Interfaces:**
- Produces: `discovery::set_plugin_enabled_path(&Config, path_key: &str, enabled: bool) -> anyhow::Result<()>`; `pub fn set_plugin_enabled(name: &str, enabled: bool) -> anyhow::Result<()>` (resolves `plugin_install_dir().join(name)` as the key).

- [ ] **Step 1: Failing test** (`discovery.rs` tests)

```rust
#[test]
fn set_plugin_enabled_path_roundtrip() {
    let tmp = tempfile::tempdir().unwrap();
    let cfg = Config::new(tmp.path().join("config.yaml"), "k").unwrap();
    set_plugin_enabled_path(&cfg, "/x/plugins/demo", false).unwrap();
    assert_eq!(plugin_enabled_map(&cfg).get("/x/plugins/demo"), Some(&false));
    set_plugin_enabled_path(&cfg, "/x/plugins/demo", true).unwrap();
    assert_eq!(plugin_enabled_map(&cfg).get("/x/plugins/demo"), Some(&true));
}
```

- [ ] **Step 2: Run — fails** — `cargo test -p goose --lib plugins::discovery::tests::set_plugin_enabled_path_roundtrip` → FAIL.

- [ ] **Step 3: discovery.rs — setter**

```rust
pub(crate) fn set_plugin_enabled_path(config: &Config, path_key: &str, enabled: bool) -> anyhow::Result<()> {
    let mut entries: HashMap<String, PluginConfigEntry> =
        config.get_param(PLUGINS_CONFIG_KEY).unwrap_or_default();
    entries.insert(path_key.to_string(), PluginConfigEntry { enabled });
    config.set_param(PLUGINS_CONFIG_KEY, serde_json::to_value(&entries)?)?;
    Ok(())
}
```

- [ ] **Step 4: mod.rs — name wrapper**

```rust
pub fn set_plugin_enabled(name: &str, enabled: bool) -> Result<()> {
    let path = plugin_install_dir().join(name);
    crate::plugins::discovery::set_plugin_enabled_path(
        crate::config::Config::global(),
        &path.to_string_lossy(),
        enabled,
    )
}
```

- [ ] **Step 5: Run — passes** — same command → PASS; `cargo fmt`; `cargo clippy -p goose -- -D warnings`.

- [ ] **Step 6: Commit**

```bash
git add crates/goose/src/plugins/discovery.rs crates/goose/src/plugins/mod.rs
git commit -m "feat(plugins): set_plugin_enabled via config.yaml plugins map"
```

---

