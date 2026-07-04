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
    let manifest = dir.join("marketplace.json");
    let json = std::fs::read_to_string(&manifest)
        .with_context(|| format!("reading {}", manifest.display()))?;
    match src.kind {
        MarketplaceKind::Claude => parse_claude_marketplace(&json, &src.name),
        MarketplaceKind::Codex => parse_codex_marketplace(&json, &src.name),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::marketplace::{MarketplaceKind, MarketplaceSource};

    #[test]
    fn fetches_and_parses_from_dir() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(
            tmp.path().join("marketplace.json"),
            r#"{"name":"m","owner":{"name":"o"},"plugins":[
               {"name":"a","source":"./plugins/a"}]}"#,
        )
        .unwrap();
        let src = MarketplaceSource {
            name: "m".into(),
            kind: MarketplaceKind::Claude,
            location: "ignored".into(),
            enabled: true,
        };

        let plugins = fetch_catalog_from_dir(&src, tmp.path()).unwrap();
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].name, "a");
    }
}
