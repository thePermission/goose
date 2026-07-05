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
