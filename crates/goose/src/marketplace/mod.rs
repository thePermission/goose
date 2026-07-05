pub mod catalog;
pub mod fetch;
pub mod install;
pub mod registry;

pub use catalog::{CatalogPlugin, PluginSource};
pub use install::install_catalog_plugin;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, clap::ValueEnum)]
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

impl MarketplaceSource {
    /// Lowercase, stable string form of `kind` for display purposes (e.g. CLI `marketplace list`).
    pub fn kind_str(&self) -> &'static str {
        match self.kind {
            MarketplaceKind::Claude => "claude",
            MarketplaceKind::Codex => "codex",
        }
    }
}

fn default_true() -> bool {
    true
}
