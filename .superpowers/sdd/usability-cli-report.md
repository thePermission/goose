# goose marketplace CLI — usability proof

Branch: `corporate` (confirmed via `git branch --show-current`, not switched).
Date: 2026-07-05.

## Setup

Built with:
```
source bin/activate-hermit
cargo build -p goose-cli
```
Result: `Finished `dev` profile [unoptimized + debuginfo] target(s) in 4m 33s` (948 crates
compiled, no errors). Binary at `./target/debug/goose`.

Sandbox isolation (per instructions):
```
export SANDBOX_HOME=$(mktemp -d /tmp/goose-mktplace-XXXXXX)   # -> /tmp/goose-mktplace-ApjXnx
export HOME="$SANDBOX_HOME"
export XDG_CONFIG_HOME="$SANDBOX_HOME/.config"
export XDG_DATA_HOME="$SANDBOX_HOME/.local/share"
export XDG_STATE_HOME="$SANDBOX_HOME/.local/state"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_STATE_HOME"
```

## Fixture marketplace (mirrors `crates/goose/src/marketplace/install.rs`'s
`e2e_register_fetch_install_from_local_git_marketplace` test fixture exactly)

Created at `/tmp/goose-cli-market-fixture`:
- `.claude-plugin/marketplace.json`:
  `{"name":"cli-market","owner":{"name":"e2e"},"plugins":[{"name":"demo","source":"./plugins/demo","description":"a demo plugin"}]}`
- `plugins/demo/.claude-plugin/plugin.json`:
  `{"name":"demo","version":"1.0.0","description":"a demo plugin"}`
- `plugins/demo/skills/x/SKILL.md`:
  ```
  ---
  name: x
  description: does x
  ---
  Body line for skill x.
  ```
- `git init`, `user.email`/`user.name` set, `git add .`, `git commit -m init` (commit `3d690ca`).

## Drive the flow

### 1. `./target/debug/goose marketplace list` (isolation sanity check)
```
No marketplaces configured.
```
PASS — empty, confirms sandbox isolation worked (no pre-existing real sources leaked in).
Also confirmed the real `/home/sascha/.config/goose/config.yaml` (mtime Jul 4 20:15, predating
this run) was never touched by any command in this session.

### 2. `./target/debug/goose marketplace add /tmp/goose-cli-market-fixture --kind claude --name cli-market`
```
✓ Added marketplace 'cli-market'
```
PASS.

### 3. `./target/debug/goose marketplace list`
```
  cli-market [claude] /tmp/goose-cli-market-fixture
```
PASS — matches. Sandbox `config.yaml` after this step:
```yaml
marketplaces:
- name: cli-market
  kind: claude
  location: /tmp/goose-cli-market-fixture
  enabled: true
```

### 4. `./target/debug/goose marketplace browse cli-market`
```
1 plugins in 'cli-market':
  • demo — a demo plugin
```
PASS — `demo` shown with the installable `•` marker (not `×`/Unsupported).

### 5. `./target/debug/goose marketplace install cli-market demo`
```
✓ Installed claude plugin 'demo' (1.0.0)
    source: cli-market → ./plugins/demo (local to marketplace)
    skills:
      - demo:x
⚠ Review before use: plugins may include hooks and MCP servers — code that runs local shell commands and services on your machine.
    installed at: /tmp/goose-mktplace-ApjXnx/.agents/plugins/demo
```
PASS — trust/source line, format/name/version, skill `demo:x`, hooks/MCP warning, and
"installed at" path all present as expected.

### 6. Physical verification

```
$ test -d /tmp/goose-mktplace-ApjXnx/.agents/plugins/demo && echo YES
YES

$ find /tmp/goose-mktplace-ApjXnx/.agents/plugins/demo -type f
/tmp/goose-mktplace-ApjXnx/.agents/plugins/demo/.claude-plugin/plugin.json
/tmp/goose-mktplace-ApjXnx/.agents/plugins/demo/.goose-plugin-install.json
/tmp/goose-mktplace-ApjXnx/.agents/plugins/demo/skills/x/SKILL.md

$ cat .../skills/x/SKILL.md
---
name: demo:x
description: does x
---
Body line for skill x.

$ cat .../.goose-plugin-install.json
{
  "source": "cli-market:demo",
  "source_type": "git",
  "format": "open-plugins",
  "auto_update": false,
  "last_update_check": null
}
```
PASS — install directory, `.claude-plugin/plugin.json`, and namespaced skill
`skills/x/SKILL.md` (renamed to `demo:x` in frontmatter, per plugin-skill-namespacing
behavior) are all physically present, plus per-install metadata.

**Finding (not a bug, documented behavior — see below): `config.yaml`'s `plugins:` map is
NOT populated by `marketplace install`.** After install, the sandbox `config.yaml` still only
contains the `marketplaces:` key from step 3; there is no `plugins:` key.

Root cause / explanation (read `crates/goose/src/plugins/discovery.rs` and
`crates/goose/src/plugins/mod.rs`):
- The `plugins` map in `config.yaml` is an *enable/disable override* layer, not an install
  registry. It is populated lazily by `filter_by_config()` inside
  `discover_enabled_plugins()`/`discover_enabled_plugins_with_config()`, which scans
  `plugin_install_dir()` on disk and inserts `{enabled: true}` for any newly-seen plugin path.
