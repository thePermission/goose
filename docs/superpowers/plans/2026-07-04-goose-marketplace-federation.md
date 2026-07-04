# Marketplace-Föderation & -Verwaltung — Implementation Plan (Plan 1: Rust-Kern + CLI)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** goose kann Marketplace-Quellen (Claude/Codex) registrieren, deren Plugin-Kataloge durchsuchen und ausgewählte Plugins installieren — vollständig über die CLI.

**Architecture:** Neues `goose::marketplace`-Modul (Registry in `config.yaml`, Katalog-Provider für Claude/Codex, Install-Bridge) über der **bestehenden** `goose::plugins`-Installationsmaschinerie. Claude/Codex-*Plugins* werden vom vorhandenen `open_plugins`-Adapter importiert (erweitert um deren Manifest-Pfade), d. h. Skills/Hooks/MCP-Import wird wiederverwendet, nicht neu gebaut.

**Tech Stack:** Rust (workspace crates `goose`, `goose-cli`), `serde`/`serde_json`, `anyhow`, `clap`, `git` (via bestehendem `clone_git_repo`).

## Global Constraints

- Sprache im Repo folgt goose-Konventionen; öffentliche Doku-Strings englisch.
- **Persistenz der Registry: `config.yaml` über `Config` (schreibbar).** `settings.json` wird von goose nur gelesen — nicht dafür verwenden.
- **Keine Netzwerkzugriffe in Unit-/Integrationstests** — ausschließlich lokale Fixture-Verzeichnisse/-Repos.
- **v1-Scope:** Import beschränkt auf **Skills + Hooks + MCP-Server**. Slash-Commands/Subagenten werden erkannt und im Katalog *angezeigt*, aber **nicht** importiert.
- **v1-Source-Typen:** `relative path`, `git-subdir`, `github`, `url` (git). `npm` und `local`(absolut) → klarer Fehler „not supported in v1".
- Plugin-Namespacing (`plugin:skill`), Auto-Update und `disabledPlugins` bleiben unverändert nutzbar (kommen automatisch über die bestehende Maschinerie).
- Testkommandos: `cargo test -p goose <pfad>` bzw. `cargo test -p goose-cli <pfad>` (Ausführung im Repo-Root `/home/sascha/Projects/corporategoose/goose-marketplace`).

**Deviation-Log ggü. Spec (bewusst):** (1) Registry in `config.yaml` statt `settings.json`. (2) Claude/Codex-Plugin-*Install* über erweiterten `open_plugins`-Adapter statt zweier Voll-Adapter (DRY). (3) Desktop-UI ausgelagert in Folge-Plan 2, da heute kein Plugin-HTTP-Seam existiert.

---

### Task 1: Claude/Codex-Plugins installierbar machen (`PluginFormat` + `open_plugins`-Manifeste)

Claude-Plugins tragen `.claude-plugin/plugin.json`, Codex-Plugins `.codex-plugin/plugin.json`; Skills/Hooks/MCP-Layout ist identisch zu `open_plugins`. Wir erweitern die Manifest-Liste und leiten das Format-Label aus dem gefundenen Manifest ab.

**Files:**
- Modify: `crates/goose/src/plugins/mod.rs:19-32` (`PluginFormat` + `Display`)
- Modify: `crates/goose/src/plugins/formats/open_plugins.rs:14-33` (`MANIFESTS`), `install_from_manifest` (68-126) und `manifest_path`
- Test: `crates/goose/src/plugins/formats/open_plugins.rs` (`#[cfg(test)]`-Modul, gleiche Datei)

**Interfaces:**
- Produces: `PluginFormat::Claude`, `PluginFormat::Codex`; `open_plugins::try_install_from_manifest_at_root` importiert nun auch `.claude-plugin`/`.codex-plugin`-Plugins und setzt `PluginInstall.format` entsprechend.

- [ ] **Step 1: Failing-Test — Claude-Plugin-Verzeichnis installieren**

In `crates/goose/src/plugins/formats/open_plugins.rs` im Test-Modul:

```rust
#[test]
fn installs_claude_plugin_and_labels_format() {
    let tmp = tempfile::tempdir().unwrap();
    let checkout = tmp.path().join("checkout");
    std::fs::create_dir_all(checkout.join(".claude-plugin")).unwrap();
    std::fs::write(
        checkout.join(".claude-plugin/plugin.json"),
        r#"{"name":"quality","version":"1.0.0","description":"d"}"#,
    ).unwrap();
    std::fs::create_dir_all(checkout.join("skills/review")).unwrap();
    std::fs::write(
        checkout.join("skills/review/SKILL.md"),
        "---\nname: review\ndescription: r\n---\nbody",
    ).unwrap();
    let root = tmp.path().join("install");

    let install = try_install_from_manifest_at_root(
        "https://example/x.git", &checkout, &root,
        &crate::plugins::PluginInstallOptions::default(), None,
    ).unwrap();

    assert_eq!(install.format, crate::plugins::PluginFormat::Claude);
    assert_eq!(install.skills.len(), 1);
    assert_eq!(install.skills[0].name, "quality:review");
}
```

