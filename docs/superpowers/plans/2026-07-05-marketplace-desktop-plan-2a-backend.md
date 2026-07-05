# Desktop Marketplaces — Plan 2a (Backend + ACP + TS wrappers)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the Plan-1 marketplace core (sources CRUD, browse, install) plus installed-plugin management (list/enable-disable/update) to the goose Desktop via the ACP JSON-RPC path, ending with typed TypeScript wrappers callable from the app.

**Architecture:** Follow the live Extensions triad — wire request/response structs in `goose-sdk-types`, dispatch arms in `custom_dispatch.rs`, handler methods in a new `acp/server/marketplace.rs`, regenerate the ACP SDK, then thin TS wrappers in `ui/desktop/src/acp/marketplace.ts`. Two additive Rust-core functions back the installed-plugin management.

**Tech Stack:** Rust (`goose`, `goose-sdk-types`), ACP macros (`goose-acp-macros`), `just` codegen, TypeScript SDK (`@aaif/goose-sdk`), pnpm.

## Global Constraints

- **This is the follow-up to Plan 1** (branch `feature/marketplace-desktop-ui`, based on `feature/marketplace-federation`). The `goose::marketplace` module (`registry`, `fetch`, `catalog`, `install`) already exists — reuse it, do not reimplement.
- **Transport is ACP, not REST.** Do not touch `crates/goose-server/.../config_management.rs` or `openapi.json`.
- **Plugin enable/disable state lives in the writable `config.yaml` `plugins` map**, keyed by the plugin's **absolute directory path** (`{ "<path>": { "enabled": bool } }`) — NOT `settings.json` (read-only), NOT keyed by name.
- ACP request structs MUST derive `Default` + `JsonRpcRequest`; response structs derive `JsonRpcResponse`; method strings are `_goose/unstable/marketplace/<verb>` and `_goose/unstable/plugins/<verb>`. Generated client methods are `client.goose.<camelCase>_unstable(...)`.
- After changing ACP types/handlers you MUST run `just generate-acp-types` and **commit** the regenerated `crates/goose/acp-{schema,meta}.json` + `ui/sdk/src/generated/*` (CI `check-acp-schema` enforces freshness).
- Rust tests network-free (`tempfile` fixtures / local `git init`). Build/test the goose crate with `cargo test -p goose --lib` (no default features → no cmake needed). clippy: `cargo clippy -p goose -- -D warnings`; fmt: `cargo fmt`.
- Trust: `install` response must carry enough to warn the user (skills list + hooks/MCP presence + source).

---

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

### Task 3: ACP wire types

**Files:**
- Modify: `crates/goose-sdk-types/src/custom_requests.rs` (append the block below near the extension requests)

**Interfaces:**
- Produces (consumed by Tasks 4/5/6): the request/response structs below and the info structs `MarketplaceSourceInfo`, `CatalogPluginInfo`, `InstalledPluginInfo`, `InstalledPluginResult`.

- [ ] **Step 1: Add the types** (verbatim; note `EmptyResponse` already exists in this file)

```rust
// ---- Marketplace + plugin management (Desktop Plan 2) ----

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSourceInfo {
    pub name: String,
    pub kind: String,       // "claude" | "codex"
    pub location: String,
    pub enabled: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CatalogPluginInfo {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub installable: bool,
    pub source_kind: String, // "relative-path" | "git-subdir" | "git" | "unsupported"
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPluginInfo {
    pub name: String,
    pub version: String,
    pub source: String,
    pub enabled: bool,
    pub auto_update: bool,
    pub updatable: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPluginResult {
    pub name: String,
    pub version: String,
    pub format: String,
    pub source: String,
    pub skills: Vec<String>,
    pub has_hooks: bool,
    pub has_mcp: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/marketplace/list", response = ListMarketplacesResponse)]
pub struct ListMarketplacesRequest {}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
pub struct ListMarketplacesResponse {
    pub marketplaces: Vec<MarketplaceSourceInfo>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/marketplace/add", response = EmptyResponse)]
#[serde(rename_all = "camelCase")]
pub struct AddMarketplaceRequest {
    pub name: String,
    pub kind: String,
    pub location: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/marketplace/remove", response = EmptyResponse)]
#[serde(rename_all = "camelCase")]
pub struct RemoveMarketplaceRequest {
    pub name: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/marketplace/browse", response = BrowseMarketplaceResponse)]
#[serde(rename_all = "camelCase")]
pub struct BrowseMarketplaceRequest {
    pub name: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
pub struct BrowseMarketplaceResponse {
    pub plugins: Vec<CatalogPluginInfo>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/marketplace/install", response = InstalledPluginResult)]
#[serde(rename_all = "camelCase")]
pub struct InstallMarketplacePluginRequest {
    pub marketplace: String,
    pub plugin: String,
    #[serde(default)]
    pub auto_update: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/plugins/list", response = ListInstalledPluginsResponse)]
pub struct ListInstalledPluginsRequest {}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
pub struct ListInstalledPluginsResponse {
    pub plugins: Vec<InstalledPluginInfo>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/plugins/set-enabled", response = EmptyResponse)]
#[serde(rename_all = "camelCase")]
pub struct SetPluginEnabledRequest {
    pub name: String,
    pub enabled: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/plugins/update", response = InstalledPluginResult)]
pub struct UpdatePluginRequest {
    pub name: String,
}
```

