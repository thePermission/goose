use crate::config::Config;
use crate::marketplace::MarketplaceSource;
use anyhow::{bail, Result};

const KEY: &str = "marketplaces";

pub fn list_marketplaces() -> Result<Vec<MarketplaceSource>> {
    list_marketplaces_with_config(Config::global())
}

pub fn list_marketplaces_with_config(config: &Config) -> Result<Vec<MarketplaceSource>> {
    match config.get_param::<Vec<MarketplaceSource>>(KEY) {
        Ok(v) => Ok(v),
        Err(_) => Ok(Vec::new()), // Key nicht gesetzt -> leer
    }
}

pub fn add_marketplace_with_config(config: &Config, src: MarketplaceSource) -> Result<()> {
    let mut all = list_marketplaces_with_config(config)?;
    if all.iter().any(|m| m.name == src.name) {
        bail!("Marketplace '{}' already exists", src.name);
    }
    all.push(src);
    config.set_param(KEY, serde_json::to_value(&all)?)?;
    Ok(())
}

pub fn add_marketplace(src: MarketplaceSource) -> Result<()> {
    add_marketplace_with_config(Config::global(), src)
}

pub fn remove_marketplace_with_config(config: &Config, name: &str) -> Result<bool> {
    let mut all = list_marketplaces_with_config(config)?;
    let before = all.len();
    all.retain(|m| m.name != name);
    let removed = all.len() != before;
    config.set_param(KEY, serde_json::to_value(&all)?)?;
    Ok(removed)
}

pub fn remove_marketplace(name: &str) -> Result<bool> {
    remove_marketplace_with_config(Config::global(), name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use crate::marketplace::MarketplaceKind;

    fn temp_config() -> Config {
        let tmp = tempfile::tempdir().unwrap();
        Config::new(tmp.path().join("config.yaml"), "test-key").unwrap()
    }

    #[test]
    fn add_list_remove_roundtrip() {
        let cfg = temp_config();
        assert!(list_marketplaces_with_config(&cfg).unwrap().is_empty());

        add_marketplace_with_config(
            &cfg,
            MarketplaceSource {
                name: "anthropic".into(),
                kind: MarketplaceKind::Claude,
                location: "https://github.com/anthropics/claude-plugins-official.git".into(),
                enabled: true,
            },
        )
        .unwrap();

        let all = list_marketplaces_with_config(&cfg).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].name, "anthropic");

        assert!(remove_marketplace_with_config(&cfg, "anthropic").unwrap());
        assert!(list_marketplaces_with_config(&cfg).unwrap().is_empty());
    }

    #[test]
    fn add_duplicate_name_is_error() {
        let cfg = temp_config();
        let src = MarketplaceSource {
            name: "x".into(),
            kind: MarketplaceKind::Codex,
            location: "l".into(),
            enabled: true,
        };
        add_marketplace_with_config(&cfg, src.clone()).unwrap();
        assert!(add_marketplace_with_config(&cfg, src).is_err());
    }
}
