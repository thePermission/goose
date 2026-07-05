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
        sources: [
          { name: 'alpha', kind: 'claude', location: 'x', enabled: true },
          { name: 'beta', kind: 'claude', location: 'y', enabled: true },
        ],
        removeSource,
      })
    );
    renderWithIntl(<SourcesSection />);
    const removeAlpha = screen.getByRole('button', { name: /Remove alpha/ });
    const removeBeta = screen.getByRole('button', { name: /Remove beta/ });
    expect(removeAlpha).not.toBe(removeBeta);
    fireEvent.click(removeBeta);
    await waitFor(() => expect(removeSource).toHaveBeenCalledWith('beta'));
    expect(removeSource).not.toHaveBeenCalledWith('alpha');
  });
});
