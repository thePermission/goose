# Task 3 Report: ACP wire request/response types (marketplace + plugin management)

> Note: this report file previously contained content for an unrelated,
> earlier "Task 3" (a `crates/goose/src/marketplace` module + registry CRUD
> implementation, apparently from a prior plan iteration). That content has
> been replaced below with the report for the actual Task 3 of Plan 2a
> ("ACP wire request/response types") as briefed in `task-3-brief.md`.

## What was added

Appended the marketplace/plugin-management ACP wire types to
`crates/goose-sdk-types/src/custom_requests.rs`, inserted right after
`GetSessionExtensionsResponse` (end of the existing extension-request
section, before the preferences section) — 117 lines total:

- Info structs (no `JsonRpcRequest`/`JsonRpcResponse`, `JsonSchema` only):
  `MarketplaceSourceInfo`, `CatalogPluginInfo`, `InstalledPluginInfo`.
- `InstalledPluginResult` — same fields as specified in the brief, **plus an
  added `JsonRpcResponse` derive** (see deviation below).
- Requests/responses, methods exactly as in the brief:
  - `ListMarketplacesRequest` → `_goose/unstable/marketplace/list` → `ListMarketplacesResponse { marketplaces: Vec<MarketplaceSourceInfo> }`
  - `AddMarketplaceRequest { name, kind, location }` → `_goose/unstable/marketplace/add` → `EmptyResponse`
  - `RemoveMarketplaceRequest { name }` → `_goose/unstable/marketplace/remove` → `EmptyResponse`
  - `BrowseMarketplaceRequest { name }` → `_goose/unstable/marketplace/browse` → `BrowseMarketplaceResponse { plugins: Vec<CatalogPluginInfo> }`
  - `InstallMarketplacePluginRequest { marketplace, plugin, auto_update }` → `_goose/unstable/marketplace/install` → `InstalledPluginResult`
  - `ListInstalledPluginsRequest` → `_goose/unstable/plugins/list` → `ListInstalledPluginsResponse { plugins: Vec<InstalledPluginInfo> }`
  - `SetPluginEnabledRequest { name, enabled }` → `_goose/unstable/plugins/set-enabled` → `EmptyResponse`
  - `UpdatePluginRequest { name }` → `_goose/unstable/plugins/update` → `InstalledPluginResult`

`EmptyResponse` was **not** redefined — reused the existing definition
already present in the file (`pub struct EmptyResponse {}`).

## Deviation from the brief (required to compile)

The brief's verbatim code used `InstalledPluginResult` directly as the
`response =` target for `InstallMarketplacePluginRequest` and
`UpdatePluginRequest`, but specified `InstalledPluginResult`'s derive list as
only `Debug, Default, Clone, Serialize, Deserialize, JsonSchema` — i.e. a
plain info struct, not a `JsonRpcResponse`. `#[request(... response = X)]`
requires `X: JsonRpcResponse` (enforced by `JsonRpcRequest::Response`'s trait
bound in `agent_client_protocol`), so the code as given in the brief failed
to compile with:

```
error[E0277]: the trait bound `InstalledPluginResult: JsonRpcResponse` is not satisfied
```

Fix applied: added `JsonRpcResponse` to `InstalledPluginResult`'s derive
list (now `Debug, Default, Clone, Serialize, Deserialize, JsonSchema,
JsonRpcResponse`). No other change — field layout, name, and `#[serde(...)]`
attributes are exactly as specified. This matches the file-wide convention:
every type used as a `response =` target elsewhere in this file derives
`JsonRpcResponse`. `InstalledPluginResult` is not used as a nested field
inside any other response in this task, so this is a safe, unambiguous fix
with no other type/derive path differences observed anywhere else in the
brief.

## Build result

- `cargo build -p goose-sdk-types` → success (0 errors, 0 warnings) after the fix above.
- `cargo fmt -p goose-sdk-types` → no additional changes (brief's formatting was already `rustfmt`-clean).

## Files changed

- `crates/goose-sdk-types/src/custom_requests.rs` (+117 lines)

## Self-review

- Diffed the change (`git diff`) before committing: confirms the change is
  a single contiguous insertion of exactly the specified block (plus the one
  derive fix), no other file touched, no accidental reformatting elsewhere
  in the file.
- Verified `EmptyResponse` was not redefined (grepped for existing
  definition; reused it).
- Verified method strings char-for-char against the brief
  (`_goose/unstable/marketplace/list|add|remove|browse|install`,
  `_goose/unstable/plugins/list|set-enabled|update`).
- Confirmed placement is "near the other extension request/response
  structs" as instructed — directly after the last extension-management
  struct (`GetSessionExtensionsResponse`) and before the preferences
  section.
- Did not add any unit tests (task explicitly says types-only, no unit
  test required).

## Concerns

- The `JsonRpcResponse` derive addition to `InstalledPluginResult` is a
  necessary correction to the brief, not an invention of new behavior/shape;
  flagging it explicitly in case Tasks 4/5/6 (handlers/codegen) or the
  original plan author assumed `InstalledPluginResult` would also be reused
  as a plain nested field elsewhere — that would still work fine (the derive
  addition doesn't remove `JsonSchema`/`Serialize`/`Deserialize`), so no
  downstream breakage expected.
- Found and overwrote stale content in this same report file path from an
  unrelated, previously-completed "Task 3" (a `marketplace` module/registry
  implementation). Flagging in case the `.superpowers/sdd/` directory is
  being reused across plan iterations and other task-N-report.md files also
  carry stale content that should be checked before being trusted.
- No functional/business logic in this task — purely types, so no other
  correctness concerns.
