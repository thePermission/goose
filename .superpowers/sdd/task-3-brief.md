### Task 3: ACP wire types

**Files:**
- Modify: `crates/goose-sdk-types/src/custom_requests.rs` (append the block below near the extension requests)

**Interfaces:**
- Produces (consumed by Tasks 4/5/6): the request/response structs below and the info structs `MarketplaceSourceInfo`, `CatalogPluginInfo`, `InstalledPluginInfo`, `InstalledPluginResult`.

- [ ] **Step 1: Add the types** (verbatim; note `EmptyResponse` already exists in this file)

```rust
// ---- Marketplace + plugin management (Desktop Plan 2) ----

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSourceInfo {
    pub name: String,
    pub kind: String,       // "claude" | "codex"
    pub location: String,
    pub enabled: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct CatalogPluginInfo {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub installable: bool,
    pub source_kind: String, // "relative-path" | "git-subdir" | "git" | "unsupported"
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPluginInfo {
    pub name: String,
    pub version: String,
    pub source: String,
    pub enabled: bool,
    pub auto_update: bool,
    pub updatable: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPluginResult {
    pub name: String,
    pub version: String,
    pub format: String,
    pub source: String,
    pub skills: Vec<String>,
    pub has_hooks: bool,
    pub has_mcp: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/marketplace/list", response = ListMarketplacesResponse)]
pub struct ListMarketplacesRequest {}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
pub struct ListMarketplacesResponse {
    pub marketplaces: Vec<MarketplaceSourceInfo>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/marketplace/add", response = EmptyResponse)]
#[serde(rename_all = "camelCase")]
pub struct AddMarketplaceRequest {
    pub name: String,
    pub kind: String,
    pub location: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/marketplace/remove", response = EmptyResponse)]
#[serde(rename_all = "camelCase")]
pub struct RemoveMarketplaceRequest {
    pub name: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/marketplace/browse", response = BrowseMarketplaceResponse)]
#[serde(rename_all = "camelCase")]
pub struct BrowseMarketplaceRequest {
    pub name: String,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
pub struct BrowseMarketplaceResponse {
    pub plugins: Vec<CatalogPluginInfo>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/marketplace/install", response = InstalledPluginResult)]
#[serde(rename_all = "camelCase")]
pub struct InstallMarketplacePluginRequest {
    pub marketplace: String,
    pub plugin: String,
    #[serde(default)]
    pub auto_update: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/plugins/list", response = ListInstalledPluginsResponse)]
pub struct ListInstalledPluginsRequest {}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcResponse)]
#[serde(rename_all = "camelCase")]
pub struct ListInstalledPluginsResponse {
    pub plugins: Vec<InstalledPluginInfo>,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/plugins/set-enabled", response = EmptyResponse)]
#[serde(rename_all = "camelCase")]
pub struct SetPluginEnabledRequest {
    pub name: String,
    pub enabled: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize, JsonSchema, JsonRpcRequest)]
#[request(method = "_goose/unstable/plugins/update", response = InstalledPluginResult)]
pub struct UpdatePluginRequest {
    pub name: String,
}
```

- [ ] **Step 2: Compiles** — `cargo build -p goose-sdk-types` → success. `cargo fmt`.

- [ ] **Step 3: Commit**

```bash
git add crates/goose-sdk-types/src/custom_requests.rs
git commit -m "feat(acp-types): marketplace + plugin-management request/response types"
```

---

