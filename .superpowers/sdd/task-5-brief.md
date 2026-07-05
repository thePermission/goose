### Task 5: ACP handlers — plugins/* + dispatch

**Files:**
- Modify: `crates/goose/src/acp/server/marketplace.rs` (add plugin-management handlers)
- Modify: `crates/goose/src/acp/server/custom_dispatch.rs` (dispatch arms)

**Interfaces:**
- Consumes: Task 1/2 (`list_installed_plugins`, `set_plugin_enabled`), `goose::plugins::update_plugin`, `install_to_result` (Task 4).
- Produces: `on_plugins_list/set_enabled/update`.

- [ ] **Step 1: Handlers** (append into the `impl GooseAcpAgent` in `marketplace.rs`)

```rust
impl GooseAcpAgent {
    pub(super) async fn on_plugins_list(
        &self,
    ) -> Result<ListInstalledPluginsResponse, agent_client_protocol::Error> {
        let plugins = crate::plugins::list_installed_plugins()
            .into_iter()
            .map(|p| InstalledPluginInfo {
                name: p.name,
                version: p.version,
                source: p.source,
                enabled: p.enabled,
                auto_update: p.auto_update,
                updatable: p.updatable,
            })
            .collect();
        Ok(ListInstalledPluginsResponse { plugins })
    }

    pub(super) async fn on_plugins_set_enabled(
        &self,
        req: SetPluginEnabledRequest,
    ) -> Result<EmptyResponse, agent_client_protocol::Error> {
        crate::plugins::set_plugin_enabled(&req.name, req.enabled)
            .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?;
        Ok(EmptyResponse {})
    }

    pub(super) async fn on_plugins_update(
        &self,
        req: UpdatePluginRequest,
    ) -> Result<InstalledPluginResult, agent_client_protocol::Error> {
        let install = crate::plugins::update_plugin(&req.name)
            .map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?;
        Ok(install_to_result(install))
    }
}
```

- [ ] **Step 2: Dispatch arms** (custom_dispatch.rs)

```rust
    #[custom_method(ListInstalledPluginsRequest)]
    async fn dispatch_plugins_list(&self) -> Result<ListInstalledPluginsResponse, agent_client_protocol::Error> {
        self.on_plugins_list().await
    }
    #[custom_method(SetPluginEnabledRequest)]
    async fn dispatch_plugins_set_enabled(&self, req: SetPluginEnabledRequest) -> Result<EmptyResponse, agent_client_protocol::Error> {
        self.on_plugins_set_enabled(req).await
    }
    #[custom_method(UpdatePluginRequest)]
    async fn dispatch_plugins_update(&self, req: UpdatePluginRequest) -> Result<InstalledPluginResult, agent_client_protocol::Error> {
        self.on_plugins_update(req).await
    }
```

- [ ] **Step 3: Compile + clippy** — `cargo build -p goose --lib` + `cargo clippy -p goose -- -D warnings` → clean.

- [ ] **Step 4: Commit**

```bash
git add crates/goose/src/acp/server/marketplace.rs crates/goose/src/acp/server/custom_dispatch.rs
git commit -m "feat(acp): plugins list/set-enabled/update handlers"
```

---