- `discover_enabled_plugins()` is only invoked from `HookManager::load()`
  (`crates/goose/src/hooks/mod.rs:239`) and the MCP-server plugin loader
  (`crates/goose/src/plugins/mcp_servers.rs:34`), both of which run only when an `Agent` is
  constructed for a real session (`crates/goose/src/agents/agent.rs:383`) — i.e. it requires a
  live agent/provider session, which this sandboxed CLI-only proof intentionally does not spin
  up (no API keys, no network calls to an LLM provider were used, per the isolation
  requirement).
- `list_installed_plugins()`/`InstalledPlugin.enabled` defaults absent entries to `true`
  (`unwrap_or(true)` in `crates/goose/src/plugins/mod.rs:130-133`), so a plugin that has never
  been toggled is correctly treated as installed-and-enabled even with no `config.yaml` entry.
- This is consistent with the file's own doc comment: "Newly discovered plugins are added to
  the map with `enabled: true`; plugins explicitly set to `enabled: false` are dropped" — i.e.
  the map exists to *persist disables*, not to record installs.
- Conclusion: this is by-design, not a marketplace-CLI bug. The install is fully and correctly
  recorded on disk (directory + manifest + skill + `.goose-plugin-install.json`); the
  `config.yaml` plugins map simply hasn't been populated yet because nothing has triggered
  plugin *discovery* (which only happens at agent-session start, out of scope for a
  provider-less CLI marketplace smoke test).
- Side note (unrelated, pre-existing, not a bug): `.goose-plugin-install.json`'s `format` field
  is hardcoded to the literal string `"open-plugins"` for every plugin installed via the
  open-plugins adapter (`crates/goose/src/plugins/formats/open_plugins.rs:21,113`), regardless
  of the actual detected sub-format (Claude/Codex/OpenPlugins) — which is why the file on disk
  says `"format": "open-plugins"` while the CLI correctly printed `"Installed claude plugin"`
  (using `format_for_manifest()`, a separate, correct detection used only for the in-memory
  `PluginInstall.format` returned to the caller). The metadata struct field is marked
  `#[allow(dead_code)]` in `crates/goose/src/plugins/mod.rs:81`, confirming it's known-unused
  and intentionally not relied upon — not something introduced by or specific to the
  marketplace feature.

**Enable/disable CLI check:** grepped `crates/goose-cli/src/` for
`set_plugin_enabled`/`discover_enabled_plugins`/`list_installed_plugins` — zero hits. These
APIs are only wired into `crates/goose/src/acp/server/marketplace.rs` (ACP/desktop), exactly as
`.superpowers/sdd/progress.md`'s final-review notes state ("enable/disable is ACP/desktop").
**No CLI subcommand exists for enable/disable** — noted and skipped, per the task's own escape
clause.

### Extra robustness check: `./target/debug/goose marketplace remove cli-market`
```
✓ Removed 'cli-market'
```
Followed by `marketplace list` → `No marketplaces configured.` PASS (not required by the
brief, but confirms the full add→list→browse→install→remove round trip is clean).

## Automated tests

```
cargo test -p goose marketplace
```
All 16 marketplace-related tests pass, including the exact e2e fixture test
(`marketplace::install::tests::e2e_register_fetch_install_from_local_git_marketplace`) that
this manual CLI run mirrors:
```
test marketplace::catalog::tests::parses_codex_sources ... ok
test marketplace::catalog::tests::codex_local_absolute_path_is_unsupported ... ok
test marketplace::catalog::tests::parses_claude_sources ... ok
test marketplace::fetch::tests::fetches_from_codex_agents_plugins_dir ... ok
test marketplace::fetch::tests::fetches_from_claude_plugin_dir ... ok
test marketplace::fetch::tests::fetches_and_parses_from_dir_fallback ... ok
test marketplace::install::tests::rejects_parent_dir_traversal_in_relative_path ... ok
test marketplace::install::tests::rejects_absolute_relative_path ... ok
test marketplace::install::tests::unsupported_source_errors ... ok
test marketplace::registry::tests::unset_key_returns_empty ... ok
test marketplace::install::tests::installs_relative_path_plugin_from_checkout ... ok
test marketplace::registry::tests::malformed_stored_value_is_not_swallowed ... ok
test marketplace::registry::tests::add_duplicate_name_is_error ... ok
test marketplace::registry::tests::add_list_remove_roundtrip ... ok
test marketplace::install::tests::e2e_register_fetch_install_from_local_git_marketplace ... ok
test plugins::tests::clone_marketplace_repo_ref_honors_pinned_ref ... ok

test result: ok. 16 passed; 0 failed; 0 ignored; 0 measured; 1344 filtered out
```

## Bugs found / fixes made

**None.** Every step of the CLI-driven flow (`add`, `list`, `browse`, `install`, physical
verification, `remove`) worked correctly on the first attempt, with no code changes required.
Per the task instructions ("Do NOT commit anything if no code change was needed"), no commit
was made.

## Cleanup

```
rm -rf "$SANDBOX_HOME"   # /tmp/goose-mktplace-ApjXnx
```
Executed at the end of the session. Real user config/data (`/home/sascha/.config/goose/`,
`~/.local/share/goose`, etc.) was never read or written by any command in this proof.

## Conclusion

**Status: USABLE.** The `goose marketplace` CLI workflow (add a local git marketplace, list
it, browse its catalog, install a plugin, and confirm the install landed on disk with its
skill) works end-to-end exactly as documented, with no defects found and no fixes required.
The one deviation from the task's step-6 expectation (a `plugins:` entry in `config.yaml`
immediately after install) is explained above as intentional lazy-discovery design, not a
marketplace bug — plugin enable-state in `config.yaml` is only materialized when an agent
session actually discovers plugins, which is outside the scope of a bare, provider-less
`marketplace install` CLI call.
