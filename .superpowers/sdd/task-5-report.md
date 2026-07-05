# Task 5 report — ACP handlers: plugins/* + dispatch

## Implemented

Added three new thin-adapter handlers to the existing `impl GooseAcpAgent` block in
`crates/goose/src/acp/server/marketplace.rs` (appended right after `on_marketplace_install`,
before the free-standing `install_to_result` helper):

- `pub(super) async fn on_plugins_list(&self) -> Result<ListInstalledPluginsResponse, ...>`
  — calls `crate::plugins::list_installed_plugins()`, maps each `InstalledPlugin` to
  `InstalledPluginInfo` (name/version/source/enabled/auto_update/updatable — all fields
  copied 1:1, no transformation needed since the ACP DTO and the core struct have identical
  shapes), collects into `ListInstalledPluginsResponse { plugins }`. Cannot fail — no
  `Result` from the core call, so no error mapping needed.
- `pub(super) async fn on_plugins_set_enabled(&self, req: SetPluginEnabledRequest) -> Result<EmptyResponse, ...>`
  — calls `crate::plugins::set_plugin_enabled(&req.name, req.enabled)`, maps the core error
  via `.map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?`
  (matches the mapping style used by `on_marketplace_add`/`on_marketplace_remove`... actually
  matches the plain non-`internal_err()` closure style already used elsewhere in this same
  file for fallible core calls that return `anyhow::Result`), returns `EmptyResponse {}`.
- `pub(super) async fn on_plugins_update(&self, req: UpdatePluginRequest) -> Result<InstalledPluginResult, ...>`
  — calls `crate::plugins::update_plugin(&req.name)`, same error-mapping closure, then reuses
  the existing private `install_to_result(install)` helper (Task 4) to build the
  `InstalledPluginResult` — no duplication of the hooks/mcp-detection logic.

Added matching dispatch arms in `crates/goose/src/acp/server/custom_dispatch.rs`, placed
directly after the `#[custom_method(InstallMarketplacePluginRequest)]` arm and before the
`ListProvidersRequest` arm (keeping all marketplace/plugin-management arms grouped together):

- `#[custom_method(ListInstalledPluginsRequest)] dispatch_plugins_list(&self) -> Result<ListInstalledPluginsResponse, ...>` → `self.on_plugins_list().await`
- `#[custom_method(SetPluginEnabledRequest)] dispatch_plugins_set_enabled(&self, req) -> Result<EmptyResponse, ...>` → `self.on_plugins_set_enabled(req).await`
- `#[custom_method(UpdatePluginRequest)] dispatch_plugins_update(&self, req) -> Result<InstalledPluginResult, ...>` → `self.on_plugins_update(req).await`

Diff matches the brief's Step 1/Step 2 code blocks verbatim (confirmed via `git diff` before
committing — byte-for-byte identical to the brief's snippets, modulo the multi-line
`fn` signature wrapping that `cargo fmt` prefers, which was already the case in the brief's
own formatting for the other two dispatch arms it showed).

## Types/functions consumed (all pre-existing, verified before writing code)

- `crate::plugins::{list_installed_plugins, set_plugin_enabled, update_plugin}` —
  `crates/goose/src/plugins/mod.rs` (lines 99, 149, 241). `InstalledPlugin` struct
  (line 90-97) has fields `name, version, source, enabled, auto_update, updatable` —
  exact match to `InstalledPluginInfo`.
- `ListInstalledPluginsRequest/Response`, `InstalledPluginInfo`, `SetPluginEnabledRequest`,
  `UpdatePluginRequest`, `InstalledPluginResult`, `EmptyResponse` — all defined in
  `crates/goose-sdk-types/src/custom_requests.rs` (lines 486-580), brought into scope in
  `marketplace.rs`/`custom_dispatch.rs` via the existing `use super::*;` →
  `crate::acp::custom_requests::*` glob re-export chain already used by the marketplace
  handlers from Task 4. No new imports were needed.
- `install_to_result` — private free fn at the bottom of `marketplace.rs` (Task 4), reused
  as-is for `on_plugins_update`.

## Build / clippy / fmt results

- `cargo build -p goose --lib` → **clean**, `Finished dev profile [unoptimized + debuginfo] target(s) in 22.79s`, no warnings.
- `cargo clippy -p goose -- -D warnings` → **clean**, `No issues found`.
- `cargo fmt -p goose` → ran; no diff produced on the two touched files (already
  correctly formatted by hand-matching the brief's style), only pre-existing unrelated
  formatting drift in `.superpowers/sdd/task-3-report.md` showed up in `git diff --stat`
  (that file was already modified before this task started per the initial `git status`,
  untouched by me, and intentionally NOT staged/committed).

## Files changed

- `/home/sascha/Projects/corporategoose/goose-desktop-ui/crates/goose/src/acp/server/marketplace.rs` (+35 lines)
- `/home/sascha/Projects/corporategoose/goose-desktop-ui/crates/goose/src/acp/server/custom_dispatch.rs` (+23 lines)

Commit: `18aa5b4ac` — "feat(acp): plugins list/set-enabled/update handlers" (2 files changed, 58 insertions(+), 0 deletions(-)). Verified via `git show --stat HEAD` that only these two files are in the commit — the pre-existing modified/untracked `.superpowers/sdd/*` files were deliberately left out of the staging area.

## Self-review

- Handler bodies and dispatch arms are byte-identical to the brief's prescribed code —
  no deviation, no extra logic, no reformatting beyond what `cargo fmt` already accepted.
- Error mapping is consistent with the brief's own snippet
  (`agent_client_protocol::Error::internal_error().data(e.to_string())`), and also consistent
  with how the file already handles fallible calls into `crate::plugins::*`/`anyhow::Result`
  APIs elsewhere in this same file (e.g. `on_marketplace_add`, `on_marketplace_install`'s
  clone/fetch/install steps) — the module doesn't use the `.internal_err()` extension trait
  for these particular call sites, it reserves that for `crate::marketplace::registry::*`
  calls that return a different error type. So the chosen mapping matches local convention.
- No new unit tests added, per the "thin adapters" instruction in the global constraints —
  correctly matches Task 4's precedent (no tests were added for the marketplace handlers
  either; they're pure pass-through glue over already-tested core functions).
- Placement: handlers appended inside the existing `impl GooseAcpAgent` block, ahead of the
  free `install_to_result` fn (so the block stays intact and the private helper stays at
  module scope, reusable by both `on_marketplace_install` and `on_plugins_update`) — matches
  the brief's instruction to "append into the impl GooseAcpAgent in marketplace.rs".
- Dispatch arms placed immediately after the last marketplace arm and before
  `ListProvidersRequest`, keeping the marketplace+plugin-management group contiguous and
  not touching any unrelated existing arms.

## Concerns

None. No TODOs, no known follow-up work for this task. The three new custom-request types
were already fully defined by Task 3 with correct camelCase serde and JsonRpcRequest/Response
derives, and the two core functions (`set_plugin_enabled`, `update_plugin`) were already fully
implemented and unit-tested by Tasks 1/2, so this task was purely mechanical glue code with
no design decisions or edge cases to resolve. Build and clippy are pristine.
