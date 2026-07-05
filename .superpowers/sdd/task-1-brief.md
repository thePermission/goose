### Task 1: Rust core — `InstalledPlugin` + `list_installed_plugins()`

**Files:**
- Modify: `crates/goose/src/plugins/mod.rs`
- Modify: `crates/goose/src/plugins/discovery.rs` (expose a `pub(crate)` enabled-state reader)
- Test: `crates/goose/src/plugins/mod.rs` (`#[cfg(test)]`)

**Interfaces:**
- Produces: `pub struct InstalledPlugin { name, version, source, enabled, auto_update, updatable }`; `pub fn list_installed_plugins() -> Vec<InstalledPlugin>` (+ `_at_root` test variant); `discovery::plugin_enabled_map(&Config) -> std::collections::HashMap<String, bool>`.

- [ ] **Step 1: Failing test** (`mod.rs` test module)

```rust
#[test]
fn lists_installed_plugins_with_state() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().join("plugins");
    let dir = root.join("demo");
    std::fs::create_dir_all(dir.join(".claude-plugin")).unwrap();
    std::fs::write(dir.join(".claude-plugin/plugin.json"),
        r#"{"name":"demo","version":"2.0.0","description":"d"}"#).unwrap();
    std::fs::write(dir.join(INSTALL_METADATA),
        r#"{"source":"m:demo","source_type":"git","format":"claude","auto_update":true}"#).unwrap();
    let cfg = crate::config::Config::new(tmp.path().join("config.yaml"), "k").unwrap();
    // mark demo disabled via the config.yaml plugins map (keyed by path)
    let key = dir.to_string_lossy().to_string();
    cfg.set_param("plugins", serde_json::json!({ key: { "enabled": false } })).unwrap();

    let list = list_installed_plugins_at_root(&root, &cfg);
    assert_eq!(list.len(), 1);
    let p = &list[0];
    assert_eq!(p.name, "demo");
    assert_eq!(p.version, "2.0.0");
    assert_eq!(p.source, "m:demo");
    assert!(p.auto_update);
    assert!(p.updatable);        // source_type == "git"
    assert!(!p.enabled);         // disabled in config map
}
```

- [ ] **Step 2: Run — fails** — `cargo test -p goose --lib plugins::tests::lists_installed_plugins_with_state` → FAIL (symbols missing).

- [ ] **Step 3: discovery.rs — expose enabled-state reader**

Add to `crates/goose/src/plugins/discovery.rs` (reuses existing `PLUGINS_CONFIG_KEY`/`PluginConfigEntry`):

```rust
/// Read the `plugins` enable-map from config.yaml as path -> enabled.
pub(crate) fn plugin_enabled_map(config: &Config) -> HashMap<String, bool> {
    let entries: HashMap<String, PluginConfigEntry> =
        config.get_param(PLUGINS_CONFIG_KEY).unwrap_or_default();
    entries.into_iter().map(|(k, v)| (k, v.enabled)).collect()
}
```

- [ ] **Step 4: mod.rs — struct + functions**

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstalledPlugin {
    pub name: String,
    pub version: String,
    pub source: String,
    pub enabled: bool,
    pub auto_update: bool,
    pub updatable: bool,
}

pub fn list_installed_plugins() -> Vec<InstalledPlugin> {
    list_installed_plugins_at_root(&plugin_install_dir(), crate::config::Config::global())
}

fn list_installed_plugins_at_root(root: &Path, config: &crate::config::Config) -> Vec<InstalledPlugin> {
    let enabled_map = crate::plugins::discovery::plugin_enabled_map(config);
    let entries = match fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() { continue; }
        let name = match dir.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let version = formats::open_plugins::read_manifest(&dir, "")
            .ok()
            .and_then(|m| m.version)
            .unwrap_or_else(|| "unknown".to_string());
        let (source, auto_update, updatable) = match read_install_metadata(&dir) {
            Ok(m) => (m.source, m.auto_update, m.source_type == "git"),
            Err(_) => (String::new(), false, false),
        };
        let enabled = enabled_map
            .get(&dir.to_string_lossy().to_string())
            .copied()
            .unwrap_or(true);
        out.push(InstalledPlugin { name, version, source, enabled, auto_update, updatable });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}
```

- [ ] **Step 5: Run — passes** — `cargo test -p goose --lib plugins::tests::lists_installed_plugins_with_state` → PASS. Then `cargo fmt` + `cargo clippy -p goose -- -D warnings`.

- [ ] **Step 6: Commit**

```bash
git add crates/goose/src/plugins/mod.rs crates/goose/src/plugins/discovery.rs
git commit -m "feat(plugins): list_installed_plugins with enabled/updatable state"
```

---

