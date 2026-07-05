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