- [ ] **Step 2: Test schlägt fehl**

Run: `cargo test -p goose plugins::formats::open_plugins::installs_claude_plugin -- --nocapture`
Expected: FAIL (`PluginFormat::Claude` existiert nicht / Manifest nicht erkannt).

- [ ] **Step 3: `PluginFormat` erweitern** (`crates/goose/src/plugins/mod.rs:19-32`)

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PluginFormat {
    Gemini,
    OpenPlugins,
    Claude,
    Codex,
}

impl std::fmt::Display for PluginFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PluginFormat::Gemini => write!(f, "gemini"),
            PluginFormat::OpenPlugins => write!(f, "open-plugins"),
            PluginFormat::Claude => write!(f, "claude"),
            PluginFormat::Codex => write!(f, "codex"),
        }
    }
}
```

- [ ] **Step 4: Manifeste + Format-Ableitung in `open_plugins.rs`**

`MANIFESTS` (Zeile ~14) erweitern und Reihenfolge beibehalten (spezifische zuerst):

```rust
const MANIFESTS: [&str; 5] = [
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
    ".goose-plugin/plugin.json",
    ".plugin/plugin.json",
    "plugin.json",
];
```

Hilfsfunktion neben `manifest_path` ergänzen und in `install_from_manifest` (statt hartem `PluginFormat::OpenPlugins`) verwenden:

```rust
fn format_for_manifest(checkout_dir: &Path) -> PluginFormat {
    if checkout_dir.join(".claude-plugin/plugin.json").is_file() {
        PluginFormat::Claude
    } else if checkout_dir.join(".codex-plugin/plugin.json").is_file() {
        PluginFormat::Codex
    } else {
        PluginFormat::OpenPlugins
    }
}
```

In `install_from_manifest` das `Ok(PluginInstall { .. format: PluginFormat::OpenPlugins .. })` ersetzen durch `format: format_for_manifest(checkout_dir),`.

- [ ] **Step 5: Test grün + bestehende Format-Tests**

Run: `cargo test -p goose plugins::formats::open_plugins`
Expected: PASS (inkl. bisheriger Tests).

- [ ] **Step 6: Analoger Codex-Test + Commit**

Zusätzlicher Test mit `.codex-plugin/plugin.json` (erwartet `PluginFormat::Codex`). Dann:

```bash
git add crates/goose/src/plugins/mod.rs crates/goose/src/plugins/formats/open_plugins.rs
git commit -m "feat(plugins): install Claude/Codex plugins via open_plugins adapter"
```

---

### Task 2: Öffentliche Install-Bridge `install_plugin_from_checkout`

Marketplace-Plugins liegen oft als **Unterverzeichnis** eines Marketplace-Repos. Wir brauchen einen öffentlichen Einstieg, der ein bereits ausgechecktes Verzeichnis installiert (statt selbst zu klonen).

**Files:**
- Modify: `crates/goose/src/plugins/mod.rs` (neue `pub fn`, delegiert an bestehendes privates `install_from_checkout_at_root`)
- Test: `crates/goose/src/plugins/mod.rs` (`#[cfg(test)]`)

**Interfaces:**
- Consumes (Task 7): `install_plugin_from_checkout(checkout_dir: &Path, source: &str, options: PluginInstallOptions) -> Result<PluginInstall>` und die `_at_root`-Variante für Tests.

- [ ] **Step 1: Failing-Test**

```rust
#[test]
fn installs_plugin_from_existing_checkout() {
    let tmp = tempfile::tempdir().unwrap();
    let checkout = tmp.path().join("co");
    std::fs::create_dir_all(&checkout).unwrap();
    std::fs::write(checkout.join("plugin.json"),
        r#"{"name":"p","version":"1.0.0","description":"d"}"#).unwrap();
    std::fs::create_dir_all(checkout.join("skills/s")).unwrap();
    std::fs::write(checkout.join("skills/s/SKILL.md"),
        "---\nname: s\ndescription: d\n---\nb").unwrap();
    let root = tmp.path().join("root");

    let install = install_plugin_from_checkout_at_root(
        &checkout, "mysource", PluginInstallOptions::default(), &root,
    ).unwrap();
    assert_eq!(install.name, "p");
    assert_eq!(install.source, "mysource");
}
```

- [ ] **Step 2: Test schlägt fehl**

Run: `cargo test -p goose plugins::installs_plugin_from_existing_checkout`
Expected: FAIL (Funktion fehlt).

- [ ] **Step 3: Implementieren** (in `crates/goose/src/plugins/mod.rs`, nahe `install_plugin_with_options`)

```rust
pub fn install_plugin_from_checkout(
    checkout_dir: &Path,
    source: &str,
    options: PluginInstallOptions,
) -> Result<PluginInstall> {
    install_plugin_from_checkout_at_root(checkout_dir, source, options, &plugin_install_dir())
}

fn install_plugin_from_checkout_at_root(
    checkout_dir: &Path,
    source: &str,
    options: PluginInstallOptions,
    install_root: &Path,
) -> Result<PluginInstall> {
    install_from_checkout_at_root(source, checkout_dir, install_root, &options, None)
}
```

