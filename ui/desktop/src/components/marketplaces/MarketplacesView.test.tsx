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
