# Task 4 Report — `marketplace/*` ACP handlers + dispatch

## What was implemented

1. **`crates/goose/src/acp/server/marketplace.rs`** (new file) — five handler methods on
   `impl GooseAcpAgent`, all `pub(super) async fn on_marketplace_*`:
   - `on_marketplace_list()` → `ListMarketplacesResponse`. Lists registered marketplaces via
     `crate::marketplace::registry::list_marketplaces()`, maps each `MarketplaceSource` to a
     `MarketplaceSourceInfo` (kind rendered as lowercase `"claude"`/`"codex"` via
     `format!("{:?}", m.kind).to_lowercase()`).
   - `on_marketplace_add(req)` → `EmptyResponse`. Validates `req.kind` via the local
     `parse_kind` helper (only `"claude"`/`"codex"` accepted, else `invalid_params`), then calls
     `registry::add_marketplace`. Registry errors (e.g. duplicate name) are mapped to
     `invalid_params` since they're client-input issues.
   - `on_marketplace_remove(req)` → `EmptyResponse`. Calls `registry::remove_marketplace`;
     "not found" (returns `false`) becomes `invalid_params`, other failures `internal_err()`.
   - `on_marketplace_browse(req)` → `BrowseMarketplaceResponse`. Looks up the named marketplace
     from the registry, calls `marketplace::fetch::fetch_catalog` (clones + parses in one step,
     used only for browsing — no install side effects), and maps each `CatalogPlugin` to a
     `CatalogPluginInfo` with `installable = !matches!(source, PluginSource::Unsupported(_))`
     and a `source_kind` label (`relative-path` / `git-subdir` / `git` / `unsupported`) via the
     local `source_kind_label` helper.
   - `on_marketplace_install(req)` → `InstalledPluginResult`. Looks up the marketplace, clones it
     **once** into a `tempfile::tempdir()`, calls `fetch_catalog_from_dir` against that same
     checkout to resolve the requested plugin entry, then
     `marketplace::install::install_catalog_plugin(&entry, tmp.path(), PluginInstallOptions { auto_update })`.
     The result is converted via the local `install_to_result` helper, which derives
     `has_hooks`/`has_mcp` by checking `install.directory.join("hooks/hooks.json").is_file()` /
     `.join(".mcp.json").is_file()`, and maps `install.skills: Vec<ImportedSkill>` to
     `Vec<String>` (skill names). `install.source` (a `"<marketplace>:<plugin>"` label set by the
     Plan-1 installer) is carried straight through for the trust display.

2. **`crates/goose/src/acp/server.rs`** — added `mod marketplace;`, alphabetically placed
   between `mod manage_sessions;` and `mod new_session;`.

3. **`crates/goose/src/acp/server/custom_dispatch.rs`** — added five `#[custom_method(...)]`
   dispatch arms inside the existing `#[custom_methods] impl GooseAcpAgent` block, placed
   directly after `dispatch_get_session_extensions` (next to the other extension-related arms,
   per the brief), each a one-line passthrough to the corresponding `on_marketplace_*` handler.
   `dispatch_marketplace_list` takes no `req` parameter (mirrors the existing
   `dispatch_get_config_extensions`/`dispatch_get_available_extensions` pattern for
   zero-field request types), confirming the `custom_methods` macro already supports that shape.

## Error-mapping approach (confirmed)

Read `crates/goose/src/acp/server.rs` (lines ~120–150): it defines a private
`trait ResultExt<T> { fn internal_err(self) -> ...; fn internal_err_ctx(...); fn invalid_params_err(...); fn invalid_params_err_ctx(...); }`
blanket-implemented for `Result<T, E: std::fmt::Display>`, and `extensions.rs` (a sibling
`mod extensions;` under `server`) already calls `.internal_err()` / `.internal_err_ctx("...")`
freely via its `use super::*;`. Because `ResultExt` is a private (non-`pub`) item of the `server`
module and Rust visibility rules let descendant modules see a private parent-module item,
`marketplace.rs` (also `mod marketplace;` under `server`) gets `.internal_err()` for free through
its own `use super::*;` — no additional import needed. This is exactly what the brief's code uses,
so **no rewrite to `.map_err(...)` was necessary**; the brief's mix of `.internal_err()` (for
"can't happen in practice" registry/fetch failures) and explicit
`.map_err(|e| agent_client_protocol::Error::internal_error().data(e.to_string()))?` (for cases
that want an explicit local closure, e.g. clone/fetch/install failures during `on_marketplace_install`)
was left verbatim. Build + clippy confirm both forms compile cleanly.

## Build / clippy / fmt results

- `cargo build -p goose --lib` → **success** (finished in ~1m15s, no errors/warnings).
- `cargo clippy -p goose -- -D warnings` → **`No issues found`**.
- `cargo fmt -p goose` → no diff produced beyond what was already staged (files were already
  correctly formatted as written).

