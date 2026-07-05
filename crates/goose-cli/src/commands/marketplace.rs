use anyhow::{bail, Result};
use console::style;
use goose::marketplace::{
    fetch::{fetch_catalog, fetch_catalog_from_dir},
    install::install_catalog_plugin,
    registry::{add_marketplace, list_marketplaces, remove_marketplace},
    MarketplaceKind, MarketplaceSource, PluginSource,
};
use goose::plugins::PluginInstallOptions;

pub fn handle_add(location: &str, kind: MarketplaceKind, name: Option<String>) -> Result<()> {
    let name = name.unwrap_or_else(|| derive_name(location));
    add_marketplace(MarketplaceSource {
        name: name.clone(),
        kind,
        location: location.into(),
        enabled: true,
    })?;
    println!("{} Added marketplace '{}'", style("✓").green(), name);
    Ok(())
}

pub fn handle_list() -> Result<()> {
    let all = list_marketplaces()?;
    if all.is_empty() {
        println!("No marketplaces configured.");
        return Ok(());
    }
    for m in all {
        println!(
            "  {} [{}] {}{}",
            style(&m.name).bold(),
            m.kind_str(),
            m.location,
            if m.enabled { "" } else { " (disabled)" }
        );
    }
    Ok(())
}

pub fn handle_remove(name: &str) -> Result<()> {
    if remove_marketplace(name)? {
        println!("{} Removed '{}'", style("✓").green(), name);
    } else {
        bail!("Marketplace '{}' not found", name);
    }
    Ok(())
}

pub fn handle_browse(name: &str) -> Result<()> {
    let src = find(name)?;
    let plugins = fetch_catalog(&src)?;
    println!("{} plugins in '{}':", plugins.len(), name);
    for p in plugins {
        let installable = !matches!(p.source, goose::marketplace::PluginSource::Unsupported(_));
        println!(
            "  {} {}{}",
            if installable { "•" } else { "×" },
            style(&p.name).bold(),
            p.description.map(|d| format!(" — {d}")).unwrap_or_default()
        );
    }
    Ok(())
}

pub fn handle_install(marketplace: &str, plugin: &str, auto_update: bool) -> Result<()> {
    let src = find(marketplace)?;
    let tmp = tempfile::tempdir()?;
    // Katalog einmal beschaffen; RelativePath-Plugins nutzen dasselbe Checkout.
    goose::plugins::clone_marketplace_repo(&src.location, tmp.path())?;
    let plugins = fetch_catalog_from_dir(&src, tmp.path())?;
    let entry = plugins
        .into_iter()
        .find(|p| p.name == plugin)
        .ok_or_else(|| {
            anyhow::anyhow!("plugin '{}' not in marketplace '{}'", plugin, marketplace)
        })?;
    let source_location = describe_source(&entry.source);
    let install = install_catalog_plugin(&entry, tmp.path(), PluginInstallOptions { auto_update })?;
    println!(
        "{} Installed {} plugin '{}' ({})",
        style("✓").green(),
        install.format,
        style(&install.name).bold(),
        install.version
    );
    println!("    source: {marketplace} → {source_location}");
    if install.skills.is_empty() {
        println!("    skills: (none)");
    } else {
        println!("    skills:");
        for s in &install.skills {
            println!("      - {}", s.name);
        }
    }

    // Trust surface: a plugin may carry hooks (local shell commands) and MCP
    // servers, which run on your machine. Surface them and warn — non-interactive.
    let has_hooks = install.directory.join("hooks/hooks.json").is_file();
    let has_mcp = install.directory.join(".mcp.json").is_file();
    println!(
        "{} Review before use: plugins may include {} and {} — code that runs local shell commands and services on your machine.",
        style("⚠").yellow(),
        if has_hooks {
            style("hooks (present)").yellow().to_string()
        } else {
            "hooks".to_string()
        },
        if has_mcp {
            style("MCP servers (present)").yellow().to_string()
        } else {
            "MCP servers".to_string()
        },
    );
    println!("    installed at: {}", install.directory.display());
    Ok(())
}

/// Human-readable source location for the trust line printed on install
/// (marketplace name is printed separately by the caller).
fn describe_source(source: &PluginSource) -> String {
    match source {
        PluginSource::RelativePath(rel) => format!("{rel} (local to marketplace)"),
        PluginSource::GitSubdir { url, path, git_ref } => match git_ref {
            Some(r) => format!("{url} (subdir {path}, ref {r})"),
            None => format!("{url} (subdir {path})"),
        },
        PluginSource::Git { url, git_ref } => match git_ref {
            Some(r) => format!("{url} (ref {r})"),
            None => url.clone(),
        },
        PluginSource::Unsupported(reason) => format!("unsupported ({reason})"),
    }
}

fn find(name: &str) -> Result<MarketplaceSource> {
    list_marketplaces()?
        .into_iter()
        .find(|m| m.name == name)
        .ok_or_else(|| anyhow::anyhow!("Marketplace '{}' not found", name))
}

fn derive_name(location: &str) -> String {
    location
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("marketplace")
        .trim_end_matches(".git")
        .to_string()
}
