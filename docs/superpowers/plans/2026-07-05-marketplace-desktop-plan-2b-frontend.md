# Marketplaces Desktop UI (Frontend, Plan 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the goose Desktop (electron/React) "Marketplaces" top-level view that lets users add/list/remove marketplace sources, browse a source catalog, multi-select and install plugins behind a trust dialog, and manage installed plugins (enable/disable/update) — consuming the already-generated ACP wrapper `ui/desktop/src/acp/marketplace.ts`.

**Architecture:** A React context/hook (`useMarketplace`, mirroring `ConfigContext`/`useConfig`) owns state (`sources`, `catalog`, `installedPlugins`) plus per-op loading/error flags and wraps the existing ACP wrapper functions. Three presentational sections (`SourcesSection`, `BrowseSection`, `InstalledSection`) consume the hook and are composed by `MarketplacesView` inside `MainPanelLayout`; a new `/marketplaces` route + sidebar item + `View` union member wire it into the app. Errors surface as toasts via the existing `toastService`; the trust dialog gates installs.

**Tech Stack:** React 19 + TypeScript (bundler/`isolatedModules`, `strict`, `noUnusedLocals`), react-router-dom (HashRouter), react-intl (`defineMessages`/`useIntl`), Radix UI (`Switch`), Vitest + `@testing-library/react` (jsdom) for unit/component tests, Playwright for E2E, pnpm as the package manager. ACP JSON-RPC via `@aaif/goose-sdk` `GooseExtClient` (already generated).

## Global Constraints

- **Full v1 scope (no reduction):** Sources add/list/remove · Browse catalog (installable vs. `Unsupported`, marked & disabled) with multi-select install + Trust dialog · Installed list/enable/disable/update. (Spec §Scope, §Komponenten 5)
- **ACP-only, no REST:** the frontend talks only via `ui/desktop/src/acp/marketplace.ts` → `GooseExtClient`. `ui/desktop/src/api` does not exist; do not create or call any REST/openapi path. (Spec §Architektur-Entscheidung)
- **Generated files already exist — do NOT regenerate or edit them:** ACP schema (`crates/goose/acp-{schema,meta}.json`), `ui/sdk/src/generated/*`, `GooseExtClient`, and the wrapper `ui/desktop/src/acp/marketplace.ts` are done (Plan 2a). Consume them; never run `just generate-acp-*` in this plan. (Spec §Codegen, §TS-Layer)
- **i18n via `defineMessages` + `i18n:check` green:** every user-facing string uses `defineMessages`/`intl.formatMessage`; message IDs are dot-hierarchical (`marketplaces.<section>.<key>`). CI runs `pnpm i18n:check`. (Spec §Komponenten 5, §Teststrategie)
- **i18n locale parity (hard requirement):** `scripts/i18n-validate-locale.js` (part of `i18n:check`) requires **every** locale catalog in `src/i18n/messages/*.json` to contain **exactly** the same key set as `en.json` (16 locales total; all 15 non-English catalogs currently have every en.json key). New `marketplaces.*` / `navigation.itemMarketplaces` keys MUST be added to `en.json` (via `pnpm i18n:extract`) **and** to all 15 non-English catalogs, or `i18n:check` fails. This is handled centrally in Task 6; Tasks 2–5 therefore run scoped `eslint` + `typecheck` but do **not** run the full `pnpm lint:check`/`i18n:check` until Task 6.
- **Lint/typecheck clean:** `pnpm lint:check` = `tsc --noEmit` + `eslint … --max-warnings 0` + `i18n:check`, all green. No `any`, no unused locals/params (`noUnusedLocals`/`noUnusedParameters` are on). (Spec §Teststrategie)
- **Tests:** Vitest component tests with the ACP client mocked (Sources form add/validate/remove; Browse selection+install incl. `Unsupported` disabled + Trust dialog + per-plugin partial errors; Installed toggle/update). Real Playwright E2E (add→browse→install against a local git fixture marketplace, needs running `goosed`) is the goal; a manual runbook is the documented fallback if Playwright + `goosed` are CI-unstable. (Spec §Teststrategie, §Plan-2b-Entscheidungen)
- **Out of scope (deferred, do NOT implement):** (1) per-plugin auto-update toggle in the UI (v1 only *displays* `autoUpdate`); (2) real progress streaming for long git ops (v1 uses a simple busy/disabled state); (3) conflict UI for same-named plugins across marketplaces. (`docs/marketplace-ui-future-work.md`)
- **Package manager:** pnpm (`engines.pnpm >=10.30.0`). All commands run from `ui/desktop/`.

---

### Task 1: `useMarketplace` hook + context

Owns marketplace state and actions; wraps the existing ACP wrapper. Deliverable: a `MarketplaceProvider`/`useMarketplace` pair whose actions call the wrapper with correct loading/error bookkeeping and per-plugin install outcomes, verified with the ACP wrapper mocked.

**Files:**
- Create: `ui/desktop/src/components/marketplaces/errorMessage.ts`
- Create: `ui/desktop/src/components/marketplaces/MarketplaceContext.tsx`
- Test: `ui/desktop/src/components/marketplaces/MarketplaceContext.test.tsx`

**Interfaces:**
- Consumes (from existing wrapper `ui/desktop/src/acp/marketplace.ts`, do not modify):
  - `listMarketplaces(): Promise<MarketplaceSourceInfo[]>`
  - `addMarketplace(name: string, kind: string, location: string): Promise<void>`
  - `removeMarketplace(name: string): Promise<void>`
  - `browseMarketplace(name: string): Promise<CatalogPluginInfo[]>`
  - `installMarketplacePlugin(marketplace: string, plugin: string, autoUpdate?: boolean): Promise<InstalledPluginResult_unstable>`
  - `listInstalledPlugins(): Promise<InstalledPluginInfo[]>`
  - `setPluginEnabled(name: string, enabled: boolean): Promise<void>`
  - `updatePlugin(name: string): Promise<InstalledPluginResult_unstable>`
- Consumes (SDK types from `@aaif/goose-sdk`):
  - `MarketplaceSourceInfo { name: string; kind: string; location: string; enabled: boolean }`
  - `CatalogPluginInfo { name: string; description?: string | null; installable: boolean; sourceKind: string }`
  - `InstalledPluginInfo { name: string; version: string; source: string; enabled: boolean; autoUpdate: boolean; updatable: boolean }`
  - `InstalledPluginResult_unstable { name: string; version: string; format: string; source: string; skills: string[]; hasHooks: boolean; hasMcp: boolean }`
- Produces (for Tasks 2–5):
  - `export function errorMessage(e: unknown): string` (from `./errorMessage`)
  - `export type InstallOutcome = { plugin: string; ok: true; result: InstalledPluginResult_unstable } | { plugin: string; ok: false; error: string }`
  - `export interface MarketplaceLoading { sources: boolean; browse: boolean; install: boolean; installed: boolean }`
  - `export interface MarketplaceErrors { sources: string | null; browse: string | null; install: string | null; installed: string | null }`
  - `export interface MarketplaceContextValue { sources: MarketplaceSourceInfo[]; catalog: CatalogPluginInfo[]; browsedSource: string | null; installedPlugins: InstalledPluginInfo[]; loading: MarketplaceLoading; errors: MarketplaceErrors; refreshSources: () => Promise<void>; addSource: (name: string, kind: string, location: string) => Promise<void>; removeSource: (name: string) => Promise<void>; browse: (name: string) => Promise<void>; install: (marketplace: string, plugins: string[], autoUpdate?: boolean) => Promise<InstallOutcome[]>; refreshInstalled: () => Promise<void>; setPluginEnabled: (name: string, enabled: boolean) => Promise<void>; updatePlugin: (name: string) => Promise<void> }`
  - `export const MarketplaceProvider: React.FC<{ children: React.ReactNode }>`
  - `export function useMarketplace(): MarketplaceContextValue`

- [ ] **Step 1: Write the failing test**

Create `ui/desktop/src/components/marketplaces/MarketplaceContext.test.tsx`:

