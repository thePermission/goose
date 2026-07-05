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

/// Look up a configured marketplace by name, or return an `invalid_params` error.
fn find_marketplace(name: &str) -> Result<MarketplaceSource, agent_client_protocol::Error> {
    crate::marketplace::registry::list_marketplaces()
        .internal_err()?
        .into_iter()
        .find(|m| m.name == name)
        .ok_or_else(|| {
            agent_client_protocol::Error::invalid_params()
                .data(format!("marketplace '{name}' not found"))
        })
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
                    kind: m.kind.kind_str().to_string(),
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
        let src = find_marketplace(&req.name)?;
        // `fetch_catalog` shells out to `git`, which blocks the thread; keep it off the
        // async executor so it doesn't stall the whole ACP connection.
        let plugins =
            tokio::task::spawn_blocking(move || crate::marketplace::fetch::fetch_catalog(&src))
                .await
                .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?
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
        let src = find_marketplace(&req.marketplace)?;
        let marketplace_name = req.marketplace;
        let plugin_name = req.plugin;
        let auto_update = req.auto_update;
        // The whole clone -> fetch -> install sequence shells out to `git` and touches the
        // filesystem, so run it as one unit on the blocking pool. The `TempDir` is created
        // and dropped inside the closure so the checkout stays alive until install finishes.
        let install = tokio::task::spawn_blocking(move || {
            let tmp = tempfile::tempdir()
                .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?;
            crate::plugins::clone_marketplace_repo(&src.location, tmp.path())
                .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?;
            let entry = crate::marketplace::fetch::fetch_catalog_from_dir(&src, tmp.path())
                .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?
                .into_iter()
                .find(|p| p.name == plugin_name)
                .ok_or_else(|| {
                    agent_client_protocol::Error::invalid_params().data(format!(
                        "plugin '{plugin_name}' not found in marketplace '{marketplace_name}'"
                    ))
                })?;
            crate::marketplace::install::install_catalog_plugin(
                &entry,
                tmp.path(),
                crate::plugins::PluginInstallOptions { auto_update },
            )
            .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))
        })
        .await
        .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))??;
        Ok(install_to_result(install))
    }

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
        let name = req.name;
        // `update_plugin` shells out to `git`; keep it off the async executor.
        let install = tokio::task::spawn_blocking(move || crate::plugins::update_plugin(&name))
            .await
            .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?
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
