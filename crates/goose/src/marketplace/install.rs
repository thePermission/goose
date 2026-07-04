use crate::marketplace::catalog::{CatalogPlugin, PluginSource};
use crate::plugins::{self, PluginInstall, PluginInstallOptions};
use anyhow::{bail, Result};
use std::path::Path;

pub fn install_catalog_plugin(
    entry: &CatalogPlugin,
    marketplace_checkout: &Path,
    options: PluginInstallOptions,
) -> Result<PluginInstall> {
    install_catalog_plugin_at_root(
        entry,
        marketplace_checkout,
        options,
        &plugins::plugin_install_dir(),
    )
}

fn install_catalog_plugin_at_root(
    entry: &CatalogPlugin,
    marketplace_checkout: &Path,
    options: PluginInstallOptions,
    install_root: &Path,
) -> Result<PluginInstall> {
    let source_label = format!("{}:{}", entry.marketplace, entry.name);
    match &entry.source {
        PluginSource::RelativePath(rel) => {
            let dir = marketplace_checkout.join(rel.trim_start_matches("./"));
            if !dir.is_dir() {
                bail!("plugin path '{}' not found in marketplace", rel);
            }
            plugins::install_plugin_from_checkout_at_root(
                &dir,
                &source_label,
                options,
                install_root,
            )
        }
        PluginSource::GitSubdir { url, path, .. } => {
            let tmp = tempfile::tempdir()?;
            plugins::clone_marketplace_repo(url, tmp.path())?;
            let dir = tmp.path().join(path.trim_start_matches("./"));
            plugins::install_plugin_from_checkout_at_root(
                &dir,
                &source_label,
                options,
                install_root,
            )
        }
        PluginSource::Git { url, .. } => {
            let tmp = tempfile::tempdir()?;
            plugins::clone_marketplace_repo(url, tmp.path())?;
            plugins::install_plugin_from_checkout_at_root(
                tmp.path(),
                &source_label,
                options,
                install_root,
            )
        }
        PluginSource::Unsupported(reason) => {
            bail!("cannot install '{}': {}", entry.name, reason)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::marketplace::catalog::{CatalogPlugin, PluginSource};
    use crate::plugins::PluginInstallOptions;

    #[test]
    fn installs_relative_path_plugin_from_checkout() {
        let tmp = tempfile::tempdir().unwrap();
        let market = tmp.path().join("market");
        let plug = market.join("plugins/a");
        std::fs::create_dir_all(plug.join(".claude-plugin")).unwrap();
        std::fs::write(
            plug.join(".claude-plugin/plugin.json"),
            r#"{"name":"a","version":"1.0.0","description":"d"}"#,
        )
        .unwrap();
        std::fs::create_dir_all(plug.join("skills/s")).unwrap();
        std::fs::write(
            plug.join("skills/s/SKILL.md"),
            "---\nname: s\ndescription: d\n---\nb",
        )
        .unwrap();
        let install_root = tmp.path().join("install");

        let entry = CatalogPlugin {
            name: "a".into(),
            description: None,
            source: PluginSource::RelativePath("./plugins/a".into()),
            marketplace: "m".into(),
        };

        let install = install_catalog_plugin_at_root(
            &entry,
            &market,
            PluginInstallOptions::default(),
            &install_root,
        )
        .unwrap();
        assert_eq!(install.name, "a");
        assert_eq!(install.format, crate::plugins::PluginFormat::Claude);
    }

    #[test]
    fn unsupported_source_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let entry = CatalogPlugin {
            name: "n".into(),
            description: None,
            source: PluginSource::Unsupported("npm".into()),
            marketplace: "m".into(),
        };
        assert!(
            install_catalog_plugin_at_root(&entry, tmp.path(), Default::default(), tmp.path())
                .is_err()
        );
    }
}