```tsx
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MarketplaceProvider, useMarketplace } from './MarketplaceContext';
import * as marketplaceAcp from '../../acp/marketplace';

vi.mock('../../acp/marketplace', () => ({
  listMarketplaces: vi.fn(),
  addMarketplace: vi.fn(),
  removeMarketplace: vi.fn(),
  browseMarketplace: vi.fn(),
  installMarketplacePlugin: vi.fn(),
  listInstalledPlugins: vi.fn(),
  setPluginEnabled: vi.fn(),
  updatePlugin: vi.fn(),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MarketplaceProvider>{children}</MarketplaceProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(marketplaceAcp.listMarketplaces).mockResolvedValue([]);
  vi.mocked(marketplaceAcp.listInstalledPlugins).mockResolvedValue([]);
  vi.mocked(marketplaceAcp.addMarketplace).mockResolvedValue(undefined);
  vi.mocked(marketplaceAcp.removeMarketplace).mockResolvedValue(undefined);
  vi.mocked(marketplaceAcp.setPluginEnabled).mockResolvedValue(undefined);
});

describe('useMarketplace', () => {
  it('loads sources and installed plugins on mount', async () => {
    vi.mocked(marketplaceAcp.listMarketplaces).mockResolvedValue([
      { name: 'core', kind: 'claude', location: 'https://ex/repo.git', enabled: true },
    ]);
    vi.mocked(marketplaceAcp.listInstalledPlugins).mockResolvedValue([
      { name: 'demo', version: '1.0.0', source: 'core', enabled: true, autoUpdate: false, updatable: true },
    ]);
    const { result } = renderHook(() => useMarketplace(), { wrapper });
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
    expect(result.current.sources[0].name).toBe('core');
    expect(result.current.installedPlugins[0].name).toBe('demo');
  });

  it('addSource calls the wrapper then refreshes sources', async () => {
    const { result } = renderHook(() => useMarketplace(), { wrapper });
    await waitFor(() => expect(marketplaceAcp.listMarketplaces).toHaveBeenCalledTimes(1));
    await act(async () => {
      await result.current.addSource('m', 'codex', './repo');
    });
    expect(marketplaceAcp.addMarketplace).toHaveBeenCalledWith('m', 'codex', './repo');
    expect(marketplaceAcp.listMarketplaces).toHaveBeenCalledTimes(2);
  });

  it('browse populates catalog and browsedSource on success', async () => {
    vi.mocked(marketplaceAcp.browseMarketplace).mockResolvedValue([
      { name: 'a', description: 'x', installable: true, sourceKind: 'git' },
    ]);
    const { result } = renderHook(() => useMarketplace(), { wrapper });
    await act(async () => {
      await result.current.browse('core');
    });
    expect(result.current.catalog).toHaveLength(1);
    expect(result.current.browsedSource).toBe('core');
    expect(result.current.errors.browse).toBeNull();
  });

  it('browse failure records an error and clears the catalog', async () => {
    vi.mocked(marketplaceAcp.browseMarketplace).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useMarketplace(), { wrapper });
    await act(async () => {
      await result.current.browse('core');
    });
    expect(result.current.catalog).toHaveLength(0);
    expect(result.current.errors.browse).toBe('offline');
  });

  it('install collects per-plugin outcomes, keeps going after a failure, and refreshes installed', async () => {
    vi.mocked(marketplaceAcp.installMarketplacePlugin).mockImplementation(async (_m, plugin) => {
      if (plugin === 'bad') throw new Error('boom');
      return {
        name: plugin, version: '1.0.0', format: 'claude', source: 'core',
        skills: [], hasHooks: false, hasMcp: false,
      };
    });
    const { result } = renderHook(() => useMarketplace(), { wrapper });
    await waitFor(() => expect(marketplaceAcp.listInstalledPlugins).toHaveBeenCalledTimes(1));
    let outcomes: Awaited<ReturnType<typeof result.current.install>> = [];
    await act(async () => {
      outcomes = await result.current.install('core', ['good', 'bad']);
    });
    expect(outcomes).toHaveLength(2);
    expect(outcomes[0]).toMatchObject({ plugin: 'good', ok: true });
    expect(outcomes[1]).toMatchObject({ plugin: 'bad', ok: false, error: 'boom' });
    expect(result.current.errors.install).toContain('bad: boom');
    expect(marketplaceAcp.listInstalledPlugins).toHaveBeenCalledTimes(2);
  });

  it('setPluginEnabled and updatePlugin call the wrapper then refresh installed', async () => {
    vi.mocked(marketplaceAcp.updatePlugin).mockResolvedValue({
      name: 'demo', version: '2.0.0', format: 'claude', source: 'core',
      skills: [], hasHooks: false, hasMcp: false,
    });
    const { result } = renderHook(() => useMarketplace(), { wrapper });
    await waitFor(() => expect(marketplaceAcp.listInstalledPlugins).toHaveBeenCalledTimes(1));
    await act(async () => {
      await result.current.setPluginEnabled('demo', false);
      await result.current.updatePlugin('demo');
    });
    expect(marketplaceAcp.setPluginEnabled).toHaveBeenCalledWith('demo', false);
    expect(marketplaceAcp.updatePlugin).toHaveBeenCalledWith('demo');
    expect(marketplaceAcp.listInstalledPlugins).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run -- src/components/marketplaces/MarketplaceContext.test.tsx`
Expected: FAIL — cannot resolve import `./MarketplaceContext` ("Failed to resolve import ... MarketplaceContext").

- [ ] **Step 3: Write the minimal implementation**

Create `ui/desktop/src/components/marketplaces/errorMessage.ts`:

```ts
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
```

Create `ui/desktop/src/components/marketplaces/MarketplaceContext.tsx`:

```tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type {
  MarketplaceSourceInfo,
  CatalogPluginInfo,
  InstalledPluginInfo,
  InstalledPluginResult_unstable,
} from '@aaif/goose-sdk';
import {
  listMarketplaces,
  addMarketplace,
  removeMarketplace,
  browseMarketplace,
  installMarketplacePlugin,
  listInstalledPlugins,
  setPluginEnabled as acpSetPluginEnabled,
  updatePlugin as acpUpdatePlugin,
} from '../../acp/marketplace';
import { errorMessage } from './errorMessage';

export type InstallOutcome =
  | { plugin: string; ok: true; result: InstalledPluginResult_unstable }
  | { plugin: string; ok: false; error: string };

export interface MarketplaceLoading {
  sources: boolean;
  browse: boolean;
  install: boolean;
  installed: boolean;
}

export interface MarketplaceErrors {
  sources: string | null;
  browse: string | null;
  install: string | null;
  installed: string | null;
}

export interface MarketplaceContextValue {
  sources: MarketplaceSourceInfo[];
  catalog: CatalogPluginInfo[];
  browsedSource: string | null;
  installedPlugins: InstalledPluginInfo[];
  loading: MarketplaceLoading;
  errors: MarketplaceErrors;
  refreshSources: () => Promise<void>;
  addSource: (name: string, kind: string, location: string) => Promise<void>;
  removeSource: (name: string) => Promise<void>;
  browse: (name: string) => Promise<void>;
  install: (marketplace: string, plugins: string[], autoUpdate?: boolean) => Promise<InstallOutcome[]>;
  refreshInstalled: () => Promise<void>;
  setPluginEnabled: (name: string, enabled: boolean) => Promise<void>;
  updatePlugin: (name: string) => Promise<void>;
}

const MarketplaceContext = createContext<MarketplaceContextValue | undefined>(undefined);

export const MarketplaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sources, setSources] = useState<MarketplaceSourceInfo[]>([]);
  const [catalog, setCatalog] = useState<CatalogPluginInfo[]>([]);
  const [browsedSource, setBrowsedSource] = useState<string | null>(null);
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPluginInfo[]>([]);
  const [loading, setLoading] = useState<MarketplaceLoading>({
    sources: false,
    browse: false,
    install: false,
    installed: false,
  });
  const [errors, setErrors] = useState<MarketplaceErrors>({
    sources: null,
    browse: null,
    install: null,
    installed: null,
  });

  const refreshSources = useCallback(async () => {
    setLoading((p) => ({ ...p, sources: true }));
    setErrors((p) => ({ ...p, sources: null }));
    try {
      setSources(await listMarketplaces());
    } catch (e) {
      setErrors((p) => ({ ...p, sources: errorMessage(e) }));
    } finally {
      setLoading((p) => ({ ...p, sources: false }));
    }
  }, []);

  const refreshInstalled = useCallback(async () => {
    setLoading((p) => ({ ...p, installed: true }));
    setErrors((p) => ({ ...p, installed: null }));
    try {
      setInstalledPlugins(await listInstalledPlugins());
    } catch (e) {
      setErrors((p) => ({ ...p, installed: errorMessage(e) }));
    } finally {
      setLoading((p) => ({ ...p, installed: false }));
    }
  }, []);

  const addSource = useCallback(
    async (name: string, kind: string, location: string) => {
      await addMarketplace(name, kind, location);
      await refreshSources();
    },
    [refreshSources]
  );

  const removeSource = useCallback(
    async (name: string) => {
      await removeMarketplace(name);
      await refreshSources();
    },
    [refreshSources]
  );

  const browse = useCallback(async (name: string) => {
    setLoading((p) => ({ ...p, browse: true }));
    setErrors((p) => ({ ...p, browse: null }));
    try {
      const plugins = await browseMarketplace(name);
      setCatalog(plugins);
      setBrowsedSource(name);
    } catch (e) {
      setCatalog([]);
      setBrowsedSource(name);
      setErrors((p) => ({ ...p, browse: errorMessage(e) }));
    } finally {
      setLoading((p) => ({ ...p, browse: false }));
    }
  }, []);

  const install = useCallback(
    async (marketplace: string, plugins: string[], autoUpdate = false) => {
      setLoading((p) => ({ ...p, install: true }));
      setErrors((p) => ({ ...p, install: null }));
      const outcomes: InstallOutcome[] = [];
      for (const plugin of plugins) {
        try {
          const result = await installMarketplacePlugin(marketplace, plugin, autoUpdate);
          outcomes.push({ plugin, ok: true, result });
        } catch (e) {
          outcomes.push({ plugin, ok: false, error: errorMessage(e) });
        }
      }
      await refreshInstalled();
      const failed = outcomes.filter(
        (o): o is Extract<InstallOutcome, { ok: false }> => !o.ok
      );
      if (failed.length > 0) {
        setErrors((p) => ({
          ...p,
          install: failed.map((o) => `${o.plugin}: ${o.error}`).join('; '),
        }));
      }
      setLoading((p) => ({ ...p, install: false }));
      return outcomes;
    },
    [refreshInstalled]
  );

  const setPluginEnabled = useCallback(
    async (name: string, enabled: boolean) => {
      await acpSetPluginEnabled(name, enabled);
      await refreshInstalled();
    },
    [refreshInstalled]
  );

  const updatePlugin = useCallback(
    async (name: string) => {
      await acpUpdatePlugin(name);
      await refreshInstalled();
    },
    [refreshInstalled]
  );

  useEffect(() => {
    void refreshSources();
    void refreshInstalled();
  }, [refreshSources, refreshInstalled]);

  const value = useMemo<MarketplaceContextValue>(
    () => ({
      sources,
      catalog,
      browsedSource,
      installedPlugins,
      loading,
      errors,
      refreshSources,
      addSource,
      removeSource,
      browse,
      install,
      refreshInstalled,
      setPluginEnabled,
      updatePlugin,
    }),
    [
      sources,
      catalog,
      browsedSource,
      installedPlugins,
      loading,
      errors,
      refreshSources,
      addSource,
      removeSource,
      browse,
      install,
      refreshInstalled,
      setPluginEnabled,
      updatePlugin,
    ]
  );

  return <MarketplaceContext.Provider value={value}>{children}</MarketplaceContext.Provider>;
};

export function useMarketplace(): MarketplaceContextValue {
  const ctx = useContext(MarketplaceContext);
  if (ctx === undefined) {
    throw new Error('useMarketplace must be used within a MarketplaceProvider');
  }
  return ctx;
}
```

