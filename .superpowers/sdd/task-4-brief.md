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

