### Task 7: TypeScript ACP wrappers

**Files:**
- Create: `ui/desktop/src/acp/marketplace.ts`
- Test: typecheck via `pnpm -C ui/desktop run lint:check` (tsc + eslint + i18n:check)

**Interfaces:**
- Consumes: generated `client.goose.<method>_unstable` from Task 6; `getAcpClient` from `./acpConnection`.
- Produces (consumed by Plan 2b): `listMarketplaces`, `addMarketplace`, `removeMarketplace`, `browseMarketplace`, `installMarketplacePlugin`, `listInstalledPlugins`, `setPluginEnabled`, `updatePlugin` and the TS types re-exported from `@aaif/goose-sdk`.

- [ ] **Step 1: Wrappers** (mirror `ui/desktop/src/acp/extensions.ts`; use the EXACT generated method names verified in Task 6 Step 2 — adjust casing if the generator differs)

```ts
import { getAcpClient } from './acpConnection';
import type {
  MarketplaceSourceInfo,
  CatalogPluginInfo,
  InstalledPluginInfo,
  InstalledPluginResult,
} from '@aaif/goose-sdk';

export async function listMarketplaces(): Promise<MarketplaceSourceInfo[]> {
  const client = await getAcpClient();
  const res = await client.goose.marketplaceList_unstable({});
  return res.marketplaces;
}

export async function addMarketplace(name: string, kind: string, location: string): Promise<void> {
  const client = await getAcpClient();
  await client.goose.marketplaceAdd_unstable({ name, kind, location });
}

export async function removeMarketplace(name: string): Promise<void> {
  const client = await getAcpClient();
  await client.goose.marketplaceRemove_unstable({ name });
}

export async function browseMarketplace(name: string): Promise<CatalogPluginInfo[]> {
  const client = await getAcpClient();
  const res = await client.goose.marketplaceBrowse_unstable({ name });
  return res.plugins;
}

export async function installMarketplacePlugin(
  marketplace: string,
  plugin: string,
  autoUpdate = false
): Promise<InstalledPluginResult> {
  const client = await getAcpClient();
  return await client.goose.marketplaceInstall_unstable({ marketplace, plugin, autoUpdate });
}

export async function listInstalledPlugins(): Promise<InstalledPluginInfo[]> {
  const client = await getAcpClient();
  const res = await client.goose.pluginsList_unstable({});
  return res.plugins;
}

export async function setPluginEnabled(name: string, enabled: boolean): Promise<void> {
  const client = await getAcpClient();
  await client.goose.pluginsSetEnabled_unstable({ name, enabled });
}

export async function updatePlugin(name: string): Promise<InstalledPluginResult> {
  const client = await getAcpClient();
  return await client.goose.pluginsUpdate_unstable({ name });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -C ui/desktop run lint:check`
Expected: passes (tsc finds the generated types + client methods; no eslint/i18n errors — this file adds no user-facing strings).

- [ ] **Step 3: Commit**

```bash
git add ui/desktop/src/acp/marketplace.ts
git commit -m "feat(desktop): ACP TS wrappers for marketplace + plugin management"
```

---

## Self-Review

**Spec coverage (backend portion):** sources CRUD → Task 4 (list/add/remove) ✅; browse → Task 4 ✅; install (clone-once + trust fields) → Task 4 (`InstalledPluginResult` carries skills/has_hooks/has_mcp/source) ✅; installed list/enable-disable/update → Tasks 1/2/5 ✅; ACP transport → Tasks 3–6 ✅; TS callable → Task 7 ✅. **UI itself (views, i18n, tests) → Plan 2b.**

**Placeholder scan:** none — every code step is complete. The two guarded notes (`.internal_err()` availability; generated method-name casing) instruct verification against a named real file, not blanks.

**Type consistency:** `InstalledPlugin` (Task 1) → `InstalledPluginInfo` (Task 3) mapping in Task 5 fields match; `PluginInstall` → `install_to_result` → `InstalledPluginResult` fields match Task 3; `PluginSource` variants in `source_kind_label`/`installable` match Plan-1 `catalog.rs`; method strings ↔ generated names verified in Task 6.

**Open verification points (baked into task steps):** `.internal_err()` trait scope (Task 4 note); exact generated client method casing (Task 6 Step 2 → Task 7); `Config::new` test-constructor signature (Tasks 1/2, precedented in `discovery.rs`).

**Follow-up:** Plan 2b (React `MarketplacesView` + `useMarketplace` + routing + i18n + vitest/Playwright) — write it against the generated SDK **after** 2a lands.