- [ ] **Step 4: Run the test + typecheck + lint to verify they pass**

Run: `pnpm test:run -- src/components/marketplaces/MarketplaceContext.test.tsx`
Expected: PASS (6 tests).
Run: `pnpm typecheck`
Expected: PASS (exit 0, no errors).
Run: `pnpm exec eslint "src/components/marketplaces/**/*.{ts,tsx}" --max-warnings 0 --no-warn-ignored`
Expected: PASS (exit 0).

- [ ] **Step 5: Commit**

```bash
git add ui/desktop/src/components/marketplaces/errorMessage.ts \
        ui/desktop/src/components/marketplaces/MarketplaceContext.tsx \
        ui/desktop/src/components/marketplaces/MarketplaceContext.test.tsx
git commit -m "feat(marketplaces): add useMarketplace hook and context"
```

---

### Task 2: Sources section (add / validate / list / remove)

Deliverable: `SourcesSection` renders configured sources, validates and adds a new source (Name, Location, Kind = Claude|Codex), and removes sources — surfacing failures as toasts. Verified with `useMarketplace` and `toastService` mocked.

**Files:**
- Create: `ui/desktop/src/components/marketplaces/SourcesSection.tsx`
- Test: `ui/desktop/src/components/marketplaces/SourcesSection.test.tsx`

**Interfaces:**
- Consumes: `useMarketplace()` → `{ sources, addSource, removeSource }` (Task 1); `errorMessage` (from `./errorMessage`, Task 1); `toastService` from `../../toasts` (existing: `toastService.error({ title: string; msg: string; traceback?: string }): void`); UI `Button` (`../ui/button`), `Input` (`../ui/input`); `defineMessages`, `useIntl` (`../../i18n`); `Trash2` (`lucide-react`).
- Kind string values passed to `addSource`: `'claude'` or `'codex'` (backend `parse_kind` accepts only these).
- Produces: `export default function SourcesSection(): JSX.Element` and stable E2E hooks `data-testid`: `marketplace-source-name`, `marketplace-source-location`, `marketplace-source-kind`, `marketplace-source-add`, `marketplace-source-remove-<name>`.

- [ ] **Step 1: Write the failing test**

Create `ui/desktop/src/components/marketplaces/SourcesSection.test.tsx`:

```tsx
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, type RenderOptions } from '@testing-library/react';
import { IntlTestWrapper } from '../../i18n/test-utils';
import SourcesSection from './SourcesSection';
import { useMarketplace, type MarketplaceContextValue } from './MarketplaceContext';
import { toastService } from '../../toasts';

vi.mock('./MarketplaceContext', () => ({ useMarketplace: vi.fn() }));
vi.mock('../../toasts', () => ({ toastService: { error: vi.fn(), success: vi.fn() } }));

function makeCtx(overrides: Partial<MarketplaceContextValue> = {}): MarketplaceContextValue {
  return {
    sources: [],
    catalog: [],
    browsedSource: null,
    installedPlugins: [],
    loading: { sources: false, browse: false, install: false, installed: false },
    errors: { sources: null, browse: null, install: null, installed: null },
    refreshSources: vi.fn().mockResolvedValue(undefined),
    addSource: vi.fn().mockResolvedValue(undefined),
    removeSource: vi.fn().mockResolvedValue(undefined),
    browse: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue([]),
    refreshInstalled: vi.fn().mockResolvedValue(undefined),
    setPluginEnabled: vi.fn().mockResolvedValue(undefined),
    updatePlugin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const renderWithIntl = (ui: React.ReactElement, o?: RenderOptions) =>
  render(ui, { wrapper: IntlTestWrapper, ...o });

beforeEach(() => vi.clearAllMocks());

describe('SourcesSection', () => {
  it('lists configured sources with name, kind and location', () => {
    vi.mocked(useMarketplace).mockReturnValue(
      makeCtx({
        sources: [{ name: 'core', kind: 'claude', location: 'https://ex/r.git', enabled: true }],
      })
    );
    renderWithIntl(<SourcesSection />);
    expect(screen.getByText('core')).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/ex\/r\.git/)).toBeInTheDocument();
  });

  it('rejects an add with empty name or location and does not call addSource', () => {
    const addSource = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useMarketplace).mockReturnValue(makeCtx({ addSource }));
    renderWithIntl(<SourcesSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(addSource).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Name and location are required.');
  });

  it('adds a source with the entered name, selected kind and location', async () => {
    const addSource = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useMarketplace).mockReturnValue(makeCtx({ addSource }));
    renderWithIntl(<SourcesSection />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'mp' } });
    fireEvent.change(screen.getByLabelText('Git URL or path'), { target: { value: './repo' } });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'codex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(addSource).toHaveBeenCalledWith('mp', 'codex', './repo'));
  });

  it('shows a toast when adding fails', async () => {
    const addSource = vi.fn().mockRejectedValue(new Error('duplicate'));
    vi.mocked(useMarketplace).mockReturnValue(makeCtx({ addSource }));
    renderWithIntl(<SourcesSection />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'mp' } });
    fireEvent.change(screen.getByLabelText('Git URL or path'), { target: { value: './repo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(toastService.error).toHaveBeenCalled());
  });

  it('removes a source when its remove button is clicked', async () => {
    const removeSource = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useMarketplace).mockReturnValue(
      makeCtx({
        sources: [{ name: 'core', kind: 'claude', location: 'x', enabled: true }],
        removeSource,
      })
    );
    renderWithIntl(<SourcesSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(removeSource).toHaveBeenCalledWith('core'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run -- src/components/marketplaces/SourcesSection.test.tsx`
Expected: FAIL — cannot resolve import `./SourcesSection`.

- [ ] **Step 3: Write the minimal implementation**

Create `ui/desktop/src/components/marketplaces/SourcesSection.tsx`:

```tsx
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useMarketplace } from './MarketplaceContext';
import { errorMessage } from './errorMessage';
import { toastService } from '../../toasts';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  heading: { id: 'marketplaces.sources.heading', defaultMessage: 'Sources' },
  namePlaceholder: { id: 'marketplaces.sources.namePlaceholder', defaultMessage: 'Name' },
  locationPlaceholder: {
    id: 'marketplaces.sources.locationPlaceholder',
    defaultMessage: 'Git URL or path',
  },
  kindLabel: { id: 'marketplaces.sources.kindLabel', defaultMessage: 'Kind' },
  kindClaude: { id: 'marketplaces.sources.kindClaude', defaultMessage: 'Claude' },
  kindCodex: { id: 'marketplaces.sources.kindCodex', defaultMessage: 'Codex' },
  add: { id: 'marketplaces.sources.add', defaultMessage: 'Add' },
  remove: { id: 'marketplaces.sources.remove', defaultMessage: 'Remove' },
  required: {
    id: 'marketplaces.sources.required',
    defaultMessage: 'Name and location are required.',
  },
  addFailed: { id: 'marketplaces.sources.addFailed', defaultMessage: 'Failed to add source' },
  removeFailed: { id: 'marketplaces.sources.removeFailed', defaultMessage: 'Failed to remove source' },
  empty: { id: 'marketplaces.sources.empty', defaultMessage: 'No sources configured yet.' },
});

export default function SourcesSection() {
  const intl = useIntl();
  const { sources, addSource, removeSource } = useMarketplace();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [kind, setKind] = useState('claude');
  const [formError, setFormError] = useState<string | null>(null);

  const handleAdd = async () => {
    if (name.trim() === '' || location.trim() === '') {
      setFormError(intl.formatMessage(i18n.required));
      return;
    }
    setFormError(null);
    try {
      await addSource(name.trim(), kind, location.trim());
      setName('');
      setLocation('');
      setKind('claude');
    } catch (e) {
      setFormError(errorMessage(e));
      toastService.error({
        title: intl.formatMessage(i18n.addFailed),
        msg: errorMessage(e),
        traceback: errorMessage(e),
      });
    }
  };

  const handleRemove = async (sourceName: string) => {
    try {
      await removeSource(sourceName);
    } catch (e) {
      toastService.error({
        title: intl.formatMessage(i18n.removeFailed),
        msg: errorMessage(e),
        traceback: errorMessage(e),
      });
    }
  };

  return (
    <section aria-label={intl.formatMessage(i18n.heading)}>
      <h2 className="text-lg font-medium mb-3">{intl.formatMessage(i18n.heading)}</h2>

      {sources.length === 0 ? (
        <p className="text-sm text-text-secondary mb-3">{intl.formatMessage(i18n.empty)}</p>
      ) : (
        <ul className="flex flex-col gap-2 mb-4">
          {sources.map((s) => (
            <li
              key={s.name}
              className="flex items-center justify-between border border-border-primary rounded-md px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{s.name}</div>
                <div className="text-xs text-text-secondary truncate">
                  {s.kind} · {s.location}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                data-testid={`marketplace-source-remove-${s.name}`}
                aria-label={intl.formatMessage(i18n.remove)}
                onClick={() => handleRemove(s.name)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          data-testid="marketplace-source-name"
          aria-label={intl.formatMessage(i18n.namePlaceholder)}
          placeholder={intl.formatMessage(i18n.namePlaceholder)}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          data-testid="marketplace-source-location"
          aria-label={intl.formatMessage(i18n.locationPlaceholder)}
          placeholder={intl.formatMessage(i18n.locationPlaceholder)}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <select
          data-testid="marketplace-source-kind"
          aria-label={intl.formatMessage(i18n.kindLabel)}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="h-9 rounded-md border border-border-primary bg-background-primary px-3 text-sm"
        >
          <option value="claude">{intl.formatMessage(i18n.kindClaude)}</option>
          <option value="codex">{intl.formatMessage(i18n.kindCodex)}</option>
        </select>
        <Button data-testid="marketplace-source-add" onClick={handleAdd}>
          {intl.formatMessage(i18n.add)}
        </Button>
      </div>
      {formError !== null && (
        <p role="alert" className="text-sm text-red-500 mt-2">
          {formError}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the test + typecheck + lint to verify they pass**

Run: `pnpm test:run -- src/components/marketplaces/SourcesSection.test.tsx`
Expected: PASS (5 tests).
Run: `pnpm typecheck`
Expected: PASS.
Run: `pnpm exec eslint "src/components/marketplaces/**/*.{ts,tsx}" --max-warnings 0 --no-warn-ignored`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/desktop/src/components/marketplaces/SourcesSection.tsx \
        ui/desktop/src/components/marketplaces/SourcesSection.test.tsx
git commit -m "feat(marketplaces): add Sources section (add/validate/list/remove)"
```