- [ ] **Step 4: Test grün**

Run: `cargo test -p goose plugins::installs_plugin_from_existing_checkout`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/goose/src/plugins/mod.rs
git commit -m "feat(plugins): add install_plugin_from_checkout public entrypoint"
```

---

### Task 3: `marketplace`-Modul + Registry (CRUD über `config.yaml`)

**Files:**
- Create: `crates/goose/src/marketplace/mod.rs`
- Create: `crates/goose/src/marketplace/registry.rs`
- Modify: `crates/goose/src/lib.rs` (`pub mod marketplace;` ergänzen)
- Test: `crates/goose/src/marketplace/registry.rs` (`#[cfg(test)]`)

**Interfaces:**
- Produces: `MarketplaceKind { Claude, Codex }`; `MarketplaceSource { name, kind, location, enabled }`; `add_marketplace(MarketplaceSource)`, `list_marketplaces() -> Vec<MarketplaceSource>`, `remove_marketplace(&str) -> bool`, jeweils plus `_with_config(&Config, ...)`-Variante für Tests.

- [ ] **Step 1: Config-API bestätigen**

Öffne `crates/goose/src/config/base.rs` und notiere die exakten Signaturen von `Config::global`, `get_param`, `set_param` (in `discovery.rs` verwendet als `config.get_param(KEY)` / `config.set_param(...)`). Die folgenden Schritte nutzen: `config.get_param::<Vec<MarketplaceSource>>(KEY) -> Result<...>` und `config.set_param(KEY, serde_json::Value) -> Result<()>`. Falls die Signaturen abweichen, in Step 3/4 exakt daran anpassen.

- [ ] **Step 2: Failing-Test** (`registry.rs`)

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;

    fn temp_config() -> Config {
        let tmp = tempfile::tempdir().unwrap();
        Config::new(tmp.path().join("config.yaml"), "test-key").unwrap()
    }

    #[test]
    fn add_list_remove_roundtrip() {
        let cfg = temp_config();
        assert!(list_marketplaces_with_config(&cfg).unwrap().is_empty());

        add_marketplace_with_config(&cfg, MarketplaceSource {
            name: "anthropic".into(),
            kind: MarketplaceKind::Claude,
            location: "https://github.com/anthropics/claude-plugins-official.git".into(),
            enabled: true,
        }).unwrap();

        let all = list_marketplaces_with_config(&cfg).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].name, "anthropic");

        assert!(remove_marketplace_with_config(&cfg, "anthropic").unwrap());
        assert!(list_marketplaces_with_config(&cfg).unwrap().is_empty());
    }

    #[test]
    fn add_duplicate_name_is_error() {
        let cfg = temp_config();
        let src = MarketplaceSource { name: "x".into(), kind: MarketplaceKind::Codex,
            location: "l".into(), enabled: true };
        add_marketplace_with_config(&cfg, src.clone()).unwrap();
        assert!(add_marketplace_with_config(&cfg, src).is_err());
    }
}
```

> Falls `Config::new` eine andere Konstruktor-Signatur hat (in Step 1 geprüft), Test-Helper entsprechend anpassen.

- [ ] **Step 3: Test schlägt fehl**

Run: `cargo test -p goose marketplace::registry`
Expected: FAIL (Modul/Typen fehlen).

- [ ] **Step 4: `mod.rs` — Typen** (`crates/goose/src/marketplace/mod.rs`)

```rust
pub mod registry;

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

fn default_true() -> bool { true }
```

- [ ] **Step 5: `registry.rs` — CRUD**

```rust
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
```

`crate::marketplace` in `crates/goose/src/lib.rs` als `pub mod marketplace;` registrieren.

- [ ] **Step 6: Test grün + Commit**

Run: `cargo test -p goose marketplace::registry`
Expected: PASS.

```bash
git add crates/goose/src/marketplace/ crates/goose/src/lib.rs
git commit -m "feat(marketplace): registry CRUD persisted in config.yaml"
```

---

### Task 4: Katalog-Modell + Claude-Provider (`marketplace.json` parsen)

**Files:**
- Create: `crates/goose/src/marketplace/catalog.rs`
- Modify: `crates/goose/src/marketplace/mod.rs` (`pub mod catalog;` + Re-Export)
- Test: `crates/goose/src/marketplace/catalog.rs` (`#[cfg(test)]`)

**Interfaces:**
- Produces: `CatalogPlugin { name, description, source: PluginSource, marketplace }`; `PluginSource { RelativePath(String), GitSubdir{url,path,git_ref}, Git{url,git_ref}, Unsupported(String) }`; `parse_claude_marketplace(json: &str, marketplace_name: &str) -> Result<Vec<CatalogPlugin>>`.

