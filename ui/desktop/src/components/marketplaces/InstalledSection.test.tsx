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

  it('disables the Switch while a toggle is in flight, guarding against a rapid double-click', async () => {
    const setPluginEnabled = vi.fn(() => new Promise<void>(() => {}));
    vi.mocked(useMarketplace).mockReturnValue(
      makeCtx({ installedPlugins: [plugins[0]], setPluginEnabled })
    );
    renderWithIntl(<InstalledSection />);
    const toggle = screen.getByRole('switch', { name: 'Enable demo' });
    expect(toggle).not.toBeDisabled();
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeDisabled());
    fireEvent.click(toggle);
    expect(setPluginEnabled).toHaveBeenCalledTimes(1);
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

  it('renders an alert when errors.installed is set (e.g. mount-time load failure)', () => {
    vi.mocked(useMarketplace).mockReturnValue(
      makeCtx({
        installedPlugins: [],
        errors: { sources: null, browse: null, install: null, installed: 'acp unreachable' },
      })
    );
    renderWithIntl(<InstalledSection />);
    expect(screen.getByRole('alert')).toHaveTextContent('acp unreachable');
    expect(screen.queryByText('No plugins installed yet.')).not.toBeInTheDocument();
  });

  // Additional coverage beyond the brief: Task 1 review flagged that setPluginEnabled/updatePlugin
  // throw on failure and expose no errors.* field, so this section must catch failures itself,
  // revert the optimistic toggle, and surface a toast. Verify that behavior actually holds.
  it('reverts the optimistic toggle and shows a toast when setPluginEnabled fails', async () => {
    const setPluginEnabled = vi.fn().mockRejectedValue(new Error('denied'));
    vi.mocked(useMarketplace).mockReturnValue(
      makeCtx({ installedPlugins: [plugins[0]], setPluginEnabled })
    );
    const { toastService } = await import('../../toasts');
    renderWithIntl(<InstalledSection />);
    const toggle = screen.getByRole('switch', { name: 'Enable demo' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Enable demo' })).toHaveAttribute('aria-checked', 'false')
    );
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Enable demo' })).toHaveAttribute('aria-checked', 'true')
    );
    expect(toastService.error).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('switch', { name: 'Enable demo' })).not.toBeDisabled();
  });

  it('shows a toast when updatePlugin fails and clears the busy state', async () => {
    const updatePlugin = vi.fn().mockRejectedValue(new Error('network error'));
    vi.mocked(useMarketplace).mockReturnValue(
      makeCtx({ installedPlugins: [plugins[0]], updatePlugin })
    );
    const { toastService } = await import('../../toasts');
    renderWithIntl(<InstalledSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(toastService.error).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Update' })).not.toBeDisabled();
  });
});