---

### Task 3: Browse section (source select → browse → catalog → multi-select → install + Trust dialog)

Deliverable: `BrowseSection` + `TrustDialog`. Selecting a source and clicking Browse loads the catalog; `Unsupported` (`installable === false`) rows are marked and their checkboxes disabled; multiple installable plugins can be selected; Install opens a Trust dialog showing the source (name · kind · location) and the selected plugins plus a hooks/MCP warning; confirming installs and renders per-plugin results (skills count + hooks/MCP presence from the install result) with partial-failure handling. Verified with `useMarketplace` and `toastService` mocked.

**Files:**
- Create: `ui/desktop/src/components/marketplaces/TrustDialog.tsx`
- Create: `ui/desktop/src/components/marketplaces/BrowseSection.tsx`
- Test: `ui/desktop/src/components/marketplaces/BrowseSection.test.tsx`

**Interfaces:**
- Consumes: `useMarketplace()` → `{ sources, catalog, browsedSource, browse, install, loading, errors }` and `type InstallOutcome` (Task 1); `toastService` (`../../toasts`); `Button` (`../ui/button`); `defineMessages`, `useIntl` (`../../i18n`); `MarketplaceSourceInfo` (`@aaif/goose-sdk`).
- Produces:
  - `TrustDialog` — `export interface TrustDialogProps { open: boolean; source?: MarketplaceSourceInfo; plugins: string[]; installing: boolean; onConfirm: () => void; onCancel: () => void }`, `export default function TrustDialog(props: TrustDialogProps): JSX.Element | null` (custom modal with `role="dialog"`, chosen over Radix `ui/dialog` for deterministic jsdom testing).
  - `BrowseSection` — `export default function BrowseSection(): JSX.Element`; E2E hooks `data-testid`: `marketplace-browse-select`, `marketplace-browse`, `marketplace-install`, `marketplace-trust-confirm`; catalog checkboxes use `aria-label={plugin.name}`.
- Design note (spec gap): `CatalogPluginInfo` has no per-plugin hooks/MCP flag, so the pre-install Trust dialog shows the **source** + a generic hooks/MCP warning; concrete per-plugin hooks/MCP presence is shown afterward from each `InstalledPluginResult_unstable` (`hasHooks`/`hasMcp`/`skills`). This satisfies "source + hooks/MCP presence" (spec §5) with the data actually available.

- [ ] **Step 1: Write the failing test**

Create `ui/desktop/src/components/marketplaces/BrowseSection.test.tsx`:

```tsx
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, type RenderOptions } from '@testing-library/react';
import { IntlTestWrapper } from '../../i18n/test-utils';
import BrowseSection from './BrowseSection';
import { useMarketplace, type MarketplaceContextValue, type InstallOutcome } from './MarketplaceContext';
import { toastService } from '../../toasts';

vi.mock('./MarketplaceContext', () => ({ useMarketplace: vi.fn() }));
vi.mock('../../toasts', () => ({ toastService: { error: vi.fn(), success: vi.fn() } }));

function makeCtx(overrides: Partial<MarketplaceContextValue> = {}): MarketplaceContextValue {
  return {
    sources: [{ name: 'core', kind: 'claude', location: 'https://ex/r.git', enabled: true }],
    catalog: [],
    browsedSource: null,
    installedPlugins: [],
    loading: { sources: false, browse: false, install: false, installed: false },
    errors: { sources: null, browse: null, install: null, installed: null },
    refreshSources: vi.fn().mockResolvedValue(undefined),
    addSource: vi.fn().mockResolvedValue(undefined),
    removeSource: vi.fn().mockResolvedValue(undefined),
    browse: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue([]),
    refreshInstalled: vi.fn().mockResolvedValue(undefined),
    setPluginEnabled: vi.fn().mockResolvedValue(undefined),
    updatePlugin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const renderWithIntl = (ui: React.ReactElement, o?: RenderOptions) =>
  render(ui, { wrapper: IntlTestWrapper, ...o });

const catalog = [
  { name: 'demo', description: 'a demo', installable: true, sourceKind: 'git' },
  { name: 'legacy', description: 'old', installable: false, sourceKind: 'unsupported' },
];

beforeEach(() => vi.clearAllMocks());

describe('BrowseSection', () => {
  it('browses the selected source', () => {
    const browse = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useMarketplace).mockReturnValue(makeCtx({ browse }));
    renderWithIntl(<BrowseSection />);
    fireEvent.click(screen.getByTestId('marketplace-browse'));
    expect(browse).toHaveBeenCalledWith('core');
  });

  it('renders catalog rows and disables the Unsupported checkbox', () => {
    vi.mocked(useMarketplace).mockReturnValue(makeCtx({ catalog, browsedSource: 'core' }));
    renderWithIntl(<BrowseSection />);
    expect(screen.getByRole('checkbox', { name: 'demo' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'legacy' })).toBeDisabled();
    expect(screen.getByText(/Unsupported/)).toBeInTheDocument();
  });

  it('opens the Trust dialog showing the source and selected plugins', () => {
    vi.mocked(useMarketplace).mockReturnValue(makeCtx({ catalog, browsedSource: 'core' }));
    renderWithIntl(<BrowseSection />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'demo' }));
    fireEvent.click(screen.getByTestId('marketplace-install'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('https://ex/r.git');
    expect(dialog).toHaveTextContent('demo');
    expect(dialog).toHaveTextContent(/hooks that run local commands/i);
  });

  it('confirming install calls install and renders per-plugin results with partial failure', async () => {
    const outcomes: InstallOutcome[] = [
      {
        plugin: 'demo',
        ok: true,
        result: { name: 'demo', version: '1.0.0', format: 'claude', source: 'core', skills: ['demo:x'], hasHooks: true, hasMcp: false },
      },
      { plugin: 'legacy', ok: false, error: 'boom' },
    ];
    const install = vi.fn().mockResolvedValue(outcomes);
    vi.mocked(useMarketplace).mockReturnValue(makeCtx({ catalog, browsedSource: 'core', install }));
    renderWithIntl(<BrowseSection />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'demo' }));
    fireEvent.click(screen.getByTestId('marketplace-install'));
    fireEvent.click(screen.getByTestId('marketplace-trust-confirm'));
    await waitFor(() => expect(install).toHaveBeenCalledWith('core', ['demo']));
    expect(
      await screen.findByText(/demo: installed \(skills: 1, hooks: yes, MCP: no\)/)
    ).toBeInTheDocument();
    expect(await screen.findByText(/legacy: failed — boom/)).toBeInTheDocument();
    await waitFor(() => expect(toastService.error).toHaveBeenCalled());
  });

  it('disables the Install button while installing and when nothing is selected', () => {
    vi.mocked(useMarketplace).mockReturnValue(
      makeCtx({ catalog, browsedSource: 'core', loading: { sources: false, browse: false, install: true, installed: false } })
    );
    renderWithIntl(<BrowseSection />);
    expect(screen.getByTestId('marketplace-install')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run -- src/components/marketplaces/BrowseSection.test.tsx`
Expected: FAIL — cannot resolve import `./BrowseSection`.

- [ ] **Step 3: Write the minimal implementation**

Create `ui/desktop/src/components/marketplaces/TrustDialog.tsx`:

```tsx
import type { MarketplaceSourceInfo } from '@aaif/goose-sdk';
import { Button } from '../ui/button';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  title: { id: 'marketplaces.trust.title', defaultMessage: 'Confirm installation' },
  sourceLabel: { id: 'marketplaces.trust.sourceLabel', defaultMessage: 'Source' },
  pluginsLabel: { id: 'marketplaces.trust.pluginsLabel', defaultMessage: 'Plugins to install' },
  warning: {
    id: 'marketplaces.trust.warning',
    defaultMessage:
      'Plugins may include hooks that run local commands and MCP servers. Only install from sources you trust.',
  },
  cancel: { id: 'marketplaces.trust.cancel', defaultMessage: 'Cancel' },
  confirm: { id: 'marketplaces.trust.confirm', defaultMessage: 'Install' },
  installing: { id: 'marketplaces.trust.installing', defaultMessage: 'Installing…' },
});

export interface TrustDialogProps {
  open: boolean;
  source?: MarketplaceSourceInfo;
  plugins: string[];
  installing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function TrustDialog({
  open,
  source,
  plugins,
  installing,
  onConfirm,
  onCancel,
}: TrustDialogProps) {
  const intl = useIntl();
  if (!open) {
    return null;
  }
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={intl.formatMessage(i18n.title)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="bg-background-primary rounded-lg border border-border-primary p-6 w-full max-w-md">
        <h3 className="text-lg font-medium mb-3">{intl.formatMessage(i18n.title)}</h3>
        <div className="text-sm mb-2">
          <div className="font-medium">{intl.formatMessage(i18n.sourceLabel)}</div>
          <div className="text-text-secondary">
            {source ? `${source.name} · ${source.kind} · ${source.location}` : ''}
          </div>
        </div>
        <div className="text-sm mb-2">
          <div className="font-medium">{intl.formatMessage(i18n.pluginsLabel)}</div>
          <ul className="list-disc pl-5 text-text-secondary">
            {plugins.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-red-500 mb-4">{intl.formatMessage(i18n.warning)}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={installing}>
            {intl.formatMessage(i18n.cancel)}
          </Button>
          <Button data-testid="marketplace-trust-confirm" onClick={onConfirm} disabled={installing}>
            {installing ? intl.formatMessage(i18n.installing) : intl.formatMessage(i18n.confirm)}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

Create `ui/desktop/src/components/marketplaces/BrowseSection.tsx`:

```tsx
import { useState } from 'react';
import { useMarketplace, type InstallOutcome } from './MarketplaceContext';
import { toastService } from '../../toasts';
import { Button } from '../ui/button';
import TrustDialog from './TrustDialog';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  heading: { id: 'marketplaces.browse.heading', defaultMessage: 'Browse' },
  selectLabel: { id: 'marketplaces.browse.selectLabel', defaultMessage: 'Marketplace' },
  browseButton: { id: 'marketplaces.browse.browseButton', defaultMessage: 'Browse' },
  browsing: { id: 'marketplaces.browse.browsing', defaultMessage: 'Browsing…' },
  noSource: { id: 'marketplaces.browse.noSource', defaultMessage: 'Add a source to browse its catalog.' },
  empty: { id: 'marketplaces.browse.empty', defaultMessage: 'No plugins in this catalog.' },
  unsupported: { id: 'marketplaces.browse.unsupported', defaultMessage: 'Unsupported' },
  install: { id: 'marketplaces.browse.install', defaultMessage: 'Install selected' },
  resultsHeading: { id: 'marketplaces.browse.resultsHeading', defaultMessage: 'Installation results' },
  resultSuccess: {
    id: 'marketplaces.browse.resultSuccess',
    defaultMessage: '{name}: installed (skills: {skills}, hooks: {hooks}, MCP: {mcp})',
  },
  resultFailure: { id: 'marketplaces.browse.resultFailure', defaultMessage: '{name}: failed — {error}' },
  installSucceeded: { id: 'marketplaces.browse.installSucceeded', defaultMessage: 'Plugins installed' },
  installPartial: { id: 'marketplaces.browse.installPartial', defaultMessage: 'Some plugins failed to install' },
  yes: { id: 'marketplaces.browse.yes', defaultMessage: 'yes' },
  no: { id: 'marketplaces.browse.no', defaultMessage: 'no' },
});