- [ ] **Step 2: Compiles** — `cargo build -p goose-sdk-types` → success. `cargo fmt`.

- [ ] **Step 3: Commit**

```bash
git add crates/goose-sdk-types/src/custom_requests.rs
git commit -m "feat(acp-types): marketplace + plugin-management request/response types"
```

---

### Task 4: ACP handlers — marketplace/* + dispatch

**Files:**
- Create: `crates/goose/src/acp/server/marketplace.rs`
- Modify: `crates/goose/src/acp/server.rs` (add `mod marketplace;` near `mod extensions;` at line ~92)
- Modify: `crates/goose/src/acp/server/custom_dispatch.rs` (add dispatch arms)
- Test: none new (thin wrappers over Task-1/2 + Plan-1 code, already tested); verified by compile.

**Interfaces:**
- Consumes: Task 3 types; `goose::marketplace::{registry, fetch, install, MarketplaceSource, MarketplaceKind, catalog::PluginSource}`; `goose::plugins::{list_installed_plugins, set_plugin_enabled, update_plugin, clone_marketplace_repo, PluginInstall, PluginInstallOptions, plugin_install_dir}`.
- Produces: `pub(super) async fn on_marketplace_list/add/remove/browse/install(...)`.

- [ ] **Step 1: `marketplace.rs` handlers**

```rust
use super::*;
use crate::marketplace::catalog::PluginSource;
use crate::marketplace::{MarketplaceKind, MarketplaceSource};

fn parse_kind(kind: &str) -> Result<MarketplaceKind, agent_client_protocol::Error> {
    match kind {
        "claude" => Ok(MarketplaceKind::Claude),
        "codex" => Ok(MarketplaceKind::Codex),
        other => Err(agent_client_protocol::Error::invalid_params()
            .data(format!("unknown marketplace kind '{other}'"))),
    }
}

fn source_kind_label(s: &PluginSource) -> &'static str {
    match s {
        PluginSource::RelativePath(_) => "relative-path",
        PluginSource::GitSubdir { .. } => "git-subdir",
        PluginSource::Git { .. } => "git",
        PluginSource::Unsupported(_) => "unsupported",
    }
}

impl GooseAcpAgent {
    pub(super) async fn on_marketplace_list(
        &self,
    ) -> Result<ListMarketplacesResponse, agent_client_protocol::Error> {
        let list = crate::marketplace::registry::list_marketplaces().internal_err()?;
        Ok(ListMarketplacesResponse {
            marketplaces: list
                .into_iter()
                .map(|m| MarketplaceSourceInfo {
                    name: m.name,
                    kind: format!("{:?}", m.kind).to_lowercase(),
                    location: m.location,
                    enabled: m.enabled,
                })
                .collect(),
        })
    }

    pub(super) async fn on_marketplace_add(
        &self,
        req: AddMarketplaceRequest,
    ) -> Result<EmptyResponse, agent_client_protocol::Error> {
        let kind = parse_kind(&req.kind)?;
        crate::marketplace::registry::add_marketplace(MarketplaceSource {
            name: req.name,
            kind,
            location: req.location,
            enabled: true,
        })
        .map_err(|e| agent_client_protocol::Error::invalid_params().data(e.to_string()))?;
        Ok(EmptyResponse {})
    }

    pub(super) async fn on_marketplace_remove(
        &self,
        req: RemoveMarketplaceRequest,
    ) -> Result<EmptyResponse, agent_client_protocol::Error> {
        let removed = crate::marketplace::registry::remove_marketplace(&req.name).internal_err()?;
        if !removed {
            return Err(agent_client_protocol::Error::invalid_params()
                .data(format!("marketplace '{}' not found", req.name)));
        }
        Ok(EmptyResponse {})
    }

    pub(super) async fn on_marketplace_browse(
        &self,
        req: BrowseMarketplaceRequest,
    ) -> Result<BrowseMarketplaceResponse, agent_client_protocol::Error> {
        let src = crate::marketplace::registry::list_marketplaces()
            .internal_err()?
            .into_iter()
            .find(|m| m.name == req.name)
            .ok_or_else(|| {
                agent_client_protocol::Error::invalid_params()
                    .data(format!("marketplace '{}' not found", req.name))
            })?;
        let plugins = crate::marketplace::fetch::fetch_catalog(&src)
            .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?;
        Ok(BrowseMarketplaceResponse {
            plugins: plugins
                .into_iter()
                .map(|p| CatalogPluginInfo {
                    installable: !matches!(p.source, PluginSource::Unsupported(_)),
                    source_kind: source_kind_label(&p.source).to_string(),
                    name: p.name,
                    description: p.description,
                })
                .collect(),
        })
    }

    pub(super) async fn on_marketplace_install(
        &self,
        req: InstallMarketplacePluginRequest,
    ) -> Result<InstalledPluginResult, agent_client_protocol::Error> {
        let src = crate::marketplace::registry::list_marketplaces()
            .internal_err()?
            .into_iter()
            .find(|m| m.name == req.marketplace)
            .ok_or_else(|| {
                agent_client_protocol::Error::invalid_params()
                    .data(format!("marketplace '{}' not found", req.marketplace))
            })?;
        let tmp = tempfile::tempdir()
            .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?;
        crate::plugins::clone_marketplace_repo(&src.location, tmp.path())
            .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?;
        let entry = crate::marketplace::fetch::fetch_catalog_from_dir(&src, tmp.path())
            .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?
            .into_iter()
            .find(|p| p.name == req.plugin)
            .ok_or_else(|| {
                agent_client_protocol::Error::invalid_params().data(format!(
                    "plugin '{}' not found in marketplace '{}'",
                    req.plugin, req.marketplace
                ))
            })?;
        let install = crate::marketplace::install::install_catalog_plugin(
            &entry,
            tmp.path(),
            crate::plugins::PluginInstallOptions { auto_update: req.auto_update },
        )
        .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?;
        Ok(install_to_result(install))
    }
}

fn install_to_result(install: crate::plugins::PluginInstall) -> InstalledPluginResult {
    let has_hooks = install.directory.join("hooks/hooks.json").is_file();
    let has_mcp = install.directory.join(".mcp.json").is_file();
    InstalledPluginResult {
        name: install.name,
        version: install.version,
        format: install.format.to_string(),
        source: install.source,
        skills: install.skills.into_iter().map(|s| s.name).collect(),
        has_hooks,
        has_mcp,
    }
}
```