- [ ] **Step 1: Failing-Test** (`catalog.rs`) mit echtem Claude-Schema

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const CLAUDE: &str = r#"{
      "name": "company-tools",
      "owner": { "name": "Team" },
      "metadata": { "pluginRoot": "./plugins" },
      "plugins": [
        { "name": "formatter", "source": "formatter", "description": "fmt" },
        { "name": "deploy", "source": { "source": "github", "repo": "company/deploy-plugin" } },
        { "name": "mono", "source": { "source": "git-subdir",
          "url": "https://github.com/acme/monorepo.git", "path": "tools/claude-plugin" } },
        { "name": "npmpkg", "source": { "source": "npm", "package": "x" } }
      ]
    }"#;

    #[test]
    fn parses_claude_sources() {
        let plugins = parse_claude_marketplace(CLAUDE, "company-tools").unwrap();
        assert_eq!(plugins.len(), 4);
        assert_eq!(plugins[0].source, PluginSource::RelativePath("./plugins/formatter".into()));
        assert!(matches!(plugins[1].source, PluginSource::Git { .. }));
        assert!(matches!(plugins[2].source, PluginSource::GitSubdir { .. }));
        assert!(matches!(plugins[3].source, PluginSource::Unsupported(_)));
        assert_eq!(plugins[0].marketplace, "company-tools");
    }
}
```

- [ ] **Step 2: Test schlägt fehl**

Run: `cargo test -p goose marketplace::catalog::tests::parses_claude_sources`
Expected: FAIL.

- [ ] **Step 3: Katalog-Typen + Claude-Parser** (`catalog.rs`)

```rust
use anyhow::Result;
use serde::Deserialize;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PluginSource {
    RelativePath(String),
    GitSubdir { url: String, path: String, git_ref: Option<String> },
    Git { url: String, git_ref: Option<String> },
    Unsupported(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogPlugin {
    pub name: String,
    pub description: Option<String>,
    pub source: PluginSource,
    pub marketplace: String,
}

// ---- Claude marketplace.json ----
#[derive(Debug, Deserialize)]
struct ClaudeMarketplace {
    #[serde(default)]
    metadata: Option<ClaudeMeta>,
    #[serde(default)]
    plugins: Vec<ClaudePlugin>,
}
#[derive(Debug, Deserialize)]
struct ClaudeMeta { #[serde(rename = "pluginRoot")] plugin_root: Option<String> }
#[derive(Debug, Deserialize)]
struct ClaudePlugin {
    name: String,
    #[serde(default)]
    description: Option<String>,
    source: ClaudeSource,
}
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ClaudeSource {
    Path(String),
    Object(ClaudeSourceObj),
}
#[derive(Debug, Deserialize)]
struct ClaudeSourceObj {
    source: String,           // "github" | "url" | "git-subdir" | "npm" | "local"
    #[serde(default)] repo: Option<String>,
    #[serde(default)] url: Option<String>,
    #[serde(default)] path: Option<String>,
    #[serde(default)] r#ref: Option<String>,
    #[serde(default)] sha: Option<String>,
}

pub fn parse_claude_marketplace(json: &str, marketplace_name: &str) -> Result<Vec<CatalogPlugin>> {
    let doc: ClaudeMarketplace = serde_json::from_str(json)?;
    let root = doc.metadata.and_then(|m| m.plugin_root)
        .unwrap_or_else(|| ".".to_string());
    Ok(doc.plugins.into_iter().map(|p| {
        let source = match p.source {
            ClaudeSource::Path(rel) => PluginSource::RelativePath(join_rel(&root, &rel)),
            ClaudeSource::Object(o) => map_claude_object(o),
        };
        CatalogPlugin { name: p.name, description: p.description, source,
            marketplace: marketplace_name.to_string() }
    }).collect())
}

fn map_claude_object(o: ClaudeSourceObj) -> PluginSource {
    let git_ref = o.sha.or(o.r#ref);
    match o.source.as_str() {
        "github" => match o.repo {
            Some(repo) => PluginSource::Git { url: format!("https://github.com/{repo}.git"), git_ref },
            None => PluginSource::Unsupported("github without repo".into()),
        },
        "url" => match o.url {
            Some(url) => PluginSource::Git { url, git_ref },
            None => PluginSource::Unsupported("url without url".into()),
        },
        "git-subdir" => match (o.url, o.path) {
            (Some(url), Some(path)) => PluginSource::GitSubdir { url, path, git_ref },
            _ => PluginSource::Unsupported("git-subdir missing url/path".into()),
        },
        other => PluginSource::Unsupported(format!("source type '{other}' not supported in v1")),
    }
}

fn join_rel(root: &str, rel: &str) -> String {
    let rel = rel.trim_start_matches("./");
    let root = root.trim_end_matches('/');
    if root == "." || root.is_empty() { format!("./{rel}") } else { format!("{root}/{rel}") }
}
```

`mod.rs`: `pub mod catalog;` und `pub use catalog::{CatalogPlugin, PluginSource};`.

- [ ] **Step 4: Test grün + Commit**

Run: `cargo test -p goose marketplace::catalog`
Expected: PASS.

```bash
git add crates/goose/src/marketplace/
git commit -m "feat(marketplace): catalog model + Claude marketplace.json parser"
```

---

### Task 5: Codex-Provider (`marketplace.json` mit `source`-Objekten)

**Files:**
- Modify: `crates/goose/src/marketplace/catalog.rs` (Codex-Parser + Tests)

**Interfaces:**
- Produces: `parse_codex_marketplace(json: &str, marketplace_name: &str) -> Result<Vec<CatalogPlugin>>` (liefert dieselben `CatalogPlugin`/`PluginSource`).

- [ ] **Step 1: Failing-Test** mit echtem Codex-Schema

```rust
const CODEX: &str = r#"{
  "name": "local-example-plugins",
  "interface": { "displayName": "Local Example Plugins" },
  "plugins": [
    { "name": "my-plugin",
      "source": { "source": "local", "path": "./plugins/my-plugin" },
      "category": "Productivity" },
    { "name": "mono",
      "source": { "source": "git-subdir",
        "url": "https://github.com/acme/mono.git", "path": "tools/codex", "ref": "main" } }
  ]
}"#;

#[test]
fn parses_codex_sources() {
    let plugins = parse_codex_marketplace(CODEX, "local-example-plugins").unwrap();
    assert_eq!(plugins.len(), 2);
    assert_eq!(plugins[0].source, PluginSource::RelativePath("./plugins/my-plugin".into()));
    assert!(matches!(&plugins[1].source,
        PluginSource::GitSubdir { git_ref, .. } if git_ref.as_deref() == Some("main")));
}
```

- [ ] **Step 2: Test schlägt fehl**

Run: `cargo test -p goose marketplace::catalog::tests::parses_codex_sources`
Expected: FAIL.

- [ ] **Step 3: Codex-Parser** (`catalog.rs`)

```rust
#[derive(Debug, Deserialize)]
struct CodexMarketplace { #[serde(default)] plugins: Vec<CodexPlugin> }
#[derive(Debug, Deserialize)]
struct CodexPlugin {
    name: String,
    #[serde(default)] description: Option<String>,
    source: CodexSource,
}
#[derive(Debug, Deserialize)]
struct CodexSource {
    source: String,           // "local" | "git-subdir"
    #[serde(default)] path: Option<String>,
    #[serde(default)] url: Option<String>,
    #[serde(default)] r#ref: Option<String>,
}

pub fn parse_codex_marketplace(json: &str, marketplace_name: &str) -> Result<Vec<CatalogPlugin>> {
    let doc: CodexMarketplace = serde_json::from_str(json)?;
    Ok(doc.plugins.into_iter().map(|p| {
        let source = match p.source.source.as_str() {
            "local" => match p.source.path {
                Some(path) => PluginSource::RelativePath(if path.starts_with("./") { path } else { format!("./{path}") }),
                None => PluginSource::Unsupported("local without path".into()),
            },
            "git-subdir" => match (p.source.url, p.source.path) {
                (Some(url), Some(path)) => PluginSource::GitSubdir { url, path, git_ref: p.source.r#ref },
                _ => PluginSource::Unsupported("git-subdir missing url/path".into()),
            },
            other => PluginSource::Unsupported(format!("source type '{other}' not supported in v1")),
        };
        CatalogPlugin { name: p.name, description: p.description, source,
            marketplace: marketplace_name.to_string() }
    }).collect())
}
```

- [ ] **Step 4: Test grün + Commit**

Run: `cargo test -p goose marketplace::catalog`
Expected: PASS.

```bash
git add crates/goose/src/marketplace/catalog.rs
git commit -m "feat(marketplace): Codex marketplace.json parser"
```

---

### Task 6: `fetch_catalog` — Marketplace-Quelle beschaffen & parsen

**Files:**
- Create: `crates/goose/src/marketplace/fetch.rs`
- Modify: `crates/goose/src/marketplace/mod.rs` (`pub mod fetch;` + Re-Export)
- Test: `crates/goose/src/marketplace/fetch.rs` (`#[cfg(test)]`, lokale Fixture-Verzeichnisse)

**Interfaces:**
- Consumes: `MarketplaceSource`, `MarketplaceKind`, `parse_claude_marketplace`, `parse_codex_marketplace`.
- Produces: `fetch_catalog(&MarketplaceSource) -> Result<Vec<CatalogPlugin>>` und `fetch_catalog_from_dir(&MarketplaceSource, &Path) -> Result<Vec<CatalogPlugin>>` (Test-Variante ohne Netzwerk). Konvention: `marketplace.json` liegt im Repo-/Verzeichnis-Root.

- [ ] **Step 1: Failing-Test** (lokales Verzeichnis als „geklontes Repo")

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::marketplace::{MarketplaceKind, MarketplaceSource};

    #[test]
    fn fetches_and_parses_from_dir() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("marketplace.json"),
            r#"{"name":"m","owner":{"name":"o"},"plugins":[
               {"name":"a","source":"./plugins/a"}]}"#).unwrap();
        let src = MarketplaceSource { name: "m".into(), kind: MarketplaceKind::Claude,
            location: "ignored".into(), enabled: true };

        let plugins = fetch_catalog_from_dir(&src, tmp.path()).unwrap();
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].name, "a");
    }
}
```

- [ ] **Step 2: Test schlägt fehl**

Run: `cargo test -p goose marketplace::fetch::tests::fetches_and_parses_from_dir`
Expected: FAIL.

- [ ] **Step 3: Implementieren** (`fetch.rs`)

```rust
use crate::marketplace::catalog::{parse_claude_marketplace, parse_codex_marketplace, CatalogPlugin};
use crate::marketplace::{MarketplaceKind, MarketplaceSource};
use crate::plugins; // clone helper wiederverwenden (siehe Step 4)
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
```

- [ ] **Step 4: Clone-Helper öffentlich machen**

In `crates/goose/src/plugins/mod.rs` das vorhandene private `clone_git_repo` (Zeile ~292) über einen schmalen `pub(crate)`-Wrapper verfügbar machen (Signatur aus der Datei übernehmen — vermutlich `(url: &str, dest: &Path) -> Result<()>`):

```rust
pub(crate) fn clone_marketplace_repo(url: &str, dest: &Path) -> Result<()> {
    clone_git_repo(url, dest)
}
```

> Falls `clone_git_repo` bereits `pub(crate)` ist, diesen Wrapper weglassen und in `fetch.rs` direkt `plugins::clone_git_repo` verwenden.

- [ ] **Step 5: Test grün + Commit**

Run: `cargo test -p goose marketplace::fetch`
Expected: PASS.

```bash
git add crates/goose/src/marketplace/ crates/goose/src/plugins/mod.rs
git commit -m "feat(marketplace): fetch_catalog (clone/read marketplace.json + parse)"
```

---

### Task 7: Install-Bridge — `CatalogPlugin` auflösen & installieren

**Files:**
- Create: `crates/goose/src/marketplace/install.rs`
- Modify: `crates/goose/src/marketplace/mod.rs` (`pub mod install;` + Re-Export)
- Test: `crates/goose/src/marketplace/install.rs` (`#[cfg(test)]`, lokale Fixtures)

