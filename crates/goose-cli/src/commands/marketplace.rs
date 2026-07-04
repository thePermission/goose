use anyhow::{bail, Result};
use console::style;
use goose::marketplace::{
    fetch::{fetch_catalog, fetch_catalog_from_dir},
    install::install_catalog_plugin,
    registry::{add_marketplace, list_marketplaces, remove_marketplace},
    MarketplaceKind, MarketplaceSource,
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
    let install = install_catalog_plugin(&entry, tmp.path(), PluginInstallOptions { auto_update })?;
    println!(
        "{} Installed {} plugin '{}' ({})",
        style("✓").green(),
        install.format,
        style(&install.name).bold(),
        install.version
    );
    for s in &install.skills {
        println!("    - {}", s.name);
    }
    Ok(())
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