> If the `.internal_err()` extension trait is not in scope via `use super::*`, replace `.internal_err()?` with `.map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?` (confirm by reading how `extensions.rs` maps `anyhow`/`Result` errors).

- [ ] **Step 2: Wire the module** — in `crates/goose/src/acp/server.rs`, add next to `mod extensions;`:

```rust
mod marketplace;
```

- [ ] **Step 3: Dispatch arms** — in `crates/goose/src/acp/server/custom_dispatch.rs`, inside the `#[custom_methods] impl GooseAcpAgent` block (next to the extension arms):

```rust
    #[custom_method(ListMarketplacesRequest)]
    async fn dispatch_marketplace_list(&self) -> Result<ListMarketplacesResponse, agent_client_protocol::Error> {
        self.on_marketplace_list().await
    }
    #[custom_method(AddMarketplaceRequest)]
    async fn dispatch_marketplace_add(&self, req: AddMarketplaceRequest) -> Result<EmptyResponse, agent_client_protocol::Error> {
        self.on_marketplace_add(req).await
    }
    #[custom_method(RemoveMarketplaceRequest)]
    async fn dispatch_marketplace_remove(&self, req: RemoveMarketplaceRequest) -> Result<EmptyResponse, agent_client_protocol::Error> {
        self.on_marketplace_remove(req).await
    }
    #[custom_method(BrowseMarketplaceRequest)]
    async fn dispatch_marketplace_browse(&self, req: BrowseMarketplaceRequest) -> Result<BrowseMarketplaceResponse, agent_client_protocol::Error> {
        self.on_marketplace_browse(req).await
    }
    #[custom_method(InstallMarketplacePluginRequest)]
    async fn dispatch_marketplace_install(&self, req: InstallMarketplacePluginRequest) -> Result<InstalledPluginResult, agent_client_protocol::Error> {
        self.on_marketplace_install(req).await
    }
```

- [ ] **Step 4: Compile + clippy**

Run: `cargo build -p goose --lib` then `cargo clippy -p goose -- -D warnings`
Expected: success, no warnings. (If `on_marketplace_install` `tmp` drops too early, note the tempdir is bound to `tmp` for the whole fn — it is.)

