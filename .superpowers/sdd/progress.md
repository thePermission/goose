# SDD Progress — Desktop Marketplaces Plan 2a
Branch: feature/marketplace-desktop-ui

Task 1: complete (commits 8a6d579..96d55ba, review clean).
  Known (pre-existing, not ours): discovery test flake under parallel (GOOSE_PATH_ROOT env race).
Task 2: complete (commits 96d55ba..b18da1f, review clean).
  Minor (final-review triage): set_plugin_enabled_path/plugin_enabled_map use get_param(...).unwrap_or_default() (mirrors pre-existing filter_by_config); theoretical clobber only on corrupt (not absent) plugins value.
Task 3: complete (commits b18da1f..83b9a66, review clean; InstalledPluginResult JsonRpcResponse derive fix verified).
Task 4: complete (commits 83b9a66..e406f6d, review clean).
  Minor (final-review triage): (a) marketplace.rs kind->string via format!("{:?}") instead of MarketplaceSource::kind_str(); (b) duplicated find-marketplace-by-name block in browse+install (both inherited from brief).
Task 5: complete (commits e406f6d..18aa5b4, review clean).
Task 6: complete (commits 18aa5b4..f4f49ae, review clean; generated methods+types verified). Note: generated TS type names may be _unstable-suffixed; JS toolchain = hermit (./bin/activate-hermit, pnpm 10.30.3).
Task 7: complete (commits f4f49ae..3e8ecc7, review clean). ALL 7 Plan-2a tasks done.

== FINAL whole-branch review (opus): Ready to merge = WITH FIXES ==
Important #1: browse/install/update handlers run blocking git (no timeout) inside async fn -> freezes ACP connection (single actor). Fix: tokio::task::spawn_blocking (pattern: providers.rs:694). FIXING NOW.
Minor #3: use MarketplaceKind::kind_str() not format!("{:?}"). FIXING NOW.
Minor #5: dedup find-marketplace-by-name helper. FIXING NOW.
Follow-up (Plan 2b / documented): #2 list_installed_plugins is global-dir + config.yaml-layer only (omits project-local + settings.json layer) — deliberate v1 scope, document in 2b.
Follow-up: #4 get_param unwrap_or_default clobber on corrupt plugins value (pre-existing pattern; consider logging). #6 on_marketplace_add maps all errors to invalid_params.
Not ours: discovery parallel test flake (GOOSE_PATH_ROOT).
Fix wave (final review): commit 3e8ecc7..0f3a1c5 — #1 spawn_blocking, #3 kind_str, #5 dedup. Re-review APPROVED (TempDir lifetime + Send verified; kind_str byte-identical; no regression). Plan 2a COMPLETE at 0f3a1c5ef.
