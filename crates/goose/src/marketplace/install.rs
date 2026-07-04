use crate::marketplace::catalog::{CatalogPlugin, PluginSource};
use crate::plugins::{self, PluginInstall, PluginInstallOptions};
use anyhow::{bail, Result};
use std::path::{Component, Path, PathBuf};

/// Join a plugin-relative source path onto a trusted base, rejecting anything
/// that could escape it. A marketplace manifest is untrusted input, so an
/// absolute path or any `..` component (which could point outside the checkout,
/// e.g. into the user's home directory) is refused.
fn safe_join(base: &Path, rel: &str) -> Result<PathBuf> {
    let trimmed = rel.trim_start_matches("./");
    let candidate = Path::new(trimmed);
    if candidate.is_absolute() {
        bail!("plugin source path must be relative, not absolute: '{rel}'");
    }
    if candidate.components().any(|c| {
        matches!(
            c,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        bail!("plugin source path must not escape the marketplace (contains '..'): '{rel}'");
    }
    Ok(base.join(candidate))
}

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
            let dir = safe_join(marketplace_checkout, rel)?;
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
        PluginSource::GitSubdir { url, path, git_ref } => {
            let tmp = tempfile::tempdir()?;
            plugins::clone_marketplace_repo_ref(url, tmp.path(), git_ref.as_deref())?;
            let dir = safe_join(tmp.path(), path)?;
            plugins::install_plugin_from_checkout_at_root(
                &dir,
                &source_label,
                options,
                install_root,
            )
        }
        PluginSource::Git { url, git_ref } => {
            let tmp = tempfile::tempdir()?;
            plugins::clone_marketplace_repo_ref(url, tmp.path(), git_ref.as_deref())?;
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

    /// Build a valid plugin at `dir` so that, absent a traversal guard, an
    /// escaping source path would actually install (making the guard the only
    /// thing that turns this into an error).
    fn write_valid_plugin(dir: &Path) {
        std::fs::create_dir_all(dir.join(".claude-plugin")).unwrap();
        std::fs::write(
            dir.join(".claude-plugin/plugin.json"),
            r#"{"name":"evil","version":"1.0.0","description":"d"}"#,
        )
        .unwrap();
        std::fs::create_dir_all(dir.join("skills/s")).unwrap();
        std::fs::write(
            dir.join("skills/s/SKILL.md"),
            "---\nname: s\ndescription: d\n---\nb",
        )
        .unwrap();
    }

    #[test]
    fn rejects_parent_dir_traversal_in_relative_path() {
        let tmp = tempfile::tempdir().unwrap();
        let market = tmp.path().join("market");
        std::fs::create_dir_all(&market).unwrap();
        // A real, installable plugin OUTSIDE the marketplace checkout.
        write_valid_plugin(&tmp.path().join("evil"));
        let install_root = tmp.path().join("install");

        let entry = CatalogPlugin {
            name: "evil".into(),
            description: None,
            source: PluginSource::RelativePath("../evil".into()),
            marketplace: "m".into(),
        };

        let err = install_catalog_plugin_at_root(
            &entry,
            &market,
            PluginInstallOptions::default(),
            &install_root,
        )
        .unwrap_err();
        assert!(
            err.to_string().contains("escape") || err.to_string().contains(".."),
            "expected traversal rejection, got: {err}"
        );
    }

    #[test]
    fn rejects_absolute_relative_path() {
        let tmp = tempfile::tempdir().unwrap();
        let market = tmp.path().join("market");
        std::fs::create_dir_all(&market).unwrap();
        let evil = tmp.path().join("evil");
        write_valid_plugin(&evil);
        let install_root = tmp.path().join("install");

        let entry = CatalogPlugin {
            name: "evil".into(),
            description: None,
            source: PluginSource::RelativePath(evil.to_string_lossy().into_owned()),
            marketplace: "m".into(),
        };

        assert!(
            install_catalog_plugin_at_root(
                &entry,
                &market,
                PluginInstallOptions::default(),
                &install_root,
            )
            .is_err(),
            "absolute source path must be rejected"
        );
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