- [ ] **Step 5: Commit**

```bash
git add crates/goose/src/acp/server/marketplace.rs crates/goose/src/acp/server.rs crates/goose/src/acp/server/custom_dispatch.rs
git commit -m "feat(acp): marketplace list/add/remove/browse/install handlers"
```

---

### Task 5: ACP handlers — plugins/* + dispatch

**Files:**
- Modify: `crates/goose/src/acp/server/marketplace.rs` (add plugin-management handlers)
- Modify: `crates/goose/src/acp/server/custom_dispatch.rs` (dispatch arms)

**Interfaces:**
- Consumes: Task 1/2 (`list_installed_plugins`, `set_plugin_enabled`), `goose::plugins::update_plugin`, `install_to_result` (Task 4).
- Produces: `on_plugins_list/set_enabled/update`.

- [ ] **Step 1: Handlers** (append into the `impl GooseAcpAgent` in `marketplace.rs`)

```rust
impl GooseAcpAgent {
    pub(super) async fn on_plugins_list(
        &self,
    ) -> Result<ListInstalledPluginsResponse, agent_client_protocol::Error> {
        let plugins = crate::plugins::list_installed_plugins()
            .into_iter()
            .map(|p| InstalledPluginInfo {
                name: p.name,
                version: p.version,
                source: p.source,
                enabled: p.enabled,
                auto_update: p.auto_update,
                updatable: p.updatable,
            })
            .collect();
        Ok(ListInstalledPluginsResponse { plugins })
    }

    pub(super) async fn on_plugins_set_enabled(
        &self,
        req: SetPluginEnabledRequest,
    ) -> Result<EmptyResponse, agent_client_protocol::Error> {
        crate::plugins::set_plugin_enabled(&req.name, req.enabled)
            .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?;
        Ok(EmptyResponse {})
    }

    pub(super) async fn on_plugins_update(
        &self,
        req: UpdatePluginRequest,
    ) -> Result<InstalledPluginResult, agent_client_protocol::Error> {
        let install = crate::plugins::update_plugin(&req.name)
            .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?;
        Ok(install_to_result(install))
    }
}
```

- [ ] **Step 2: Dispatch arms** (custom_dispatch.rs)

```rust
    #[custom_method(ListInstalledPluginsRequest)]
    async fn dispatch_plugins_list(&self) -> Result<ListInstalledPluginsResponse, agent_client_protocol::Error> {
        self.on_plugins_list().await
    }
    #[custom_method(SetPluginEnabledRequest)]
    async fn dispatch_plugins_set_enabled(&self, req: SetPluginEnabledRequest) -> Result<EmptyResponse, agent_client_protocol::Error> {
        self.on_plugins_set_enabled(req).await
    }
    #[custom_method(UpdatePluginRequest)]
    async fn dispatch_plugins_update(&self, req: UpdatePluginRequest) -> Result<InstalledPluginResult, agent_client_protocol::Error> {
        self.on_plugins_update(req).await
    }
```

- [ ] **Step 3: Compile + clippy** — `cargo build -p goose --lib` + `cargo clippy -p goose -- -D warnings` → clean.

- [ ] **Step 4: Commit**

```bash
git add crates/goose/src/acp/server/marketplace.rs crates/goose/src/acp/server/custom_dispatch.rs
git commit -m "feat(acp): plugins list/set-enabled/update handlers"
```

---

### Task 6: Regenerate ACP schema + SDK

**Files:**
- Modify (generated): `crates/goose/acp-schema.json`, `crates/goose/acp-meta.json`, `ui/sdk/src/generated/*`

