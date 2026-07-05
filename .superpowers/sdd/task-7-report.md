### Task 7 Report: TypeScript ACP wrappers (`ui/desktop/src/acp/marketplace.ts`)

## Files changed
- Created: `ui/desktop/src/acp/marketplace.ts` (58 lines, 8 thin wrapper functions, no business logic, no user-facing strings).

## Actual generated names used (verified against `ui/sdk/src/generated/{types.gen.ts,client.gen.ts,index.ts}`)

The brief's type-import list was almost right, with one correction:

| Brief assumed | Actual (verified) | Notes |
|---|---|---|
| `MarketplaceSourceInfo` | `MarketplaceSourceInfo` | exported standalone, no `_unstable` suffix (`types.gen.ts:838`) |
| `CatalogPluginInfo` | `CatalogPluginInfo` | exported standalone, no suffix (`types.gen.ts:863`) |
| `InstalledPluginInfo` | `InstalledPluginInfo` | exported standalone, no suffix (`types.gen.ts:894`) |
| `InstalledPluginResult` | **`InstalledPluginResult_unstable`** | the response type DOES carry the `_unstable` suffix (`types.gen.ts:876`); brief's assumed name doesn't exist |

All four types are re-exported unchanged from `ui/sdk/src/generated/index.ts` → `@aaif/goose-sdk` (`ui/sdk/src/index.ts` does `export * from "./generated/types.gen.js"`), so no derivation/indexing workaround was needed — every type imports directly.

Method names on `client.goose` (confirmed in `client.gen.ts:535-610`, matching the brief exactly, no casing adjustments needed):
- `marketplaceList_unstable({}) → ListMarketplacesResponse_unstable { marketplaces: MarketplaceSourceInfo[] }`
- `marketplaceAdd_unstable({ name, kind, location }) → void` (fire-and-forget, no response type)
- `marketplaceRemove_unstable({ name }) → void`
- `marketplaceBrowse_unstable({ name }) → BrowseMarketplaceResponse_unstable { plugins: CatalogPluginInfo[] }`
- `marketplaceInstall_unstable({ marketplace, plugin, autoUpdate }) → InstalledPluginResult_unstable`
- `pluginsList_unstable({}) → ListInstalledPluginsResponse_unstable { plugins: InstalledPluginInfo[] }`
- `pluginsSetEnabled_unstable({ name, enabled }) → void`
- `pluginsUpdate_unstable({ name }) → InstalledPluginResult_unstable`

`getAcpClient(): Promise<GooseClient>` and the `client.goose.<method>` access pattern were confirmed by reading `ui/desktop/src/acp/acpConnection.ts` and cross-checking against the existing `ui/desktop/src/acp/extensions.ts` wrapper (same pattern, same import style).

## Wrapper shape
Kept the external shape exactly as specified in the brief (function names, params, return types) — the only change from the brief's code sample is swapping `InstalledPluginResult` → `InstalledPluginResult_unstable` in the two function signatures (`installMarketplacePlugin`, `updatePlugin`) and in the type import list.

## Typecheck / lint

Environment: hermit-pinned toolchain activated via `source ./bin/activate-hermit` (pnpm 10.30.3, confirmed via `pnpm --version`).

Ran the full command specified in the brief — succeeded, no workaround needed:

```
pnpm -C ui/desktop run lint:check
```

Result: **exit code 0**. Breakdown of the three composed steps (`tsc --noEmit && eslint "src/**/*.{ts,tsx}" --max-warnings 0 --no-warn-ignored && i18n:check`):
- `tsc --noEmit` — passed, no errors (only harmless `WARN Unsupported platform` npm messages about darwin/win32 optional binaries, unrelated to this change / this Linux CI-like environment).
- `eslint` — passed with `--max-warnings 0` (no output = clean).
- `i18n:check` — passed: "i18n locale validation passed for de, es, fr, hi, id, it, ja, ko, ms, pt, ru, tr, vi, zh-CN, zh-TW (1509 messages)." Expected, since this file adds zero user-facing strings.

No BLOCKED condition was hit — `pnpm install` was not needed; the workspace's existing `node_modules` were already usable.

## Self-review

- **Thin wrappers only**: every exported function does exactly one `getAcpClient()` + one `client.goose.<method>_unstable(...)` call, then returns the relevant field (or `void`). No mapping/transformation logic, unlike `extensions.ts` (which needs shape conversion because its Rust/ACP types diverge from the desktop UI's local `ExtensionConfig`/`ExtensionEntry` types). Marketplace/plugin types have no such local UI-type layer yet (that's Plan 2b's job), so there was nothing to convert — matching the brief's expectation that this is pure passthrough.
- **No user-facing strings**: confirmed no string literals other than JSON param keys / ACP method names (not translatable UI text) — i18n:check green confirms this mechanically.
- **Type accuracy**: all four imported types and eight method names were verified against the actual generated `types.gen.ts` / `client.gen.ts` output (Task 6, commit `f4f49aece`) rather than trusted from the brief. Found and corrected the one real discrepancy: `InstalledPluginResult` → `InstalledPluginResult_unstable`.
- **Consumability by Plan 2b**: function names (`listMarketplaces`, `addMarketplace`, `removeMarketplace`, `browseMarketplace`, `installMarketplacePlugin`, `listInstalledPlugins`, `setPluginEnabled`, `updatePlugin`) match the brief's "Produces" interface list exactly, so Plan 2b's `useMarketplace` hook can import these names unchanged; only the `InstalledPluginResult_unstable` type name needs to be used instead of `InstalledPluginResult` wherever Plan 2b types the install/update results.

## Concerns

- None blocking. The single naming surprise (`InstalledPluginResult_unstable`) is now documented here and in the file's own imports, so Plan 2b's UI work should reference `InstalledPluginResult_unstable` (re-exported from `@aaif/goose-sdk`) rather than the brief's assumed bare name.
- `marketplaceAdd_unstable`, `marketplaceRemove_unstable`, and `pluginsSetEnabled_unstable` have no declared response type in `client.gen.ts` (the calls are awaited but not returned/parsed), consistent with the wrappers returning `Promise<void>` — this matches existing sibling wrappers in `extensions.ts` (e.g. `removeConfigExtension`) doing the same "await, don't return" pattern.