**Interfaces:**
- Consumes: `CatalogPlugin`, `PluginSource`, `plugins::install_plugin_from_checkout`, `plugins::clone_marketplace_repo`.
- Produces: `install_catalog_plugin(&CatalogPlugin, marketplace_checkout: &Path, PluginInstallOptions) -> Result<PluginInstall>`.

- [ ] **Step 1: Failing-Test** (RelativePath: Plugin liegt als Subdir des Marketplace-Checkouts)

```rust
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
        std::fs::write(plug.join(".claude-plugin/plugin.json"),
            r#"{"name":"a","version":"1.0.0","description":"d"}"#).unwrap();
        std::fs::create_dir_all(plug.join("skills/s")).unwrap();
        std::fs::write(plug.join("skills/s/SKILL.md"),
            "---\nname: s\ndescription: d\n---\nb").unwrap();
        let install_root = tmp.path().join("install");

        let entry = CatalogPlugin { name: "a".into(), description: None,
            source: PluginSource::RelativePath("./plugins/a".into()), marketplace: "m".into() };

        let install = install_catalog_plugin_at_root(
            &entry, &market, PluginInstallOptions::default(), &install_root).unwrap();
        assert_eq!(install.name, "a");
        assert_eq!(install.format, crate::plugins::PluginFormat::Claude);
    }

    #[test]
    fn unsupported_source_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let entry = CatalogPlugin { name: "n".into(), description: None,
            source: PluginSource::Unsupported("npm".into()), marketplace: "m".into() };
        assert!(install_catalog_plugin_at_root(
            &entry, tmp.path(), Default::default(), tmp.path()).is_err());
    }
}
```