## Files changed

- `crates/goose/src/acp/server/marketplace.rs` (new)
- `crates/goose/src/acp/server.rs` (+1 line: `mod marketplace;`)
- `crates/goose/src/acp/server/custom_dispatch.rs` (+39 lines: 5 dispatch arms)

## Self-review

- Verified every type referenced (`ListMarketplacesResponse`, `MarketplaceSourceInfo`,
  `AddMarketplaceRequest`, `RemoveMarketplaceRequest`, `BrowseMarketplaceRequest`,
  `BrowseMarketplaceResponse`, `CatalogPluginInfo`, `InstallMarketplacePluginRequest`,
  `InstalledPluginResult`, `EmptyResponse`) against the Task-3 commit
  (`83b9a66d2`, `crates/goose-sdk-types/src/custom_requests.rs`) — field names/types match
  exactly (all `camelCase` on the wire via `#[serde(rename_all = "camelCase")]`, Rust-side
  `snake_case` field names used here are correct).
- Verified the Plan-1 core signatures used
  (`registry::{list,add,remove}_marketplace`, `fetch::{fetch_catalog,fetch_catalog_from_dir}`,
  `install::install_catalog_plugin`, `MarketplaceSource`, `MarketplaceKind`,
  `catalog::PluginSource`, `plugins::{clone_marketplace_repo, PluginInstall,
  PluginInstallOptions, plugin_install_dir}`) against their actual definitions in
  `crates/goose/src/marketplace/{mod,registry,fetch,install,catalog}.rs` and
  `crates/goose/src/plugins/mod.rs` — all match; no signature drift from what the brief assumed.
- Confirmed the marketplace repo is cloned exactly once in `on_marketplace_install` (into a
  single `tempfile::tempdir()`), and that same checkout path is reused for both
  `fetch_catalog_from_dir` and `install_catalog_plugin` — satisfies the "clone once" global
  constraint. (Per-plugin `Git`/`GitSubdir` sources trigger their own separate clone inside
  `install_catalog_plugin`, but that's an unavoidable second repo — a different location than the
  marketplace itself — not a redundant clone of the marketplace.)
- No new unit tests added, per the task brief (thin ACP adapters over already-tested Plan-1
  core logic — `marketplace::{registry,fetch,install}` and `plugins::clone_marketplace_repo`
  already carry unit/e2e coverage). Verification is by successful compile + clean clippy, as
  specified.
- `git diff` on `server.rs` and `custom_dispatch.rs` shows only the intended additions (1 line,
  39 lines respectively) — no unrelated changes.

## Concerns

- **Error-severity nuance (minor, matches the brief as given):** in `on_marketplace_add`, a
  *duplicate name* is legitimately `invalid_params`, but the brief maps **all**
  `add_marketplace` errors (including any underlying `Config::set_param` I/O failure, e.g. a
  permissions problem on `config.yaml`) to `invalid_params` rather than distinguishing genuine
  server-side I/O failures as `internal_error`. This mirrors the brief's exact code and is a
  pre-existing judgment call in the plan, not something introduced by this task — flagging for
  awareness, not treating as a defect to fix unilaterally.
- Did not touch `crates/goose/src/acp/server/custom_dispatch.rs`'s handling of
  `ListInstalledPluginsRequest`/other plugin-management request types also added in Task 3 —
  those are out of scope for Task 4 (brief only covers `marketplace/*`); presumably a later task
  in Plan 2a wires `plugins/list`, `plugins/set-enabled`, `plugins/update`, etc.
- Left `.superpowers/sdd/task-3-report.md` untouched (it showed as modified in git status before
  I started work here — pre-existing, unrelated to Task 4, not part of my commit).

## Commit

`e406f6de5` — `feat(acp): marketplace list/add/remove/browse/install handlers`
(3 files changed, 185 insertions(+): `crates/goose/src/acp/server/marketplace.rs` (new),
`crates/goose/src/acp/server.rs`, `crates/goose/src/acp/server/custom_dispatch.rs`).

---

## Final-review fixes (applied after the report above)

### FIX #1 (Important) — offload blocking git/network work off the async executor

Read `crates/goose/src/acp/server/providers.rs` (~line 694) first to confirm the codebase's
existing `spawn_blocking` idiom:
```rust
match tokio::task::spawn_blocking(move || entry.inventory_configured()).await {
    Ok(is_configured) => is_configured,
    Err(error) => { warn!(...); false }
}
```
This one wraps a closure with no fallible inner `Result`. In `marketplace.rs` the wrapped
closures *do* return a `Result`, so the idiom used here is the double-`map_err` / double-`?`
form: `spawn_blocking(move || { ... }).await.map_err(|e| ...internal_error...().data(e.to_string()))?` to
convert the `JoinError`, immediately followed by a second `?` (or a second `.map_err(...)?`
when the closure's inner error type isn't already `agent_client_protocol::Error`) to unwrap the
business-logic `Result` exactly as it was mapped before.

