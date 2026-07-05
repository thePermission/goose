use anyhow::Result;
use serde::Deserialize;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PluginSource {
    RelativePath(String),
    GitSubdir {
        url: String,
        path: String,
        git_ref: Option<String>,
    },
    Git {
        url: String,
        git_ref: Option<String>,
    },
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
struct ClaudeMeta {
    #[serde(rename = "pluginRoot")]
    plugin_root: Option<String>,
}
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
    source: String, // "github" | "url" | "git-subdir" | "npm" | "local"
    #[serde(default)]
    repo: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    r#ref: Option<String>,
    #[serde(default)]
    sha: Option<String>,
}

pub fn parse_claude_marketplace(json: &str, marketplace_name: &str) -> Result<Vec<CatalogPlugin>> {
    let doc: ClaudeMarketplace = serde_json::from_str(json)?;
    let root = doc
        .metadata
        .and_then(|m| m.plugin_root)
        .unwrap_or_else(|| ".".to_string());
    Ok(doc
        .plugins
        .into_iter()
        .map(|p| {
            let source = match p.source {
                ClaudeSource::Path(rel) => PluginSource::RelativePath(join_rel(&root, &rel)),
                ClaudeSource::Object(o) => map_claude_object(o),
            };
            CatalogPlugin {
                name: p.name,
                description: p.description,
                source,
                marketplace: marketplace_name.to_string(),
            }
        })
        .collect())
}

fn map_claude_object(o: ClaudeSourceObj) -> PluginSource {
    let git_ref = o.sha.or(o.r#ref);
    match o.source.as_str() {
        "github" => match o.repo {
            Some(repo) => PluginSource::Git {
                url: format!("https://github.com/{repo}.git"),
                git_ref,
            },
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

// ---- Codex marketplace.json ----
#[derive(Debug, Deserialize)]
struct CodexMarketplace {
    #[serde(default)]
    plugins: Vec<CodexPlugin>,
}
#[derive(Debug, Deserialize)]
struct CodexPlugin {
    name: String,
    #[serde(default)]
    description: Option<String>,
    source: CodexSource,
}
#[derive(Debug, Deserialize)]
struct CodexSource {
    source: String, // "local" | "git-subdir"
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    r#ref: Option<String>,
}

pub fn parse_codex_marketplace(json: &str, marketplace_name: &str) -> Result<Vec<CatalogPlugin>> {
    let doc: CodexMarketplace = serde_json::from_str(json)?;
    Ok(doc
        .plugins
        .into_iter()
        .map(|p| {
            let source = match p.source.source.as_str() {
                "local" => match p.source.path {
                    Some(path) if std::path::Path::new(&path).is_absolute() => {
                        PluginSource::Unsupported("absolute local path not supported".into())
                    }
                    Some(path) => PluginSource::RelativePath(if path.starts_with("./") {
                        path
                    } else {
                        format!("./{path}")
                    }),
                    None => PluginSource::Unsupported("local without path".into()),
                },
                "git-subdir" => match (p.source.url, p.source.path) {
                    (Some(url), Some(path)) => PluginSource::GitSubdir {
                        url,
                        path,
                        git_ref: p.source.r#ref,
                    },
                    _ => PluginSource::Unsupported("git-subdir missing url/path".into()),
                },
                other => {
                    PluginSource::Unsupported(format!("source type '{other}' not supported in v1"))
                }
            };
            CatalogPlugin {
                name: p.name,
                description: p.description,
                source,
                marketplace: marketplace_name.to_string(),
            }
        })
        .collect())
}

fn join_rel(root: &str, rel: &str) -> String {
    let rel = rel.trim_start_matches("./");
    let root = root.trim_end_matches('/');
    if root == "." || root.is_empty() {
        format!("./{rel}")
    } else {
        format!("{root}/{rel}")
    }
}

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
        assert_eq!(
            plugins[0].source,
            PluginSource::RelativePath("./plugins/formatter".into())
        );
        assert!(matches!(plugins[1].source, PluginSource::Git { .. }));
        assert!(matches!(plugins[2].source, PluginSource::GitSubdir { .. }));
        assert!(matches!(plugins[3].source, PluginSource::Unsupported(_)));
        assert_eq!(plugins[0].marketplace, "company-tools");
    }

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
        assert_eq!(
            plugins[0].source,
            PluginSource::RelativePath("./plugins/my-plugin".into())
        );
        assert!(matches!(&plugins[1].source,
            PluginSource::GitSubdir { git_ref, .. } if git_ref.as_deref() == Some("main")));
    }

    #[test]
    fn codex_local_absolute_path_is_unsupported() {
        let json = r#"{"name":"m","plugins":[
            {"name":"evil","source":{"source":"local","path":"/etc/passwd"}}]}"#;
        let plugins = parse_codex_marketplace(json, "m").unwrap();
        assert_eq!(plugins.len(), 1);
        assert!(
            matches!(&plugins[0].source, PluginSource::Unsupported(reason)
                if reason.contains("absolute")),
            "absolute local path must map to Unsupported, got {:?}",
            plugins[0].source
        );
    }
}