export default function BrowseSection() {
  const intl = useIntl();
  const { sources, catalog, browsedSource, browse, install, loading, errors } = useMarketplace();
  const [selectedSource, setSelectedSource] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trustOpen, setTrustOpen] = useState(false);
  const [results, setResults] = useState<InstallOutcome[] | null>(null);

  const activeSource = selectedSource || sources[0]?.name || '';
  const selectedPlugins = [...selected];
  const trustSource = sources.find((s) => s.name === (browsedSource ?? activeSource));

  const toggleSelected = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleConfirmInstall = async () => {
    const marketplace = browsedSource ?? activeSource;
    const outcomes = await install(marketplace, selectedPlugins);
    setResults(outcomes);
    setTrustOpen(false);
    setSelected(new Set());
    if (outcomes.every((o) => o.ok)) {
      toastService.success({ title: intl.formatMessage(i18n.installSucceeded), msg: '' });
    } else {
      toastService.error({
        title: intl.formatMessage(i18n.installPartial),
        msg: outcomes.filter((o) => !o.ok).map((o) => o.plugin).join(', '),
        traceback: '',
      });
    }
  };

  if (sources.length === 0) {
    return (
      <section aria-label={intl.formatMessage(i18n.heading)}>
        <h2 className="text-lg font-medium mb-3">{intl.formatMessage(i18n.heading)}</h2>
        <p className="text-sm text-text-secondary">{intl.formatMessage(i18n.noSource)}</p>
      </section>
    );
  }

  return (
    <section aria-label={intl.formatMessage(i18n.heading)}>
      <h2 className="text-lg font-medium mb-3">{intl.formatMessage(i18n.heading)}</h2>

      <div className="flex items-center gap-2 mb-4">
        <select
          data-testid="marketplace-browse-select"
          aria-label={intl.formatMessage(i18n.selectLabel)}
          value={activeSource}
          onChange={(e) => setSelectedSource(e.target.value)}
          className="h-9 rounded-md border border-border-primary bg-background-primary px-3 text-sm"
        >
          {sources.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <Button
          data-testid="marketplace-browse"
          onClick={() => browse(activeSource)}
          disabled={loading.browse}
        >
          {loading.browse ? intl.formatMessage(i18n.browsing) : intl.formatMessage(i18n.browseButton)}
        </Button>
      </div>

      {errors.browse !== null && (
        <p role="alert" className="text-sm text-red-500 mb-3">
          {errors.browse}
        </p>
      )}

      {browsedSource !== null && catalog.length === 0 && !loading.browse && (
        <p className="text-sm text-text-secondary mb-3">{intl.formatMessage(i18n.empty)}</p>
      )}

      {catalog.length > 0 && (
        <>
          <ul className="flex flex-col gap-2 mb-4">
            {catalog.map((p) => (
              <li
                key={p.name}
                className="flex items-start gap-3 border border-border-primary rounded-md px-3 py-2"
              >
                <input
                  type="checkbox"
                  aria-label={p.name}
                  disabled={!p.installable}
                  checked={selected.has(p.name)}
                  onChange={() => toggleSelected(p.name)}
                  className="mt-1"
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {p.name}
                    {!p.installable && (
                      <span className="ml-2 text-xs text-text-secondary">
                        ({intl.formatMessage(i18n.unsupported)})
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <div className="text-xs text-text-secondary">{p.description}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <Button
            data-testid="marketplace-install"
            onClick={() => setTrustOpen(true)}
            disabled={selectedPlugins.length === 0 || loading.install}
          >
            {intl.formatMessage(i18n.install)}
          </Button>
        </>
      )}

      {results !== null && (
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">{intl.formatMessage(i18n.resultsHeading)}</h3>
          <ul className="flex flex-col gap-1">
            {results.map((o) =>
              o.ok ? (
                <li key={o.plugin} className="text-sm text-text-secondary">
                  {intl.formatMessage(i18n.resultSuccess, {
                    name: o.plugin,
                    skills: o.result.skills.length,
                    hooks: o.result.hasHooks ? intl.formatMessage(i18n.yes) : intl.formatMessage(i18n.no),
                    mcp: o.result.hasMcp ? intl.formatMessage(i18n.yes) : intl.formatMessage(i18n.no),
                  })}
                </li>
              ) : (
                <li key={o.plugin} className="text-sm text-red-500">
                  {intl.formatMessage(i18n.resultFailure, { name: o.plugin, error: o.error })}
                </li>
              )
            )}
          </ul>
        </div>
      )}

      <TrustDialog
        open={trustOpen}
        source={trustSource}
        plugins={selectedPlugins}
        installing={loading.install}
        onConfirm={handleConfirmInstall}
        onCancel={() => setTrustOpen(false)}
      />
    </section>
  );
}
```

- [ ] **Step 4: Run the test + typecheck + lint to verify they pass**

Run: `pnpm test:run -- src/components/marketplaces/BrowseSection.test.tsx`
Expected: PASS (5 tests).
Run: `pnpm typecheck`
Expected: PASS.
Run: `pnpm exec eslint "src/components/marketplaces/**/*.{ts,tsx}" --max-warnings 0 --no-warn-ignored`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/desktop/src/components/marketplaces/TrustDialog.tsx \
        ui/desktop/src/components/marketplaces/BrowseSection.tsx \
        ui/desktop/src/components/marketplaces/BrowseSection.test.tsx
git commit -m "feat(marketplaces): add Browse section with catalog select, multi-install and Trust dialog"
```

---

### Task 4: Installed section (list + enable/disable toggle + update)

Deliverable: `InstalledSection` lists installed plugins (name, version, source, `Auto-update: on/off` display-only), toggles enable/disable with an optimistic switch, and shows an Update button only for `updatable` plugins with a per-row busy state. Verified with `useMarketplace` and `toastService` mocked.

**Files:**
- Create: `ui/desktop/src/components/marketplaces/InstalledSection.tsx`
- Test: `ui/desktop/src/components/marketplaces/InstalledSection.test.tsx`

**Interfaces:**
- Consumes: `useMarketplace()` → `{ installedPlugins, loading, setPluginEnabled, updatePlugin }` (Task 1); `InstalledPluginInfo` (`@aaif/goose-sdk`); `errorMessage` (`./errorMessage`); `toastService` (`../../toasts`); `Button` (`../ui/button`); `Switch` (`../ui/switch`, Radix — renders with `role="switch"`, controlled via `checked`/`onCheckedChange`); `defineMessages`, `useIntl` (`../../i18n`).
- Produces: `export default function InstalledSection(): JSX.Element`; each row has `data-testid={`installed-plugin-<name>`}`; toggle switch uses `aria-label={`Enable <name>`}`.
- Deferred (do NOT add): a control to change `autoUpdate` — v1 only displays it.

- [ ] **Step 1: Write the failing test**

Create `ui/desktop/src/components/marketplaces/InstalledSection.test.tsx`:

```tsx
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, type RenderOptions } from '@testing-library/react';
import { IntlTestWrapper } from '../../i18n/test-utils';
import InstalledSection from './InstalledSection';
import { useMarketplace, type MarketplaceContextValue } from './MarketplaceContext';

vi.mock('./MarketplaceContext', () => ({ useMarketplace: vi.fn() }));
vi.mock('../../toasts', () => ({ toastService: { error: vi.fn(), success: vi.fn() } }));

function makeCtx(overrides: Partial<MarketplaceContextValue> = {}): MarketplaceContextValue {
  return {
    sources: [],
    catalog: [],
    browsedSource: null,
    installedPlugins: [],
    loading: { sources: false, browse: false, install: false, installed: false },
    errors: { sources: null, browse: null, install: null, installed: null },
    refreshSources: vi.fn().mockResolvedValue(undefined),
    addSource: vi.fn().mockResolvedValue(undefined),
    removeSource: vi.fn().mockResolvedValue(undefined),
    browse: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue([]),
    refreshInstalled: vi.fn().mockResolvedValue(undefined),
    setPluginEnabled: vi.fn().mockResolvedValue(undefined),
    updatePlugin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const renderWithIntl = (ui: React.ReactElement, o?: RenderOptions) =>
  render(ui, { wrapper: IntlTestWrapper, ...o });

const plugins = [
  { name: 'demo', version: '1.0.0', source: 'core', enabled: true, autoUpdate: false, updatable: true },
  { name: 'builtin', version: '2.1.0', source: 'local', enabled: false, autoUpdate: true, updatable: false },
];

beforeEach(() => vi.clearAllMocks());

describe('InstalledSection', () => {
  it('lists installed plugins with version and source', () => {
    vi.mocked(useMarketplace).mockReturnValue(makeCtx({ installedPlugins: plugins }));
    renderWithIntl(<InstalledSection />);
    expect(screen.getByTestId('installed-plugin-demo')).toHaveTextContent('demo');
    expect(screen.getByTestId('installed-plugin-demo')).toHaveTextContent('1.0.0');
    expect(screen.getByTestId('installed-plugin-builtin')).toHaveTextContent('local');
  });

  it('shows the Update button only for updatable plugins', () => {
    vi.mocked(useMarketplace).mockReturnValue(makeCtx({ installedPlugins: plugins }));
    renderWithIntl(<InstalledSection />);
    const demoRow = screen.getByTestId('installed-plugin-demo');
    const builtinRow = screen.getByTestId('installed-plugin-builtin');
    expect(demoRow.querySelector('[data-slot="button"]')).not.toBeNull();
    expect(builtinRow.querySelector('[data-slot="button"]')).toBeNull();
  });

  it('toggles enable/disable and reflects the new state optimistically', async () => {
    const setPluginEnabled = vi.fn(() => new Promise<void>(() => {}));
    vi.mocked(useMarketplace).mockReturnValue(
      makeCtx({ installedPlugins: [plugins[0]], setPluginEnabled })
    );
    renderWithIntl(<InstalledSection />);
    const toggle = screen.getByRole('switch', { name: 'Enable demo' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Enable demo' })).toHaveAttribute('aria-checked', 'false')
    );
    expect(setPluginEnabled).toHaveBeenCalledWith('demo', false);
  });

  it('calls updatePlugin when the Update button is clicked', async () => {
    const updatePlugin = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useMarketplace).mockReturnValue(
      makeCtx({ installedPlugins: [plugins[0]], updatePlugin })
    );
    renderWithIntl(<InstalledSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(updatePlugin).toHaveBeenCalledWith('demo'));
  });

  it('shows an empty state when no plugins are installed', () => {
    vi.mocked(useMarketplace).mockReturnValue(makeCtx({ installedPlugins: [] }));
    renderWithIntl(<InstalledSection />);
    expect(screen.getByText('No plugins installed yet.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run -- src/components/marketplaces/InstalledSection.test.tsx`
Expected: FAIL — cannot resolve import `./InstalledSection`.

- [ ] **Step 3: Write the minimal implementation**

Create `ui/desktop/src/components/marketplaces/InstalledSection.tsx`:

```tsx
import { useState } from 'react';
import type { InstalledPluginInfo } from '@aaif/goose-sdk';
import { useMarketplace } from './MarketplaceContext';
import { errorMessage } from './errorMessage';
import { toastService } from '../../toasts';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  heading: { id: 'marketplaces.installed.heading', defaultMessage: 'Installed' },
  empty: { id: 'marketplaces.installed.empty', defaultMessage: 'No plugins installed yet.' },
  loading: { id: 'marketplaces.installed.loading', defaultMessage: 'Loading installed plugins…' },
  autoUpdateOn: { id: 'marketplaces.installed.autoUpdateOn', defaultMessage: 'Auto-update: on' },
  autoUpdateOff: { id: 'marketplaces.installed.autoUpdateOff', defaultMessage: 'Auto-update: off' },
  enableLabel: { id: 'marketplaces.installed.enableLabel', defaultMessage: 'Enable {name}' },
  update: { id: 'marketplaces.installed.update', defaultMessage: 'Update' },
  updating: { id: 'marketplaces.installed.updating', defaultMessage: 'Updating…' },
  updateFailed: { id: 'marketplaces.installed.updateFailed', defaultMessage: 'Failed to update plugin' },
  toggleFailed: { id: 'marketplaces.installed.toggleFailed', defaultMessage: 'Failed to change plugin state' },
});

function InstalledPluginRow({ plugin }: { plugin: InstalledPluginInfo }) {
  const intl = useIntl();
  const { setPluginEnabled, updatePlugin } = useMarketplace();
  const [enabled, setEnabled] = useState(plugin.enabled);
  const [updating, setUpdating] = useState(false);

  const handleToggle = async (next: boolean) => {
    setEnabled(next);
    try {
      await setPluginEnabled(plugin.name, next);
    } catch (e) {
      setEnabled(!next);
      toastService.error({
        title: intl.formatMessage(i18n.toggleFailed),
        msg: errorMessage(e),
        traceback: errorMessage(e),
      });
    }
  };

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await updatePlugin(plugin.name);
    } catch (e) {
      toastService.error({
        title: intl.formatMessage(i18n.updateFailed),
        msg: errorMessage(e),
        traceback: errorMessage(e),
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <li
      data-testid={`installed-plugin-${plugin.name}`}
      className="flex items-center justify-between border border-border-primary rounded-md px-3 py-2"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">
          {plugin.name} <span className="text-text-secondary">v{plugin.version}</span>
        </div>
        <div className="text-xs text-text-secondary truncate">{plugin.source}</div>
        <div className="text-xs text-text-secondary">
          {plugin.autoUpdate
            ? intl.formatMessage(i18n.autoUpdateOn)
            : intl.formatMessage(i18n.autoUpdateOff)}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {plugin.updatable && (
          <Button variant="secondary" size="sm" onClick={handleUpdate} disabled={updating}>
            {updating ? intl.formatMessage(i18n.updating) : intl.formatMessage(i18n.update)}
          </Button>
        )}
        <Switch
          aria-label={intl.formatMessage(i18n.enableLabel, { name: plugin.name })}
          checked={enabled}
          onCheckedChange={handleToggle}
        />
      </div>
    </li>
  );
}

export default function InstalledSection() {
  const intl = useIntl();
  const { installedPlugins, loading } = useMarketplace();

  return (
    <section aria-label={intl.formatMessage(i18n.heading)}>
      <h2 className="text-lg font-medium mb-3">{intl.formatMessage(i18n.heading)}</h2>
      {loading.installed && installedPlugins.length === 0 ? (
        <p className="text-sm text-text-secondary">{intl.formatMessage(i18n.loading)}</p>
      ) : installedPlugins.length === 0 ? (
        <p className="text-sm text-text-secondary">{intl.formatMessage(i18n.empty)}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {installedPlugins.map((p) => (
            <InstalledPluginRow key={p.name} plugin={p} />
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run the test + typecheck + lint to verify they pass**

Run: `pnpm test:run -- src/components/marketplaces/InstalledSection.test.tsx`
Expected: PASS (5 tests).
Run: `pnpm typecheck`
Expected: PASS.
Run: `pnpm exec eslint "src/components/marketplaces/**/*.{ts,tsx}" --max-warnings 0 --no-warn-ignored`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/desktop/src/components/marketplaces/InstalledSection.tsx \
        ui/desktop/src/components/marketplaces/InstalledSection.test.tsx
git commit -m "feat(marketplaces): add Installed section with enable/disable toggle and update"
```

---

### Task 5: `MarketplacesView` composition + navigation registration

Deliverable: `MarketplacesView` composes the three sections in `MainPanelLayout`; a `/marketplaces` route (wrapped in `MarketplaceProvider`) is registered in `App.tsx`; `'marketplaces'` is added to the `View` union + `createNavigationHandler`; a `Marketplaces` sidebar item is added to `NAV_ITEMS`. Verified with a rendered-view test (child sections mocked) plus unit tests for the navigation registration.

**Files:**
- Create: `ui/desktop/src/components/marketplaces/MarketplacesView.tsx`
- Test: `ui/desktop/src/components/marketplaces/MarketplacesView.test.tsx`
- Modify: `ui/desktop/src/utils/navigationUtils.ts` (View union lines 5-20; `createNavigationHandler` switch, after the `extensions` case ~line 75)
- Test: `ui/desktop/src/utils/navigationUtils.test.ts`
- Modify: `ui/desktop/src/hooks/useNavigationItems.ts` (imports line 1-11; `NAV_ITEMS` after the `extensions` entry ~line 30; `navItemMessages` ~line 65)
- Test: `ui/desktop/src/hooks/useNavigationItems.test.ts`
- Modify: `ui/desktop/src/App.tsx` (imports near line 34-47; add `MarketplacesRoute` after `ExtensionsRoute` ~line 305; add `<Route>` after the `extensions` route ~line 657)

**Interfaces:**
- Consumes: `MainPanelLayout` (`../Layout/MainPanelLayout`, named export); child sections `./SourcesSection`, `./BrowseSection`, `./InstalledSection` (default exports, Tasks 2-4); `MarketplaceProvider` (`./MarketplaceContext`, Task 1); `createNavigationHandler`/`View` (`../../utils/navigationUtils`); `NAV_ITEMS`/`getNavItemLabel`/`NavItem` (`../hooks/useNavigationItems`); `createIntl` (`react-intl`); `Store` (`lucide-react`).
- Produces: `export default function MarketplacesView(): JSX.Element`; `View` union member `'marketplaces'`; nav item `{ id: 'marketplaces', path: '/marketplaces', label: 'Marketplaces', icon: Store }`; route `path="marketplaces"`.

- [ ] **Step 1: Write the failing tests**

Create `ui/desktop/src/components/marketplaces/MarketplacesView.test.tsx` (no `import React` — the repo relies on the JSX automatic runtime + the global `React`; an unused `import React` would trip `noUnusedLocals`. We mock `useMarketplace`/`toastService` and let the real sections render so the test also proves all three mount):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlTestWrapper } from '../../i18n/test-utils';
import MarketplacesView from './MarketplacesView';
import { useMarketplace, type MarketplaceContextValue } from './MarketplaceContext';

vi.mock('./MarketplaceContext', () => ({ useMarketplace: vi.fn() }));
vi.mock('../../toasts', () => ({ toastService: { error: vi.fn(), success: vi.fn() } }));

function makeCtx(): MarketplaceContextValue {
  return {
    sources: [],
    catalog: [],
    browsedSource: null,
    installedPlugins: [],
    loading: { sources: false, browse: false, install: false, installed: false },
    errors: { sources: null, browse: null, install: null, installed: null },
    refreshSources: vi.fn().mockResolvedValue(undefined),
    addSource: vi.fn().mockResolvedValue(undefined),
    removeSource: vi.fn().mockResolvedValue(undefined),
    browse: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue([]),
    refreshInstalled: vi.fn().mockResolvedValue(undefined),
    setPluginEnabled: vi.fn().mockResolvedValue(undefined),
    updatePlugin: vi.fn().mockResolvedValue(undefined),
  };
}

describe('MarketplacesView', () => {
  it('renders the heading and all three sections', () => {
    vi.mocked(useMarketplace).mockReturnValue(makeCtx());
    render(<MarketplacesView />, { wrapper: IntlTestWrapper });
    expect(screen.getByRole('heading', { level: 1, name: 'Marketplaces' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Sources' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Browse' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Installed' })).toBeInTheDocument();
  });
});
```

Create `ui/desktop/src/utils/navigationUtils.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createNavigationHandler } from './navigationUtils';

describe('createNavigationHandler', () => {
  it('navigates to /marketplaces for the marketplaces view', () => {
    const navigate = vi.fn();
    createNavigationHandler(navigate)('marketplaces');
    expect(navigate).toHaveBeenCalledWith('/marketplaces', { state: undefined });
  });
});
```

Create `ui/desktop/src/hooks/useNavigationItems.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createIntl } from 'react-intl';
import { NAV_ITEMS, getNavItemLabel } from './useNavigationItems';

describe('marketplaces nav item', () => {
  it('registers a Marketplaces item at /marketplaces', () => {
    const item = NAV_ITEMS.find((i) => i.id === 'marketplaces');
    expect(item).toBeDefined();
    expect(item?.path).toBe('/marketplaces');
  });

  it('localizes the Marketplaces label', () => {
    const intl = createIntl({ locale: 'en', messages: {} });
    const item = NAV_ITEMS.find((i) => i.id === 'marketplaces')!;
    expect(getNavItemLabel(item, intl)).toBe('Marketplaces');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run -- src/components/marketplaces/MarketplacesView.test.tsx src/utils/navigationUtils.test.ts src/hooks/useNavigationItems.test.ts`
Expected: FAIL — `MarketplacesView.test.tsx` cannot resolve `./MarketplacesView`; `navigationUtils.test.ts` fails `expect(navigate).toHaveBeenCalledWith('/marketplaces', …)` (handler falls through to `navigate('/')`); `useNavigationItems.test.ts` fails `expect(item).toBeDefined()`.

- [ ] **Step 3: Write the minimal implementation**

Create `ui/desktop/src/components/marketplaces/MarketplacesView.tsx`:

```tsx
import { MainPanelLayout } from '../Layout/MainPanelLayout';
import SourcesSection from './SourcesSection';
import BrowseSection from './BrowseSection';
import InstalledSection from './InstalledSection';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  heading: { id: 'marketplaces.view.heading', defaultMessage: 'Marketplaces' },
  description: {
    id: 'marketplaces.view.description',
    defaultMessage:
      'Manage plugin marketplaces, browse their catalogs, install plugins, and manage installed plugins.',
  },
});

export default function MarketplacesView() {
  const intl = useIntl();
  return (
    <MainPanelLayout>
      <div className="flex flex-col min-w-0 flex-1 overflow-y-auto">
        <div className="bg-background-primary px-8 pb-4 pt-16">
          <h1 className="text-4xl font-light mb-1">{intl.formatMessage(i18n.heading)}</h1>
          <p className="text-sm text-text-secondary mb-6">{intl.formatMessage(i18n.description)}</p>
        </div>
        <div className="px-8 pb-16 flex flex-col gap-10">
          <SourcesSection />
          <BrowseSection />
          <InstalledSection />
        </div>
      </div>
    </MainPanelLayout>
  );
}
```

In `ui/desktop/src/utils/navigationUtils.ts`, add `'marketplaces'` to the `View` union (e.g. after `'extensions'`):

```ts
  | 'extensions'
  | 'marketplaces'
```

and add a case in `createNavigationHandler`, immediately after the `extensions` case:

```ts
      case 'marketplaces':
        navigate('/marketplaces', { state: options });
        break;
```

In `ui/desktop/src/hooks/useNavigationItems.ts`, add `Store` to the lucide-react import:

```ts
import {
  AppWindow,
  Clock,
  FileText,
  History,
  MessageSquarePlus,
  Puzzle,
  Settings,
  Store,
  Zap,
} from 'lucide-react';
```

add the nav item after the `extensions` entry in `NAV_ITEMS`:

```ts
  { id: 'marketplaces', path: '/marketplaces', label: 'Marketplaces', icon: Store },
```

and add the message to `navItemMessages` after `extensions`:

```ts
  marketplaces: {
    id: 'navigation.itemMarketplaces',
    defaultMessage: 'Marketplaces',
  },
```

In `ui/desktop/src/App.tsx`, add the imports near the other view imports (~line 34-47):

```tsx
import MarketplacesView from './components/marketplaces/MarketplacesView';
import { MarketplaceProvider } from './components/marketplaces/MarketplaceContext';
```

add the route component after `ExtensionsRoute` (~line 305):

```tsx
const MarketplacesRoute = () => {
  return (
    <MarketplaceProvider>
      <MarketplacesView />
    </MarketplaceProvider>
  );
};
```

and register the route after the `extensions` `<Route>` (~line 657, inside the layout `<Route path="/">`):

```tsx
              <Route path="marketplaces" element={<MarketplacesRoute />} />
```

- [ ] **Step 4: Run the tests + typecheck + lint to verify they pass**

Run: `pnpm test:run -- src/components/marketplaces/MarketplacesView.test.tsx src/utils/navigationUtils.test.ts src/hooks/useNavigationItems.test.ts`
Expected: PASS (4 tests).
Run: `pnpm typecheck`
Expected: PASS (App.tsx route + View union compile).
Run: `pnpm exec eslint "src/components/marketplaces/**/*.{ts,tsx}" src/App.tsx src/utils/navigationUtils.ts src/utils/navigationUtils.test.ts src/hooks/useNavigationItems.ts src/hooks/useNavigationItems.test.ts --max-warnings 0 --no-warn-ignored`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/desktop/src/components/marketplaces/MarketplacesView.tsx \
        ui/desktop/src/components/marketplaces/MarketplacesView.test.tsx \
        ui/desktop/src/utils/navigationUtils.ts \
        ui/desktop/src/utils/navigationUtils.test.ts \
        ui/desktop/src/hooks/useNavigationItems.ts \
        ui/desktop/src/hooks/useNavigationItems.test.ts \
        ui/desktop/src/App.tsx
git commit -m "feat(marketplaces): compose MarketplacesView and register /marketplaces route + sidebar item"
```

---

### Task 6: i18n extraction + locale-catalog parity + full lint gate

Deliverable: `en.json` regenerated with all new `marketplaces.*` and `navigation.itemMarketplaces` keys, the same keys added to all 16 non-English catalogs (so `i18n:check` passes), and the full `pnpm lint:check` green across the feature. This is the CI gate.

**Files:**
- Modify: `ui/desktop/src/i18n/messages/en.json` (regenerated by `pnpm i18n:extract`)
- Modify: `ui/desktop/src/i18n/messages/{es,fr,de,it,pt,id,ms,vi,hi,ja,ko,ru,tr,zh-CN,zh-TW}.json` (add the new keys)

**Interfaces:**
- Consumes: the `defineMessages` blocks written in Tasks 2-5 (message IDs `marketplaces.sources.*`, `marketplaces.browse.*`, `marketplaces.trust.*`, `marketplaces.installed.*`, `marketplaces.view.*`, `navigation.itemMarketplaces`) and the scripts `i18n:extract`, `i18n:check` (`scripts/i18n-check.js` + `scripts/i18n-validate-locale.js`).
- Produces: catalogs with identical key sets across all locales (validated by `i18n-validate-locale.js`).

- [ ] **Step 1: Verify the check currently fails (extraction out of date)**

Run: `pnpm i18n:check`
Expected: FAIL with `Error: src/i18n/messages/en.json is out of date. Run pnpm i18n:extract to update it.` (the new `defineMessages` are not yet in `en.json`).

- [ ] **Step 2: Regenerate the English catalog**

Run: `pnpm i18n:extract`
This rewrites `src/i18n/messages/en.json` with the new marketplace keys and recompiles.

Run: `node scripts/i18n-check.js`
Expected: PASS silently (en.json now matches extraction).

- [ ] **Step 3: Verify locale parity fails, then fill the non-English catalogs**

Run: `pnpm exec node scripts/i18n-validate-locale.js`
Expected: FAIL — `Missing <locale> keys (...)` for every locale, listing the new `marketplaces.*` / `navigation.itemMarketplaces` keys.

Add every en.json key missing from each non-English catalog, seeding the value with the English `defaultMessage` (real translations are a follow-up; this preserves existing translations and satisfies the key-parity + placeholder-parity validator). Run this one-off fill from `ui/desktop/`:

```bash
node -e '
const fs = require("fs");
const path = require("path");
const dir = path.join("src", "i18n", "messages");
const en = JSON.parse(fs.readFileSync(path.join(dir, "en.json"), "utf8"));
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith(".json") || file === "en.json") continue;
  const p = path.join(dir, file);
  const cat = JSON.parse(fs.readFileSync(p, "utf8"));
  let added = 0;
  for (const key of Object.keys(en)) {
    if (!Object.prototype.hasOwnProperty.call(cat, key)) {
      cat[key] = { defaultMessage: en[key].defaultMessage };
      added++;
    }
  }
  // Rewrite in en.json key order so diffs stay minimal and keys stay aligned.
  const ordered = {};
  for (const key of Object.keys(en)) ordered[key] = cat[key];
  fs.writeFileSync(p, JSON.stringify(ordered, null, 2) + "\n");
  console.log(file, "added", added, "keys");
}
'
```

- [ ] **Step 4: Verify i18n:check and the full lint gate pass**

Run: `pnpm i18n:check`
Expected: PASS (`i18n locale validation passed for … (<N> messages).`).
Run: `pnpm lint:check`
Expected: PASS (`tsc --noEmit` + `eslint --max-warnings 0` + `i18n:check` all green).
Run: `pnpm test:run -- src/components/marketplaces src/utils/navigationUtils.test.ts src/hooks/useNavigationItems.test.ts`
Expected: PASS (all marketplace + navigation tests green).

- [ ] **Step 5: Commit**

```bash
git add ui/desktop/src/i18n/messages
git commit -m "i18n(marketplaces): extract English catalog and sync all locale catalogs"
```

---

### Task 7: Playwright E2E — add → browse → install against a local git fixture marketplace

Deliverable: a Playwright spec that launches the app (via the existing `goosePage` fixture, which spawns `goosed`), navigates to `/marketplaces`, adds a local git fixture marketplace (kind `claude`), browses its catalog, installs the `demo` plugin behind the Trust dialog, and asserts it appears in the Installed section — plus a fixture builder and a documented manual-runbook fallback.

**Files:**
- Create: `ui/desktop/tests/e2e/marketplace-fixture.ts`
- Create: `ui/desktop/tests/e2e/marketplaces.spec.ts`
- Create: `ui/desktop/tests/e2e/MARKETPLACES-RUNBOOK.md` (manual fallback)

**Interfaces:**
- Consumes: `test`, `expect` from `./fixtures` (existing; provides `goosePage: Page` after launching electron + `goosed`); the app's HashRouter (navigate via `window.location.hash`); the `data-testid` hooks produced in Tasks 2-4 (`marketplace-source-name`, `marketplace-source-location`, `marketplace-source-kind`, `marketplace-source-add`, `marketplace-browse-select`, `marketplace-browse`, `marketplace-install`, `marketplace-trust-confirm`, `marketplace-source-remove-<name>`, `installed-plugin-<name>`) and the catalog checkbox `aria-label={plugin.name}`.
- The fixture repo layout mirrors the backend's expected Claude marketplace format (`.claude-plugin/marketplace.json` + `plugins/demo/.claude-plugin/plugin.json` + `plugins/demo/skills/x/SKILL.md`), matching the core `e2e_register_fetch_install_from_local_git_marketplace` test in `crates/goose/src/marketplace/install.rs`.
- Note: `tests/e2e` is outside the `tsconfig.json` `include`, so these files are not part of `pnpm typecheck`; Playwright compiles them itself.

- [ ] **Step 1: Write the fixture builder and the failing spec**

Create `ui/desktop/tests/e2e/marketplace-fixture.ts`:

```ts
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/** Build a local git-repo Claude marketplace with one installable plugin ("demo"). */
export function createMarketplaceFixture(): string {
  const repo = mkdtempSync(join(tmpdir(), 'goose-mp-e2e-'));

  mkdirSync(join(repo, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(repo, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({
      name: 'e2e-market',
      owner: { name: 'e2e' },
      plugins: [{ name: 'demo', source: './plugins/demo', description: 'a demo plugin' }],
    })
  );

  const demoMeta = join(repo, 'plugins', 'demo', '.claude-plugin');
  mkdirSync(demoMeta, { recursive: true });
  writeFileSync(
    join(demoMeta, 'plugin.json'),
    JSON.stringify({ name: 'demo', version: '1.0.0', description: 'a demo plugin' })
  );

  const skill = join(repo, 'plugins', 'demo', 'skills', 'x');
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: x\ndescription: does x\n---\nBody.\n');

  const git = (args: string[]) => execFileSync('git', args, { cwd: repo });
  git(['init']);
  git(['config', 'user.email', 'e2e@example.com']);
  git(['config', 'user.name', 'e2e']);
  git(['add', '.']);
  git(['commit', '-m', 'init']);

  return repo;
}
```

Create `ui/desktop/tests/e2e/marketplaces.spec.ts`:

```ts
import { test, expect } from './fixtures';
import { createMarketplaceFixture } from './marketplace-fixture';

test.describe('Marketplaces', () => {
  test('add a source, browse the catalog, and install a plugin', async ({ goosePage }) => {
    const fixture = createMarketplaceFixture();
    const sourceName = `e2e-market-${Date.now()}`;

    // Navigate to the Marketplaces view (HashRouter listens to hashchange).
    await goosePage.evaluate(() => {
      window.location.hash = '#/marketplaces';
    });
    await goosePage.waitForSelector('[data-testid="marketplace-source-name"]', { timeout: 30000 });

    // Add the local git fixture as a Claude marketplace source.
    await goosePage.fill('[data-testid="marketplace-source-name"]', sourceName);
    await goosePage.fill('[data-testid="marketplace-source-location"]', fixture);
    await goosePage.selectOption('[data-testid="marketplace-source-kind"]', 'claude');
    await goosePage.click('[data-testid="marketplace-source-add"]');

    // Browse the new source's catalog (network/git — allow generous timeout).
    await goosePage.selectOption('[data-testid="marketplace-browse-select"]', sourceName);
    await goosePage.click('[data-testid="marketplace-browse"]');
    const demoCheckbox = goosePage.getByRole('checkbox', { name: 'demo' });
    await expect(demoCheckbox).toBeVisible({ timeout: 30000 });

    // Select the plugin and install it via the Trust dialog.
    await demoCheckbox.check();
    await goosePage.click('[data-testid="marketplace-install"]');
    await goosePage.click('[data-testid="marketplace-trust-confirm"]');

    // The Installed section should list the demo plugin.
    await expect(goosePage.getByTestId('installed-plugin-demo')).toBeVisible({ timeout: 60000 });

    // Best-effort cleanup: remove the source we added (ambient user config).
    await goosePage.click(`[data-testid="marketplace-source-remove-${sourceName}"]`).catch(() => {});
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `pnpm test-e2e:single "add a source, browse the catalog, and install a plugin"`
Expected: FAIL — the app has no Marketplaces view yet at the branch point where this task starts, or (once Tasks 1-6 are merged) the spec passes; if run before the UI exists it fails at `waitForSelector('[data-testid="marketplace-source-name"]')` (timeout). This confirms the spec exercises the real UI.

- [ ] **Step 3: Add the manual-runbook fallback**

Create `ui/desktop/tests/e2e/MARKETPLACES-RUNBOOK.md`:

```markdown
# Manual runbook — Marketplaces (fallback for `marketplaces.spec.ts`)

Use this when Playwright + `goosed` are unstable in CI (per Plan 2b, the automated
E2E is the goal; this runbook is the documented fallback). It mutates ambient user
config and installs a plugin into the user's plugin dir — run against a disposable
`HOME`/goose config, or remove the source and plugin afterward.

1. Build the fixture: `node -e "require('./tests/e2e/marketplace-fixture').createMarketplaceFixture()"`
   prints nothing; instead call it from a REPL and note the printed path, or copy the
   `createMarketplaceFixture` body to create a local git repo with
   `.claude-plugin/marketplace.json` + `plugins/demo`.
2. `pnpm start-gui`, open the sidebar, click **Marketplaces**.
3. **Sources:** enter a unique Name, paste the fixture repo path as Location, Kind = Claude, click **Add**. The source appears in the list.
4. **Browse:** select the source, click **Browse**. The `demo` plugin appears (installable, not Unsupported).
5. Tick `demo`, click **Install selected**, review the **Trust dialog** (shows source name · kind · location + hooks/MCP warning), click **Install**.
6. Verify the **Installation results** show `demo: installed (skills: 1, hooks: no, MCP: no)` and the **Installed** section lists `demo` with an enable/disable toggle and (if git) an **Update** button.
7. Toggle enable/disable and confirm it persists. **Cleanup:** click the source's Remove button.
```

- [ ] **Step 4: Verify the spec passes when the UI is present**

Run (with Tasks 1-6 in the working tree): `pnpm test-e2e:single "add a source, browse the catalog, and install a plugin"`
Expected: PASS — the Installed section shows `installed-plugin-demo`. If Playwright + `goosed` are unstable in the CI environment, record that and rely on `MARKETPLACES-RUNBOOK.md` (Plan 2b fallback).

- [ ] **Step 5: Commit**

```bash
git add ui/desktop/tests/e2e/marketplace-fixture.ts \
        ui/desktop/tests/e2e/marketplaces.spec.ts \
        ui/desktop/tests/e2e/MARKETPLACES-RUNBOOK.md
git commit -m "test(marketplaces): add Playwright E2E (add/browse/install) with local git fixture + manual runbook"
```

---

## Final verification (run before handoff)

From `ui/desktop/`:

- `pnpm test:run` — all Vitest suites green (marketplace hook, three sections, view, navigation).
- `pnpm lint:check` — `tsc --noEmit` + `eslint --max-warnings 0` + `i18n:check` all green.
- `pnpm test-e2e:single "add a source, browse the catalog, and install a plugin"` — green, or documented fallback to `MARKETPLACES-RUNBOOK.md`.