- [ ] **Step 2: Test schlägt fehl**

Run: `cargo test -p goose marketplace::install`
Expected: FAIL.

- [ ] **Step 3: Implementieren** (`install.rs`)

```rust
use crate::marketplace::catalog::{CatalogPlugin, PluginSource};
use crate::plugins::{self, PluginInstall, PluginInstallOptions};
use anyhow::{bail, Result};
use std::path::Path;

pub fn install_catalog_plugin(
    entry: &CatalogPlugin,
    marketplace_checkout: &Path,
    options: PluginInstallOptions,
) -> Result<PluginInstall> {
    install_catalog_plugin_at_root(entry, marketplace_checkout, options,
        &plugins::plugin_install_dir())
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
            if !dir.is_dir() { bail!("plugin path '{}' not found in marketplace", rel); }
            plugins::install_plugin_from_checkout_at_root(&dir, &source_label, options, install_root)
        }
        PluginSource::GitSubdir { url, path, .. } => {
            let tmp = tempfile::tempdir()?;
            plugins::clone_marketplace_repo(url, tmp.path())?;
            let dir = tmp.path().join(path.trim_start_matches("./"));
            plugins::install_plugin_from_checkout_at_root(&dir, &source_label, options, install_root)
        }
        PluginSource::Git { url, .. } => {
            let tmp = tempfile::tempdir()?;
            plugins::clone_marketplace_repo(url, tmp.path())?;
            plugins::install_plugin_from_checkout_at_root(tmp.path(), &source_label, options, install_root)
        }
        PluginSource::Unsupported(reason) =>
            bail!("cannot install '{}': {}", entry.name, reason),
    }
}
```

> Erfordert, dass `install_plugin_from_checkout_at_root` und `plugin_install_dir` als `pub(crate)` sichtbar sind (Task 2 exportiert `install_plugin_from_checkout`; die `_at_root`-Variante hier auf `pub(crate)` anheben).