Changes in `crates/goose/src/acp/server/marketplace.rs`:
- `on_marketplace_browse` (lines ~80–104): kept the marketplace lookup on the async side (now via
  the new `find_marketplace` helper, see FIX #5), then moved the owned `src` into
  `tokio::task::spawn_blocking(move || crate::marketplace::fetch::fetch_catalog(&src))`. Outer
  `.map_err` converts the `JoinError`; inner `.map_err` converts `fetch_catalog`'s `anyhow::Error`
  — identical mapping to what was there before, just relocated inside the `.await` chain.
- `on_marketplace_install` (lines ~106–143): moved the **entire** clone → `fetch_catalog_from_dir`
  → find-entry → `install_catalog_plugin` sequence, **including** `tempfile::tempdir()`, into one
  `spawn_blocking` closure. The closure captures owned `src` (`MarketplaceSource`),
  `marketplace_name`/`plugin_name` (`String`, cloned out of `req` before the move), and
  `auto_update` (`bool`) — all `Send + 'static`. The `TempDir` guard (`tmp`) lives entirely inside
  the closure and is only dropped when the closure returns, so the checkout stays on disk through
  `install_catalog_plugin`. The closure itself returns
  `Result<crate::plugins::PluginInstall, agent_client_protocol::Error>`, preserving the original
  error-kind distinction (the "plugin not found in marketplace" case stays `invalid_params`; clone
  /fetch/install failures stay `internal_error`) — nothing was collapsed to a single generic error
  kind. On the async side: `.await.map_err(...)??` — first `?` unwraps the `JoinError`-mapped
  outer `Result`, second `?` unwraps the closure's own `Result`. Then `install_to_result(install)`
  runs on the async side as instructed.
- `on_plugins_update` (lines ~171–182): moved `req.name` (owned, no clone needed — `req` isn't
  used afterward) into `spawn_blocking(move || crate::plugins::update_plugin(&name))`, same
  double-`map_err` idiom as `on_marketplace_browse`.
- Left `list`, `add`, `remove`, `plugins/list`, `plugins/set-enabled` untouched — quick config-only
  ops, no blocking I/O.

### FIX #3 (Minor) — robust kind serialization

Verified `MarketplaceKind::kind_str()` did **not** exist yet — only `MarketplaceSource::kind_str()`
did (in `crates/goose/src/marketplace/mod.rs`, matching on `self.kind`). Added
`impl MarketplaceKind { pub fn kind_str(&self) -> &'static str { match self { Claude => "claude",
Codex => "codex" } } }` right after the `MarketplaceKind` enum definition, and changed
`MarketplaceSource::kind_str()` to delegate: `self.kind.kind_str()` (dedups the match arms instead
of having two copies). In `marketplace.rs::on_marketplace_list`, replaced
`format!("{:?}", m.kind).to_lowercase()` with `m.kind.kind_str().to_string()`.

### FIX #5 (Minor) — dedup

Extracted the duplicated "look up marketplace by name, else `invalid_params`" block from
`on_marketplace_browse` and `on_marketplace_install` into a new private helper at the top of
`marketplace.rs`:
```rust
fn find_marketplace(name: &str) -> Result<MarketplaceSource, agent_client_protocol::Error> {
    crate::marketplace::registry::list_marketplaces()
        .internal_err()?
        .into_iter()
        .find(|m| m.name == name)
        .ok_or_else(|| {
            agent_client_protocol::Error::invalid_params()
                .data(format!("marketplace '{name}' not found"))
        })
}
```
Both handlers now call `find_marketplace(&req.name)?` / `find_marketplace(&req.marketplace)?`.

### Build / clippy / fmt / test results

- `cargo build -p goose --lib` → success (no errors/warnings).
- `cargo fmt -p goose` → reformatted `marketplace.rs` (line-wrapping of the new `spawn_blocking`
  calls); no semantic changes.
- `cargo clippy -p goose -- -D warnings` → `No issues found`.
- `cargo test -p goose --lib marketplace -- --test-threads=1` → `16 passed; 0 failed`.
- `cargo test -p goose --lib plugins -- --test-threads=1` → `34 passed; 0 failed`.

### Files changed (this fix pass)

- `crates/goose/src/acp/server/marketplace.rs` — FIX #1, #3, #5 (spawn_blocking wrapping,
  `find_marketplace` helper, `kind_str()` call site).
- `crates/goose/src/marketplace/mod.rs` — FIX #3 (`MarketplaceKind::kind_str()` added,
  `MarketplaceSource::kind_str()` now delegates to it).

### Not fixed / out of scope

- Nothing outstanding from FIX #1/#3/#5 — all three applied as specified. (FIX #2/#4, if they
  exist in the full review, were not included in this task's scope and are not addressed here.)