- [ ] **Step 1: Generate** — from repo root, with the user-local cmake on PATH (needed by the schema binary's feature set) and Node available:

```bash
export PATH="$HOME/.local/bin:$PATH"
just generate-acp-types
```

- [ ] **Step 2: Verify the new client methods exist**

Run: `grep -REn "marketplaceList_unstable|marketplaceInstall_unstable|pluginsList_unstable|pluginsSetEnabled_unstable" ui/sdk/src/generated`
Expected: matches present (camelCased from `_goose/unstable/marketplace/list` → `marketplaceList_unstable`, `.../plugins/set-enabled` → `pluginsSetEnabled_unstable`).

- [ ] **Step 3: check-acp-schema is clean after commit** — `just check-acp-schema` → "up-to-date" (run after staging).

- [ ] **Step 4: Commit generated files**

```bash
git add crates/goose/acp-schema.json crates/goose/acp-meta.json ui/sdk/src/generated
git commit -m "chore(acp): regenerate schema + SDK for marketplace/plugins methods"
```

---

### Task 7: TypeScript ACP wrappers

**Files:**
- Create: `ui/desktop/src/acp/marketplace.ts`
- Test: typecheck via `pnpm -C ui/desktop run lint:check` (tsc + eslint + i18n:check)

**Interfaces:**
- Consumes: generated `client.goose.<method>_unstable` from Task 6; `getAcpClient` from `./acpConnection`.
- Produces (consumed by Plan 2b): `listMarketplaces`, `addMarketplace`, `removeMarketplace`, `browseMarketplace`, `installMarketplacePlugin`, `listInstalledPlugins`, `setPluginEnabled`, `updatePlugin` and the TS types re-exported from `@aaif/goose-sdk`.

- [ ] **Step 1: Wrappers** (mirror `ui/desktop/src/acp/extensions.ts`; use the EXACT generated method names verified in Task 6 Step 2 — adjust casing if the generator differs)

```ts
import { getAcpClient } from './acpConnection';
import type {
  MarketplaceSourceInfo,
  CatalogPluginInfo,
  InstalledPluginInfo,
  InstalledPluginResult,
} from '@aaif/goose-sdk';

export async function listMarketplaces(): Promise<MarketplaceSourceInfo[]> {
  const client = await getAcpClient();
  const res = await client.goose.marketplaceList_unstable({});
  return res.marketplaces;
}

export async function addMarketplace(name: string, kind: string, location: string): Promise<void> {
  const client = await getAcpClient();
  await client.goose.marketplaceAdd_unstable({ name, kind, location });
}

export async function removeMarketplace(name: string): Promise<void> {
  const client = await getAcpClient();
  await client.goose.marketplaceRemove_unstable({ name });
}

export async function browseMarketplace(name: string): Promise<CatalogPluginInfo[]> {
  const client = await getAcpClient();
  const res = await client.goose.marketplaceBrowse_unstable({ name });
  return res.plugins;
}

export async function installMarketplacePlugin(
  marketplace: string,
  plugin: string,
  autoUpdate = false
): Promise<InstalledPluginResult> {
  const client = await getAcpClient();
  return await client.goose.marketplaceInstall_unstable({ marketplace, plugin, autoUpdate });
}

export async function listInstalledPlugins(): Promise<InstalledPluginInfo[]> {
  const client = await getAcpClient();
  const res = await client.goose.pluginsList_unstable({});
  return res.plugins;
}

export async function setPluginEnabled(name: string, enabled: boolean): Promise<void> {
  const client = await getAcpClient();
  await client.goose.pluginsSetEnabled_unstable({ name, enabled });
}

export async function updatePlugin(name: string): Promise<InstalledPluginResult> {
  const client = await getAcpClient();
  return await client.goose.pluginsUpdate_unstable({ name });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -C ui/desktop run lint:check`
Expected: passes (tsc finds the generated types + client methods; no eslint/i18n errors — this file adds no user-facing strings).

- [ ] **Step 3: Commit**

```bash
git add ui/desktop/src/acp/marketplace.ts
git commit -m "feat(desktop): ACP TS wrappers for marketplace + plugin management"
```

---

## Self-Review

**Spec coverage (backend portion):** sources CRUD → Task 4 (list/add/remove) ✅; browse → Task 4 ✅; install (clone-once + trust fields) → Task 4 (`InstalledPluginResult` carries skills/has_hooks/has_mcp/source) ✅; installed list/enable-disable/update → Tasks 1/2/5 ✅; ACP transport → Tasks 3–6 ✅; TS callable → Task 7 ✅. **UI itself (views, i18n, tests) → Plan 2b.**

**Placeholder scan:** none — every code step is complete. The two guarded notes (`.internal_err()` availability; generated method-name casing) instruct verification against a named real file, not blanks.

**Type consistency:** `InstalledPlugin` (Task 1) → `InstalledPluginInfo` (Task 3) mapping in Task 5 fields match; `PluginInstall` → `install_to_result` → `InstalledPluginResult` fields match Task 3; `PluginSource` variants in `source_kind_label`/`installable` match Plan-1 `catalog.rs`; method strings ↔ generated names verified in Task 6.

**Open verification points (baked into task steps):** `.internal_err()` trait scope (Task 4 note); exact generated client method casing (Task 6 Step 2 → Task 7); `Config::new` test-constructor signature (Tasks 1/2, precedented in `discovery.rs`).

**Follow-up:** Plan 2b (React `MarketplacesView` + `useMarketplace` + routing + i18n + vitest/Playwright) — write it against the generated SDK **after** 2a lands.
