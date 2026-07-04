pub mod catalog;
pub mod fetch;
pub mod install;
pub mod registry;

pub use catalog::{CatalogPlugin, PluginSource};
pub use install::install_catalog_plugin;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MarketplaceKind {
    Claude,
    Codex,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarketplaceSource {
    pub name: String,
    pub kind: MarketplaceKind,
    pub location: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}