- [ ] **Step 4: Test grün + Commit**

Run: `cargo test -p goose marketplace::install`
Expected: PASS.

```bash
git add crates/goose/src/marketplace/ crates/goose/src/plugins/mod.rs
git commit -m "feat(marketplace): resolve CatalogPlugin source and install from checkout"
```

---

### Task 8: CLI `goose marketplace` (add/list/remove/browse/install)

**Files:**
- Create: `crates/goose-cli/src/commands/marketplace.rs`
- Modify: `crates/goose-cli/src/commands/mod.rs` (`pub mod marketplace;`)
- Modify: `crates/goose-cli/src/cli.rs` (Import ~19; `Command::Marketplace` ~988; `MarketplaceCommand`-Enum nahe `PluginCommand` ~705; Dispatch `handle_marketplace_subcommand` ~1972; Routing ~2319; Telemetry ~1353)
- Test: manuell (CLI-Smoke), plus Kompilierprüfung.

**Interfaces:**
- Consumes: `goose::marketplace::{registry, fetch, install, MarketplaceSource, MarketplaceKind}`.

- [ ] **Step 1: Handler-Modul** (`commands/marketplace.rs`)

```rust
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
    add_marketplace(MarketplaceSource { name: name.clone(), kind, location: location.into(), enabled: true })?;
    println!("{} Added marketplace '{}'", style("✓").green(), name);
    Ok(())
}

pub fn handle_list() -> Result<()> {
    let all = list_marketplaces()?;
    if all.is_empty() { println!("No marketplaces configured."); return Ok(()); }
    for m in all {
        println!("  {} [{}] {}{}", style(&m.name).bold(), m.kind_str(), m.location,
            if m.enabled { "" } else { " (disabled)" });
    }
    Ok(())
}

pub fn handle_remove(name: &str) -> Result<()> {
    if remove_marketplace(name)? { println!("{} Removed '{}'", style("✓").green(), name); }
    else { bail!("Marketplace '{}' not found", name); }
    Ok(())
}

pub fn handle_browse(name: &str) -> Result<()> {
    let src = find(name)?;
    let plugins = fetch_catalog(&src)?;
    println!("{} plugins in '{}':", plugins.len(), name);
    for p in plugins {
        let installable = !matches!(p.source, goose::marketplace::PluginSource::Unsupported(_));
        println!("  {} {}{}", if installable { "•" } else { "×" },
            style(&p.name).bold(), p.description.map(|d| format!(" — {d}")).unwrap_or_default());
    }
    Ok(())
}

pub fn handle_install(marketplace: &str, plugin: &str, auto_update: bool) -> Result<()> {
    let src = find(marketplace)?;
    let tmp = tempfile::tempdir()?;
    // Katalog einmal beschaffen; RelativePath-Plugins nutzen dasselbe Checkout.
    goose::plugins::clone_marketplace_repo(&src.location, tmp.path())?;
    let plugins = fetch_catalog_from_dir(&src, tmp.path())?;
    let entry = plugins.into_iter().find(|p| p.name == plugin)
        .ok_or_else(|| anyhow::anyhow!("plugin '{}' not in marketplace '{}'", plugin, marketplace))?;
    let install = install_catalog_plugin(&entry, tmp.path(), PluginInstallOptions { auto_update })?;
    println!("{} Installed {} plugin '{}' ({})", style("✓").green(),
        install.format, style(&install.name).bold(), install.version);
    for s in &install.skills { println!("    - {}", s.name); }
    Ok(())
}

fn find(name: &str) -> Result<MarketplaceSource> {
    list_marketplaces()?.into_iter().find(|m| m.name == name)
        .ok_or_else(|| anyhow::anyhow!("Marketplace '{}' not found", name))
}

fn derive_name(location: &str) -> String {
    location.trim_end_matches('/').rsplit('/').next().unwrap_or("marketplace")
        .trim_end_matches(".git").to_string()
}
```

> `MarketplaceSource::kind_str()` als kleinen Helfer in `marketplace/mod.rs` ergänzen (`match self.kind { Claude => "claude", Codex => "codex" }`) oder inline `format!("{:?}", m.kind)`.

- [ ] **Step 2: clap-Enum + Wiring in `cli.rs`**

`MarketplaceKind` clap-fähig machen: in `marketplace/mod.rs` `#[derive(clap::ValueEnum)]` zu `MarketplaceKind` hinzufügen (Feature `clap` ist im `goose`-Crate vorhanden, sonst in `cli.rs` ein lokales `ValueEnum`-Mirror + `From`). Dann in `cli.rs`:

```rust
// import (~ Zeile 19)
use crate::commands::marketplace::{handle_add, handle_list, handle_remove, handle_browse, handle_install};

// Command-Variante (~ Zeile 988)
    /// Manage plugin marketplaces
    #[command(about = "Manage plugin marketplaces")]
    Marketplace {
        #[command(subcommand)]
        command: MarketplaceCommand,
    },

// Subcommand-Enum (nahe PluginCommand ~ Zeile 705)
#[derive(Subcommand)]
enum MarketplaceCommand {
    /// Add a marketplace source
    Add {
        #[arg(help = "Git URL of the marketplace repository")]
        location: String,
        #[arg(long, value_enum, help = "Marketplace kind")]
        kind: goose::marketplace::MarketplaceKind,
        #[arg(long, help = "Optional name (defaults to repo name)")]
        name: Option<String>,
    },
    /// List configured marketplaces
    List,
    /// Remove a marketplace by name
    Remove { name: String },
    /// List plugins offered by a marketplace
    Browse { name: String },
    /// Install a plugin from a marketplace
    Install {
        marketplace: String,
        plugin: String,
        #[arg(long)] auto_update: bool,
    },
}

// Dispatcher (~ Zeile 1972)
fn handle_marketplace_subcommand(command: MarketplaceCommand) -> Result<()> {
    match command {
        MarketplaceCommand::Add { location, kind, name } => handle_add(&location, kind, name),
        MarketplaceCommand::List => handle_list(),
        MarketplaceCommand::Remove { name } => handle_remove(&name),
        MarketplaceCommand::Browse { name } => handle_browse(&name),
        MarketplaceCommand::Install { marketplace, plugin, auto_update } =>
            handle_install(&marketplace, &plugin, auto_update),
    }
}

// Routing (~ Zeile 2319)
        Some(Command::Marketplace { command }) => handle_marketplace_subcommand(command),

// Telemetry (~ Zeile 1353)
        Some(Command::Marketplace { .. }) => "marketplace",
```

`crates/goose-cli/src/commands/mod.rs`: `pub mod marketplace;`.

- [ ] **Step 3: Kompiliert + Clippy**

Run: `cargo build -p goose-cli`
Expected: erfolgreich. Danach `cargo clippy -p goose -p goose-cli --all-targets` ohne neue Warnungen.

- [ ] **Step 4: CLI-Smoke (lokale Fixture, kein Netzwerk)**

Lege ein lokales Fixture-Marketplace-Verzeichnis mit `marketplace.json` + einem Plugin-Subdir an; setze `GOOSE_PATH_ROOT` auf ein Temp-Verzeichnis. Prüfe:

```bash
export GOOSE_PATH_ROOT=$(mktemp -d)
cargo run -p goose-cli -- marketplace add /pfad/zum/fixture --kind claude --name demo
cargo run -p goose-cli -- marketplace list
cargo run -p goose-cli -- marketplace browse demo
cargo run -p goose-cli -- marketplace install demo <plugin-name>
```

Expected: `add` bestätigt, `list` zeigt `demo`, `browse` listet Plugins (installierbare mit `•`), `install` meldet „Installed claude plugin …" samt importierter Skills. (Für lokale Pfad-Locations ggf. `fetch_catalog` um einen `file://`-/Pfad-Zweig ergänzen, falls `clone_marketplace_repo` nur echte Git-URLs akzeptiert — dann Step in Task 6 entsprechend erweitern.)

- [ ] **Step 5: Commit**

```bash
git add crates/goose-cli/src/commands/marketplace.rs crates/goose-cli/src/commands/mod.rs \
        crates/goose-cli/src/cli.rs crates/goose/src/marketplace/mod.rs
git commit -m "feat(cli): goose marketplace add/list/remove/browse/install"
```

---

## Self-Review

**Spec coverage:**
- Registry (add/list/remove) → Task 3 ✅
- Katalog-Provider Claude/Codex → Task 4/5, Beschaffung Task 6 ✅
- Format-Adapter (Skills/Hooks/MCP-Import) → Task 1 (open_plugins erweitert) ✅ — Hooks/MCP-Import kommt automatisch über die bestehende open_plugins-Pipeline (`hooks/hooks.json`, `.mcp.json`); keine Zusatzarbeit nötig.
- Install-Bridge über bestehende Maschinerie → Task 2 + Task 7 ✅
- Oberfläche (CLI) → Task 8 ✅
- Non-Goals (Commands/Subagenten nur anzeigen) → im Katalog nicht importiert; `browse` markiert nur installierbare Quellen ✅
- **Desktop-UI:** NICHT in diesem Plan → **Folge-Plan 2** (Server-Route `/config/plugins` mirror + React-View „Marketplaces"), da heute kein Plugin-HTTP-Seam existiert.

**Offene Verifikationspunkte (in den jeweiligen Tasks als erste Steps verankert):**
- `Config::new`/`get_param`/`set_param`-Signaturen (Task 3, Step 1).
- `clone_git_repo`-Signatur/-Sichtbarkeit (Task 6, Step 4).
- `MarketplaceKind` als clap `ValueEnum` (Task 8, Step 2).
- lokale Pfad-Location vs. reine Git-URL in `fetch_catalog` (Task 8, Step 4).

**Type-Konsistenz:** `PluginSource`/`CatalogPlugin` (Task 4) unverändert in Task 5/6/7 verwendet; `install_plugin_from_checkout(_at_root)` (Task 2) in Task 7 konsumiert; `PluginFormat::Claude/Codex` (Task 1) in Task 1/7-Tests geprüft. Konsistent.
