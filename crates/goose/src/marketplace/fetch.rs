use crate::marketplace::catalog::{
    parse_claude_marketplace, parse_codex_marketplace, CatalogPlugin,
};
use crate::marketplace::{MarketplaceKind, MarketplaceSource};
use crate::plugins; // clone helper wiederverwenden (siehe clone_marketplace_repo)
use anyhow::{Context, Result};
use std::path::Path;

pub fn fetch_catalog(src: &MarketplaceSource) -> Result<Vec<CatalogPlugin>> {
    let tmp = tempfile::tempdir()?;
    plugins::clone_marketplace_repo(&src.location, tmp.path())
        .with_context(|| format!("cloning marketplace '{}'", src.name))?;
    fetch_catalog_from_dir(src, tmp.path())
}

pub fn fetch_catalog_from_dir(src: &MarketplaceSource, dir: &Path) -> Result<Vec<CatalogPlugin>> {
    let manifest = resolve_manifest_path(src.kind, dir);
    let json = std::fs::read_to_string(&manifest)
        .with_context(|| format!("reading {}", manifest.display()))?;
    match src.kind {
        MarketplaceKind::Claude => parse_claude_marketplace(&json, &src.name),
        MarketplaceKind::Codex => parse_codex_marketplace(&json, &src.name),
    }
}

/// Resolve the marketplace manifest path for a given kind, falling back to the
/// bare `<dir>/marketplace.json` layout when the kind-specific file is absent.
///
/// Real repository layouts differ by kind:
/// - Claude: `<dir>/.claude-plugin/marketplace.json`
/// - Codex:  `<dir>/.agents/plugins/marketplace.json`
fn resolve_manifest_path(kind: MarketplaceKind, dir: &Path) -> std::path::PathBuf {
    let kind_specific = match kind {
        MarketplaceKind::Claude => dir.join(".claude-plugin").join("marketplace.json"),
        MarketplaceKind::Codex => dir.join(".agents").join("plugins").join("marketplace.json"),
    };
    if kind_specific.is_file() {
        kind_specific
    } else {
        dir.join("marketplace.json")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::marketplace::{MarketplaceKind, MarketplaceSource};

    fn write(dir: &Path, rel: &str, contents: &str) {
        let path = dir.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, contents).unwrap();
    }

    const CLAUDE_MANIFEST: &str = r#"{"name":"m","owner":{"name":"o"},"plugins":[
               {"name":"a","source":"./plugins/a"}]}"#;
    const CODEX_MANIFEST: &str = r#"{"name":"m","plugins":[
               {"name":"a","source":{"source":"local","path":"./plugins/a"}}]}"#;

    fn src(kind: MarketplaceKind) -> MarketplaceSource {
        MarketplaceSource {
            name: "m".into(),
            kind,
            location: "ignored".into(),
            enabled: true,
        }
    }

    #[test]
    fn fetches_and_parses_from_dir_fallback() {
        // Legacy / fallback layout: bare <dir>/marketplace.json.
        let tmp = tempfile::tempdir().unwrap();
        write(tmp.path(), "marketplace.json", CLAUDE_MANIFEST);

        let plugins = fetch_catalog_from_dir(&src(MarketplaceKind::Claude), tmp.path()).unwrap();
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].name, "a");
    }

    #[test]
    fn fetches_from_claude_plugin_dir() {
        // Real Claude layout: <dir>/.claude-plugin/marketplace.json.
        let tmp = tempfile::tempdir().unwrap();
        write(
            tmp.path(),
            ".claude-plugin/marketplace.json",
            CLAUDE_MANIFEST,
        );

        let plugins = fetch_catalog_from_dir(&src(MarketplaceKind::Claude), tmp.path()).unwrap();
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].name, "a");
    }

    #[test]
    fn fetches_from_codex_agents_plugins_dir() {
        // Real Codex layout: <dir>/.agents/plugins/marketplace.json.
        let tmp = tempfile::tempdir().unwrap();
        write(
            tmp.path(),
            ".agents/plugins/marketplace.json",
            CODEX_MANIFEST,
        );

        let plugins = fetch_catalog_from_dir(&src(MarketplaceKind::Codex), tmp.path()).unwrap();
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].name, "a");
    }
}
