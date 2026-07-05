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
